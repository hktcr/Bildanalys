'use strict';
const C = SharpFrameCore, $ = id => document.getElementById(id);
let videoFile=null, videoUrl=null, videoDuration=0, currentResults=null, activeRun=null, loadController=null, lightboxIndex=0, displayedResults=[], currentSort="detail";
const videoPlayer=$('video-player'),canvas=$('analysis-canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
const thumbCanvas=document.createElement('canvas'),thumbCtx=thumbCanvas.getContext('2d');
const fileInput=$('file-input'),dropZone=$('drop-zone');
const modeLabels={detail:'Brusdämpad detaljsignal',sharpness:'Rå skärpesignal',composite:'Äldre kombinationsmått'};
function fmt(t){const ms=Math.max(0,Math.round(t*1000)),h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;return `${h?h+':':''}${h?String(m).padStart(2,'0'):m}:${String(s).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;}
function fmtFile(t){return fmt(t).replace(/:/g,'m').replace('.','s');}
function showError(message){$('upload-error').textContent=message;$('upload-error').classList.remove('hidden');$('upload-error').focus();$('upload-error').scrollIntoView({block:'nearest'});}
function hideError(){$('upload-error').classList.add('hidden');$('upload-error').textContent='';}
function releaseResults(results){for(const r of results||[]){URL.revokeObjectURL(r.dataUrl);URL.revokeObjectURL(r.thumbUrl);}}
function clearResults(){closeLightbox();releaseResults(currentResults);currentResults=null;displayedResults=[];$('results-grid').replaceChildren();$('results-section').classList.add('hidden');}
function waitMedia(video,event,signal,start,timeout=15000){
    return new Promise((resolve,reject)=>{
        let timer,settled=false;
        const cleanup=()=>{clearTimeout(timer);video.removeEventListener(event,ok);video.removeEventListener('error',fail);signal?.removeEventListener('abort',abort);};
        const finish=error=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve();};
        const ok=()=>finish(),fail=()=>finish(new Error('Videon kunde inte avkodas. Prova MP4 med H.264 eller WebM i en webbläsare som stöder formatet.'));
        const abort=()=>finish(new DOMException('Avbruten','AbortError'));
        if(signal?.aborted)return abort();
        video.addEventListener(event,ok,{once:true});video.addEventListener('error',fail,{once:true});signal?.addEventListener('abort',abort,{once:true});
        timer=setTimeout(()=>finish(new Error('Videoläsningen tog för lång tid. Prova ett kortare klipp eller ett annat format.')),timeout);
        try{start();}catch(error){finish(error);}
    });
}
function updatePlan(){
    const start=+$('start-range').value,end=+$('end-range').value,interval=+$('sample-interval').value;
    $('start-time-display').textContent=fmt(start);$('end-time-display').textContent=fmt(end);$('start-range').setAttribute('aria-valuetext',fmt(start));$('end-range').setAttribute('aria-valuetext',fmt(end));
    try{
        const analysisDimensions=C.analysisSize(videoPlayer.videoWidth,videoPlayer.videoHeight);
        if(analysisDimensions.width<5||analysisDimensions.height<5)throw new Error('Videons extrema bildproportioner ger för få pixlar för meningsfull detaljanalys. Prova ett mindre avlångt utsnitt.');
        const times=C.samplingTimes(start,end,interval),step=times.length>1?times[1]-times[0]:Math.min(interval,end-start);
        const capped=(end-start)/interval>C.LIMITS.samples;
        $('analysis-plan').textContent=`${times.length} grundstickprov, ungefär ${step.toFixed(3)} s mellan söktiderna.${capped?' Gränsen 600 stickprov glesar ut urvalet; korta ner intervallet för tätare täckning.':''}${$('refine').checked?' Därefter högst 80 tätare stickprov nära lovande kandidater.':''} Alla videorutor granskas inte.`;
    }catch{$('analysis-plan').textContent='Välj ett giltigt tidsintervall och samplingsteg.';}
}
async function loadVideo(file){
    if(activeRun||window.SharpFrameMovie?.busy){showError('Avbryt pågående analys eller filmexport innan du byter video.');return;}
    window.SharpFrameMovie?.sourceWillChange();
    loadController?.abort();const controller=new AbortController();loadController=controller;
    clearResults();hideError();videoFile=null;videoDuration=0;videoPlayer.pause();
    for(const id of ['settings-section','video-info','progress-section'])$(id).classList.add('hidden');
    if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=URL.createObjectURL(file);
    try{
        await waitMedia(videoPlayer,'loadeddata',controller.signal,()=>{videoPlayer.src=videoUrl;videoPlayer.load();});
        if(controller.signal.aborted)return;
        if(!Number.isFinite(videoPlayer.duration)||videoPlayer.duration<=0||videoPlayer.videoWidth<3||videoPlayer.videoHeight<3)throw new Error('Videon saknar användbar längd eller bildstorlek.');
        videoFile=file;videoDuration=videoPlayer.duration;
        $('info-filename').textContent=file.name;$('info-resolution').textContent=`${videoPlayer.videoWidth} × ${videoPlayer.videoHeight}`;$('info-duration').textContent=fmt(videoDuration);
        $('video-info').classList.remove('hidden');
        $('start-range').max=videoDuration;$('start-range').value=0;$('end-range').max=videoDuration;$('end-range').value=videoDuration;
        $('settings-section').classList.remove('hidden');updatePlan();
        window.SharpFrameMovie?.sourceLoaded({file:videoFile,url:videoUrl,duration:videoDuration,width:videoPlayer.videoWidth,height:videoPlayer.videoHeight});
    }catch(error){if(error.name!=='AbortError'){if(loadController===controller){videoPlayer.removeAttribute('src');videoPlayer.load();if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=null;}showError(error.message);}}
}
$('choose-file').addEventListener('click',()=>fileInput.click());
fileInput.addEventListener('change',e=>{const file=e.target.files[0];fileInput.value='';if(file)loadVideo(file);});
dropZone.addEventListener('dragover',e=>{e.preventDefault();dropZone.classList.add('dragover');});
dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop',e=>{e.preventDefault();dropZone.classList.remove('dragover');const file=e.dataTransfer.files[0];if(file)loadVideo(file);});
for(const id of ['start-range','end-range'])$(id).addEventListener('input',()=>{
    updatePlan();const t=+$(id).value;if(Number.isFinite(t))videoPlayer.currentTime=Math.min(t,Math.max(0,videoDuration-.000001));
});
for(const id of ['sample-interval','refine'])$(id).addEventListener('input',updatePlan);
$('set-start').addEventListener('click',()=>{$('start-range').value=videoPlayer.currentTime;updatePlan();});
$('set-end').addEventListener('click',()=>{$('end-range').value=videoPlayer.currentTime;updatePlan();});
async function seekVideo(video,time,signal){
    if(signal?.aborted)throw new DOMException('Avbruten','AbortError');
    if(video.error)throw new Error('Videodekodern har rapporterat ett fel. Prova ett annat videoformat.');
    if(!video.seeking&&video.readyState>=2&&Math.abs(video.currentTime-time)<.000001)return;
    await waitMedia(video,'seeked',signal,()=>{video.currentTime=time;});
    if(video.readyState<2)await waitMedia(video,'loadeddata',signal,()=>{});
}
async function measureFrame(video,time,signal){
    await seekVideo(video,time,signal);const size=C.analysisSize(video.videoWidth,video.videoHeight);
    canvas.width=size.width;canvas.height=size.height;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(video,0,0,size.width,size.height);const data=ctx.getImageData(0,0,size.width,size.height);
    return {time,...C.metrics(data),signature:C.signature(data)};
}
function canvasBlob(target,type,signal,quality){return new Promise((resolve,reject)=>{
    let settled=false,timer;
    const finish=(error,blob)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(blob);};
    const abort=()=>finish(new DOMException('Avbruten','AbortError'));
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)return abort();
    timer=setTimeout(()=>finish(new Error('Bildexporten tog för lång tid.')),30000);
    try{target.toBlob(blob=>finish(blob?null:new Error('Kunde inte skapa bildfil.'),blob),type,quality);}catch(error){finish(error);}
});}
async function captureExport(video,time,signal){
    await seekVideo(video,time,signal);const w=video.videoWidth,h=video.videoHeight;
    if(w*h>C.LIMITS.exportPixels||w>C.LIMITS.exportDimension||h>C.LIMITS.exportDimension)throw new Error('Bildstorleken överskrider exportgränsen (36 megapixel eller 16 384 px per sida). Använd en mindre videoversion.');
    canvas.width=w;canvas.height=h;ctx.drawImage(video,0,0);
    const png=await canvasBlob(canvas,'image/png',signal);
    const scale=Math.min(1,480/w,320/h);thumbCanvas.width=Math.max(1,Math.round(w*scale));thumbCanvas.height=Math.max(1,Math.round(h*scale));
    thumbCtx.imageSmoothingEnabled=true;thumbCtx.imageSmoothingQuality='high';thumbCtx.drawImage(canvas,0,0,thumbCanvas.width,thumbCanvas.height);
    const thumbnail=await canvasBlob(thumbCanvas,'image/jpeg',signal,.85);
    return {png,thumbnail};
}
function setBusy(busy){
    window.SharpFrameMovie?.analysisBusy(busy);
    $('analyze-btn').disabled=busy;fileInput.disabled=busy;$('choose-file').disabled=busy;
    document.querySelectorAll('#settings-section input,#settings-section select,#settings-section button').forEach(el=>el.disabled=busy);
    $('clear-results').disabled=busy;$('cancel-btn').disabled=!busy;$('progress-badge').classList.toggle('pulse',busy);
}
$('analyze-btn').addEventListener('click',runAnalysis);
$('cancel-btn').addEventListener('click',()=>activeRun?.abort());
async function runAnalysis(){
    if(activeRun||!videoFile||window.SharpFrameMovie?.busy)return;
    const start=+$('start-range').value,end=+$('end-range').value,count=+$('top-n').value,gap=+$('min-gap').value,interval=+$('sample-interval').value,mode=$('ranking-mode').value;
    if(![start,end,count,gap,interval].every(Number.isFinite)||!Number.isInteger(count)||count<1||count>50||gap<0||gap>30||interval<.1||interval>5||start<0||end>videoDuration||start>=end||!Object.hasOwn(modeLabels,mode)){showError('Kontrollera start före slut, antal 1–50, avstånd 0–30 och sampling 0,1–5 sekunder.');return;}
    const controller=new AbortController();activeRun=controller;const signal=controller.signal,sourceFile=videoFile,sourceUrl=videoUrl;
    const dedupe=$('dedupe').checked,refine=$('refine').checked,video=document.createElement('video');video.muted=true;video.preload='auto';video.playsInline=true;
    const retainedBytes=(currentResults||[]).reduce((total,r)=>total+(r.pngBytes||0),0);
    const results=[];let committed=false,totalBytes=0;
    hideError();videoPlayer.pause();setBusy(true);closeLightbox();$('progress-section').classList.remove('hidden');$('progress-heading').textContent='Analyserar…';$('progress-bar').style.width='0%';$('progress-message').textContent='Läser video…';
    try{
        if(videoPlayer.videoWidth*videoPlayer.videoHeight>C.LIMITS.exportPixels||Math.max(videoPlayer.videoWidth,videoPlayer.videoHeight)>C.LIMITS.exportDimension)throw new Error('Videons bildstorlek överskrider exportgränsen. Högst 36 megapixel och 16 384 px per sida stöds.');
        const analysisDimensions=C.analysisSize(videoPlayer.videoWidth,videoPlayer.videoHeight);
        if(analysisDimensions.width<5||analysisDimensions.height<5)throw new Error('Videons extrema bildproportioner ger för få pixlar för meningsfull detaljanalys. Prova ett mindre avlångt utsnitt.');
        const times=C.samplingTimes(start,end,interval),step=times.length>1?times[1]-times[0]:Math.min(interval,end-start),scored=[];let failed=0,consecutiveFailures=0,refinementCount=0;
        await waitMedia(video,'loadeddata',signal,()=>{video.src=sourceUrl;video.load();});
        async function scan(scanTimes,label,base,weight){
            for(let i=0;i<scanTimes.length;i++){
                try{scored.push(await measureFrame(video,scanTimes[i],signal));consecutiveFailures=0;}
                catch(error){if(error.name==='AbortError')throw error;failed++;if(++consecutiveFailures>=3)throw new Error('Tre bildrutor i följd kunde inte läsas. Prova ett kortare klipp eller ett annat videoformat.');}
                $('progress-bar').style.width=`${base+weight*(i+1)/scanTimes.length}%`;$('progress-message').textContent=`${label} ${i+1}/${scanTimes.length}`;
                await new Promise(r=>setTimeout(r,0));
            }
        }
        await scan(times,'Grundstickprov',0,refine?55:75);
        if(!scored.length)throw new Error('Inga bildrutor kunde analyseras.');
        C.normalize(scored);
        if(refine){const finer=C.refinementTimes(scored,start,end,step,mode,times);refinementCount=finer.length;await scan(finer,'Tätare sökning nära kandidater',55,20);C.normalize(scored);}
        const selection=C.select(scored,{count,gap,mode,dedupe});
        for(let i=0;i<selection.selected.length;i++){
            const frame=selection.selected[i],{png,thumbnail}=await captureExport(video,frame.time,signal);
            if(signal.aborted)throw new DOMException('Avbruten','AbortError');
            if(retainedBytes+totalBytes+png.size>C.LIMITS.exportBytes)throw new Error('Gamla och nya PNG-filer överskrider tillsammans exportbudgeten 256 MiB. Välj färre bilder eller rensa tidigare resultat och försök igen. Tidigare färdiga resultat finns kvar.');
            totalBytes+=png.size;
            const {signature,...values}=frame;
            results.push({...values,pngBytes:png.size,rank:i+1,mode,timeStr:fmt(frame.time),dataUrl:URL.createObjectURL(png),thumbUrl:URL.createObjectURL(thumbnail),filename:`${sourceFile.name.replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')}_${fmtFile(frame.time)}_${i+1}.png`});
            $('progress-bar').style.width=`${75+25*(i+1)/selection.selected.length}%`;$('progress-message').textContent=`Skapar PNG ${i+1}/${selection.selected.length}`;
            await new Promise(r=>setTimeout(r,0));
        }
        if(signal.aborted)throw new DOMException('Avbruten','AbortError');
        clearResults();currentResults=results;committed=true;
        const size=C.analysisSize(video.videoWidth,video.videoHeight);
        $('results-summary').textContent=`${results.length} av högst ${count} bilder valda med ${modeLabels[mode].toLowerCase()}. ${scored.length} lyckade stickprov (${times.length} grundsökningar + ${refinementCount} tätare sökningar), ${failed} misslyckade. Överhoppade före fullt urval: ${selection.spacingSkipped} för tidsavstånd, ${selection.similarSkipped} för visuell likhet.${results.length<count?' Färre kandidater klarade urvalsreglerna; reglerna har inte lättats automatiskt.':''} Analys ${size.width} × ${size.height} px; PNG ${video.videoWidth} × ${video.videoHeight} px i avkodad originalstorlek. Relativa poäng gäller bara dessa stickprov.`;
        $('results-section').classList.remove('hidden');$('progress-heading').textContent='Analys klar';$('progress-message').textContent='Färdiga kandidater finns nedan.';
        setSort(mode);$('results-heading').focus();
    }catch(error){$('progress-heading').textContent=error.name==='AbortError'?'Analys avbruten':'Analysen kunde inte slutföras';$('progress-message').textContent=error.name==='AbortError'?'Inga ofullständiga resultat sparades. Du kan försöka igen. Tidigare färdiga resultat finns kvar.':error.message;if(error.name!=='AbortError')showError(error.message);}
    finally{if(!committed)releaseResults(results);video.pause();video.removeAttribute('src');video.load();video.remove();canvas.width=1;canvas.height=1;thumbCanvas.width=1;thumbCanvas.height=1;activeRun=null;setBusy(false);}
}
function setSort(mode){currentSort=mode;document.querySelectorAll('.sort-btn').forEach(btn=>{const selected=btn.dataset.sort===mode;btn.classList.toggle('active',selected);btn.setAttribute('aria-pressed',String(selected));});if(currentResults)renderResults(mode);}
function renderResults(mode){
    const sorted=mode==='time'?[...currentResults].sort((a,b)=>a.time-b.time):C.ranked(currentResults,mode),grid=$('results-grid');displayedResults=sorted;grid.replaceChildren();
    for(const r of sorted){
        const card=document.createElement('article');card.className='result-card';
        const thumb=document.createElement('button');thumb.className='result-thumb';thumb.type='button';thumb.setAttribute('aria-label',`Visa kandidat ${r.rank}, ${r.timeStr}`);
        const img=document.createElement('img');img.src=r.thumbUrl;img.alt='';img.loading='lazy';thumb.append(img);thumb.addEventListener('click',()=>openLightbox(displayedResults.indexOf(r)));
        const info=document.createElement('p');info.className='result-scores';info.textContent=`Kandidat ${r.rank} · ${r.timeStr} · ${modeLabels[displayMode(r)]} ${relativeScore(r,displayMode(r)).toFixed(1)}`;
        const download=document.createElement('button');download.className='download-btn';download.textContent='Ladda ner PNG';download.setAttribute('aria-label',`Ladda ner kandidat ${r.rank}, ${r.timeStr}, som PNG`);download.addEventListener('click',()=>downloadImage(r.dataUrl,r.filename));
        card.append(thumb,info,download);
        if(window.SharpFrameMovie){const add=document.createElement('button');add.className='secondary-btn movie-candidate';add.type='button';add.textContent='Lägg till filmstopp';add.setAttribute('aria-label',`Lägg till filmstopp vid ${r.timeStr}`);add.addEventListener('click',()=>window.SharpFrameMovie.addStop(r.time,r.thumbUrl));card.append(add);}
        grid.append(card);
    }
}
function displayMode(r){return currentSort==='time'?r.mode:currentSort;}
function relativeScore(r,mode=r.mode){return mode==='sharpness'?r.sharpness:mode==='composite'?r.composite:r.detail;}
function downloadImage(url,name){const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();}
function showLightboxFrame(){const r=displayedResults[lightboxIndex];$('lightbox-img').src=r.dataUrl;$('lightbox-img').alt=`Kandidat ${r.rank}, ${r.timeStr}`;$('lightbox-info').textContent=`${lightboxIndex+1}/${displayedResults.length} · ${r.timeStr} · ${modeLabels[displayMode(r)]} ${relativeScore(r,displayMode(r)).toFixed(1)}`;}
function openLightbox(index){if(!displayedResults?.length)return;lightboxIndex=index;showLightboxFrame();if(!$('lightbox').open)$('lightbox').showModal();}
function closeLightbox(){if($('lightbox').open)$('lightbox').close();$('lightbox-img').removeAttribute('src');}
$('lightbox-close').addEventListener('click',closeLightbox);
$('lightbox-prev').addEventListener('click',()=>{lightboxIndex=(lightboxIndex+displayedResults.length-1)%displayedResults.length;showLightboxFrame();});
$('lightbox-next').addEventListener('click',()=>{lightboxIndex=(lightboxIndex+1)%displayedResults.length;showLightboxFrame();});
$('lightbox').addEventListener('click',e=>{if(e.target===$('lightbox'))closeLightbox();});
$('lightbox').addEventListener('close',()=>{$('lightbox-img').removeAttribute('src');});
$('lightbox').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();$(e.key==='ArrowLeft'?'lightbox-prev':'lightbox-next').click();}});
for(const btn of document.querySelectorAll('.sort-btn'))btn.addEventListener('click',()=>setSort(btn.dataset.sort));
$('clear-results').addEventListener('click',()=>{clearResults();$('analyze-btn').focus();});
$('new-analysis-btn').addEventListener('click',()=>{$('settings-section').scrollIntoView({behavior:'smooth'});$('analyze-btn').focus();});
window.addEventListener('pagehide',event=>{activeRun?.abort();loadController?.abort();if(event.persisted)return;clearResults();if(videoUrl)URL.revokeObjectURL(videoUrl);});

if(window.SharpFrameMovie)$('lightbox-add-stop').addEventListener('click',()=>{const r=displayedResults[lightboxIndex];if(r){window.SharpFrameMovie.addStop(r.time,r.thumbUrl);closeLightbox();}});
