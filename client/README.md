# GTA VI — ULIAN EDITION: Online + Infinite Missions Package

This package adds **real online multiplayer** and an **endless money-paying mission system** to your game.
Offline mode never needs any of the online files — it keeps working on its own.

## What's inside

| Path | What it is |
|---|---|
| `server/index.js` | WebSocket game server (Node 18+). Verifies Supabase logins, rooms, position sync, server-side damage, anti-teleport, rate limits, reconnect, invites. |
| `supabase/migrations/0001_init.sql` | Database: profiles, friendships, cloud saves + Row Level Security. |
| `.env.example` | Server settings (copy to `.env`). Holds the secret key — server only. |
| `client/online-config.js` | Public settings the browser needs (Supabase URL, anon key, server address). |
| `client/online.js` | Browser client: register/login/logout, connect, rooms, friends, `RemotePlayers` (draws other players in Three.js). |
| `client/online-ui.js` | Ready-made ONLINE panel (login, status, lobbies, friends, invites). |
| `client/missions.js` | **Infinite procedural missions** (works offline, no server). |
| `test/smoke.js` | Automated server test (`npm test`). |

---

## Part 1 — Set up online multiplayer (step by step)

### 1. Create the free database (Supabase)
1. Go to https://supabase.com, create a project.
2. Open **SQL Editor**, paste all of `supabase/migrations/0001_init.sql`, press **Run**.
3. (Easiest for testing) **Authentication → Providers → Email → turn OFF "Confirm email"**.
4. **Project Settings → API**: copy the **Project URL**, the **anon public** key and the **service_role** key.

### 2. Run the game server
```bash
npm install
cp .env.example .env      # then edit .env:
#   SUPABASE_URL=...        SUPABASE_SERVICE_ROLE_KEY=...   (service key stays ONLY here)
npm start
```
Check http://localhost:8080/health — it should say `{"ok":true,...,"auth":"supabase"}`.

### 3. Connect your game
Edit `client/online-config.js`:
```js
supabaseUrl: 'https://YOURPROJECT.supabase.co',
supabaseAnonKey: 'YOUR_ANON_KEY',          // public key, safe in the browser
wsUrl: 'ws://localhost:8080',
```
In your game's HTML (needs internet for the Supabase CDN):
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="client/online-config.js"></script>
<script src="client/online.js"></script>
<script src="client/online-ui.js"></script>
```
Hook your **ONLINE — PLAY WITH FRIENDS** button: `onclick="UlianOnlineUI.open()"`.

Then in your game code:
```js
const remote = new RemotePlayers(scene);                  // other players appear in your 3D world
UlianOnline.on('snap', s => remote.applySnapshot(s));
UlianOnline.on('left', m => remote.remove(m.id));
UlianOnline.on('correct', c => { player.x=c.x; player.y=c.y; player.z=c.z; });  // server rubber-band
UlianOnline.on('hp', m => { if (m.id === UlianOnline.me.id) player.hp = m.hp; });
// every frame:
remote.update(dt);
if (UlianOnline.room) UlianOnline.sendState({x:player.x,y:player.y,z:player.z,ry:player.rotY,anim:player.anim,veh:player.vehicleId});
// when you shoot another player:
UlianOnline.shoot('pistol', targetPlayerId);              // weapons: pistol, smg, shotgun, rifle, fists
```
Playing with friends: both register → one adds the other by username → the friend accepts → create a private lobby and press **Invite** (or share the room code).

### 4. Put it on the internet
Friends outside your network need the server hosted somewhere (Render, Railway, Fly.io, a VPS). Deploy this folder, set the same environment variables there, and use a secure address: `wsUrl: 'wss://your-server.example.com'`. Set `ALLOWED_ORIGINS` to your game's website address. Your HTML page must also be hosted (GitHub Pages, Netlify, etc.).

### Local test without Supabase
`npm run dev` starts the server with guest login; set `allowGuestDev: true` in `online-config.js`. **Never use this in production.**

---

## Part 2 — Infinite missions & money

`client/missions.js` generates endless quests. Every one has real objectives, a time limit, fail conditions and a money reward that grows with your level and streak. Finishing/failing one instantly creates a fresh list.

**Mission types:** package delivery, taxi, car theft, bounty hunt, gang territory, rescue & escort, getaway driving, heists, street races, fictional contracts, military infiltration, casino jobs.

```js
Missions.init({
  addMoney: (n, why) => economy.addCash(n, why),          // REQUIRED — your one money system
  getPlayer: () => ({ x:player.x, z:player.z, dead:player.dead, wanted:player.wanted }),
  onUpdate: (s) => hud.showObjective(s),                   // s.objective.text, s.marker, s.timeLeft ...
  locations: () => myDistricts,                            // optional [{name,x,z,r}]
  save: d => localStorage.setItem('ulian_missions', JSON.stringify(d)),
  load: () => JSON.parse(localStorage.getItem('ulian_missions') || 'null'),
});
const list = Missions.offer(5);       // show these in the phone's Missions app
Missions.start(list[0].id);
// each frame: Missions.update(dt)
// when things happen: Missions.event('kill') / 'collect' / 'enterVehicle' / 'wantedLevel' {level}
```
Rewards are paid exactly once per mission (duplicate-claim protected). Spend the money in your shops, dealerships and properties through the same `economy`.

---

## Honest status — please read

**Tested:** all server/client files pass a syntax check; the mission generator was simulated through 30 generated missions end to end (all completed, rewards paid, level scaling worked).

**NOT tested (could not be run in my environment):**
- `npm install` / `npm test` — my sandbox cannot reach the npm registry, so the server and `test/smoke.js` have **not been executed yet**. Please run `npm install && npm test` first; it checks joining, sync, teleport rejection, damage, cooldown and room limits.
- Real Supabase registration/login/friends — needs your own project.
- Visual syncing in your actual 3D game — I did not have your game's HTML file (only your master prompt and the concept image), so the integration lines above must be added to it.

**Known limitations:** movement is client-reported with server sanity checks (speed, bounds, shot range/rate), not full server physics; cheating is limited, not impossible. Missions pay money client-side in offline play (editable by the player); for ranked online play, move rewards server-side. Guest accounts cannot resume after a disconnect (logged-in accounts can, within 30 seconds).

This package does not include the giant open-world map, rigged characters, shops or phone from the master prompt — those belong to the game itself.
