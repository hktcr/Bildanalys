'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../docs/sharpframe/core.js');
let passed=0;const observations={};
function check(name,test){test();passed++;console.log(`PASS: ${name}`);}
function frame(w,h,fn){const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=fn(x,y);const i=(y*w+x)*4;if(Array.isArray(c)){data.set(c,i);}else{data[i]=data[i+1]=data[i+2]=c;}data[i+3]=255;}return {width:w,height:h,data};}
function blur(image,sigma){const {width:w,height:h,data}=image,r=Math.ceil(sigma*3),weights=Array.from({length:2*r+1},(_,i)=>Math.exp(-((i-r)**2)/(2*sigma*sigma))),sum=weights.reduce((a,b)=>a+b);weights.forEach((v,i)=>weights[i]=v/sum);const tmp=new Float64Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let k=-r;k<=r;k++)tmp[y*w+x]+=weights[k+r]*data[(y*w+Math.max(0,Math.min(w-1,x+k)))*4];return frame(w,h,(x,y)=>{let v=0;for(let k=-r;k<=r;k++)v+=weights[k+r]*tmp[Math.max(0,Math.min(h-1,y+k))*w+x];return v;});}
let seed=81173;function rand(){seed=(1664525*seed+1013904223)>>>0;return (seed+.5)/4294967296;}function gaussian(){return Math.sqrt(-2*Math.log(rand()))*Math.cos(2*Math.PI*rand());}
const clean=frame(256,192,(x,y)=>((x%32<16)^(y%32<16))?180:80),soft=blur(clean,1.6);
const noisy=frame(256,192,(x,y)=>soft.data[(y*256+x)*4]+gaussian()*16),flatNoise=frame(256,192,()=>128+gaussian()*16),lowContrast=frame(256,192,(x,y)=>((x%32<16)^(y%32<16))?133:123);
const m={clean:C.metrics(clean),soft:C.metrics(soft),noisy:C.metrics(noisy),flatNoise:C.metrics(flatNoise),lowContrast:C.metrics(lowContrast)};observations.metrics=m;
check('Uniform input gives finite zero detail',()=>{const v=C.metrics(frame(8,8,()=>128));assert.equal(v.detailRaw,0);assert.equal(v.sharpnessRaw,0);});
check('Tiny images produce finite scores',()=>{for(const [w,h] of [[1,1],[3,3],[4,4],[1,20]])assert(Object.values(C.metrics(frame(w,h,()=>4))).every(Number.isFinite));});
check('Invalid pixel array rejected',()=>assert.throws(()=>C.metrics({width:3,height:3,data:[]})));
check('Sharp > blurred same scene at several blur levels',()=>{for(const s of [1,1.6,2.5])assert(m.clean.detailRaw>C.metrics(blur(clean,s)).detailRaw);});
check('Legacy noise failure reproduced',()=>assert(m.noisy.sharpnessRaw>m.clean.sharpnessRaw));
check('Damped metric corrects noisy-blur fixture ordering',()=>assert(m.clean.detailRaw>m.noisy.detailRaw));
check('Known limitation retained: noise can beat low-contrast detail',()=>assert(m.flatNoise.detailRaw>m.lowContrast.detailRaw));
check('Analysis bounded in both axes',()=>{for(const [w,h] of [[7680,4320],[32000,3],[3,32000],[1920,1080],[1080,1920]]){const s=C.analysisSize(w,h);assert(s.width<=1280&&s.height<=720&&s.width>=1&&s.height>=1);}});
check('Sampling bounded/exclusive with small and long clips',()=>{for(const span of [.03,.1,.11,2,800,7200])for(const step of [.1,.5,5]){const t=C.samplingTimes(0,span,step);assert(t.length>=1&&t.length<=600);assert(t.every(x=>x>=0&&x<span));assert.equal(new Set(t).size,t.length);}});
check('Sampling rejects invalid intervals',()=>{for(const args of [[0,0,.1],[-1,2,.5],[0,2,0],[0,2,NaN],[0,2,1,0]])assert.throws(()=>C.samplingTimes(...args));});
const sig=C.signature(clean);
check('Identical image is similar',()=>assert(C.similar(sig,C.signature(clean))));
check('Brightness change is retained',()=>assert(!C.similar(sig,C.signature(frame(256,192,(x,y)=>clean.data[(y*256+x)*4]+15)))));
check('Equal-luma different colors are retained',()=>assert(!C.similar(C.signature(frame(32,32,()=>[255,0,0,255])),C.signature(frame(32,32,()=>[0,130,0,255])))));
check('Different image structure retained',()=>assert(!C.similar(sig,C.signature(frame(256,192,(x,y)=>((x%32<16)^(y%32<16))?80:180)))));
check('Small subject-change false match explicitly documented',()=>{const a=frame(256,192,()=>128),b=frame(256,192,(x,y)=>x>=128&&x<130&&y>=96&&y<98?160:128);assert(C.similar(C.signature(a),C.signature(b)));});
const candidates=C.normalize([0,1,2].map((time,i)=>({time,detailRaw:20-i*.01,sharpnessRaw:20-i,contrast:5,exposure:60,signature:sig})));
check('Dedupe off preserves candidates',()=>assert.equal(C.select(candidates,{count:3,gap:0,dedupe:false}).selected.length,3));
check('Dedupe on removes but never fills with rejected frames',()=>{const r=C.select(candidates,{count:3,gap:0,dedupe:true});assert.equal(r.selected.length,1);assert.equal(r.similarSkipped,2);});
check('Temporal spacing exclusions counted separately',()=>{const r=C.select(candidates,{count:3,gap:1.1});assert.equal(r.selected.length,2);assert.equal(r.spacingSkipped,1);});
check('Sorting retains sub-display precision and deterministic tie break',()=>{assert.deepEqual(C.ranked(candidates,'detail').map(f=>f.time),[0,1,2]);assert.deepEqual(C.ranked([{time:2,detailRaw:1},{time:1,detailRaw:1}],'detail').map(f=>f.time),[1,2]);});
check('Equal scores finite; no calibrated quality claim',()=>{const rows=C.normalize([0,1].map(time=>({time,detailRaw:1,sharpnessRaw:1,contrast:1,exposure:100})));assert(rows.every(r=>r.detail===0&&Number.isFinite(r.composite)));});
check('Refinement is bounded, unique, exclusive and not coarse duplicates',()=>{const base=C.samplingTimes(0,120,.5),rows=C.normalize(base.map(time=>({time,detailRaw:100-time,sharpnessRaw:2,contrast:1,exposure:20}))),r=C.refinementTimes(rows,0,120,.5,'detail',base);assert(r.length>0&&r.length<=80);assert.equal(new Set(r.map(t=>Math.round(t*1e6))).size,r.length);assert(r.every(t=>t>=0&&t<120&&!base.includes(t)));assert(Math.max(...r)>20,'seeds distributed rather than only first adjacent scores');});
const html=fs.readFileSync(path.join(__dirname,'../docs/sharpframe/index.html'),'utf8'),app=fs.readFileSync(path.join(__dirname,'../docs/sharpframe/app.js'),'utf8');
check('Self-contained local scripts and no remote fonts/scripts',()=>{assert(!/https?:\/\//.test(html));assert(html.includes('src="core.js"')&&html.includes('src="app.js?v=20261024-range"'));});
check('Every direct DOM identifier resolves',()=>{const ids=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));for(const m of app.matchAll(/\$\('([^']+)'\)/g))assert(ids.has(m[1]),m[1]);});
check('Native keyboard file button and modal dialog',()=>{assert(/<button[^>]+id="choose-file"/.test(html));assert(/<dialog[^>]+id="lightbox"/.test(html));assert(app.includes('.showModal()'));assert(html.includes('aria-label="Stäng bildgranskning"'));});
check('Temporal inputs labeled and support very short clips',()=>{assert(html.includes('for="start-range"')&&html.includes('for="end-range"'));for(const id of ['start-range','end-range'])assert(new RegExp(`id="${id}"[^>]*step="any"`).test(html));});
check('Similarity opt-in, refinement transparent',()=>{assert(!/id="dedupe"[^>]*checked/.test(html));assert(html.includes('Sök tätare nära kandidater'));assert(html.includes('inte verifierade frame-ID'));});
check('Separate thumbnails and explicit export limits',()=>{assert(app.includes('img.src=r.thumbUrl'));assert(app.includes('C.LIMITS.exportBytes'));assert(app.includes('C.LIMITS.exportPixels'));assert(html.includes('inte ett tak för webbläsarens totala minne'));});
check('No cropping or disappearing error timer',()=>{assert(!html.includes('object-fit: cover'));assert(html.includes('role="alert"'));assert(!/setTimeout\([^\n]*upload-error/.test(app));});
console.log(`${passed}/${passed} PASS`);console.log('FIXTURE OBSERVATIONS '+JSON.stringify(observations));
