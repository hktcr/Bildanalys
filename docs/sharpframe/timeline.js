/* Deterministic output-time -> source-time mapping. No media or DOM dependency. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SharpFrameTimeline=api;})(globalThis,()=>{
'use strict';
const LIMITS=Object.freeze({stops:100,hold:120,ramp:30,duration:21600,frames:648000});
function number(value,name,min,max){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`${name}: ange ett tal mellan ${min} och ${max}.`);return value;}
function build({duration,stops=[],rate=1,fps=25}){
    number(duration,'Filmlängd',.001,LIMITS.duration);number(rate,'Tempo',.25,2);
    if(![25,30].includes(fps))throw new Error('Välj 25 eller 30 bilder per sekund.');
    if(!Array.isArray(stops)||stops.length>LIMITS.stops)throw new Error('Högst 100 stopp stöds.');
    const sorted=stops.map((s,index)=>({id:s.id??String(index),time:number(s.time,'Stopptid',0,duration),hold:number(s.hold,'Stillbild',.04,LIMITS.hold),brake:number(s.brake,'Inbromsning',0,LIMITS.ramp),resume:number(s.resume,'Uppstart',0,LIMITS.ramp)})).sort((a,b)=>a.time-b.time);
    for(let i=1;i<sorted.length;i++)if(sorted[i].time-sorted[i-1].time<.001)throw new Error('Två stopp ligger på samma tid. Ändra eller ta bort ett av dem.');
    const segments=[],warnings=[];let output=0,source=0;
    function add(type,start,end,seconds,stopId){if(seconds<=1e-10)return;segments.push({type,start,end,outputStart:output,outputEnd:output+seconds,seconds,stopId});output+=seconds;}
    for(let i=0;i<sorted.length;i++){
        const s=sorted[i],previous=i?sorted[i-1].time:0,next=i+1<sorted.length?sorted[i+1].time:duration;
        // Adjacent ramps get at most half their shared source interval; neither can overlap.
        const left=i?(s.time-previous)/2:s.time,right=i+1<sorted.length?(next-s.time)/2:duration-s.time;
        const brake=Math.min(s.brake,2*left/rate),resume=Math.min(s.resume,2*right/rate);
        if(brake<s.brake-1e-8||resume<s.resume-1e-8)warnings.push({id:s.id,brake,resume});
        const begin=s.time-rate*brake/2,end=s.time+rate*resume/2;
        add('motion',source,begin,Math.max(0,begin-source)/rate);
        add('brake',begin,s.time,brake,s.id);add('hold',s.time,s.time,s.hold,s.id);add('resume',s.time,end,resume,s.id);source=end;
    }
    add('motion',source,duration,Math.max(0,duration-source)/rate);
    const frames=Math.max(1,Math.ceil(output*fps-1e-8));
    if(frames>LIMITS.frames)throw new Error('Den nya filmen blir för lång. Korta filmen, stillbilderna eller välj högre tempo.');
    return {duration,rate,fps,stops:sorted,segments,warnings,seconds:output,frames,encodedSeconds:frames/fps};
}
function sample(plan,time){
    number(time,'Förhandsvisningstid',0,plan.encodedSeconds+.000001);
    const t=Math.min(time,plan.seconds),list=plan.segments;
    let lo=0,hi=list.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(t>=list[mid].outputEnd)lo=mid+1;else hi=mid;}
    const s=list[lo];if(!s)return {time:0,type:'motion'};
    const u=Math.max(0,Math.min(1,(t-s.outputStart)/s.seconds));
    const progress=s.type==='brake'?2*u-u*u:s.type==='resume'?u*u:u;
    return {time:Math.max(0,Math.min(plan.duration,s.start+(s.end-s.start)*progress)),type:s.type,stopId:s.stopId};
}
function dimensions(width,height,maxSide=1280){
    number(width,'Bredd',2,16384);number(height,'Höjd',2,16384);if(![640,1280,1920].includes(maxSide))throw new Error('Ogiltig exportstorlek.');
    const scale=Math.min(1,maxSide/Math.max(width,height));
    const out={width:Math.max(2,Math.floor(width*scale/2)*2),height:Math.max(2,Math.floor(height*scale/2)*2)};
    if(Math.abs((out.width/out.height)/(width/height)-1)>.02)throw new Error('Bildens proportioner är för extrema för denna exportstorlek. Välj större storlek eller ett mindre avlångt utsnitt.');
    return out;
}
return {LIMITS,build,sample,dimensions};
});
