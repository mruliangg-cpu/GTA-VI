const mk=()=>({position:{set(){},x:0,z:0},rotation:{x:0,y:0,z:0},scale:{set(){},setScalar(){}},add(){},remove(){},userData:{},material:{color:{setHSL(){}},emissive:{setHSL(){}}}});
class O{constructor(){Object.assign(this,mk())}}
global.window=global;global.THREE={Group:O,Mesh:O,Sprite:O,SpriteMaterial:O,MeshLambertMaterial:O,MeshBasicMaterial:O,CanvasTexture:O,ACESFilmicToneMapping:1,NoToneMapping:0};
const ctx=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:1}):()=>{},set:()=>true});
global.document={createElement:t=>t==='canvas'?{getContext:()=>ctx,width:0,height:0}:(()=>{const e={style:{},addEventListener(){},append(){},remove(){},appendChild(){},set innerHTML(v){}};BTNS.push(e);return e})(),head:{appendChild(){}},body:{append(){},appendChild(){}},getElementById:id=>['fadev','prompt','wp'].includes(id)?(global.STUB[id]=global.STUB[id]||{style:{},textContent:'',hidden:false}):null};
global.addEventListener=()=>{};global.localStorage={getItem:()=>null,setItem(){}};
global.STUB={};global.BTNS=[];global.B=70;global.N=17;global.SZ=1190;global.BG={};global.SG={};global.mat=()=>({});global.human=()=>new O();global.animH=()=>{};global.addBox=()=>{};global.pick=a=>a[0];global.PCOL=[1,2];global.HC=[1];global.rnd=(a,b)=>a;global.scene=new O();global.INT=[];global.toast=()=>{};
global.G={chars:[{x:0,z:0,hp:100,m:new O()}],ci:0,money:99999,wanted:0,armor:0,res:0,ammo:0,wep:1,hour:12};global.playing=true;global.K={};global.peds=[];global.offs=[];global.cars=[];global.UlianOnline=undefined;global.USET={map:c=>c};global.KEYS={};
global.cars=[];global.mkCar=(t,c,sp,x,z,h)=>{const o={x,z,type:t,hp:50};cars.push(o);return o};global.hud=()=>{};global.spawns=()=>{};global.copsUpdate=()=>{};global.onKey=()=>{};global.initGame=()=>{};global.save=()=>{};global.die=()=>{};global.shoot=()=>{};global.heat=()=>{};global.hitWall=()=>{};global.dmgP=()=>{};global.dmgCar=()=>{};global.killPed=()=>{};global.killCop=()=>{};global.Q={};
require(require('path').join(__dirname,'../client/city.js'));
CITY.boot();

const sleep=ms=>new Promise(r=>setTimeout(r,ms)),click=txt=>{const b=BTNS.slice().reverse().find(b=>(b.textContent||'').includes(txt));if(!b||!b.onclick)throw new Error('no button '+txt);b.onclick()};
(async()=>{const log=(...a)=>console.log(...a);let errs=0;const T=(n,c)=>{log(c?'PASS':'FAIL',n);if(!c)errs++};
 for(const t of Object.keys({hospital:1,hotel:1,casino:1,gunshop:1,home:1,clothes:1,restaurant:1,cinema:1,bank:1,police:1,military:1,supermarket:1,dealership:1,garage:1,nightclub:1,apartment:1,mansion:1})){try{CITY._dbg.build(t);}catch(e){log('FAIL build',t,e.message);errs++}}
 const home=INT.find(i=>i.n.startsWith('House')),apt=INT.find(i=>i.n.startsWith('Apartment'));T('property doors exist',!!home&&!!apt&&home.n.includes('for sale'));
 G.money=100;home.f();click('Buy House');T('cannot buy without money',home.n.includes('for sale')&&G.money===100);
 G.money=99999;click('Buy House');T('buy house',home.n.includes('enter')&&G.money===99999-25000);const m1=G.money;home.f();T('owned door enters (no 2nd purchase)',G.money===m1);log('guard',typeof guard);
 await sleep(700);T('inside after fade',CITY._dbg.inside==='home');
 const c0=G.chars[0];log('door pos set',c0.x,c0.z);const rx=c0.x;
 await sleep(1000);CITY._dbg.leave&&0;
 // leave via exit point: find exit pt through E
 G.chars[0].x=G.chars[0].x;onKey('KeyE');await sleep(900);
 T('left building and returned outside',CITY._dbg.inside===null);
 // dealership purchase & spawn
 const dl=INT.find(i=>i.n.startsWith('Car Dealership'));G.chars[0].x=dl.x;G.chars[0].z=dl.z;G.money=200000;await sleep(1600);dl.f();await sleep(700);T('entered dealership',CITY._dbg.inside==='dealership');
 const n0=cars.length;CITY._dbg.dealer();click('City Sedan');T('car bought, money deducted',G.money===191000);
 click('Close');await sleep(1000);onKey('KeyE');await sleep(900);T('car spawned outside on exit',cars.length===n0+1&&cars[n0].type==='parked');
 // property cannot be bought twice
 T('no negative money',G.money>=0);
 process.exit(errs?1:0)})();
