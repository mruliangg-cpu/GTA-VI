/* U = players on server · M = map + private waypoint/route · P = invite friends. Loaded after the main game script's globals exist (boot() is called at the end). */
(function(){
const $=id=>document.getElementById(id),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const css=document.createElement('style');css.textContent=`
#kv{position:fixed;inset:0;z-index:25;background:#0b0618ee;display:flex;flex-direction:column;align-items:center;padding:calc(env(safe-area-inset-top,0px) + 10px) 10px calc(env(safe-area-inset-bottom,0px) + 10px);touch-action:none}
#kv .hd{width:min(96vw,640px);display:flex;align-items:center;gap:8px;margin-bottom:8px}#kv h2{flex:1;font:italic 900 26px Impact,sans-serif;background:linear-gradient(#ffe36e,#ff4fa0);-webkit-background-clip:text;color:transparent}
#kv button{min-width:0;padding:9px 14px;font-size:13px;margin:2px}#kv .bd{width:min(96vw,640px);flex:1;overflow:auto;touch-action:pan-y}
#kv .r{display:flex;align-items:center;gap:8px;padding:9px 6px;border-bottom:1px solid #fff2}#kv .r b{flex:1}#kv .r small{opacity:.7}#kv .dot{width:10px;height:10px;border-radius:50%;background:#888}#kv .dot.on{background:#4f8}
#kv canvas{border:2px solid #ff4fa0;border-radius:8px;touch-action:none;max-width:96vw}#kv .lg{font-size:11px;opacity:.8;margin-top:6px;text-align:center}
#touch .kb{width:56px!important;height:56px!important;right:12px;font-size:10px;background:#ffe36e}#wpd{position:absolute;top:calc(var(--t) + 52px);left:50%;transform:translateX(-50%);color:#d9a6ff;font-size:14px}`;
document.head.appendChild(css);
let cur=null,box=null,tm=null,W=null,wbeam=null,routeW=[],routeM=[];const snap=new Map();let room=null,online=new Set(),fr=null;
const me=()=>{const c=G.chars[G.ci];return{x:G.veh?G.veh.x:c.x,z:G.veh?G.veh.z:c.z,ry:G.veh?G.veh.h:c.ry}};
/* ---- roads / routing (city roads are a grid every B units) ---- */
function snapRoad(p){const kx=clamp(Math.round(p.x/B),0,N),kz=clamp(Math.round(p.z/B),0,N);return Math.abs(p.x-kx*B)<=Math.abs(p.z-kz*B)?{x:kx*B,z:clamp(p.z,0,SZ),v:1,k:kx}:{x:clamp(p.x,0,SZ),z:kz*B,v:0,k:kz}}
function route(a,b){const sa=snapRoad(a),sb=snapRoad(b),P=[a,sa],mid=v=>Math.round(clamp(v,0,SZ)/B)*B;
 if(sa.v&&sb.v){if(sa.k!==sb.k){const z=mid((sa.z+sb.z)/2);P.push({x:sa.x,z},{x:sb.x,z})}}
 else if(!sa.v&&!sb.v){if(sa.k!==sb.k){const x=mid((sa.x+sb.x)/2);P.push({x,z:sa.z},{x,z:sb.z})}}
 else if(sa.v)P.push({x:sa.x,z:sb.z});else P.push({x:sb.x,z:sa.z});P.push(sb,b);return P}
function target(){try{if(window.Missions&&Missions.active){const o=Missions.active.steps[Missions.active.step];return o&&o.at?{x:o.at.x,z:o.at.z}:null}const s=MS[G.step];if(!s||s.lose)return null;if(s.car)return mCar?{x:mCar.x,z:mCar.z}:null;return s.p?{x:s.p[0],z:s.p[1]}:null}catch(e){return null}}
function refresh(){if(typeof G==='undefined'||!G||!playing)return;const m=me();routeW=W?route(m,W):[];const t=target();routeM=t?route(m,t):[];
 const d=$('wpd');if(d){if(W){const dist=Math.hypot(W.x-m.x,W.z-m.z);d.textContent='◆ Waypoint · '+Math.round(dist)+' m';if(dist<8){clearWP();toast('You have arrived')}}else d.textContent=''}}
function setWP(x,z){W={x:clamp(x,0,SZ),z:clamp(z,0,SZ)};if(!wbeam){wbeam=new THREE.Mesh(CG,new THREE.MeshBasicMaterial({color:0xb04dff,transparent:true,opacity:.5}));wbeam.scale.set(3,90,3);scene.add(wbeam)}wbeam.position.set(W.x,45,W.z);wbeam.visible=true;refresh()}
function clearWP(){W=null;if(wbeam)wbeam.visible=false;refresh()}
window.KEYS_WAYPOINT=()=>W; // private: only stored here, never sent to the server
/* ---- minimap: draw routes on top of the original minimap ---- */
const _mini=window.mini;window.mini=function(){_mini();try{const c=$('mm').getContext('2d'),ch=G.chars[G.ci],s=.5,f=[Math.sin(G.cy),Math.cos(G.cy)],r=[-f[1],f[0]],T=(x,z)=>{const dx=x-ch.x,dz=z-ch.z;return[80+(dx*r[0]+dz*r[1])*s,80-(dx*f[0]+dz*f[1])*s]};
 c.save();c.beginPath();c.arc(80,80,78,0,7);c.clip();c.lineJoin='round';
 for(const [R_,col,w] of [[routeM,'#ffd23f',3],[routeW,'#b04dff',4]]){if(R_.length<2)continue;c.strokeStyle=col;c.lineWidth=w;c.beginPath();R_.forEach((p,i)=>{const q=T(p.x,p.z);i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1])});c.stroke()}
 if(W){let q=T(W.x,W.z),dx=q[0]-80,dy=q[1]-80,d=Math.hypot(dx,dy);if(d>70){q=[80+dx/d*70,80+dy/d*70]}c.fillStyle='#b04dff';c.strokeStyle='#fff';c.lineWidth=2;c.beginPath();c.arc(q[0],q[1],6,0,7);c.fill();c.stroke()}
 c.restore()}catch(e){}};
/* ---- overlays ---- */
function open(k){if(!playing||(G&&G.paused)||$('set'))return;close();cur=k;if(document.exitPointerLock)document.exitPointerLock();for(const c of['KeyW','KeyA','KeyS','KeyD','Fire'])K[c]=0;
 box=document.createElement('div');box.id='kv';['touchstart','touchmove','touchend'].forEach(t=>box.addEventListener(t,e=>e.stopPropagation(),{passive:true}));
 box.innerHTML='<div class="hd"><h2></h2><span id="kx"></span><button id="kc">✕ Close</button></div><div class="bd"></div>';document.body.appendChild(box);
 box.querySelector('#kc').onclick=close;box.querySelector('h2').textContent={players:'PLAYERS ON SERVER',map:'MAP',friends:'INVITE FRIENDS'}[k];render();tm=setInterval(render,k==='map'?250:2000);if(k==='friends')loadFriends()}
function close(){clearInterval(tm);cur=null;if(box){box.remove();box=null}}
const toggle=k=>cur===k?close():open(k);
function row(p,name,sub,right){const d=document.createElement('div');d.className='r';const b=document.createElement('b');b.textContent=name;const s=document.createElement('small');s.textContent=sub||'';d.append(b,s);if(right)d.append(right);p.append(d);return d}
function render(){if(!box)return;const bd=box.querySelector('.bd');if(cur==='map')return drawMap(bd);const keep=bd.scrollTop;bd.textContent='';const m=me(),O=window.UlianOnline;
 if(cur==='players'){const on=O&&O.room;box.querySelector('#kx').textContent=on?'Room '+O.room+' · '+O.ping+' ms':'Offline';
  row(bd,(O&&O.me?O.me.name:'You')+' (you)',on?'ping '+O.ping+' ms':'');
  if(!on)row(bd,'Only you are here.','Open ONLINE and join a lobby to see other players.');
  else if(!snap.size)row(bd,'No other players in this room yet.','Invite friends with P.');
  for(const p of snap.values())row(bd,p.name||'Player','HP '+Math.round(p.hp==null?100:p.hp)+' · '+Math.round(Math.hypot(p.x-m.x,p.z-m.z))+' m'+(p.dead?' · dead':''))}
 else{const O2=O;if(!O2||!O2.me||String(O2.me.id).startsWith('guest')){row(bd,'Log in first','Open ONLINE from the menu and log in to use friends.');return}
  const x=box.querySelector('#kx');x.textContent='';if(!O2.room){const b=document.createElement('button');b.textContent='Create private lobby';b.onclick=()=>O2.createRoom();x.append(b)}else x.textContent='Room '+O2.room;
  if(!fr)return row(bd,'Loading friends…');if(!fr.friends.length)return row(bd,'No friends yet','Add friends by username in the ONLINE panel.');
  for(const f of fr.friends){const isOn=online.has(f.id),b=document.createElement('button');b.textContent='Invite';b.disabled=!isOn||!O2.room;b.onclick=()=>{O2.invite(f.id);b.textContent='Sent'};
   const r=row(bd,f.name,isOn?'online':'offline',b);const dot=document.createElement('span');dot.className='dot'+(isOn?' on':'');r.prepend(dot)}
  if(!O2.room)row(bd,'Create a lobby first','Invites go to the room you are in.')}
 bd.scrollTop=keep}
async function loadFriends(){const O=window.UlianOnline;if(!O||!O.me||String(O.me.id).startsWith('guest'))return;try{fr=await O.friends();O.requestPresence(fr.friends.map(f=>f.id))}catch(e){toast('Could not load friends')}render()}
/* ---- GTA-style atlas map: sea, sand, hilly countryside, lilac city, labelled regions (cached, drawn once per size) ---- */
const MG=260;let atl=null;
function atlas(sz){if(atl&&atl.width===sz)return atl;const o=document.createElement('canvas');o.width=o.height=sz;const g=o.getContext('2d'),k=sz/(SZ+2*MG),X=x=>(x+MG)*k,Z=z=>(z+MG)*k;
 let sd=7;const rn=()=>(sd=(sd*16807)%2147483647)/2147483647,GS=48,gr=[];for(let i=0;i<=GS+1;i++){gr.push([]);for(let j=0;j<=GS+1;j++)gr[i].push(rn())}
 const vn=(x,y)=>{const i=x|0,j=y|0,fx=x-i,fy=y-j,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),a=gr[i%GS][j%GS],b=gr[(i+1)%GS][j%GS],c=gr[i%GS][(j+1)%GS],d=gr[(i+1)%GS][(j+1)%GS];return a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy};
 const fb=(x,y)=>vn(x*.06,y*.06)*.55+vn(x*.14+9,y*.14+3)*.3+vn(x*.35+5,y*.35+8)*.15;
 const im=g.createImageData(sz,sz),coast=Math.round(X(SZ+60));
 for(let y=0;y<sz;y++)for(let x=0;x<sz;x++){const n=fb(x*GS/sz*2.2,y*GS/sz*2.2),h=fb(x*GS/sz*2.2+1.5,y*GS/sz*2.2+1.5)-n,i=(y*sz+x)*4;let r,gg,b;
  if(x>=coast){const d=Math.min(1,(x-coast)/(sz*.2));r=70-d*45+n*20;gg=170-d*70+n*20;b=225-d*40}
  else{const t=n;r=95+t*85+h*160;gg=140+t*75+h*130;b=40+t*40+h*60}
  im.data[i]=r;im.data[i+1]=gg;im.data[i+2]=b;im.data[i+3]=255}
 g.putImageData(im,0,0);
 g.fillStyle='#ecd890';g.fillRect(X(SZ+5),0,X(SZ+60)-X(SZ+5),sz);g.fillStyle='#f6ebb4';g.fillRect(X(SZ+40),0,X(SZ+60)-X(SZ+40),sz);
 g.fillStyle='#b5a888';g.fillRect(X(0)-3,Z(0)-3,SZ*k+6,SZ*k+6);g.fillStyle='#8f88a4';g.fillRect(X(0),Z(0),SZ*k,SZ*k);
 const hw=7*k;
 for(let i=0;i<N;i++)for(let j=0;j<N;j++){const dt=Math.hypot(i-3,j-3),park=(i+j)%7===3&&dt>1;g.fillStyle=park?'#7fb04a':((i*3+j*5)%4===0?'#ddd8e8':'#cdc7dc');g.fillRect(X(i*B)+hw,Z(j*B)+hw,B*k-2*hw,B*k-2*hw)}
 g.lineCap='butt';for(const [w,col] of [[hw*3.2,'#d9893a'],[hw*2.2,'#ffd27a']])for(let i=0;i<=N;i+=4){g.strokeStyle=col;g.lineWidth=w;g.beginPath();g.moveTo(X(i*B),Z(0));g.lineTo(X(i*B),Z(SZ));g.moveTo(X(0),Z(i*B));g.lineTo(X(SZ),Z(i*B));g.stroke()}
 g.strokeStyle='#f3f0ea';g.lineWidth=hw*1.1;for(let i=0;i<=N;i++){if(i%4===0)continue;g.beginPath();g.moveTo(X(i*B),Z(0));g.lineTo(X(i*B),Z(SZ));g.moveTo(X(0),Z(i*B));g.lineTo(X(SZ),Z(i*B));g.stroke()}
 const lab=(t,x,y,sz_,col,rot,sp)=>{g.save();g.translate(x,y);g.rotate(rot||0);g.font='900 italic '+sz_+'px Impact,system-ui,sans-serif';g.textAlign='center';g.fillStyle=col;if('letterSpacing'in g)g.letterSpacing=(sp||0)+'px';g.fillText(t,0,0);g.restore()};
 lab('ULIAN COUNTY',X(-MG*.5),Z(SZ*.5),Math.max(18,sz*.055),'rgba(255,224,110,.8)',-Math.PI/2,6);
 lab('ULIAN COUNTY',X(SZ*.5),Z(-MG*.55),Math.max(16,sz*.045),'rgba(255,224,110,.8)',0,5);
 lab('VICE CITY',X(SZ*.5),Z(SZ*.5)+sz*.02,Math.max(20,sz*.06),'rgba(30,20,60,.35)',0,8);
 lab('PACIFIC OCEAN',X(SZ+150),Z(SZ*.5),Math.max(14,sz*.035),'rgba(255,255,255,.55)',Math.PI/2,6);
 g.strokeStyle='#0006';g.lineWidth=2;g.strokeRect(1,1,sz-2,sz-2);
 return atl=o}
function drawMap(bd){let cv=bd.querySelector('canvas');const sz=Math.floor(Math.min(innerWidth*.96,innerHeight-150,640));
 if(!cv){bd.textContent='';cv=document.createElement('canvas');bd.append(cv);const bar=document.createElement('div');bar.className='lg';bar.innerHTML='Tap the map to set your waypoint (only you can see it) · <span style="color:#d9a6ff">purple = your route</span> · <span style="color:#ffd23f">yellow = mission</span>';const cb=document.createElement('button');cb.textContent='Clear waypoint';cb.onclick=clearWP;bar.append(document.createElement('br'),cb);bd.append(bar);
  cv.addEventListener('pointerdown',e=>{const r=cv.getBoundingClientRect(),u=(e.clientX-r.left)/r.width*cv.width,v=(e.clientY-r.top)/r.height*cv.height;setWP(u/cv._k-MG,v/cv._k-MG);toast('Waypoint set')})}
 cv.width=cv.height=sz;const c=cv.getContext('2d'),k=cv._k=sz/(SZ+2*MG),X=x=>(x+MG)*k,Z=z=>(z+MG)*k;
 c.drawImage(atlas(sz),0,0);
 c.font='bold 11px system-ui';c.textAlign='center';c.lineWidth=3;c.strokeStyle='#0008';c.fillStyle='#fff';try{JL.forEach(j=>{c.strokeText(j.name,X(j.x),Z(j.z)-12*k-4);c.fillText(j.name,X(j.x),Z(j.z)-12*k-4)})}catch(e){}
 const dot=(x,z,col,r,t)=>{c.fillStyle=col;c.strokeStyle='#000';c.lineWidth=1.5;c.beginPath();c.arc(X(x),Z(z),r,0,7);c.fill();c.stroke();if(t){c.fillStyle='#fff';c.fillText(t,X(x),Z(z)-r-3)}};
 const line=(P,col)=>{if(P.length<2)return;c.strokeStyle=col;c.lineWidth=5;c.lineJoin='round';c.beginPath();P.forEach((p,i)=>i?c.lineTo(X(p.x),Z(p.z)):c.moveTo(X(p.x),Z(p.z)));c.stroke()};
 line(routeM,'#ffd23f');line(routeW,'#b04dff');
 SAFE.forEach(s=>dot(s[0],s[1],'#33ddff',6,'Safehouse'));INT.forEach(i=>dot(i.x,i.z,i.c?'#'+i.c.toString(16).padStart(6,'0'):'#4f8',6,i.n.split(':')[0]));
 const t=target();if(t)dot(t.x,t.z,'#ffd23f',7,'Mission');if(W)dot(W.x,W.z,'#b04dff',8,'Waypoint');
 for(const p of snap.values())dot(p.x,p.z,'#ff4fa0',6,p.name);
 const m=me();c.save();c.translate(X(m.x),Z(m.z));c.rotate(-m.ry+Math.PI);c.fillStyle='#fff';c.strokeStyle='#000';c.beginPath();c.moveTo(0,-9);c.lineTo(6,7);c.lineTo(-6,7);c.closePath();c.fill();c.stroke();c.restore()}
/* ---- input + boot ---- */
addEventListener('keydown',e=>{if(typeof playing==='undefined'||!playing||(G&&G.paused)||$('set')||(e.target&&e.target.tagName==='INPUT'))return;const c=window.USET?USET.map(e.code):e.code,a={KeyU:'players',KeyM:'map',KeyP:'friends'}[c];
 if(a){e.preventDefault();e.stopPropagation();if(!e.repeat)toggle(a);return}if(cur){if(e.code==='Escape'||e.code==='Tab')close();e.preventDefault();e.stopPropagation()}},true);
window.KEYS={open,close,setWP,boot(){const t=$('touch');if(t)[['players','PLAYERS',134],['map','MAP',198],['friends','FRIENDS',262]].forEach(([k,l,y])=>{const b=document.createElement('button');b.className='kb';b.textContent=l;b.style.top='calc(env(safe-area-inset-top,0px) + '+y+'px)';b.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();toggle(k)},{passive:false});b.onclick=()=>toggle(k);t.append(b)});
 const h=$('hud');if(h){const d=document.createElement('div');d.id='wpd';h.append(d)}
 setInterval(refresh,400);const O=window.UlianOnline;if(O){O.on('snap',s=>{const ids=new Set();s.players.forEach(p=>{snap.set(p.id,p);ids.add(p.id)});for(const id of[...snap.keys()])if(!ids.has(id))snap.delete(id)});O.on('left',m=>snap.delete(m.id));O.on('leftSelf',()=>snap.clear());O.on('presence',m=>{online=new Set(m.online||[]);render()});O.on('invite_sent',()=>toast('Invite sent'));O.on('joined',()=>render())}}};
})();
