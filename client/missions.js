/* GTA VI - Ulian Edition: INFINITE procedural missions.
 * Works fully OFFLINE (no server needed). Missions never run out: every time you finish or fail one,
 * a new one can be generated. Rewards scale with your level and streak and are paid through YOUR
 * economy via hooks, exactly once per mission (duplicate-claim protected).
 *
 * Integration (about 10 lines in your game):
 *   Missions.init({
 *     locations: () => [{name:'Downtown', x:0,z:0, r:200}, ...],   // your districts / landmarks (optional, defaults below)
 *     addMoney: (n, why) => myEconomy.add(n, why),                  // REQUIRED: pays the player
 *     onUpdate: (state) => myHud.showObjective(state),              // optional: draw objective + marker
 *     getPlayer: () => ({x,y,z, dead, wanted, inVehicle, vehicleId}),
 *     save: (data) => localStorage.setItem('ulian_missions', JSON.stringify(data)),
 *     load: () => JSON.parse(localStorage.getItem('ulian_missions') || 'null'),
 *   });
 *   Missions.offer(5)            // list of 5 fresh missions for your phone "Missions" app
 *   Missions.start(offer.id)     // start one
 *   each frame:  Missions.update(dt)
 *   game events: Missions.event('kill'), Missions.event('enterVehicle', {id}), Missions.event('collect'), Missions.event('wantedLevel', {level})
 */
(function () {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const DEFAULT_LOCS = [
    { name: 'Downtown', x: 0, z: 0, r: 250 }, { name: 'Luxury Hills', x: 900, z: -600, r: 220 },
    { name: 'Vice Beach', x: -900, z: 400, r: 260 }, { name: 'Industrial Docks', x: 700, z: 900, r: 240 },
    { name: 'Airport', x: -1100, z: -900, r: 300 }, { name: 'Countryside', x: 1500, z: 200, r: 400 },
    { name: 'Casino Strip', x: 300, z: -1200, r: 180 }, { name: 'Port', x: -400, z: 1300, r: 220 },
  ];

  const TEMPLATES = [
    { type: 'delivery',  title: 'Package Run',      base: 900,  steps: (a, b) => [go(`Pick up the package in ${a.name}`, a), go(`Deliver it in ${b.name}`, b)], time: 1.2 },
    { type: 'taxi',      title: 'Taxi Fare',        base: 700,  steps: (a, b) => [go(`Pick up your passenger in ${a.name}`, a), go(`Drop them off in ${b.name}`, b)], time: 1.1 },
    { type: 'carTheft',  title: 'Steal a Ride',     base: 1500, steps: (a, b) => [{ kind: 'vehicle', text: `Steal the target car near ${a.name}`, at: pt(a), radius: 40 }, go(`Deliver it to the chop shop in ${b.name}`, b)], time: 1.4, wanted: true },
    { type: 'bounty',    title: 'Bounty Hunt',      base: 2200, steps: (a, b, lvl) => [go(`Track the target to ${a.name}`, a), { kind: 'kill', text: 'Take down the target', n: 1 }], time: 2.0, combat: true },
    { type: 'gang',      title: 'Gang Territory',   base: 2600, steps: (a, b, lvl) => [go(`Move on ${a.name}`, a), { kind: 'kill', text: 'Clear the gang members', n: 3 + Math.min(lvl, 8) }], time: 2.2, combat: true },
    { type: 'rescue',    title: 'Rescue & Escort',  base: 2000, steps: (a, b) => [go(`Find the hostage in ${a.name}`, a), go(`Escort them to safety in ${b.name}`, b)], time: 1.5 },
    { type: 'getaway',   title: 'Getaway Driver',   base: 3000, steps: (a, b) => [{ kind: 'vehicle', text: 'Get into the getaway car', at: pt(a), radius: 40 }, { kind: 'lose', text: 'Lose the police (wanted level 0)' }, go(`Reach the hideout in ${b.name}`, b)], time: 2.5, wanted: true },
    { type: 'heist',     title: 'Heist',            base: 5000, steps: (a, b, lvl) => [go(`Case the target in ${a.name}`, a), { kind: 'collect', text: 'Grab the loot bags', n: 3 }, { kind: 'lose', text: 'Lose the police (wanted level 0)' }, go(`Meet the crew in ${b.name}`, b)], time: 3.0, wanted: true },
    { type: 'race',      title: 'Street Race',      base: 1800, steps: (a, b) => [go('Checkpoint 1', a), go('Checkpoint 2', mid(a, b)), go('Finish line', b)], time: 1.0 },
    { type: 'hit',       title: 'Fictional Contract', base: 3500, steps: (a) => [go(`Reach the target's location in ${a.name}`, a), { kind: 'kill', text: 'Eliminate the target', n: 1 }], time: 2.0, combat: true },
    { type: 'military',  title: 'Base Infiltration', base: 6000, steps: (a, b) => [go(`Sneak into the base near ${a.name}`, a), { kind: 'collect', text: 'Steal the intel crates', n: 2 }, go(`Escape to ${b.name}`, b)], time: 3.0, wanted: true },
    { type: 'casino',    title: 'Casino Job',       base: 4000, steps: (a, b) => [go(`Get inside the casino in ${a.name}`, a), { kind: 'collect', text: 'Take the vault cash', n: 2 }, go(`Get out to ${b.name}`, b)], time: 2.5 },
  ];

  function pt(l) { const a = rnd(0, Math.PI * 2), d = rnd(0, l.r * 0.6); return { x: l.x + Math.cos(a) * d, z: l.z + Math.sin(a) * d }; }
  function go(text, l) { return { kind: 'goto', text, at: pt(l), radius: 12 }; }
  function mid(a, b) { return { name: 'Midway', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, r: 80 }; }

  const M = {
    h: {}, level: 1, streak: 0, completed: 0, totalEarned: 0,
    active: null, offers: [], claimed: new Set(), idCounter: 0,

    init(hooks) {
      this.h = hooks || {};
      if (typeof this.h.addMoney !== 'function') throw new Error('Missions.init needs an addMoney(amount, reason) hook.');
      const s = this.h.load && this.h.load();
      if (s) { this.level = s.level || 1; this.streak = s.streak || 0; this.completed = s.completed || 0; this.totalEarned = s.totalEarned || 0; this.claimed = new Set(s.claimed || []); this.idCounter = s.idCounter || 0; }
      this.offers = [];
    },
    _save() {
      if (!this.h.save) return;
      this.h.save({ level: this.level, streak: this.streak, completed: this.completed, totalEarned: this.totalEarned, idCounter: this.idCounter, claimed: [...this.claimed].slice(-500) });
    },
    locs() { const l = this.h.locations && this.h.locations(); return l && l.length >= 2 ? l : DEFAULT_LOCS; },

    generate() {
      const L = this.locs(); const t = pick(TEMPLATES);
      const a = pick(L); let b = pick(L); for (let i = 0; i < 5 && b === a; i++) b = pick(L);
      const steps = t.steps(a, b, this.level).map(s => ({ ...s, done: false, progress: 0 }));
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      const reward = Math.round((t.base * (1 + this.level * 0.12) * (1 + Math.min(this.streak, 10) * 0.05) + dist * 0.8) / 50) * 50;
      const limit = Math.round(120 + dist / 12 * t.time + steps.length * 40); // seconds
      const id = 'm' + (++this.idCounter) + '_' + Date.now().toString(36);
      return { id, type: t.type, title: t.title, from: a.name, to: b.name, reward, limit, steps, step: 0, combat: !!t.combat, wanted: !!t.wanted, difficulty: Math.min(5, 1 + Math.floor(this.level / 3)) };
    },
    offer(n = 5) { this.offers = Array.from({ length: n }, () => this.generate()); return this.offers; },

    start(id) {
      if (this.active) return { ok: false, msg: 'Finish or abandon your current mission first.' };
      const m = this.offers.find(o => o.id === id);
      if (!m) return { ok: false, msg: 'That mission is no longer available.' };
      this.offers = this.offers.filter(o => o !== m);
      m.timeLeft = m.limit; this.active = m; this._emit(); return { ok: true, mission: m };
    },
    abandon() { if (this.active) this._fail('Mission abandoned.'); },

    event(name, data) {
      const m = this.active; if (!m) return;
      const s = m.steps[m.step]; if (!s) return;
      if (name === 'kill' && s.kind === 'kill') { s.progress++; if (s.progress >= s.n) this._advance(); else this._emit(); }
      else if (name === 'collect' && s.kind === 'collect') { s.progress++; if (s.progress >= s.n) this._advance(); else this._emit(); }
      else if (name === 'enterVehicle' && s.kind === 'vehicle') {
        const p = this.h.getPlayer && this.h.getPlayer();
        if (!p || Math.hypot(p.x - s.at.x, p.z - s.at.z) <= s.radius + 30) this._advance();
      }
      else if (name === 'wantedLevel' && s.kind === 'lose' && data && data.level === 0) this._advance();
    },

    update(dt) {
      const m = this.active; if (!m) return;
      const p = this.h.getPlayer && this.h.getPlayer(); if (!p) return;
      if (p.dead) return this._fail('You died.');
      m.timeLeft -= dt;
      if (m.timeLeft <= 0) return this._fail('Out of time.');
      if (!m.wanted && !m.combat && p.wanted >= 3) return this._fail('The cops are all over you. Mission failed.');
      const s = m.steps[m.step];
      if (s && s.kind === 'goto' && Math.hypot(p.x - s.at.x, p.z - s.at.z) <= s.radius) this._advance();
      this._tick = (this._tick || 0) + dt; if (this._tick > 0.5) { this._tick = 0; this._emit(); }
    },

    _advance() {
      const m = this.active; m.steps[m.step].done = true; m.step++;
      if (m.step >= m.steps.length) return this._complete();
      this._emit('step');
    },
    _complete() {
      const m = this.active; this.active = null;
      if (this.claimed.has(m.id)) return; // duplicate-reward protection
      this.claimed.add(m.id);
      const bonus = m.timeLeft > m.limit * 0.5 ? Math.round(m.reward * 0.1 / 10) * 10 : 0; // fast-finish bonus
      const total = m.reward + bonus;
      this.h.addMoney(total, 'Mission: ' + m.title);
      this.completed++; this.streak++; this.totalEarned += total;
      if (this.completed % 3 === 0) this.level++;
      this._save();
      this._emit('complete', { reward: total, bonus, level: this.level });
      this.offer(5); // infinite supply
    },
    _fail(reason) {
      const m = this.active; this.active = null; this.streak = 0; this._save();
      this._emit('fail', { reason, mission: m }); this.offer(5);
    },
    _emit(kind, extra) {
      const m = this.active;
      this.h.onUpdate && this.h.onUpdate({
        kind: kind || 'tick', active: m, extra,
        objective: m ? m.steps[m.step] : null,
        marker: m && m.steps[m.step] && m.steps[m.step].at ? m.steps[m.step].at : null,
        timeLeft: m ? Math.max(0, Math.ceil(m.timeLeft)) : 0,
        level: this.level, streak: this.streak, completed: this.completed, totalEarned: this.totalEarned,
      });
    },
  };
  window.Missions = M;
})();
