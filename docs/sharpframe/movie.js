(function(){
'use strict';
const T=SharpFrameTimeline,E=SharpFrameExport,$=id=>document.getElementById(id);
let source=null,stops=[],nextId=1,plan=null,exportController=null,previewController=null,analysis=false,capable=false,capabilityGeneration=0,sourceGeneration=0,outputUrl=null,outputBytes=0,previewTime=0,scrubTimer=null,locked=[],pendingCommit=false,commitWarning='';
const fmt=value=>{const ms=Math.round(Math.max(0,value)*1000),minutes=Math.floor(ms/60000);return `${minutes}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;};
const labels={motion:'Rörelse',brake:'Bromsning',hold:'Stillbild',resume:'Uppstart'};
function status(text){$('movie-status').textContent=pendingCommit?commitWarning:text;}
function stopPreview(){previewController?.abort();previewController=null;clearTimeout(scrubTimer);$('movie-play').textContent='Spela';}
function clearOutput(){if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl=null;outputBytes=0;$('movie-output').pause();$('movie-output').removeAttribute('src');$('movie-output').load();$('movie-download').removeAttribute('href');$('movie-result').classList.add('hidden');}
function controls(){const busy=!!exportController||analysis;for(const el of $('movie-section').querySelectorAll('button,input,select'))el.disabled=busy;$('movie-cancel').disabled=!exportController;$('movie-export').disabled=busy||pendingCommit||!plan||!capable;$('movie-play').disabled=busy||!plan;$('movie-clear-stops').disabled=busy||!stops.length;$('movie-scrub').disabled=busy||!plan;}
function lockExport(on){
    if(on){locked=[];for(const el of document.querySelectorAll('#settings-section input,#settings-section select,#settings-section button,#choose-file,#file-input,#results-section button,#lightbox-add-stop')){locked.push([el,el.disabled]);el.disabled=true;}}
    else{for(const [el,disabled] of locked)el.disabled=disabled;locked=[];}
    controls();
}
async function updateCapability(){const generation=++capabilityGeneration;capable=false;controls();if(!source)return;let size;try{size=T.dimensions(source.width,source.height,+$('movie-size').value);}catch(error){$('movie-support').textContent=error.message;controls();return;}const yes=await E.support(E.configFor(size,+$('movie-fps').value));if(generation!==capabilityGeneration||!source)return;capable=yes;$('movie-support').textContent=yes?'Exporten kodas lokalt, bildruta för bildruta. Den kan ta längre tid än filmen. Håll fliken öppen. Utan direkt filskrivning är gränsen 192 MiB för färdiga filmfiler tillsammans.':'Den här webbläsaren kan inte exportera VP8 med WebCodecs. Prova aktuell Chrome eller Edge på dator via HTTPS eller localhost. Tidslinjen kan fortfarande redigeras.';controls();}
function updatePlan(){
    stopPreview();plan=null;
    try{
        if(!source)return;
        plan=T.build({duration:source.duration,stops,rate:+$('movie-rate').value,fps:+$('movie-fps').value});
        const size=T.dimensions(source.width,source.height,+$('movie-size').value);
        $('movie-summary').textContent=`Original ${fmt(source.duration)} → ny film ${fmt(plan.encodedSeconds)} · ${stops.length} stopp · ${size.width} × ${size.height} px · ${plan.fps} bilder/s`;
        $('movie-warning').classList.toggle('hidden',!plan.warnings.length);
        $('movie-warning').textContent=plan.warnings.map(w=>`Stopp ${w.id}: bromsning ${w.brake.toFixed(2)} s, uppstart ${w.resume.toFixed(2)} s efter anpassning till filmens kanter eller närliggande stopp.`).join(' ');
        $('movie-scrub').max=plan.encodedSeconds;previewTime=Math.min(previewTime,Math.max(0,plan.encodedSeconds-1/plan.fps));$('movie-scrub').value=previewTime;$('movie-clock').textContent=fmt(previewTime);
    }catch(error){$('movie-summary').textContent=error.message;$('movie-warning').classList.add('hidden');}
    const track=$('movie-track');track.replaceChildren();
    if(plan)for(const segment of plan.segments){const button=document.createElement('button');button.className=`movie-segment ${segment.type}`;button.type='button';button.style.flexGrow=String(segment.seconds);button.style.flexBasis='0';button.title=`${labels[segment.type]} ${fmt(segment.outputStart)}–${fmt(segment.outputEnd)}`;button.setAttribute('aria-label',button.title);if(segment.type==='hold')button.textContent='❚❚';button.addEventListener('click',()=>{previewTime=segment.outputStart;preview(false);});track.append(button);}
    $('movie-empty').classList.toggle('hidden',!!stops.length);controls();
}
function thumbnailFrom(surface){const c=document.createElement('canvas');const w=surface.videoWidth||surface.naturalWidth||surface.width,h=surface.videoHeight||surface.naturalHeight||surface.height,scale=Math.min(1,240/w,160/h);c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));c.getContext('2d').drawImage(surface,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.8);}
function renderStops(){
    const list=$('movie-stops');list.replaceChildren();const sorted=[...stops].sort((a,b)=>a.time-b.time);
    for(const [index,stop] of sorted.entries()){
        const row=document.createElement('li');row.className='movie-stop';row.dataset.stopId=stop.id;
        const image=document.createElement('img');image.alt=`Stopp ${stop.id}`;if(stop.thumbnail)image.src=stop.thumbnail;else image.hidden=true;
        const body=document.createElement('div'),head=document.createElement('div');head.className='movie-stop-head';
        const title=document.createElement('strong');title.textContent=`Stopp ${stop.id}`;const remove=document.createElement('button');remove.type='button';remove.className='secondary-btn';remove.textContent='Ta bort';remove.setAttribute('aria-label',`Ta bort stopp ${stop.id}`);remove.addEventListener('click',()=>{stops=stops.filter(s=>s.id!==stop.id);renderStops();updatePlan();});head.append(title,remove);body.append(head);
        const fields=document.createElement('div');fields.className='movie-stop-fields';
        for(const [key,label,min,max,step] of [['time','Tid i original (s)',0,source.duration,.001],['brake','Bromsa (s)',0,30,.1],['hold','Stillbild (s)',.04,120,.1],['resume','Starta igen (s)',0,30,.1]]){
            const group=document.createElement('div');group.className='setting';const caption=document.createElement('label'),input=document.createElement('input');input.id=`stop-${stop.id}-${key}`;input.type='number';input.min=min;input.max=max;input.step=step;input.value=stop[key];input.setAttribute('aria-label',`${label}, stopp ${stop.id}`);caption.htmlFor=input.id;caption.textContent=label;
            input.addEventListener('input',()=>{stop[key]=input.value===''?NaN:+input.value;if(key==='time'){stop.thumbnail=null;image.hidden=true;}updatePlan();});group.append(caption,input);fields.append(group);
        }
        body.append(fields);row.append(image,body);list.append(row);
    }
    controls();
}
function addStop(time,thumbUrl){
    if(!source||analysis||exportController)return;
    if(stops.length>=T.LIMITS.stops){status('Högst 100 stopp stöds.');return;}
    if(stops.some(s=>Math.abs(s.time-time)<.001)){status('Det finns redan ett stopp på den tiden. Ändra längden i stopplistan.');$('movie-heading').focus();return;}
    const stop={id:String(nextId++),time:Math.max(0,Math.min(source.duration,time)),brake:1.5,hold:3,resume:1.5,thumbnail:null};stops.push(stop);
    if(thumbUrl){const img=new Image(),generation=sourceGeneration;img.onload=()=>{if(generation!==sourceGeneration||!stops.includes(stop)||stop.time!==time)return;stop.thumbnail=thumbnailFrom(img);const row=$('movie-stops').querySelector(`[data-stop-id="${stop.id}"] img`);if(row){row.src=stop.thumbnail;row.hidden=false;}};img.src=thumbUrl;}
    else try{stop.thumbnail=thumbnailFrom($('video-player'));}catch{}
    renderStops();updatePlan();status(`Stopp tillagt vid ${fmt(stop.time)}. Stillbilden visas i 3 sekunder; ändra tiderna ovan efter behov.`);$('movie-heading').focus();$('movie-heading').scrollIntoView({block:'start',behavior:'smooth'});
}
async function preview(play){
    stopPreview();if(!source||!plan||analysis||exportController)return;
    const controller=new AbortController();previewController=controller;const signal=controller.signal,currentPlan=plan,currentSource=source;
    if(play&&previewTime>=plan.encodedSeconds-1/plan.fps)previewTime=0;
    const startTime=previewTime;let media;
    $('movie-play').textContent=play?'Pausa':'Spela';
    try{
        const size=T.dimensions(currentSource.width,currentSource.height,640);media=await E.source(currentSource.url,size,signal);
        const canvas=$('movie-preview'),ctx=canvas.getContext('2d');canvas.width=size.width;canvas.height=size.height;
        const began=performance.now();
        do{
            if(signal.aborted)break;
            const t=play?Math.min(currentPlan.encodedSeconds-1/currentPlan.fps,startTime+(performance.now()-began)/1000):startTime;
            const frame=await media.draw(T.sample(currentPlan,t).time);if(signal.aborted)break;ctx.drawImage(frame,0,0);previewTime=t;
            $('movie-scrub').value=t;$('movie-clock').textContent=fmt(t);$('movie-scrub').setAttribute('aria-valuetext',fmt(t));
            if(!play||t>=currentPlan.encodedSeconds-1/currentPlan.fps)break;
            await new Promise(resolve=>setTimeout(resolve,1000/currentPlan.fps));
        }while(!signal.aborted);
    }catch(error){if(error.name!=='AbortError')status(`Förhandsvisning: ${error.message}`);}
    finally{media?.close();if(previewController===controller){previewController=null;$('movie-play').textContent='Spela';}}
}
function fileName(){return `${source.file.name.replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_')}-filmstopp.webm`;}
async function exportMovie(){
    if(exportController||pendingCommit||analysis||!source||!plan||!capable)return;
    stopPreview();const controller=new AbortController();exportController=controller;const signal=controller.signal,currentSource=source,currentPlan=plan,size=T.dimensions(source.width,source.height,+$('movie-size').value),name=fileName(),direct=$('movie-direct').checked&&typeof showSaveFilePicker==='function';
    let sink,media,handle,renderStarted=false;lockExport(true);$('video-player').pause();$('movie-progress').classList.remove('hidden');$('movie-progress').value=0;status('Förbereder den nya filmen…');
    try{
        // Request the picker during the initiating user gesture, not after asynchronous codec checks.
        if(direct){handle=await E.bounded(showSaveFilePicker({suggestedName:name,types:[{description:'WebM-video',accept:{'video/webm':['.webm']}}]}),signal,null);if(handle.name.normalize('NFC').toLocaleLowerCase()===currentSource.file.name.normalize('NFC').toLocaleLowerCase())throw new Error('Välj ett annat filnamn än originalfilens. Originalet ska bevaras.');}
        if(signal.aborted)throw new DOMException('Avbruten','AbortError');
        if(!await E.bounded(E.support(E.configFor(size,currentPlan.fps)),signal))throw new Error('Den valda exportstorleken stöds inte av videokodaren. Prova 640 px.');
        if(signal.aborted)throw new DOMException('Avbruten','AbortError');
        sink=direct?await E.acquireFileSink(handle,signal,30000,error=>{if(error)status(`Den avbrutna skrivningen till ${handle.name} kunde inte stängas säkert. Kontrollera filen innan du använder den.`);}):E.memorySink(outputBytes);
        media=await E.source(currentSource.url,size,signal);renderStarted=true;
        const started=performance.now();
        const receipt=await E.render({plan:currentPlan,size,frameSource:media,sink,signal,onPhase(phase){if(phase==='committing'){$('movie-cancel').disabled=true;status('Färdigställer filen. Slutskrivningen kan inte avbrytas säkert.');}},onProgress(p){if(p.frame===1||p.frame%10===0||p.frame===p.total){$('movie-progress').value=p.frame/p.total;const elapsed=(performance.now()-started)/1000,remaining=p.frame>10?Math.ceil(elapsed*(p.total-p.frame)/p.frame):null;status(`Skapar film: ${Math.round(p.frame/p.total*100)} % · ${p.frame}/${p.total} bilder${remaining!==null?` · cirka ${remaining} s kvar`:''}.`);}}});
        let blob;
        if(direct){try{blob=await E.bounded(handle.getFile(),null,5000);}catch{status('Filmen har sparats i den valda filen, men förhandsvisningen kunde inte öppnas. Öppna filen från mappen.');return;}}else blob=sink.result();
        clearOutput();outputUrl=URL.createObjectURL(blob);outputBytes=direct?0:blob.size;$('movie-output').src=outputUrl;$('movie-download').href=outputUrl;$('movie-download').download=name;$('movie-result').classList.remove('hidden');
        $('movie-receipt').textContent=`${fmt(receipt.seconds)} · ${receipt.width} × ${receipt.height} px · ${receipt.fps} bilder/s · ${(receipt.bytes/1048576).toFixed(1)} MiB · WebM/VP8 · utan ljud`;
        status(direct?'Filmen är färdig och sparad i den fil du valde. Du kan spela den nedan. Originalfilen är orörd.':'Filmen är färdig. Spela den nedan och välj Ladda ner filmen för att spara. Originalfilen är orörd.');
    }catch(error){
        if(error.commitUncertain){
            pendingCommit=true;
            commitWarning='Slutskrivningen kunde inte bekräftas. Filen kan vara färdig, ofullständig eller oförändrad. Kontrollera den valda filen och ladda om sidan innan du gör en ny export. Ingen automatisk omskrivning görs.'+(outputUrl?' Föregående färdiga film finns kvar.':'');status(commitWarning);
            if(sink?.state==='committing')sink.completion?.then(()=>{pendingCommit=false;commitWarning='';status(`Den fördröjda slutskrivningen är nu klar: ${handle.name}. Filmen är sparad; öppna den från mappen.`);controls();},()=>{commitWarning='Slutskrivningen misslyckades med osäkert filutfall. Kontrollera den valda filen och ladda om sidan innan du gör en ny export.';status(commitWarning);});
            return;
        }
        let cleanupUncertain=!!error.cleanupUncertain;
        if(!renderStarted){media?.close();try{if(sink)await E.bounded(sink.abort(),null,2000);}catch{cleanupUncertain=true;}}
        status((error.name==='AbortError'?'Exporten avbröts. Ingen ofullständig film läggs till.':`Exporten kunde inte slutföras: ${error.message}`)+(cleanupUncertain?' Skrivströmmen kunde inte bekräftas stängd. Kontrollera den valda filen innan du använder den.':direct?' En tom fil kan finnas kvar i den valda mappen.':'')+(outputUrl?' Din föregående färdiga film finns kvar.':''));
    }finally{exportController=null;lockExport(false);}
}
window.SharpFrameMovie={get busy(){return !!exportController;},addStop,
    analysisBusy(busy){analysis=busy;if(busy)stopPreview();controls();},
    sourceWillChange(){stopPreview();sourceGeneration++;capabilityGeneration++;source=null;plan=null;stops=[];nextId=1;capable=false;previewTime=0;clearOutput();$('movie-stops').replaceChildren();$('movie-section').classList.add('hidden');const c=$('movie-preview');c.getContext('2d').clearRect(0,0,c.width,c.height);status(pendingCommit?commitWarning:'');},
    sourceLoaded(value){source=value;$('movie-section').classList.remove('hidden');updatePlan();updateCapability();preview(false);}
};
$('movie-add-current').addEventListener('click',()=>{$('video-player').pause();addStop($('video-player').currentTime);});
$('movie-clear-stops').addEventListener('click',()=>{stops=[];renderStops();updatePlan();status('Stoppen är borttagna. Originalfilen är oförändrad.');});
for(const id of ['movie-rate','movie-size','movie-fps'])$(id).addEventListener('change',()=>{updatePlan();updateCapability();});
$('movie-play').addEventListener('click',()=>previewController?stopPreview():preview(true));
$('movie-scrub').addEventListener('input',()=>{stopPreview();previewTime=+$('movie-scrub').value;$('movie-clock').textContent=fmt(previewTime);scrubTimer=setTimeout(()=>preview(false),80);});
$('movie-export').addEventListener('click',exportMovie);$('movie-cancel').addEventListener('click',()=>exportController?.abort());$('movie-clear-output').addEventListener('click',clearOutput);
if(typeof showSaveFilePicker==='function'){$('movie-direct-option').classList.remove('hidden');$('movie-direct').checked=true;}
window.addEventListener('pagehide',event=>{stopPreview();exportController?.abort();if(!event.persisted)clearOutput();});
})();
