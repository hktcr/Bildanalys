"""
SharpFrame Engine — Composite scoring med I-frame-prioritet

Tvåstegsarkitektur:
  1. Identifiera I-frame-positioner via ffprobe (snabb)
  2. Composite scoring: skärpa + exponering + kontrast (per kandidat)
"""

import json
import os
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np


# ─── I-frame-identifiering via ffprobe ────────────────────────────────────────

def get_keyframe_times(video_path: str) -> list[float]:
    """
    Använd ffprobe för att identifiera tidpunkter för alla I-frames (nyckelbilder).
    Returnerar sorterad lista av tidpunkter i sekunder.
    """
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "quiet",
                "-select_streams", "v:0",
                "-show_frames",
                "-show_entries", "frame=pict_type,pts_time",
                "-of", "json",
                video_path
            ],
            capture_output=True, text=True, timeout=60
        )

        if result.returncode != 0:
            return []

        data = json.loads(result.stdout)
        frames = data.get("frames", [])

        keyframe_times = []
        for frame in frames:
            if frame.get("pict_type") == "I":
                pts = frame.get("pts_time")
                if pts is not None:
                    keyframe_times.append(float(pts))

        return sorted(keyframe_times)

    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError):
        return []


def get_video_metadata(video_path: str) -> dict:
    """Hämta videofilens metadata."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {}

    metadata = {
        "fps": cap.get(cv2.CAP_PROP_FPS),
        "total_frames": int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
        "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
        "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
    }

    fps = metadata["fps"]
    if fps > 0:
        metadata["duration"] = metadata["total_frames"] / fps
    else:
        metadata["duration"] = 0

    cap.release()
    return metadata


# ─── Composite scoring ───────────────────────────────────────────────────────

def compute_sharpness(gray: np.ndarray) -> float:
    """
    Laplacian-variance: Var(∇²f).
    Hög varians = skarpa kanter, låg = rörelseoskärpa.
    """
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    return float(laplacian.var())


def compute_exposure(gray: np.ndarray) -> float:
    """
    Exponeringskvalitet baserad på histogram-centrering.

    Optimal exponering har medelvärde nära mitten (128) av 0-255-intervallet.
    Straffar kraftig under- eller överexponering.
    Returnerar värde 0-100, där 100 = perfekt centrerad.
    """
    mean_val = gray.mean()
    # Avstånd från ideal (128), normaliserat
    deviation = abs(mean_val - 128) / 128
    return float((1.0 - deviation) * 100)


def compute_contrast(gray: np.ndarray) -> float:
    """
    Kontrast mätt som standardavvikelse av luminans.
    Hög std = bra dynamiskt omfång, låg std = platt/matt bild.
    """
    return float(gray.std())


def composite_score(gray: np.ndarray, sharpness_range: tuple = None) -> dict:
    """
    Beräkna composite score för en bildruta.

    Returnerar dict med individuella scores och vägt totalvärde.
    sharpness_range används för normalisering (sätts efter första passet).
    """
    sharpness = compute_sharpness(gray)
    exposure = compute_exposure(gray)
    contrast = compute_contrast(gray)

    return {
        "sharpness_raw": sharpness,
        "exposure": exposure,
        "contrast": contrast,
    }


def normalize_and_weight(scores: list[dict],
                         w_sharpness: float = 0.5,
                         w_exposure: float = 0.25,
                         w_contrast: float = 0.25) -> list[dict]:
    """
    Normalisera skärpevärden till 0-100 och beräkna viktat totalvärde.

    Vikter: skärpa 50%, exponering 25%, kontrast 25%.
    """
    if not scores:
        return []

    # Normalisera skärpa till 0-100
    sharpness_vals = [s["sharpness_raw"] for s in scores]
    s_min = min(sharpness_vals)
    s_max = max(sharpness_vals)
    s_range = s_max - s_min if s_max > s_min else 1.0

    # Normalisera kontrast till 0-100
    contrast_vals = [s["contrast"] for s in scores]
    c_min = min(contrast_vals)
    c_max = max(contrast_vals)
    c_range = c_max - c_min if c_max > c_min else 1.0

    for s in scores:
        s["sharpness"] = ((s["sharpness_raw"] - s_min) / s_range) * 100
        s["contrast_norm"] = ((s["contrast"] - c_min) / c_range) * 100

        s["composite"] = (
            w_sharpness * s["sharpness"] +
            w_exposure * s["exposure"] +
            w_contrast * s["contrast_norm"]
        )

    return scores


# ─── Duplikatfilter ──────────────────────────────────────────────────────────

def is_duplicate(frame_gray: np.ndarray, reference_grays: list[np.ndarray],
                 threshold: float = 0.98) -> bool:
    """
    Kontrollera om bildrutan är en nära-duplikat av någon redan vald bild.
    Använder normaliserad korrelation (snabbare än SSIM).
    """
    if not reference_grays:
        return False

    # Skala ner för snabb jämförelse
    small = cv2.resize(frame_gray, (64, 64))

    for ref in reference_grays:
        ref_small = cv2.resize(ref, (64, 64))
        correlation = cv2.matchTemplate(
            small, ref_small, cv2.TM_CCORR_NORMED
        )[0][0]
        if correlation > threshold:
            return True

    return False


# ─── Huvudanalys ──────────────────────────────────────────────────────────────

def analyze_video(video_path: str, start_time: float = 0, end_time: float = None,
                  top_n: int = 10, min_gap: float = 1.0,
                  progress_callback=None) -> dict:
    """
    Analysera video och returnera de bästa bildrutorna.

    Args:
        video_path: Sökväg till videofil
        start_time: Starttid i sekunder
        end_time: Sluttid i sekunder (None = hela videon)
        top_n: Max antal bilder
        min_gap: Minsta avstånd i sekunder mellan valda bilder
        progress_callback: Funktion som anropas med (progress_pct, message)

    Returns:
        dict med metadata, scores och filsökvägar till sparade bilder
    """
    def report(pct, msg):
        if progress_callback:
            progress_callback(pct, msg)

    # ─── Metadata ────────────────────────────────────────────────────
    report(0, "Läser videometadata...")
    metadata = get_video_metadata(video_path)
    if not metadata:
        return {"error": "Kunde inte öppna videofilen."}

    fps = metadata["fps"]
    if fps <= 0:
        return {"error": "Ogiltig framerate (0 fps)."}

    duration = metadata["duration"]
    if end_time is None or end_time > duration:
        end_time = duration
    if start_time >= end_time:
        return {"error": f"Starttid ({start_time:.1f}s) måste vara före sluttid ({end_time:.1f}s)."}

    # ─── Steg 1: I-frame-identifiering ───────────────────────────────
    report(5, "Identifierar nyckelbilder (I-frames) via ffprobe...")
    keyframe_times = get_keyframe_times(video_path)

    # Filtrera till tidsintervall
    candidate_times = [t for t in keyframe_times if start_time <= t <= end_time]

    use_keyframes = len(candidate_times) >= 3
    if not use_keyframes:
        # Fallback: sampla bildrutor jämnt fördelat (var 0.5:e sekund)
        report(10, "Få nyckelbilder hittades — samplar var 0.5:e sekund...")
        sample_interval = 0.5
        candidate_times = []
        t = start_time
        while t <= end_time:
            candidate_times.append(t)
            t += sample_interval
    else:
        report(10, f"Hittade {len(candidate_times)} nyckelbilder i intervallet.")

    # ─── Steg 2: Composite scoring ───────────────────────────────────
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {"error": "Kunde inte öppna videofilen för analys."}

    scored_candidates = []
    total = len(candidate_times)

    for i, t in enumerate(candidate_times):
        frame_num = int(t * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
        ret, frame = cap.read()
        if not ret:
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        scores = composite_score(gray)
        scores["time"] = t
        scores["frame_num"] = frame_num
        scores["is_keyframe"] = use_keyframes
        scored_candidates.append(scores)

        pct = 10 + int((i / total) * 70)
        report(pct, f"Analyserar bildruta {i+1}/{total} ({t:.1f}s)...")

    cap.release()

    if not scored_candidates:
        return {"error": "Inga bildrutor kunde analyseras."}

    # ─── Normalisera och vikta ───────────────────────────────────────
    report(82, "Beräknar composite scores...")
    scored_candidates = normalize_and_weight(scored_candidates)

    # Sortera efter composite score (högst först)
    scored_candidates.sort(key=lambda x: x["composite"], reverse=True)

    # ─── Steg 3: Välj topp-N med min-gap + duplikatfilter ───────────
    report(85, "Väljer de bästa bildrutorna...")
    selected = []
    selected_grays = []

    cap = cv2.VideoCapture(video_path)

    for candidate in scored_candidates:
        if len(selected) >= top_n:
            break

        # Min-gap-filter
        too_close = any(abs(candidate["time"] - s["time"]) < min_gap for s in selected)
        if too_close:
            continue

        # Duplikatfilter
        cap.set(cv2.CAP_PROP_POS_FRAMES, candidate["frame_num"])
        ret, frame = cap.read()
        if not ret:
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if is_duplicate(gray, selected_grays):
            continue

        selected.append(candidate)
        selected_grays.append(gray)

    # ─── Spara valda bildrutor ───────────────────────────────────────
    report(90, "Sparar bildrutor...")
    video_name = Path(video_path).stem
    # Sanitera filnamn
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in video_name)
    output_dir = os.path.join(tempfile.gettempdir(), "sharpframe_output", safe_name)
    os.makedirs(output_dir, exist_ok=True)

    results = []
    for i, candidate in enumerate(sorted(selected, key=lambda x: x["time"])):
        cap.set(cv2.CAP_PROP_POS_FRAMES, candidate["frame_num"])
        ret, frame = cap.read()
        if not ret:
            continue

        t = candidate["time"]
        h = int(t // 3600)
        m = int((t % 3600) // 60)
        s = int(t % 60)
        time_str = f"{h:02d}h{m:02d}m{s:02d}s" if h > 0 else f"{m:02d}m{s:02d}s"

        filename = f"{safe_name}_{time_str}_q{int(candidate['composite'])}.png"
        filepath = os.path.join(output_dir, filename)
        cv2.imwrite(filepath, frame)

        # Skapa thumbnail
        thumb_dir = os.path.join(output_dir, "thumbs")
        os.makedirs(thumb_dir, exist_ok=True)
        thumb_path = os.path.join(thumb_dir, filename)
        thumb_h = 300
        scale = thumb_h / frame.shape[0]
        thumb_w = int(frame.shape[1] * scale)
        thumb = cv2.resize(frame, (thumb_w, thumb_h))
        cv2.imwrite(thumb_path, thumb)

        results.append({
            "rank": i + 1,
            "time": t,
            "time_str": time_str,
            "filename": filename,
            "filepath": filepath,
            "thumb_path": thumb_path,
            "composite": round(candidate["composite"], 1),
            "sharpness": round(candidate["sharpness"], 1),
            "exposure": round(candidate["exposure"], 1),
            "contrast": round(candidate["contrast_norm"], 1),
            "is_keyframe": candidate["is_keyframe"],
        })

        pct = 90 + int((i / len(selected)) * 10)
        report(pct, f"Sparar bild {i+1}/{len(selected)}...")

    cap.release()
    report(100, "Klart!")

    return {
        "metadata": metadata,
        "output_dir": output_dir,
        "total_candidates": len(candidate_times),
        "selected_count": len(results),
        "used_keyframes": use_keyframes,
        "results": results,
    }
