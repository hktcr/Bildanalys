/* Small streaming WebM/VP8 writer. One frame per Cluster, no retained frame index.
   WebM subset: EBML v1, Matroska v4, one VP8 video track, millisecond timebase.
   No Cues: sequential playback is supported; seeking may scan in some players. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SharpFrameWebM=api;})(globalThis,()=>{
'use strict';
const bytes=(...v)=>new Uint8Array(v),text=s=>new TextEncoder().encode(s);
function concat(parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;}
function uint(n){if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid unsigned integer');let a=[];do{a.unshift(n%256);n=Math.floor(n/256);}while(n);return new Uint8Array(a);}
function size(n){if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid element size');for(let l=1;l<=7;l++)if(n<2**(7*l)-1){const a=new Uint8Array(l);for(let i=l-1;i>=0;i--){a[i]=n%256;n=Math.floor(n/256);}a[0]|=1<<(8-l);return a;}throw new Error('Element too large');}
function element(id,payload){return concat([uint(id),size(payload.length),payload]);}
const u=(id,n)=>element(id,uint(n)),str=(id,s)=>element(id,text(s));
function float(n){const a=new Uint8Array(8);new DataView(a.buffer).setFloat64(0,n);return a;}
function header({width,height,fps,frames}){
    if(![width,height,fps,frames].every(n=>Number.isSafeInteger(n)&&n>0)||width>1920||height>1920||![25,30].includes(fps))throw new Error('Invalid WebM configuration');
    const ebml=element(0x1a45dfa3,concat([u(0x4286,1),u(0x42f7,1),u(0x42f2,4),u(0x42f3,8),str(0x4282,'webm'),u(0x4287,4),u(0x4285,2)]));
    const info=element(0x1549a966,concat([u(0x2ad7b1,1000000),str(0x4d80,'SharpFrame'),str(0x5741,'SharpFrame'),element(0x4489,float(frames*1000/fps))]));
    const video=element(0xe0,concat([u(0xb0,width),u(0xba,height)]));
    const tracks=element(0x1654ae6b,element(0xae,concat([u(0xd7,1),u(0x73c5,1),u(0x83,1),u(0x9c,0),str(0x86,'V_VP8'),u(0x23e383,Math.round(1e9/fps)),video])));
    return concat([ebml,uint(0x18538067),bytes(1,255,255,255,255,255,255,255),info,tracks]);
}
function frame(data,timestamp,key){
    if(!(data instanceof Uint8Array)||!data.length||!Number.isSafeInteger(timestamp)||timestamp<0)throw new Error('Invalid encoded frame');
    // Every Cluster has an absolute timestamp, so the signed block offset stays zero.
    return element(0x1f43b675,concat([u(0xe7,Math.round(timestamp/1000)),element(0xa3,concat([bytes(0x81,0,0,key?0x80:0),data]))]));
}
class Writer{
    constructor(config,sink){this.config=config;this.sink=sink;this.count=0;this.last=-1;this.started=false;}
    async start(){if(this.started)throw new Error('Writer already started');this.started=true;await this.sink.write(header(this.config));}
    async add(data,timestamp,key){if(!this.started||this.count>=this.config.frames||timestamp<=this.last)throw new Error('Invalid frame order');if(this.count===0&&!key)throw new Error('First frame must be a keyframe');await this.sink.write(frame(data,timestamp,key));this.last=timestamp;this.count++;}
    async finish(){if(this.count!==this.config.frames)throw new Error(`Incomplete export: ${this.count}/${this.config.frames}`);await this.sink.close();}
}
return {header,frame,Writer};
});
