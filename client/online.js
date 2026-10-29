/* GTA VI - Ulian Edition: online client.
 * Offline mode never touches this file. Load it with <script src="online.js"> AFTER online-config.js.
 * Requires (CDN, internet): https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
 * Optional: Three.js global `THREE` for remote player meshes (RemotePlayers).
 */
(function () {
  const cfg = window.ULIAN_ONLINE_CONFIG || {};
  const listeners = {};
  const emit = (e, d) => (listeners[e] || []).forEach(f => { try { f(d); } catch (x) { console.error(x); } });

  const Online = {
    status: 'offline', // offline | connecting | connected | reconnecting | error
    me: null, room: null, supa: null, ws: null, ping: 0,
    _tries: 0, _manualClose: false, _guest: null,

    on(e, f) { (listeners[e] = listeners[e] || []).push(f); },

    configured() {
      return !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) || !!cfg.allowGuestDev;
    },
    setupMessage() {
      const miss = [];
      if (!cfg.allowGuestDev) {
        if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) miss.push('Fill supabaseUrl and supabaseAnonKey in online-config.js');
        if (!window.supabase) miss.push('Load the Supabase JS library (needs internet)');
      }
      if (!cfg.wsUrl) miss.push('Set wsUrl in online-config.js');
      return miss.length ? 'Online mode is not set up yet:\n- ' + miss.join('\n- ') + '\nSee README.md. Offline mode still works.' : '';
    },

    _setStatus(s, info) { this.status = s; emit('status', { status: s, info }); },

    async init() {
      if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
        this.supa = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        const { data } = await this.supa.auth.getSession();
        if (data?.session) await this._loadMe();
        this.supa.auth.onAuthStateChange((_e, s) => { if (!s) { this.me = null; emit('auth', null); } });
      }
      return this.me;
    },

    async _loadMe() {
      const { data: u } = await this.supa.auth.getUser();
      if (!u?.user) return;
      const { data: p } = await this.supa.from('profiles').select('id,username').eq('id', u.user.id).maybeSingle();
      this.me = { id: u.user.id, name: p?.username || 'Player' };
      emit('auth', this.me);
    },

    async register(email, password, username) {
      if (!this.supa) throw new Error(this.setupMessage());
      if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) throw new Error('Username: 3-16 letters, numbers or _.');
      const { data, error } = await this.supa.auth.signUp({ email, password, options: { data: { username } } });
      if (error) throw error;
      if (!data.session) return { needsEmailConfirm: true };
      await this._loadMe();
      return { ok: true };
    },
    async login(email, password) {
      if (!this.supa) throw new Error(this.setupMessage());
      const { error } = await this.supa.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await this._loadMe();
    },
    async logout() {
      this.disconnect();
      if (this.supa) await this.supa.auth.signOut();
      this.me = null; emit('auth', null);
    },
    guest(name) { this._guest = name || 'Guest'; this.me = { id: 'guest', name: this._guest }; emit('auth', this.me); },

    // ---------- networking ----------
    async connect() {
      if (this.ws && this.ws.readyState <= 1) return;
      this._manualClose = false;
      this._setStatus(this._tries ? 'reconnecting' : 'connecting');
      let token = null;
      if (this.supa && !this._guest) {
        const { data } = await this.supa.auth.getSession();
        token = data?.session?.access_token;
        if (!token) { this._setStatus('error', 'Not logged in.'); return; }
      }
      let ws;
      try { ws = new WebSocket(cfg.wsUrl); } catch (e) { this._setStatus('error', 'Bad wsUrl: ' + e.message); return; }
      this.ws = ws;
      ws.onopen = () => ws.send(JSON.stringify(token ? { t: 'auth', token } : { t: 'auth', guest: this._guest }));
      ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } this._handle(m); };
      ws.onerror = () => {};
      ws.onclose = (ev) => {
        clearInterval(this._pinger);
        if (this._manualClose || ev.code === 4002 || ev.code === 4003) {
          this._setStatus(ev.code === 4003 ? 'error' : 'offline', ev.reason || undefined); return;
        }
        if (this._tries++ < 6) {
          this._setStatus('reconnecting', `Retry ${this._tries}/6`);
          setTimeout(() => this.connect(), Math.min(1000 * 2 ** this._tries, 15000));
        } else {
          this._setStatus('error', 'Cannot reach game server at ' + cfg.wsUrl + '. Is it running?');
        }
      };
    },
    disconnect() { this._manualClose = true; this._tries = 0; clearInterval(this._pinger); if (this.ws) this.ws.close(); this.room = null; this._setStatus('offline'); },

    _send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); },

    _handle(m) {
      switch (m.t) {
        case 'welcome':
          this._tries = 0; this.me = { id: m.id, name: m.name };
          this._setStatus('connected');
          this._pinger = setInterval(() => this._send({ t: 'ping', ts: performance.now() }), 5000);
          emit('welcome', m); break;
        case 'pong': this.ping = Math.round(performance.now() - m.ts); emit('ping', this.ping); break;
        case 'joined': this.room = m.room; emit('joined', m); break;
        case 'left_self': this.room = null; emit('leftSelf'); break;
        case 'snap': emit('snap', m); break;
        case 'entered': case 'left': case 'hp': case 'died': case 'respawn': case 'fx':
        case 'chat': case 'dm': case 'dm_sent': case 'invite': case 'presence': case 'correct': case 'invite_sent':
          emit(m.t, m); break;
        case 'error': emit('error', m); this._setStatus(this.status, m.msg); break;
      }
    },

    // Call ~15x/sec from your game loop with the local player's data.
    sendState(p) {
      const t = performance.now();
      if (t - (this._lastSend || 0) < 60) return; this._lastSend = t;
      this._send({ t: 'state', x: p.x, y: p.y, z: p.z, ry: p.ry, anim: p.anim || 'idle', veh: p.veh || null });
    },
    shoot(weapon, targetId) { this._send({ t: 'shoot', weapon, target: targetId || null }); },
    chat(text) { this._send({ t: 'chat', text }); },
    createRoom() { this._send({ t: 'create' }); },
    joinRoom(code) { this._send({ t: 'join', room: code || 'PUBLIC' }); },
    leaveRoom() { this._send({ t: 'leave' }); },
    dm(to, text) { this._send({ t: 'dm', to, text }); },
    invite(friendId) { this._send({ t: 'invite', to: friendId }); },

    // ---------- friends (Supabase, protected by RLS) ----------
    async friends() {
      if (!this.supa || !this.me) return { friends: [], incoming: [], outgoing: [] };
      const { data } = await this.supa.from('friendships').select('id,requester,addressee,status');
      const ids = new Set();
      (data || []).forEach(f => { ids.add(f.requester); ids.add(f.addressee); });
      ids.delete(this.me.id);
      const { data: profs } = ids.size ? await this.supa.from('profiles').select('id,username').in('id', [...ids]) : { data: [] };
      const name = Object.fromEntries((profs || []).map(p => [p.id, p.username]));
      const out = { friends: [], incoming: [], outgoing: [] };
      for (const f of data || []) {
        const other = f.requester === this.me.id ? f.addressee : f.requester;
        const row = { id: other, name: name[other] || '?', fid: f.id };
        if (f.status === 'accepted') out.friends.push(row);
        else if (f.addressee === this.me.id) out.incoming.push(row); else out.outgoing.push(row);
      }
      return out;
    },
    async addFriend(username) {
      const { data: p } = await this.supa.from('profiles').select('id').eq('username', username).maybeSingle();
      if (!p) throw new Error('No player with that username.');
      if (p.id === this.me.id) throw new Error("You can't add yourself.");
      const { error } = await this.supa.from('friendships').insert({ requester: this.me.id, addressee: p.id });
      if (error) throw new Error(error.code === '23505' ? 'Request already exists.' : error.message);
    },
    async acceptFriend(fid) { const { error } = await this.supa.from('friendships').update({ status: 'accepted' }).eq('id', fid); if (error) throw error; },
    async removeFriend(fid) { const { error } = await this.supa.from('friendships').delete().eq('id', fid); if (error) throw error; },
    requestPresence(ids) { this._send({ t: 'presence', ids }); },

    // ---------- optional cloud save ----------
    async cloudSave(obj) { const { error } = await this.supa.from('game_saves').upsert({ user_id: this.me.id, data: obj, updated_at: new Date().toISOString() }); if (error) throw error; },
    async cloudLoad() { const { data } = await this.supa.from('game_saves').select('data').eq('user_id', this.me.id).maybeSingle(); return data?.data || null; },
  };

  /* ---------- RemotePlayers: draws other players in your Three.js scene ----------
   * const remote = new RemotePlayers(scene, (name) => myPlayerMesh);   // factory optional
   * Online.on('snap', s => remote.applySnapshot(s));  Online.on('left', m => remote.remove(m.id));
   * in render loop: remote.update(dt);
   */
  class RemotePlayers {
    constructor(scene, factory) { this.scene = scene; this.factory = factory; this.map = new Map(); }
    _make(p) {
      const T = window.THREE; let obj;
      if (this.factory) obj = this.factory(p.name);
      else {
        obj = new T.Group();
        const body = new T.Mesh(new T.CapsuleGeometry(0.35, 1.1, 4, 8), new T.MeshStandardMaterial({ color: 0x38bdf8 }));
        body.position.y = 0.9; obj.add(body);
        const c = document.createElement('canvas'); c.width = 256; c.height = 64;
        const g = c.getContext('2d'); g.font = 'bold 34px sans-serif'; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 6; g.textAlign = 'center';
        g.strokeText(p.name, 128, 44); g.fillText(p.name, 128, 44);
        const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), depthTest: false }));
        sp.scale.set(2.4, 0.6, 1); sp.position.y = 2.3; obj.add(sp);
      }
      this.scene.add(obj);
      return { obj, tx: p.x, ty: p.y, tz: p.z, try: p.ry };
    }
    applySnapshot(s) {
      const seen = new Set();
      for (const p of s.players) {
        seen.add(p.id);
        let r = this.map.get(p.id);
        if (!r) { r = this._make(p); r.obj.position.set(p.x, p.y, p.z); this.map.set(p.id, r); }
        Object.assign(r, { tx: p.x, ty: p.y, tz: p.z, try: p.ry, anim: p.anim, veh: p.veh, hp: p.hp, dead: p.dead });
        r.obj.visible = !p.dead;
      }
      for (const id of [...this.map.keys()]) if (!seen.has(id)) this.remove(id);
    }
    update(dt) {
      const k = 1 - Math.exp(-12 * dt);
      for (const r of this.map.values()) {
        r.obj.position.x += (r.tx - r.obj.position.x) * k;
        r.obj.position.y += (r.ty - r.obj.position.y) * k;
        r.obj.position.z += (r.tz - r.obj.position.z) * k;
        let d = r.try - r.obj.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        r.obj.rotation.y += d * k;
      }
    }
    remove(id) { const r = this.map.get(id); if (!r) return; this.scene.remove(r.obj); this.map.delete(id); }
    clear() { [...this.map.keys()].forEach(id => this.remove(id)); }
  }

  // Turn confusing network errors into a message a player can act on.
  function niceErr(e) {
    const m = String((e && e.message) || e || '');
    if (/not valid JSON|Unexpected token '<'|<html/i.test(m))
      return new Error('The account server (Supabase) answered with a web page instead of data.\nMost likely: the Supabase project is paused (open supabase.com -> your project -> Restore), or supabaseUrl in client/online-config.js is wrong.\nOffline mode still works.');
    if (/Failed to fetch|NetworkError|Load failed/i.test(m))
      return new Error('Cannot reach the account server. Check your internet connection (and ad-blockers), then try again.');
    return e instanceof Error ? e : new Error(m);
  }
  ['init', 'register', 'login', 'logout', 'friends'].forEach((n) => {
    const f = Online[n]; if (typeof f !== 'function') return;
    Online[n] = async function (...a) { try { return await f.apply(this, a); } catch (e) { throw niceErr(e); } };
  });
  window.UlianOnline = Online;
  window.RemotePlayers = RemotePlayers;
})();
