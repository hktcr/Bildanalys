/* Offline frame-by-frame export: renderer speed never changes file timing. */
(function(root,factory){const api=factory(root.SharpFrameTimeline||(typeof require==='function'&&require('./timeline.js')),root.SharpFrameWebM||(typeof require==='function'&&require('./webm.js')));if(typeof module==='object'&&module.exports)module.exports=api;else root.SharpFrameExport=api;})(globalThis,(Timeline,WebM)=>{
'use strict';
const MEMORY_LIMIT=192*1024*1024;
const aborted=()=>new DOMException('Avbruten','AbortError');
function check(signal){if(signal?.aborted)throw aborted();}
function bounded(promise,signal,ms=30000){return new Promise((resolve,reject)=>{let timer,done=false;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};const abort=()=>finish(aborted());signal?.addEventListener('abort',abort,{once:true});if(ms!==null)timer=setTimeout(()=>finish(new Error('Videobearbetningen svarade inte. Avbryt och prova ett kortare klipp.')),ms);if(signal?.aborted)abort();Promise.resolve(promise).then(v=>finish(null,v),e=>finish(e));});}
function memorySink(retainedBytes=0){let chunks=[],size=0,closed=false;return {
    async write(data){if(closed)throw new Error('Exporten är stängd.');if(size+retainedBytes+data.byteLength>MEMORY_LIMIT)throw new Error('Exportfilen och tidigare film överskrider minnesgränsen 192 MiB. Rensa föregående film eller välj Spara direkt till fil.');chunks.push(data);size+=data.byteLength;},
    async close(){closed=true;},async abort(){chunks=[];size=0;closed=true;},
    result(){if(!closed||!size)throw new Error('Exporten är inte färdig.');return new Blob(chunks,{type:'video/webm'});},get size(){return size;}
};}
function fileSink(stream){let size=0,state='writing',completion=null;return {
    async write(data){if(state!=='writing')throw new Error('Exporten är stängd.');await stream.write(data);size+=data.byteLength;},
    async close(){if(state!=='writing')throw new Error('Filen håller redan på att slutskrivas.');state='committing';completion=Promise.resolve().then(()=>stream.close()).then(()=>{state='committed';},error=>{state='uncertain';throw error;});await completion;},
    async abort(){if(state==='writing'){state='aborting';try{await stream.abort();state='aborted';}catch(error){state='uncertain';throw error;}}},
    get size(){return size;},get state(){return state;},get completion(){return completion;}
};}
async function acquireFileSink(handle,signal,timeout=30000,onLateCleanup=()=>{}){
    check(signal);let abandoned=false,owned=null;
    const pending=Promise.resolve(handle.createWritable()).then(async stream=>{
        const sink=fileSink(stream);
        if(abandoned||signal?.aborted){try{await bounded(sink.abort(),null,2000);onLateCleanup(null);}catch(error){onLateCleanup(error);}throw aborted();}
        owned=sink;return sink;
    });
    try{const sink=await bounded(pending,signal,timeout);check(signal);return sink;}
    catch(error){abandoned=true;if(owned)try{await bounded(owned.abort(),null,2000);}catch(cleanup){onLateCleanup(cleanup);}throw error;}
}
async function support(config){if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined')return false;try{return (await bounded(VideoEncoder.isConfigSupported(config),null)).supported;}catch{return false;}}
function configFor(size,fps){return {codec:'vp8',width:size.width,height:size.height,framerate:fps,bitrate:Math.max(500000,Math.min(12000000,size.width*size.height*fps*.15)),latencyMode:'realtime',hardwareAcceleration:'prefer-software'};}
function mediaEvent(video,event,signal,start){return new Promise((resolve,reject)=>{let timer;const clean=()=>{clearTimeout(timer);video.removeEventListener(event,ok);video.removeEventListener('error',fail);signal?.removeEventListener('abort',abort);};const ok=()=>{clean();resolve();},fail=()=>{clean();reject(new Error('Kunde inte läsa videon. Prova MP4/H.264 eller WebM.'));},abort=()=>{clean();reject(aborted());};if(signal?.aborted)return abort();video.addEventListener(event,ok,{once:true});video.addEventListener('error',fail,{once:true});signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{clean();reject(new Error('Videoläsningen tog för lång tid.'));},15000);try{start();}catch(e){clean();reject(e);}});}
async function seek(video,time,signal){check(signal);const target=Math.max(0,Math.min(time,Math.max(0,video.duration-.000001)));if(video.error)throw new Error('Videodekodern har stannat.');if(!video.seeking&&video.readyState>=2&&Math.abs(video.currentTime-target)<1e-7)return;await mediaEvent(video,'seeked',signal,()=>{video.currentTime=target;});if(video.readyState<2)await mediaEvent(video,'loadeddata',signal,()=>{});check(signal);}
async function source(url,size,signal){
    const video=document.createElement('video');video.muted=true;video.preload='auto';video.playsInline=true;
    const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;const ctx=canvas.getContext('2d',{alpha:false});
    let previous=-1;
    const close=()=>{video.pause();video.removeAttribute('src');video.load();canvas.width=1;canvas.height=1;};
    try{await mediaEvent(video,'loadeddata',signal,()=>{video.src=url;video.load();});}catch(e){close();throw e;}
    return {async draw(time){check(signal);if(Math.abs(time-previous)>1e-9){await seek(video,time,signal);ctx.drawImage(video,0,0,size.width,size.height);previous=time;}return canvas;},close};
}
async function render({plan,size,frameSource,sink,signal,onProgress=()=>{},onPhase=()=>{},encoderFactory,frameFactory,commitTimeout=30000}){
    let encoder,error=null,writeChain=Promise.resolve(),encoded=0,complete=false,failure=null;
    const writer=new WebM.Writer({...size,fps:plan.fps,frames:plan.frames},sink);
    const onAbort=()=>{try{if(encoder&&encoder.state!=='closed')encoder.close();}catch{}};
    try{
        check(signal);
        encoder=(encoderFactory||((callbacks)=>new VideoEncoder(callbacks)))({
            output(chunk){const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);encoded++;writeChain=writeChain.then(()=>{check(signal);return writer.add(data,chunk.timestamp,chunk.type==='key');}).catch(e=>{error=error||e;});},
            error(e){error=e;}
        });
        signal?.addEventListener('abort',onAbort,{once:true});check(signal);encoder.configure(configFor(size,plan.fps));await bounded(writer.start(),signal);
        for(let i=0;i<plan.frames;i++){
            check(signal);if(error)throw error;
            const timestamp=Math.round(i*1e6/plan.fps),next=Math.round((i+1)*1e6/plan.fps),mapped=Timeline.sample(plan,i/plan.fps);
            const surface=await bounded(frameSource.draw(mapped.time),signal);
            const frame=(frameFactory||((s,o)=>new VideoFrame(s,o)))(surface,{timestamp,duration:next-timestamp});
            try{encoder.encode(frame,{keyFrame:i%(plan.fps*2)===0});}finally{frame.close();}
            // Flush each frame: no unbounded encoder/output promise queue or source-frame cache.
            await bounded(encoder.flush(),signal);await bounded(writeChain,signal);if(error)throw error;
            if(encoded!==i+1)throw new Error('Kodaren gav oväntat antal bildrutor. Ingen ofullständig film sparades.');
            onProgress({frame:i+1,total:plan.frames,seconds:(i+1)/plan.fps,bytes:sink.size});
            if(i%5===0)await new Promise(resolve=>setTimeout(resolve,0));
        }
        check(signal);onPhase('committing');
        try{await bounded(writer.finish(),null,commitTimeout);}catch(error){if(['committing','uncertain','committed'].includes(sink.state))error.commitUncertain=true;throw error;}
        complete=true;
        return {frames:plan.frames,seconds:plan.encodedSeconds,width:size.width,height:size.height,fps:plan.fps,bytes:sink.size,mime:'video/webm',audio:false};
    }catch(error){failure=error;throw error;}finally{
        signal?.removeEventListener('abort',onAbort);try{if(encoder&&encoder.state!=='closed')encoder.close();}catch{}
        frameSource.close();
        if(!complete){try{await bounded(writeChain,null,2000);}catch{}try{await bounded(sink.abort(),null,2000);}catch{if(failure)failure.cleanupUncertain=true;}}
    }
}
return {MEMORY_LIMIT,memorySink,fileSink,acquireFileSink,support,configFor,source,seek,mediaEvent,render,bounded};
});
