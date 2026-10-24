/* SharpFrame's local, deterministic scoring and selection helpers.
 * Scores are heuristics on decoded, downscaled RGB, not calibrated focus. */
(function (root) {
    'use strict';
    const LIMITS = Object.freeze({samples: 600, refinements: 80, analysisWidth: 1280, analysisHeight: 720,
        exportPixels: 36000000, exportDimension: 16384, exportBytes: 256 * 1024 * 1024});
    function samplingTimes(start, end, interval, limit = LIMITS.samples) {
        if (![start, end, interval, limit].every(Number.isFinite) || start < 0 || end <= start || interval <= 0 || limit < 1) throw new Error('Ogiltigt tidsintervall.');
        const count = Math.min(Math.floor(limit), Math.max(1, Math.ceil((end - start) / interval)));
        const step = Math.max(interval, (end - start) / count);
        return Array.from({length: count}, (_, i) => start + i * step).filter(t => t < end);
    }
    function analysisSize(width, height) {
        const scale = Math.min(1, LIMITS.analysisWidth / width, LIMITS.analysisHeight / height);
        return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
    }
    function metrics(image) {
        const {width: w, height: h, data: d} = image, n = w * h;
        if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || d.length !== n * 4) throw new Error('Ogiltiga bilddata.');
        const gray = new Float32Array(n), horizontal = new Float32Array(n), smooth = new Float32Array(n);
        let sum = 0, sumSq = 0;
        for (let i = 0; i < n; i++) {const v = .299 * d[4*i] + .587 * d[4*i+1] + .114 * d[4*i+2]; gray[i] = v; sum += v; sumSq += v*v;}
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = y*w+x; horizontal[i] = (gray[y*w+Math.max(0,x-1)] + 2*gray[i] + gray[y*w+Math.min(w-1,x+1)]) / 4;
        }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = y*w+x; smooth[i] = (horizontal[Math.max(0,y-1)*w+x] + 2*horizontal[i] + horizontal[Math.min(h-1,y+1)*w+x]) / 4;
        }
        let lapSum = 0, lapSq = 0, lapCount = 0, gradient = 0, gradientCount = 0;
        for (let y = 1; y < h-1; y++) for (let x = 1; x < w-1; x++) {
            const i = y*w+x, lap = gray[i-1]+gray[i+1]+gray[i-w]+gray[i+w]-4*gray[i];
            lapSum += lap; lapSq += lap*lap; lapCount++;
            if (x < 2 || x >= w-2 || y < 2 || y >= h-2) continue;
            const gx = (-smooth[i-w-1]+smooth[i-w+1]-2*smooth[i-1]+2*smooth[i+1]-smooth[i+w-1]+smooth[i+w+1])/8;
            const gy = (-smooth[i-w-1]-2*smooth[i-w]-smooth[i-w+1]+smooth[i+w-1]+2*smooth[i+w]+smooth[i+w+1])/8;
            gradient += gx*gx+gy*gy; gradientCount++;
        }
        const mean = sum/n;
        return {detailRaw: gradientCount ? gradient/gradientCount : 0,
            sharpnessRaw: lapCount ? Math.max(0,lapSq/lapCount-(lapSum/lapCount)**2) : 0,
            exposure: Math.max(0,(1-Math.abs(mean-128)/128)*100), contrast: Math.sqrt(Math.max(0,sumSq/n-mean*mean))};
    }
    function signature(image) {
        // Average blocks retain absolute RGB. A small thumbnail can still hide a tiny subject change.
        const size = 32, {width: w, height: h, data: d} = image, rgb = new Float32Array(size*size*3);
        for (let by = 0; by < size; by++) for (let bx = 0; bx < size; bx++) {
            const x0=Math.floor(bx*w/size), x1=Math.max(x0+1,Math.floor((bx+1)*w/size));
            const y0=Math.floor(by*h/size), y1=Math.max(y0+1,Math.floor((by+1)*h/size));
            let count=0; const j=(by*size+bx)*3;
            for(let y=y0;y<Math.min(h,y1);y++) for(let x=x0;x<Math.min(w,x1);x++) {
                const i=(y*w+x)*4; rgb[j]+=d[i];rgb[j+1]+=d[i+1];rgb[j+2]+=d[i+2];count++;
            }
            for(let c=0;c<3;c++)rgb[j+c]/=count||1;
        }
        const hash=[];
        function lum(x,y){const i=(Math.round(y*31/7)*32+Math.round(x*31/8))*3;return .299*rgb[i]+.587*rgb[i+1]+.114*rgb[i+2];}
        for(let y=0;y<8;y++)for(let x=0;x<8;x++)hash.push(lum(x,y)>lum(x+1,y));
        return {rgb,hash};
    }
    function similar(a,b) {
        if(!a || !b || a.rgb.length!==3072 || b.rgb.length!==3072 || a.hash.length!==64 || b.hash.length!==64)return false;
        let changed=0, distance=0; const sums=[0,0,0];
        for(let p=0;p<1024;p++) {let maximum=0;for(let c=0;c<3;c++){const delta=Math.abs(a.rgb[3*p+c]-b.rgb[3*p+c]);sums[c]+=delta;maximum=Math.max(maximum,delta);}if(maximum>8)changed++;}
        for(let i=0;i<64;i++)if(a.hash[i]!==b.hash[i])distance++;
        return sums.every(s=>s/1024<=2) && changed/1024<=.01 && distance<=2;
    }
    function normalize(frames) {
        for(const [raw,target] of [['detailRaw','detail'],['sharpnessRaw','sharpness'],['contrast','contrastNorm']]) {
            const values=frames.map(f=>f[raw]),lo=Math.min(...values),hi=Math.max(...values);
            for(const f of frames)f[target]=hi>lo?100*(f[raw]-lo)/(hi-lo):0;
        }
        for(const f of frames)f.composite=.5*f.sharpness+.25*f.exposure+.25*f.contrastNorm;
        return frames;
    }
    function score(frame,mode) {return mode==='sharpness'?frame.sharpnessRaw:mode==='composite'?frame.composite:frame.detailRaw;}
    function ranked(frames,mode) {return [...frames].sort((a,b)=>score(b,mode)-score(a,mode)||a.time-b.time);}
    function select(frames,{count,gap,mode='detail',dedupe=false}) {
        const selected=[];let spacingSkipped=0,similarSkipped=0;
        for(const frame of ranked(frames,mode)) {
            if(selected.length>=count)break;
            if(selected.some(other=>Math.abs(other.time-frame.time)+1e-9<gap)){spacingSkipped++;continue;}
            if(dedupe && selected.some(other=>similar(other.signature,frame.signature))){similarSkipped++;continue;}
            selected.push(frame);
        }
        return {selected,spacingSkipped,similarSkipped};
    }
    function refinementTimes(frames,start,end,step,mode,existing) {
        const seeds=select(frames,{count:20,gap:Math.max(step*2,(end-start)/40),mode}).selected;
        const offset=Math.min(step/5,.1),seen=new Set(existing.map(t=>Math.round(t*1e6))),times=[];
        for(const seed of seeds)for(const delta of [-2,-1,1,2]) {
            const t=seed.time+delta*offset,key=Math.round(t*1e6);
            if(t>=start && t<end && !seen.has(key)){seen.add(key);times.push(t);}
        }
        return times.sort((a,b)=>a-b).slice(0,LIMITS.refinements);
    }
    const api={LIMITS,samplingTimes,analysisSize,metrics,signature,similar,normalize,score,ranked,select,refinementTimes};
    if(typeof module!=='undefined' && module.exports)module.exports=api;
    if(root)root.SharpFrameCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
