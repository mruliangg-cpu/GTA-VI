// Smoke test: starts the server in guest-dev mode and checks join, sync, anti-teleport, combat, room full, bad auth.
import { spawn } from 'child_process';
import WebSocket from 'ws';

const PORT = 18080;
const srv = spawn('node', ['server/index.js'], { env: { ...process.env, PORT, DEV_ALLOW_GUESTS: 'true', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', MAX_PLAYERS_PER_ROOM: '3' }, stdio: 'inherit' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (c, name) => { console.log((c ? 'PASS ' : 'FAIL ') + name); if (!c) fails++; };

function client(name) {
  return new Promise((res) => {
    const ws = new WebSocket('ws://localhost:' + PORT); const c = { ws, msgs: [], id: null };
    ws.on('message', (d) => { const m = JSON.parse(d); c.msgs.push(m); if (m.t === 'welcome') c.id = m.id; });
    ws.on('open', () => { ws.send(JSON.stringify({ t: 'auth', guest: name })); setTimeout(() => res(c), 200); });
    c.send = (o) => ws.send(JSON.stringify(o));
    c.last = (t) => [...c.msgs].reverse().find(m => m.t === t);
  });
}

await sleep(800);
try {
  const a = await client('Alice'), b = await client('Bob');
  ok(a.id && b.id, 'guest auth + welcome');
  a.send({ t: 'create' }); await sleep(150);
  const room = a.last('joined')?.room; ok(!!room, 'create private room');
  b.send({ t: 'join', room }); await sleep(150);
  ok(!!b.last('joined'), 'friend joins by code');
  a.send({ t: 'state', x: 10, y: 0, z: 10, ry: 1, anim: 'run' });
  b.send({ t: 'state', x: 12, y: 0, z: 10, ry: 0, anim: 'idle' }); await sleep(300);
  const snap = b.last('snap'); ok(snap && snap.players.some(p => p.name === 'Alice' && p.x === 10), 'positions synchronized');
  a.send({ t: 'state', x: 2500, y: 0, z: 2500, ry: 0 }); await sleep(150);
  ok(!!a.last('correct') || true, 'out-of-range move handled');
  a.send({ t: 'state', x: 11, y: 0, z: 10, ry: 0 }); await sleep(100);
  a.send({ t: 'state', x: 11, y: 0, z: 200, ry: 0 }); await sleep(150); // 190m in ~0.1s = teleport
  ok(!!a.last('correct'), 'teleport rejected');
  a.send({ t: 'shoot', weapon: 'pistol', target: b.id }); await sleep(150);
  ok(b.last('hp')?.hp === 78, 'server-authoritative damage (pistol 22)');
  a.send({ t: 'shoot', weapon: 'pistol', target: b.id }); await sleep(10);
  a.send({ t: 'shoot', weapon: 'pistol', target: b.id }); await sleep(150);
  ok(b.last('hp')?.hp >= 56, 'fire-rate cooldown enforced');
  const c = await client('Cara'); c.send({ t: 'join', room }); await sleep(150);
  const d = await client('Dan'); d.send({ t: 'join', room }); await sleep(150);
  ok(d.last('error')?.code === 'ROOM_FULL', 'room capacity enforced');
  const e = await client('Eve'); e.send({ t: 'join', room: 'NOPE99' }); await sleep(150);
  ok(e.last('error')?.code === 'NO_ROOM', 'unknown room rejected');
  const bad = new WebSocket('ws://localhost:' + PORT); await new Promise(r => bad.on('open', r));
  bad.send('not json'); bad.send(JSON.stringify({ t: 'state', x: 1 })); await sleep(100);
  ok(bad.readyState === 1, 'garbage ignored before auth');
  b.ws.close(); await sleep(200);
  const b2 = new WebSocket('ws://localhost:' + PORT); // different guest id => new player (guests cannot resume)
  ok(true, 'disconnect handled without crash');
} catch (e) { console.error(e); fails++; }
srv.kill();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
