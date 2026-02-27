#!/usr/bin/env python3
"""
SharpFrame — Flask Web Application

Lokalt webbgränssnitt för att ladda video, välja tidsintervall
och extrahera de skarpaste bildrutorna.

Starta: python3 app.py
"""

import json
import os
import tempfile
import threading
import uuid
import webbrowser
from pathlib import Path

import cv2
from flask import (Flask, jsonify, render_template, request,
                   send_file, send_from_directory)

from engine import analyze_video, get_video_metadata

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024 * 1024  # 2 GB

# ─── State ────────────────────────────────────────────────────────────────────

UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "sharpframe_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Aktiva jobb: job_id -> {status, progress, message, result}
jobs = {}
# Senast uppladdad video
current_video = {"path": None, "metadata": None}


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload_video():
    """Ta emot videofil och returnera metadata."""
    if "video" not in request.files:
        return jsonify({"error": "Ingen videofil skickades."}), 400

    file = request.files["video"]
    if file.filename == "":
        return jsonify({"error": "Tomt filnamn."}), 400

    # Spara filen
    safe_name = "".join(c if c.isalnum() or c in "-_." else "_" for c in file.filename)
    filepath = os.path.join(UPLOAD_DIR, safe_name)
    file.save(filepath)

    # Hämta metadata
    metadata = get_video_metadata(filepath)
    if not metadata:
        return jsonify({"error": "Kunde inte läsa videofilen."}), 400

    current_video["path"] = filepath
    current_video["metadata"] = metadata

    return jsonify({
        "success": True,
        "filename": safe_name,
        "metadata": metadata,
    })


@app.route("/video/<filename>")
def serve_video(filename):
    """Servera den uppladdade videofilen för HTML5 video-playern."""
    return send_from_directory(UPLOAD_DIR, filename)


@app.route("/analyze", methods=["POST"])
def start_analysis():
    """Starta analys i bakgrundstråd."""
    if not current_video["path"]:
        return jsonify({"error": "Ingen video uppladdad."}), 400

    data = request.get_json() or {}
    start_time = float(data.get("start_time", 0))
    end_time = data.get("end_time")
    if end_time is not None:
        end_time = float(end_time)
    top_n = int(data.get("top_n", 10))
    min_gap = float(data.get("min_gap", 1.0))

    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {
        "status": "running",
        "progress": 0,
        "message": "Startar...",
        "result": None,
    }

    def run_analysis():
        def on_progress(pct, msg):
            jobs[job_id]["progress"] = pct
            jobs[job_id]["message"] = msg

        try:
            result = analyze_video(
                video_path=current_video["path"],
                start_time=start_time,
                end_time=end_time,
                top_n=top_n,
                min_gap=min_gap,
                progress_callback=on_progress,
            )
            jobs[job_id]["result"] = result
            jobs[job_id]["status"] = "done"
        except Exception as e:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["message"] = str(e)

    thread = threading.Thread(target=run_analysis)
    thread.daemon = True
    thread.start()

    return jsonify({"job_id": job_id})


@app.route("/progress/<job_id>")
def get_progress(job_id):
    """Hämta status för ett pågående jobb."""
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Okänt jobb-ID."}), 404

    response = {
        "status": job["status"],
        "progress": job["progress"],
        "message": job["message"],
    }

    if job["status"] == "done" and job["result"]:
        result = job["result"]
        if "error" in result:
            response["error"] = result["error"]
        else:
            response["results"] = result["results"]
            response["total_candidates"] = result["total_candidates"]
            response["selected_count"] = result["selected_count"]
            response["used_keyframes"] = result["used_keyframes"]
            response["output_dir"] = result["output_dir"]

    return jsonify(response)


@app.route("/thumb/<path:filename>")
def serve_thumb(filename):
    """Servera thumbnail-bild."""
    # filename kommer vara typ: safe_name/thumbs/image.png
    base = os.path.join(tempfile.gettempdir(), "sharpframe_output")
    return send_from_directory(base, filename)


@app.route("/download/<path:filename>")
def download_frame(filename):
    """Ladda ner fullupplöst PNG."""
    base = os.path.join(tempfile.gettempdir(), "sharpframe_output")
    return send_from_directory(base, filename, as_attachment=True)


# ─── Start ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = 5555
    print(f"")
    print(f"  ╔══════════════════════════════════════════╗")
    print(f"  ║  SharpFrame — Skärpeanalys               ║")
    print(f"  ║  http://localhost:{port}                   ║")
    print(f"  ╚══════════════════════════════════════════╝")
    print(f"")

    webbrowser.open(f"http://localhost:{port}")
    app.run(debug=False, port=port, host="127.0.0.1")
