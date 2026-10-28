// GTA VI - Ulian Edition: authoritative multiplayer server
// Node >= 18. Secrets come ONLY from environment variables (.env), never from the client.
import 'dotenv/config';
import http from 'http';
import crypto from 'crypto';
import { WebSocketServer } from 'ws';
import { createClient } from '@supabase/supabase-js';

const cfg = {
  port: parseInt(process.env.PORT || '8080', 10),
  supabaseUrl: process.env.SUPABASE_URL || '',
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  allowGuests: process.env.DEV_ALLOW_GUESTS === 'true',
  origins: (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  maxPerRoom: parseInt(process.env.MAX_PLAYERS_PER_ROOM || '8', 10),
  tickHz: 15,
  worldLimit: parseFloat(process.env.WORLD_LIMIT || '3000'),
  maxSpeed: parseFloat(process.env.MAX_SPEED || '90'), // m/s, covers fast cars/aircraft
  reconnectGraceMs: 30000,
};

const supa = cfg.supabaseUrl && cfg.serviceKey
  ? createClient(cfg.supabaseUrl, cfg.serviceKey, { auth: { persistSession: false } })
  : null;

if (!supa && !cfg.allowGuests) {
  console.error('[ulian] Supabase is not configured and DEV_ALLOW_GUESTS is not true.');
  console.error('[ulian] Fill in .env (see .env.example) or run "npm run dev" for local guest testing.');
  process.exit(1);
}

const WEAPONS = { // server-side damage / range / cooldown (ms). Client claims are validated against this.
  pistol:  { dmg: 22, range: 60,  cd: 250 },
  smg:     { dmg: 14, range: 70,  cd: 90 },
  shotgun: { dmg: 55, range: 25,  cd: 800 },
  rifle:   { dmg: 30, range: 150, cd: 120 },
  fists:   { dmg: 8,  range: 3,   cd: 400 },
};

const players = new Map();   // userId -> player
const rooms = new Map();     // code -> { code, isPrivate, members:Set<userId> }
const grace = new Map();     // userId -> { player, timer }

const now = () => Date.now();
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const code = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, players: players.size, rooms: rooms.size, auth: supa ? 'supabase' : 'guest-dev' }));
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({
  server,
  maxPayload: 4096,
  verifyClient: ({ origin }, cb) => {
    if (cfg.origins.length === 0 || !origin || cfg.origins.includes(origin)) return cb(true);
    cb(false, 403, 'Origin not allowed');
  },
});

function getRoom(c) { return rooms.get(c); }

function leaveRoom(p, reason = 'left') {
  if (!p.room) return;
  const r = rooms.get(p.room);
  p.room = null;
  if (!r) return;
  r.members.delete(p.id);
  broadcast(r, { t: 'left', id: p.id, reason }, p.id);
  if (r.members.size === 0 && r.code !== 'PUBLIC') rooms.delete(r.code);
}

function joinRoom(p, c, create = false) {
  c = clean(c, 12).toUpperCase();
  let r = rooms.get(c);
  if (!r) {
    if (c !== 'PUBLIC' && !create) return send(p.ws, { t: 'error', code: 'NO_ROOM', msg: 'Room not found.' });
    r = { code: c, isPrivate: c !== 'PUBLIC', members: new Set() };
    rooms.set(c, r);
  }
  if (r.members.size >= cfg.maxPerRoom && !r.members.has(p.id))
    return send(p.ws, { t: 'error', code: 'ROOM_FULL', msg: 'Room is full.' });
  leaveRoom(p);
  p.room = c; r.members.add(p.id);
  send(p.ws, { t: 'joined', room: c, private: r.isPrivate, players: [...r.members].map(id => pub(players.get(id))).filter(Boolean) });
  broadcast(r, { t: 'entered', player: pub(p) }, p.id);
}

const pub = (p) => p && ({ id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, ry: p.ry, anim: p.anim, veh: p.veh, hp: p.hp, dead: p.dead });

function broadcast(r, msg, exceptId) {
  const s = JSON.stringify(msg);
  for (const id of r.members) {
    if (id === exceptId) continue;
    const p = players.get(id);
    if (p && p.ws.readyState === 1) p.ws.send(s);
  }
}

async function authenticate(msg) {
  if (supa && msg.token) {
    const { data, error } = await supa.auth.getUser(String(msg.token));
    if (error || !data?.user) throw new Error('Invalid or expired session. Please log in again.');
    const { data: prof } = await supa.from('profiles').select('username').eq('id', data.user.id).maybeSingle();
    return { id: data.user.id, name: prof?.username || 'Player', guest: false };
  }
  if (cfg.allowGuests) {
    const name = clean(msg.guest, 16) || 'Guest' + Math.floor(Math.random() * 9000 + 1000);
    return { id: 'guest:' + crypto.randomBytes(6).toString('hex'), name, guest: true };
  }
  throw new Error('Login required.');
}

async function areFriends(a, b) {
  if (!supa || a.startsWith('guest:') || b.startsWith('guest:')) return false;
  const { data } = await supa.from('friendships').select('id')
    .eq('status', 'accepted')
    .or(`and(requester.eq.${a},addressee.eq.${b}),and(requester.eq.${b},addressee.eq.${a})`)
    .limit(1);
  return !!data?.length;
}

const UUID = /^[0-9a-f-]{36}$/i;

wss.on('connection', (ws) => {
  let p = null;
  let authed = false;
  let bucket = { n: 0, t: now() };
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  const authTimer = setTimeout(() => { if (!authed) ws.close(4001, 'Auth timeout'); }, 8000);

  ws.on('message', async (raw) => {
    // Rate limit: 40 msgs/sec
    const t = now();
    if (t - bucket.t > 1000) bucket = { n: 0, t };
    if (++bucket.n > 40) return ws.close(4008, 'Rate limit');

    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (!authed) {
      if (msg.t !== 'auth') return;
      try {
        const u = await authenticate(msg);
        authed = true; clearTimeout(authTimer);
        const old = players.get(u.id);
        if (old) { old.ws.close(4003, 'Logged in elsewhere'); }
        const g = grace.get(u.id);
        if (g) { clearTimeout(g.timer); grace.delete(u.id); p = g.player; p.ws = ws; }
        else p = { id: u.id, name: u.name, guest: u.guest, ws, room: null, x: 0, y: 0, z: 0, ry: 0, anim: 'idle', veh: null, hp: 100, dead: false, lastT: t, lastShot: 0, joinedAt: t };
        p.ws = ws; players.set(p.id, p);
        send(ws, { t: 'welcome', id: p.id, name: p.name, guest: p.guest, tickHz: cfg.tickHz, maxPerRoom: cfg.maxPerRoom, resumed: !!(g && p.room) });
        if (g && p.room && rooms.get(p.room)) {
          const r = rooms.get(p.room);
          send(ws, { t: 'joined', room: r.code, private: r.isPrivate, players: [...r.members].map(id => pub(players.get(id))).filter(Boolean) });
        }
        if (supa && !u.guest) supa.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', u.id).then(() => {});
      } catch (e) {
        send(ws, { t: 'error', code: 'AUTH', msg: e.message });
        ws.close(4002, 'Auth failed');
      }
      return;
    }

    switch (msg.t) {
      case 'join': joinRoom(p, msg.room || 'PUBLIC', false); break;
      case 'create': joinRoom(p, code(), true); break;
      case 'leave': leaveRoom(p); send(ws, { t: 'left_self' }); break;

      case 'state': {
        if (!p.room || p.dead) return;
        const { x, y, z, ry } = msg;
        if (![x, y, z, ry].every(num)) return;
        if (Math.abs(x) > cfg.worldLimit || Math.abs(z) > cfg.worldLimit || y < -50 || y > 1500) return send(ws, { t: 'correct', x: p.x, y: p.y, z: p.z });
        const dt = Math.max((t - p.lastT) / 1000, 0.016);
        const dist = Math.hypot(x - p.x, y - p.y, z - p.z);
        const first = p.lastT === p.joinedAt && p.x === 0 && p.z === 0;
        if (!first && dist / dt > cfg.maxSpeed * 1.5 && dist > 5) {
          return send(ws, { t: 'correct', x: p.x, y: p.y, z: p.z }); // reject teleport / speed hack
        }
        p.x = x; p.y = y; p.z = z; p.ry = ry; p.lastT = t;
        p.anim = clean(msg.anim, 16) || 'idle';
        p.veh = msg.veh ? clean(msg.veh, 24) : null;
        break;
      }

      case 'shoot': {
        // Server-authoritative combat: client says who it shot with what; server checks range/cooldown/damage.
        if (!p.room || p.dead) return;
        const w = WEAPONS[msg.weapon];
        if (!w || t - p.lastShot < w.cd * 0.8) return;
        p.lastShot = t;
        const r = rooms.get(p.room);
        broadcast(r, { t: 'fx', id: p.id, weapon: msg.weapon }, p.id);
        const target = players.get(String(msg.target || ''));
        if (!target || target.id === p.id || target.room !== p.room || target.dead) return;
        if (Math.hypot(target.x - p.x, target.y - p.y, target.z - p.z) > w.range + 3) return;
        target.hp = Math.max(0, target.hp - w.dmg);
        broadcast(r, { t: 'hp', id: target.id, hp: target.hp, by: p.id });
        if (target.hp === 0) {
          target.dead = true;
          broadcast(r, { t: 'died', id: target.id, by: p.id });
          setTimeout(() => {
            target.dead = false; target.hp = 100;
            if (target.room && rooms.get(target.room)) broadcast(rooms.get(target.room), { t: 'respawn', id: target.id, hp: 100 });
          }, 5000);
        }
        break;
      }

      case 'chat': {
        if (!p.room) return;
        const text = clean(msg.text, 120);
        if (text) broadcast(rooms.get(p.room), { t: 'chat', id: p.id, name: p.name, text });
        break;
      }

      case 'invite': {
        const to = String(msg.to || '');
        if (!UUID.test(to) || !p.room) return;
        if (!(await areFriends(p.id, to))) return send(ws, { t: 'error', code: 'NOT_FRIENDS', msg: 'You can only invite accepted friends.' });
        const f = players.get(to);
        if (!f) return send(ws, { t: 'error', code: 'OFFLINE', msg: 'That friend is offline.' });
        send(f.ws, { t: 'invite', from: p.id, name: p.name, room: p.room });
        send(ws, { t: 'invite_sent', to });
        break;
      }

      case 'presence': {
        // Which of my friend ids are online right now?
        const ids = Array.isArray(msg.ids) ? msg.ids.slice(0, 200).filter(i => UUID.test(i)) : [];
        send(ws, { t: 'presence', online: ids.filter(i => players.has(i)) });
        break;
      }
      case 'ping': send(ws, { t: 'pong', ts: msg.ts }); break;
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (!p || p.ws !== ws) return;
    players.delete(p.id);
    if (p.room) {
      const player = p;
      const timer = setTimeout(() => { grace.delete(player.id); leaveRoom(player, 'disconnected'); }, cfg.reconnectGraceMs);
      grace.set(p.id, { player, timer });
    }
  });
  ws.on('error', () => {});
});

// Snapshot loop
setInterval(() => {
  for (const r of rooms.values()) {
    if (r.members.size < 2) continue;
    const list = [...r.members].map(id => players.get(id)).filter(Boolean);
    for (const p of list) {
      send(p.ws, { t: 'snap', ts: now(), players: list.filter(o => o !== p).map(pub) });
    }
  }
}, 1000 / cfg.tickHz);

// Heartbeat
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 15000);

server.listen(cfg.port, () => {
  console.log(`[ulian] server listening on :${cfg.port}  auth=${supa ? 'supabase' : 'GUEST DEV MODE (not for production)'}`);
});
