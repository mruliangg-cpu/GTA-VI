/* Drop-in online panel: login/register, connection status, rooms, friends, invites.
 * Usage: <script src="online-config.js"></script> <script src="online.js"></script> <script src="online-ui.js"></script>
 *        then call  UlianOnlineUI.open()  from your ONLINE menu button. Offline mode is unaffected.
 */
(function () {
  const O = window.UlianOnline, cfg = window.ULIAN_ONLINE_CONFIG || {};
  const css = `#uo{position:fixed;inset:0;z-index:99999;background:rgba(8,6,20,.92);display:none;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#fff}
  #uo.show{display:flex}#uo .box{width:min(94vw,460px);max-height:90vh;overflow:auto;background:#15122b;border:1px solid #ff3ea5;border-radius:14px;padding:18px;box-shadow:0 0 40px #ff3ea555}
  #uo h2{margin:0 0 8px;color:#ff3ea5}#uo input,#uo button{width:100%;box-sizing:border-box;margin:4px 0;padding:10px;border-radius:8px;border:1px solid #444;background:#1f1b3d;color:#fff;font-size:15px}
  #uo button{background:#ff3ea5;border:0;font-weight:700;cursor:pointer}#uo button.sec{background:#2b2660}#uo .row{display:flex;gap:6px}
  #uo .msg{white-space:pre-line;font-size:13px;opacity:.9;margin:6px 0}#uo .err{color:#ff8080}#uo .ok{color:#6dff9c}
  #uo .fr{display:flex;align-items:center;gap:6px;padding:4px 0}#uo .fr span{flex:1}#uo .fr button{width:auto;padding:4px 10px;font-size:12px}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'uo'; document.body.appendChild(root);
  let onlineIds = [], msgText = '', msgCls = '';
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const say = (t, c = '') => { msgText = t; msgCls = c; render(); };
  const wrap = (inner) => `<div class="box"><h2>ONLINE — PLAY WITH FRIENDS</h2>${inner}<button class="sec" id="uo-close">Back to menu (offline stays playable)</button></div>`;

  async function render() {
    const m = `<div class="msg ${msgCls}">${esc(msgText)}</div>`;
    const setup = O.setupMessage();
    if (setup) { root.innerHTML = wrap(`<div class="msg err">${esc(setup)}</div>` + (cfg.allowGuestDev ? '' : '')); return bind(); }
    const stat = `<div class="msg">Status: <b>${O.status}</b>${O.status === 'connected' ? ` · ${O.ping}ms` : ''}</div>`;
    if (!O.me) {
      root.innerHTML = wrap(stat + m + `<input id="e" placeholder="Email" type="email"><input id="p" placeholder="Password (min 6)" type="password"><input id="u" placeholder="Username (for sign-up)">
        <div class="row"><button id="login">Log in</button><button id="reg" class="sec">Register</button></div>` +
        (cfg.allowGuestDev ? `<button id="guest" class="sec">Play as guest (dev server)</button>` : ''));
    } else if (O.status !== 'connected') {
      root.innerHTML = wrap(`<div class="msg">Signed in as <b>${esc(O.me.name)}</b></div>` + stat + m + `<button id="conn">Connect to server</button><button id="out" class="sec">Log out</button>`);
    } else {
      let fr = { friends: [], incoming: [], outgoing: [] };
      if (O.supa && !String(O.me.id).startsWith('guest')) { try { fr = await O.friends(); O.requestPresence(fr.friends.map(f => f.id)); } catch (e) {} }
      root.innerHTML = wrap(`<div class="msg">Signed in as <b>${esc(O.me.name)}</b></div>` + stat + m +
        `<div class="msg">Room: <b>${O.room ? esc(O.room) : 'none'}</b></div>
        <div class="row"><button id="pub">Public city</button><button id="mk" class="sec">New private lobby</button></div>
        <div class="row"><input id="rc" placeholder="Room code"><button id="jn" class="sec" style="width:40%">Join</button></div>
        ${O.room ? '<button id="lv" class="sec">Leave room</button>' : ''}
        ${O.supa ? `<h3>Friends</h3>
          <div class="row"><input id="fn" placeholder="Add by username"><button id="fa" style="width:40%">Add</button></div>
          ${fr.incoming.map(f => `<div class="fr"><span>${esc(f.name)} wants to be friends</span><button data-acc="${f.fid}">Accept</button><button class="sec" data-rm="${f.fid}">Decline</button></div>`).join('')}
          ${fr.friends.map(f => `<div class="fr"><span>${onlineIds.includes(f.id) ? '🟢' : '⚪'} ${esc(f.name)}</span>${O.room && onlineIds.includes(f.id) ? `<button data-inv="${f.id}">Invite</button>` : ''}<button class="sec" data-rm="${f.fid}">Remove</button></div>`).join('') || '<div class="msg">No friends yet.</div>'}
          ${fr.outgoing.map(f => `<div class="fr"><span>Pending: ${esc(f.name)}</span></div>`).join('')}` : ''}
        <button id="out" class="sec">Log out</button>`);
    }
    bind();
  }

  function bind() {
    const $ = (i) => root.querySelector('#' + i);
    const on = (i, fn) => { const el = $(i); if (el) el.onclick = async () => { try { await fn(); } catch (e) { say(e.message || String(e), 'err'); } }; };
    on('uo-close', () => UlianOnlineUI.close());
    on('login', async () => { await O.login($('e').value.trim(), $('p').value); say('Logged in.', 'ok'); O.connect(); });
    on('reg', async () => { const r = await O.register($('e').value.trim(), $('p').value, $('u').value.trim()); say(r.needsEmailConfirm ? 'Check your email to confirm your account, then log in.' : 'Account created.', 'ok'); if (!r.needsEmailConfirm) O.connect(); });
    on('guest', () => { O.guest('Guest' + Math.floor(Math.random() * 999)); O.connect(); });
    on('conn', () => O.connect());
    on('out', async () => { await O.logout(); say('Logged out.'); });
    on('pub', () => O.joinRoom('PUBLIC'));
    on('mk', () => O.createRoom());
    on('jn', () => O.joinRoom($('rc').value.trim()));
    on('lv', () => O.leaveRoom());
    on('fa', async () => { await O.addFriend($('fn').value.trim()); say('Friend request sent.', 'ok'); });
    root.querySelectorAll('[data-acc]').forEach(b => b.onclick = async () => { await O.acceptFriend(b.dataset.acc); render(); });
    root.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { await O.removeFriend(b.dataset.rm); render(); });
    root.querySelectorAll('[data-inv]').forEach(b => b.onclick = () => { O.invite(b.dataset.inv); say('Invite sent.', 'ok'); });
  }

  O.on('status', (s) => { if (s.info) { msgText = s.info; msgCls = s.status === 'error' ? 'err' : ''; } if (root.classList.contains('show')) render(); });
  O.on('joined', (m) => say(`Joined ${m.room}${m.private ? ' (private) — share this code with friends' : ''}`, 'ok'));
  O.on('error', (m) => say(m.msg, 'err'));
  O.on('presence', (m) => { onlineIds = m.online; });
  O.on('invite', (m) => { if (confirm(`${m.name} invited you to a lobby. Join?`)) O.joinRoom(m.room); });

  window.UlianOnlineUI = {
    async open() { root.classList.add('show'); try { await O.init(); } catch (e) { msgText = e.message; msgCls = 'err'; } render(); },
    close() { root.classList.remove('show'); },
  };
})();
