/* Ulian Edition — settings: graphics, realism, sensitivity, key rebinding. Loaded BEFORE the main game script. */
(function(){
const DEF={up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',sprint:'ShiftLeft',car:'KeyF',use:'KeyE',swap:'KeyQ',reload:'KeyR',brake:'Space',weather:'KeyT',fists:'Digit1',gun:'Digit2'};
const NAMES={up:'Move forward',down:'Move back',left:'Move left',right:'Move right',sprint:'Sprint',car:'Enter / exit car',use:'Interact',swap:'Switch character',reload:'Reload',brake:'Handbrake',weather:'Weather',fists:'Fists',gun:'Pistol'};
const D={gfx:'high',real:60,fov:65,mouse:1,touch:1,inv:false,keys:{}};
let S=Object.assign({},D,{keys:{}}),KM={};
try{const o=JSON.parse(localStorage.getItem('vcu_settings'));if(o)S=Object.assign(S,o,{keys:Object.assign({},o.keys)})}catch(e){}
const U=window.USET={
 get mouse(){return S.mouse},get touch(){return S.touch},get inv(){return S.inv?-1:1},get fov(){return S.fov},
 get fog(){return .6+S.real/100*.8},
 map:c=>KM[c]||c,
 pr(){const d=window.devicePixelRatio||1;return {low:1,med:Math.min(d,1.25),high:Math.min(d,1.75),ultra:Math.min(d,2.5)}[S.gfx]||1},
 save(){try{localStorage.setItem('vcu_settings',JSON.stringify(S))}catch(e){}},
};
function buildMap(){KM={};for(const a in DEF){const b=S.keys[a]||DEF[a];if(b!==DEF[a])KM[b]=DEF[a]}for(const a in DEF){const b=S.keys[a]||DEF[a];if(b!==DEF[a]&&!KM[DEF[a]])KM[DEF[a]]='_off'}}
U.apply=function(){buildMap();try{Q.hi=S.gfx!=='low';Q.shadow=S.gfx!=='low'&&S.gfx!=='med';
 R.shadowMap.enabled=Q.hi;sun.castShadow=Q.hi;
 R.toneMapping=S.real>=40?THREE.ACESFilmicToneMapping:THREE.NoToneMapping;R.toneMappingExposure=.75+S.real/260;
 const v=document.getElementById('vig');if(v)v.style.opacity=(S.real/100*.75).toFixed(2);
 scene.traverse(o=>{if(o.material)[].concat(o.material).forEach(m=>m.needsUpdate=true)});
 resize()}catch(e){}};
const css=document.createElement('style');css.textContent=`
#set{position:fixed;inset:0;z-index:30;background:#0b0618f2;overflow:auto;touch-action:pan-y;padding:calc(env(safe-area-inset-top,0px) + 14px) 14px calc(env(safe-area-inset-bottom,0px) + 14px)}
#set .in{max-width:560px;margin:0 auto}#set h2{font:italic 900 30px Impact,sans-serif;background:linear-gradient(#ffe36e,#ff4fa0);-webkit-background-clip:text;color:transparent;margin:4px 0 10px}
#set h3{margin:16px 0 6px;color:#7ff;font-size:13px;letter-spacing:3px}#set .row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #fff2}
#set .row span{flex:1}#set button{min-width:0;padding:8px 14px;font-size:13px;margin:2px}#set button.on{background:#ff4fa0;color:#fff}#set input[type=range]{flex:1.2;max-width:240px}
#set .big{width:100%;padding:13px;font-size:16px;margin-top:14px}#set .k{min-width:96px;background:#2b1a55;color:#fff;border:1px solid #fff5}
#vig{position:fixed;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse at center,transparent 55%,#000 130%);opacity:.45}
#bgs{position:absolute;inset:0;z-index:-1;overflow:hidden;background:#1a0a33}#bgs i{position:absolute;inset:0;background:center/cover no-repeat;opacity:0;animation:fd 16s infinite;transform:scale(1.04)}
#bgs i:nth-child(2){animation-delay:8s}#bgs:after{content:"";position:absolute;inset:0;background:linear-gradient(#0008,#0000 35%,#000a)}
@keyframes fd{0%{opacity:0;transform:scale(1.04)}8%{opacity:1}50%{opacity:1;transform:scale(1.12)}58%,100%{opacity:0}}`;
document.head.appendChild(css);
function key(c){return c.replace('Key','').replace('Digit','').replace('Arrow','↔').replace('ShiftLeft','Shift').replace('Space','Space')}
let el=null,listen=null;
U.close=function(){if(el){el.remove();el=null}listen=null};
U.open=function(){U.close();el=document.createElement('div');el.id='set';
 ['touchstart','touchmove','touchend'].forEach(t=>el.addEventListener(t,e=>e.stopPropagation(),{passive:true}));
 const sl=(id,lab,min,max,step,fmt)=>`<div class="row"><span>${lab}: <b id="v_${id}">${fmt(S[id])}</b></span><input type="range" id="s_${id}" min="${min}" max="${max}" step="${step}" value="${S[id]}"></div>`;
 const opt=(id,lab,vals)=>`<div class="row"><span>${lab}</span><div>${vals.map(v=>`<button data-o="${id}" data-v="${v[0]}" class="${S[id]===v[0]?'on':''}">${v[1]}</button>`).join('')}</div></div>`;
 el.innerHTML=`<div class="in"><h2>SETTINGS</h2><h3>GRAPHICS</h3>${opt('gfx','Quality',[['low','Low'],['med','Medium'],['high','High'],['ultra','Ultra']])}
 ${sl('real','Realism (light, contrast, haze)',0,100,5,v=>v+'%')}${sl('fov','Field of view',50,100,1,v=>v+'°')}
 <h3>CONTROLS</h3>${sl('mouse','Mouse sensitivity',.2,3,.1,v=>(+v).toFixed(1)+'x')}${sl('touch','Touch look sensitivity',.2,3,.1,v=>(+v).toFixed(1)+'x')}
 <div class="row"><span>Invert Y axis</span><button data-inv class="${S.inv?'on':''}">${S.inv?'ON':'OFF'}</button></div>
 <h3>KEY BINDINGS (click, then press a key)</h3>${Object.keys(DEF).map(a=>`<div class="row"><span>${NAMES[a]}</span><button class="k" data-a="${a}">${key(S.keys[a]||DEF[a])}</button></div>`).join('')}
 <button class="big" id="s_reset">Reset to defaults</button><button class="big" id="s_ok" style="background:#ffe36e">DONE</button></div>`;
 document.body.appendChild(el);
 el.querySelectorAll('input[type=range]').forEach(i=>i.oninput=()=>{const id=i.id.slice(2);S[id]=+i.value;el.querySelector('#v_'+id).textContent=id==='real'?S[id]+'%':id==='fov'?S[id]+'°':(+S[id]).toFixed(1)+'x';U.save();U.apply()});
 el.querySelectorAll('[data-o]').forEach(b=>b.onclick=()=>{S[b.dataset.o]=b.dataset.v;U.save();U.apply();U.open()});
 el.querySelector('[data-inv]').onclick=()=>{S.inv=!S.inv;U.save();U.open()};
 el.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{b.textContent='press…';listen=b.dataset.a});
 el.querySelector('#s_reset').onclick=()=>{S=Object.assign({},D,{keys:{}});U.save();U.apply();U.open()};
 el.querySelector('#s_ok').onclick=()=>{try{localStorage.setItem('vcu_settings_seen','1')}catch(e){}U.close()};
};
addEventListener('keydown',e=>{if(!el)return;e.stopPropagation();e.preventDefault();
 if(listen){if(e.code!=='Escape'){const a=listen,old=S.keys[a]||DEF[a];for(const o in DEF)if(o!==a&&(S.keys[o]||DEF[o])===e.code)S.keys[o]=old;S.keys[a]=e.code;U.save();U.apply()}listen=null;U.open()}
 else if(e.code==='Escape')U.close()},true);
addEventListener('keyup',e=>{if(el)e.stopPropagation()},true);
U.boot=function(){const v=document.createElement('div');v.id='vig';document.body.appendChild(v);U.apply();
 const m=document.getElementById('menu');if(m){const b=document.createElement('div');b.id='bgs';b.innerHTML='<i style="background-image:url(img/trailer1.jpg)"></i><i style="background-image:url(img/trailer2.jpg)"></i>';m.prepend(b)}
 let seen=0;try{seen=localStorage.getItem('vcu_settings_seen')}catch(e){}if(!seen)setTimeout(U.open,300)};
})();
