# Play online with friends: Supabase + Render + GitHub (all free tiers)

You end up with: game website (GitHub Pages) -> game server (Render) -> accounts/database (Supabase).

## 1. Supabase (accounts + database)
1. supabase.com -> New project (save the database password).
2. SQL Editor -> New query -> paste ALL of `supabase/migrations/0001_init.sql` -> Run.
3. Authentication -> Providers -> Email -> turn OFF "Confirm email" (easiest).
4. Project Settings -> API. Copy: **Project URL**, **anon public** key, **service_role** key.
   The service_role key is SECRET: only ever paste it into Render (step 3), never into GitHub or any file.

## 2. GitHub (hosts the game page)
1. github.com -> New repository (public, e.g. `ulian-game`). Upload ALL files from this folder (keep `.github/` and `.gitignore`).
2. Edit `client/online-config.js` on GitHub and set:
   - supabaseUrl: your Project URL
   - supabaseAnonKey: the anon public key (safe to be public)
   - wsUrl: `wss://YOUR-SERVICE.onrender.com` (you get this name in step 3; come back and edit it)
3. Settings -> Pages -> Source: **GitHub Actions**. Push/commit triggers the deploy (Actions tab shows progress).
4. Your game URL: `https://YOURNAME.github.io/ulian-game/`

## 3. Render (game server)
1. render.com -> New -> **Blueprint** -> connect the GitHub repo (it reads `render.yaml`). Or New -> Web Service, build `npm install`, start `npm start`.
2. When asked, set environment variables:
   - SUPABASE_URL = your Project URL
   - SUPABASE_SERVICE_ROLE_KEY = the service_role key
   - ALLOWED_ORIGINS = `https://YOURNAME.github.io` (no path, no trailing slash)
3. After deploy open `https://YOUR-SERVICE.onrender.com/health`. It should show `"auth":"supabase"`.
4. Put `wss://YOUR-SERVICE.onrender.com` into `client/online-config.js` (step 2.2).

Free Render sleeps after ~15 min idle: first connection can take ~50 s. Open /health before playing.

## 4. Play
Each friend opens your game URL -> ONLINE -> Register/Login. Add friends by username, accept, create a private lobby, Invite (or share the room code). Then press New Game if you haven't started; joining a room starts the game.

## Troubleshooting
- "Origin not allowed": ALLOWED_ORIGINS must exactly match the site origin.
- Setup message in game: config values empty, or Supabase script blocked (needs internet).
- Can't connect: use `wss://` (not `ws://`) on an https page.
- Never enable DEV_ALLOW_GUESTS in production.
