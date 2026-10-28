# GTA VI — Ulian Edition (integrated build)
Run: `python3 -m http.server 8000` in this folder, open http://localhost:8000/index.html (needs internet for three.js + Supabase CDNs).
- **OFFLINE — New Game / Continue**: your original game, unchanged, no server needed.
- **Jobs**: Esc/Tab -> phone/pause screen lists 5 endless jobs; pick one. Objective + marker beam + timer show on the HUD; pays into your cash once.
- **ONLINE**: menu button (or "Online" in pause). Needs setup in README.md (Supabase + `npm start`). Without it you get a setup message; offline is unaffected.
## Tested
Page loads, all client scripts serve, no JS syntax errors, Online/Missions modules register.
## NOT tested (no internet in my sandbox: three.js CDN blocked)
Actual gameplay, jobs completing, 2-player sync, server (`npm test` needs npm install).
## Known limits
Map is still your 490x490 city. Online shooting between players isn't wired (UlianOnline.shoot). Remote players use the generic human model, no name tags. Job "collect" counts any pickup; "kill" counts any ped kill.
