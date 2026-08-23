const imageCanvas=document.querySelector('#imageCanvas');
const canvasBox=document.querySelector('#canvasBox');
const analysisHint=document.querySelector('#analysisHint');
const targetSelect=document.querySelector('#outputTarget');
const shadowLimit=document.querySelector('#outputShadow');
const highlightLimit=document.querySelector('#outputHighlight');
const clusterMin=document.querySelector('#outputClusterMin');
const connectivity=document.querySelector('#outputConnectivity');
const backgroundSelect=document.querySelector('#outputBackground');
const riskOpacity=document.querySelector('#outputOpacity');
const runBtn=document.querySelector('#outputRun');
const summary=document.querySelector('#outputSummary');
const legend=document.querySelector('#outputLegend');

const riskCanvas=document.createElement('canvas');
riskCanvas.id='outputRiskCanvas';
riskCanvas.hidden=true;
canvasBox.appendChild(riskCanvas);
const rctx=riskCanvas.getContext('2d',{willReadFrequently:true});

const PRESETS={
  screen:{shadow:8,highlight:247},
  conservative:{shadow:12,highlight:243},
  custom:{shadow:8,highlight:247}
};

function pct(n,t){return t?`${(100*n/t).toFixed(3)} %`:'0.000 %'}
function neighbors(p,w,h,c){const x=p%w,y=(p/w)|0,a=[];if(x>0)a.push(p-1);if(x<w-1)a.push(p+1);if(y>0)a.push(p-w);if(y<h-1)a.push(p+w);if(c===8){if(x>0&&y>0)a.push(p-w-1);if(x<w-1&&y>0)a.push(p-w+1);if(x>0&&y<h-1)a.push(p+w-1);if(x<w-1&&y<h-1)a.push(p+w+1)}return a}
function clusters(mask,w,h,c){const seen=new Uint8Array(mask.length),out=[];for(let p=0;p<mask.length;p++){if(!mask[p]||seen[p])continue;const q=[p],pix=[];seen[p]=1;while(q.length){const cur=q.pop();pix.push(cur);for(const n of neighbors(cur,w,h,c))if(mask[n]&&!seen[n]){seen[n]=1;q.push(n)}}out.push(pix)}return out.sort((a,b)=>b.length-a.length)}
function applyBackground(){const v=backgroundSelect.value;imageCanvas.style.opacity=v==='image'?'1':v==='dim'?'0.16':'0';canvasBox.classList.toggle('outputNeutral',v==='hidden')}
function resetBackground(){imageCanvas.style.opacity='1';canvasBox.classList.remove('outputNeutral')}
function renderLegend(){legend.innerHTML='<span><i class="riskSwatch shadow"></i>Risk för svag skuggseparation</span><span><i class="riskSwatch highlight"></i>Risk för svag högdagerseparation</span>'}
function thresholds(){return{lo:Number(shadowLimit.value),hi:Number(highlightLimit.value)}}
function analyze(){if(!imageCanvas.width||!imageCanvas.height){summary.textContent='Ingen analyserad bild.';return}const w=imageCanvas.width,h=imageCanvas.height;if(riskCanvas.width!==w||riskCanvas.height!==h){riskCanvas.width=w;riskCanvas.height=h}const src=imageCanvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data,t=thresholds(),low=new Uint8Array(w*h),high=new Uint8Array(w*h);let total=0,lowN=0,highN=0;for(let p=0,k=0;p<w*h;p++,k+=4){if(src[k+3]===0)continue;total++;const y=Math.round(.2126*src[k]+.7152*src[k+1]+.0722*src[k+2]);if(y<=t.lo){low[p]=1;lowN++}if(y>=t.hi){high[p]=1;highN++}}const conn=Number(connectivity.value),min=Math.max(1,Number(clusterMin.value)||1),lc=clusters(low,w,h,conn),hc=clusters(high,w,h,conn),sigL=lc.filter(x=>x.length>=min),sigH=hc.filter(x=>x.length>=min),keepL=new Uint8Array(w*h),keepH=new Uint8Array(w*h);for(const c of sigL)for(const p of c)keepL[p]=1;for(const c of sigH)for(const p of c)keepH[p]=1;const out=rctx.createImageData(w,h),a=Math.round(255*(Number(riskOpacity.value)||.78));for(let p=0,k=0;p<w*h;p++,k+=4){if(keepL[p]){out.data[k]=40;out.data[k+1]=105;out.data[k+2]=255;out.data[k+3]=a}else if(keepH[p]){out.data[k]=255;out.data[k+1]=70;out.data[k+2]=55;out.data[k+3]=a}}rctx.putImageData(out,0,0);riskCanvas.hidden=false;applyBackground();const sigLP=sigL.reduce((s,c)=>s+c.length,0),sigHP=sigH.reduce((s,c)=>s+c.length,0);summary.innerHTML=`<div><span>Mål</span><strong>${targetSelect.selectedOptions[0].textContent}</strong></div><div><span>Skuggor ≤ Y ${t.lo}</span><strong>${pct(lowN,total)}</strong></div><div><span>Högdagrar ≥ Y ${t.hi}</span><strong>${pct(highN,total)}</strong></div><div><span>Betydande skuggkluster</span><strong>${sigL.length}, ${pct(sigLP,total)}</strong></div><div><span>Betydande högdagerkluster</span><strong>${sigH.length}, ${pct(sigHP,total)}</strong></div><div><span>Största skuggkluster</span><strong>${lc[0]?.length||0} px</strong></div><div><span>Största högdagerkluster</span><strong>${hc[0]?.length||0} px</strong></div>`;analysisHint.textContent=`Utmatningsrisk uppskattar låg tonal separation i den avkodade sRGB-representationen. Den säger inte att motiv- eller sensordata är klippta. Klusterfiltret ändrar inte pixelvärdena, bara vilka riskområden som markeras.`}
function preset(){const p=PRESETS[targetSelect.value]||PRESETS.custom;if(targetSelect.value!=='custom'){shadowLimit.value=p.shadow;highlightLimit.value=p.highlight}}
targetSelect.addEventListener('change',()=>{preset();analyze()});for(const el of [shadowLimit,highlightLimit,clusterMin,connectivity,backgroundSelect,riskOpacity])el.addEventListener('input',analyze);runBtn.addEventListener('click',analyze);
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.mode!=='outputrisk'){riskCanvas.hidden=true;resetBackground()}}));
document.querySelector('[data-mode="outputrisk"]')?.addEventListener('click',()=>requestAnimationFrame(analyze));
renderLegend();preset();
