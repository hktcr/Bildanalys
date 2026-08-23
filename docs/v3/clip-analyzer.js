const imageCanvas=document.querySelector('#imageCanvas');
const canvasBox=document.querySelector('#canvasBox');
const clipButton=document.querySelector('[data-mode="clipmap"]');
const clipPanel=document.querySelector('#clipPanel');
const clipMode=document.querySelector('#clipMode');
const clipThreshold=document.querySelector('#clipThreshold');
const clipOpacity=document.querySelector('#clipOpacity');
const clipLegend=document.querySelector('#clipLegend');
const clipSummary=document.querySelector('#clipSummary');
const clipHelp=document.querySelector('#clipHelp');
const analysisHint=document.querySelector('#analysisHint');

const clipControls=clipPanel.querySelector('.clipControls');
const backgroundLabel=document.createElement('label');
backgroundLabel.innerHTML='Bakgrund <select id="clipBackground"><option value="image">Bild</option><option value="dim">Dämpad bild</option><option value="hidden">Döljd, neutralgrå</option></select>';
clipControls.insertBefore(backgroundLabel,clipControls.lastElementChild);
const clipBackground=backgroundLabel.querySelector('#clipBackground');

const clipCanvas=document.createElement('canvas');
clipCanvas.id='clipCanvas';
clipCanvas.hidden=true;
canvasBox.appendChild(clipCanvas);
const ctx=clipCanvas.getContext('2d',{willReadFrequently:true});
let active=false;

const COLORS={1:[255,55,55],2:[40,210,105],3:[255,220,35],4:[65,125,255],5:[245,65,235],6:[45,220,235],7:[255,255,255]};

function pct(n,total){return total?`${(100*n/total).toFixed(3)} %`:'0.000 %'}
function thresholdValues(){return clipThreshold.value==='strict'?{lo:0,hi:255,label:'exakta ändpunkter 0 och 255'}:{lo:1,hi:254,label:'varningszon ≤1 och ≥254'}}
function flags(r,g,b,t,side){const test=side==='high'?v=>v>=t.hi:v=>v<=t.lo;return(test(r)?1:0)|(test(g)?2:0)|(test(b)?4:0)}
function setPixel(out,k,c,a){out[k]=c[0];out[k+1]=c[1];out[k+2]=c[2];out[k+3]=a}
function isEdge(mask,p,w,h){const x=p%w,y=(p/w)|0;if(x===0||y===0||x===w-1||y===h-1)return true;return mask[p-1]!==7||mask[p+1]!==7||mask[p-w]!==7||mask[p+w]!==7}
function legendFor(mode){if(mode==='quick')return[['#ef3b3b','Ljus clipping, minst en kanal'],['#356cff','Mörk clipping, minst en kanal'],['#b54cff','Både ljus och mörk kanalgräns i samma pixel']];if(mode==='full')return[['#ffffff','Alla R, G och B vid övre gränsen'],['#111111','Alla R, G och B vid nedre gränsen']];return[['#ff3737','R'],['#28d269','G'],['#417dff','B'],['#ffdc23','R + G'],['#f541eb','R + B'],['#2ddceb','G + B'],['#ffffff','R + G + B']]}
function renderLegend(){clipLegend.innerHTML=legendFor(clipMode.value).map(([c,t])=>`<span class="clipKey"><i class="clipSwatch" style="background:${c}"></i>${t}</span>`).join('')}
function renderSummary(s){const rows=[['Pixlar i visningsrastret',s.total.toLocaleString('sv-SE')],['Ljus, valfri kanal',pct(s.anyHi,s.total)],['Mörk, valfri kanal',pct(s.anyLo,s.total)],['Alla tre ljusa',pct(s.allHi,s.total)],['Alla tre mörka',pct(s.allLo,s.total)],['R ljus',pct(s.rHi,s.total)],['G ljus',pct(s.gHi,s.total)],['B ljus',pct(s.bHi,s.total)],['R mörk',pct(s.rLo,s.total)],['G mörk',pct(s.gLo,s.total)],['B mörk',pct(s.bLo,s.total)]];clipSummary.innerHTML=rows.map(([a,b])=>`<div><span>${a}</span><strong>${b}</strong></div>`).join('')}
function applyBackground(){canvasBox.classList.remove('clipBg-image','clipBg-dim','clipBg-hidden');if(active)canvasBox.classList.add(`clipBg-${clipBackground.value}`)}
function updateHelp(){const t=thresholdValues(),m=clipMode.value;const modeText=m==='quick'?'Snabbkontroll: rött visar ljus kanalgräns och blått mörk kanalgräns.':m==='high'?'Kanaldiagnos högdagrar: färgen visar exakt vilka RGB-kanaler som når den övre gränsen.':m==='shadow'?'Kanaldiagnos skuggor: färgen visar exakt vilka RGB-kanaler som når den nedre gränsen. Svart med ljus kant betyder att alla tre ligger vid golvet.':'Full RGB-klippning: endast pixlar där alla tre kanaler samtidigt ligger vid taket eller golvet visas.';const bg=clipBackground.value==='image'?'Originalbilden visas bakom masken.':clipBackground.value==='dim'?'Originalbilden är kraftigt dämpad bakom masken.':'Originalbilden är helt dold. Neutralgrå bakgrund gör både vit och svart clipping synlig.';clipHelp.textContent=`${modeText} Tröskel: ${t.label}. ${bg}`;analysisHint.textContent=`Clippingkartan analyserar den avkodade sRGB-representationen på visningsrastret. ${clipThreshold.value==='strict'?'0 och 255 är exakta ändpunkter i denna 8-bitars representation.':'Detta läge inkluderar även pixlar nära ändpunkterna och är en varning, inte strikt clipping.'} Detta bevisar inte sensorclipping i en RAW-fil.`}
function draw(){if(!active||!imageCanvas.width||!imageCanvas.height)return;applyBackground();const w=imageCanvas.width,h=imageCanvas.height;if(clipCanvas.width!==w||clipCanvas.height!==h){clipCanvas.width=w;clipCanvas.height=h}const src=imageCanvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;const out=ctx.createImageData(w,h),t=thresholdValues(),mode=clipMode.value,alpha=Math.round(255*(Number(clipOpacity.value)||0.72));const hiMask=new Uint8Array(w*h),loMask=new Uint8Array(w*h);const s={total:0,anyHi:0,anyLo:0,allHi:0,allLo:0,rHi:0,gHi:0,bHi:0,rLo:0,gLo:0,bLo:0};for(let p=0,k=0;p<w*h;p++,k+=4){if(src[k+3]===0)continue;s.total++;const r=src[k],g=src[k+1],b=src[k+2],hm=flags(r,g,b,t,'high'),lm=flags(r,g,b,t,'low');hiMask[p]=hm;loMask[p]=lm;if(hm){s.anyHi++;if(hm&1)s.rHi++;if(hm&2)s.gHi++;if(hm&4)s.bHi++;if(hm===7)s.allHi++}if(lm){s.anyLo++;if(lm&1)s.rLo++;if(lm&2)s.gLo++;if(lm&4)s.bLo++;if(lm===7)s.allLo++}}for(let p=0,k=0;p<w*h;p++,k+=4){const hm=hiMask[p],lm=loMask[p];if(mode==='quick'){if(hm&&lm)setPixel(out.data,k,[181,76,255],alpha);else if(hm)setPixel(out.data,k,[239,59,59],alpha);else if(lm)setPixel(out.data,k,[53,108,255],alpha)}else if(mode==='high'&&hm)setPixel(out.data,k,COLORS[hm],alpha);else if(mode==='shadow'&&lm){if(lm===7)setPixel(out.data,k,isEdge(loMask,p,w,h)?[245,245,245]:[15,15,15],Math.max(alpha,220));else setPixel(out.data,k,COLORS[lm],alpha)}else if(mode==='full'){if(hm===7)setPixel(out.data,k,[255,255,255],Math.max(alpha,220));else if(lm===7)setPixel(out.data,k,isEdge(loMask,p,w,h)?[245,245,245]:[10,10,10],Math.max(alpha,220))}}ctx.putImageData(out,0,0);renderLegend();renderSummary(s);updateHelp()}
function activate(){active=true;clipCanvas.hidden=false;clipPanel.classList.add('on');applyBackground();requestAnimationFrame(draw)}
function deactivate(){active=false;clipCanvas.hidden=true;clipPanel.classList.remove('on');canvasBox.classList.remove('clipBg-image','clipBg-dim','clipBg-hidden')}
document.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{if(btn===clipButton)requestAnimationFrame(activate);else deactivate()}));
for(const el of [clipMode,clipThreshold,clipOpacity,clipBackground])el.addEventListener('input',draw);
for(const el of [clipMode,clipThreshold,clipBackground])el.addEventListener('change',draw);
new MutationObserver(()=>{if(active)requestAnimationFrame(draw)}).observe(imageCanvas,{attributes:true,attributeFilter:['width','height']});
renderLegend();updateHelp();