/* Palleturi Cafe — counter app + customer QR menu.
   Data lives in MongoDB behind the Express API in /server. The counter screen
   gets live updates over Server-Sent Events (/api/events). */

/* ---------------- state ---------------- */
let S = null;          // counter state from /api/state
let M = null;          // customer menu from /api/menu
let R = null;          // report from /api/report
let role = null;
let token = null;
try { token = localStorage.getItem('palleturi.token'); } catch (e) {}

/* ---------------- helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rs = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA');
const item = id => (S || M)?.items.find(i => i.id === id);
const tname = t => (+t === 0 ? 'Parcel' : 'Table ' + t);
const linesTotal = lines => Object.entries(lines || {}).reduce((a, [id, q]) => a + (item(id)?.price || 0) * q, 0);
const linesCount = lines => Object.values(lines || {}).reduce((a, q) => a + q, 0);
const mins = ts => Math.max(0, Math.floor((Date.now() - ts) / 60000));
const ago = ts => { const m = mins(ts); return m < 1 ? 'just now' : m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; };
const timeStr = d => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const hourLabel = h => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
let audio;
function beep() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    [0, .18].forEach(t => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(.18, audio.currentTime + t);
      g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + t + .15);
      o.start(audio.currentTime + t); o.stop(audio.currentTime + t + .16);
    });
  } catch (e) {}
}
function drawQRs(root) {
  root.querySelectorAll('[data-qr-text]').forEach(el => {
    el.innerHTML = '';
    if (!window.QRCode) { el.textContent = 'QR needs internet'; return; }
    const size = +el.dataset.size || 180;
    new QRCode(el, { text: el.dataset.qrText, width: size, height: size, colorDark: '#2B171B', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  });
}
const menuUrl = n => location.origin + location.pathname + '#/menu/' + n;
const upiUrl = amt => `upi://pay?pa=${encodeURIComponent(S.settings.upi)}&pn=${encodeURIComponent('Palleturi Cafe')}&am=${amt}&cu=INR&tn=${encodeURIComponent('Palleturi Cafe bill')}`;

/* ---------------- API ---------------- */
async function api(path, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) { throw new Error('No connection. Check the internet.'); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && token && path !== '/api/login') { logout(true); throw new Error(j.error || 'Please log in again'); }
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}

let inflight = 0, refreshing = false, refreshAgain = false;
async function refresh() {
  if (!token) return;
  if (inflight || refreshing) { refreshAgain = true; return; }
  refreshing = true;
  try {
    const before = S ? new Set(S.pending.map(o => o.id)) : null;
    S = await api('/api/state'); role = S.role; lastRev = S.rev;
    const fresh = before ? S.pending.filter(o => !before.has(o.id) && !handled.has(o.id)) : [];
    if (fresh.length) { beep(); fresh.forEach(o => toast(`New order from ${tname(o.table)}`)); }
    if (parts()[0] === 'report' && role === 'owner') R = await api('/api/report');
    if (!$('#modal').innerHTML) render();
  } catch (e) { if (token) toast(e.message); }
  refreshing = false;
  if (refreshAgain) { refreshAgain = false; refresh(); }
}
// Run a change on the server; the optimistic update (if any) is already on screen.
async function op(fn) {
  inflight++;
  try { return await fn(); }
  catch (e) { toast(e.message); }
  finally { inflight--; if (!inflight) refresh(); }
}

// Live updates: ask the server every 3 s whether anything changed (one tiny request),
// and reload the full state only when it did.
const handled = new Set();   // QR orders this screen accepted/rejected itself (no beep)
let pollTimer = null, lastRev = null;
function connectEvents() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!token || inflight || refreshing) return;
    try {
      const { rev } = await api('/api/rev');
      if (rev !== lastRev) refresh(); // refresh() stores the new counter
    } catch (e) {}
  }, 3000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && token) refresh(); });

/* ---------------- routing ---------------- */
function parts() { return (location.hash.slice(1) || '/').split('/').filter(Boolean); }
window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  if (parts()[0] === 'report' && role === 'owner') { R = null; api('/api/report').then(r => { R = r; render(); }).catch(e => toast(e.message)); }
  render();
});

function render() {
  const p = parts();
  if (p[0] === 'menu') return renderMenu(p[1]);
  if (!token) return renderLogin();
  if (!S) { $('#app').innerHTML = `<div class="login"><div class="sub">Loading…</div></div>`; return; }
  if (p[0] === 'table') return shell(viewTable(p[1]), 'tables');
  if (p[0] === 'report' && role === 'owner') return shell(viewReport(), 'report');
  if (p[0] === 'qr' && role === 'owner') return shell(viewQR(), 'qr', true);
  if (p[0] === 'settings' && role === 'owner') return shell(viewSettings(), 'settings');
  return shell(viewTables(), 'tables');
}

function shell(html, active, qr) {
  const n = S.pending.length;
  const link = (h, id, label, badge) => `<a href="#/${h}" class="${active === id ? 'on' : ''}">${label}${badge ? `<span class="badge">${badge}</span>` : ''}</a>`;
  const y = window.scrollY;
  $('#app').innerHTML = `
    <header class="top">
      <a class="brand" href="#/" aria-label="Palleturi Cafe home"><img src="assets/logo.png" alt="Palleturi Cafe"></a>
      <nav>
        ${link('', 'tables', 'Tables', n)}
        ${role === 'owner' ? link('report', 'report', 'Today’s report') + link('qr', 'qr', 'QR stickers') + link('settings', 'settings', 'Settings') : ''}
      </nav>
      <div class="top-r">
        <span class="clock">${timeStr(new Date())}</span>
        <button class="chip" data-act="logout" title="Lock">${role === 'owner' ? 'Owner' : 'Staff'} · Lock</button>
      </div>
    </header>
    <main>${html}</main>`;
  window.scrollTo(0, y);
  if (qr) drawQRs($('#app'));
}

/* ---------------- login ---------------- */
let pin = '', pinBusy = false;
function renderLogin(err) {
  $('#app').innerHTML = `
    <div class="login"><div class="card">
      <div class="board" style="border-radius:18px"><img src="assets/logo.png" alt="Palleturi Cafe" width="260"></div>
      <div class="sub">${esc(err || 'Enter PIN to open the counter')}</div>
      <div class="dots ${err ? 'err' : ''}" id="dots">${[0, 1, 2, 3].map(i => `<i class="${i < pin.length ? 'f' : ''}"></i>`).join('')}</div>
      <div class="pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<button data-act="pin" data-k="${k}">${k}</button>`).join('')}
        <button data-act="pin" data-k="c" aria-label="Clear">✕</button>
        <button data-act="pin" data-k="0">0</button>
        <button data-act="pin" data-k="b" aria-label="Backspace">⌫</button>
      </div>
    </div></div>`;
}
async function pressPin(k) {
  if (pinBusy) return;
  if (k === 'c') pin = '';
  else if (k === 'b') pin = pin.slice(0, -1);
  else if (pin.length < 4) pin += k;
  renderLogin();
  if (pin.length < 4) return;
  pinBusy = true;
  try {
    const r = await api('/api/login', { method: 'POST', body: { pin } });
    token = r.token; role = r.role;
    try { localStorage.setItem('palleturi.token', token); } catch (e) {}
    pin = ''; location.hash = '#/';
    await refresh(); connectEvents();
  } catch (e) { pin = ''; renderLogin(e.message); }
  pinBusy = false;
}
function logout(expired) {
  if (!expired && token) api('/api/logout', { method: 'POST' }).catch(() => {});
  token = null; role = null; S = null; R = null;
  try { localStorage.removeItem('palleturi.token'); } catch (e) {}
  clearInterval(pollTimer); pollTimer = null;
  location.hash = '#/'; render();
}

/* ---------------- tables ---------------- */
function viewTables() {
  const pend = S.pending;
  const incoming = pend.length ? `
    <h2>Incoming QR orders</h2>
    <div class="incoming">${pend.map(o => `
      <div class="order-card">
        <div class="t">${+o.table === 0 ? 'Parcel' : 'T' + o.table}</div>
        <div class="lines">${Object.entries(o.lines).map(([id, q]) => `${q} × ${esc(item(id)?.name || id)}`).join(', ')}
          <div class="when" data-since="${o.at}">${ago(o.at)} ago</div></div>
        <button class="btn small ghost" data-act="reject" data-oid="${o.id}">Reject</button>
        <button class="btn small gold" data-act="accept" data-oid="${o.id}">Accept</button>
      </div>`).join('')}</div>` : '';
  const pendFor = t => pend.some(o => +o.table === t);
  const card = t => {
    const tb = S.tables[t]; const busy = tb && linesCount(tb.lines) > 0;
    const ping = pendFor(t);
    const st = ping ? 'New QR order' : busy ? `${linesCount(tb.lines)} items · <span data-since="${tb.opened}">${ago(tb.opened)}</span>` : 'Free';
    return `<a href="#/table/${t}" class="tcard ${busy ? 'busy' : ''} ${ping ? 'ping' : ''} ${t === 0 ? 'parcel' : ''}">
      <div class="n">${t === 0 ? 'Parcel' : 'T' + t}</div>
      <div class="st">${st}</div>
      <div class="amt">${busy ? rs(linesTotal(tb.lines)) : ''}</div></a>`;
  };
  const open = Object.values(S.tables).filter(t => linesCount(t.lines) > 0);
  const openAmt = open.reduce((a, t) => a + linesTotal(t.lines), 0);
  return `${incoming}
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
      <h1>Tables</h1>
      <div class="sub">${open.length} occupied · ${rs(openAmt)} running</div>
    </div>
    <div class="tables">${Array.from({ length: S.tableCount }, (_, i) => card(i + 1)).join('')}${card(0)}</div>`;
}

/* ---------------- table billing ---------------- */
let posCat = 'tea';
function viewTable(t) {
  t = +t;
  if (!(t >= 0 && t <= S.tableCount)) return `<p>Unknown table. <a href="#/">Back</a></p>`;
  const tb = S.tables[t] || { lines: {} };
  const lines = tb.lines; const total = linesTotal(lines);
  const items = S.items.filter(i => i.cat === posCat);
  const billLines = Object.entries(lines).filter(([, q]) => q > 0);
  const pendHere = S.pending.filter(o => +o.table === t);
  return `
    <div class="pos-head">
      <a class="back" href="#/" aria-label="Back to tables">‹</a>
      <div><h1 style="margin:0">${tname(t)}</h1>
      <div class="sub">${tb.opened ? `Open since ${timeStr(new Date(tb.opened))}` : 'Tap items to start the bill'}</div></div>
    </div>
    ${pendHere.map(o => `<div class="order-card" style="margin-bottom:14px"><div class="t">QR</div>
      <div class="lines">${Object.entries(o.lines).map(([id, q]) => `${q} × ${esc(item(id)?.name || id)}`).join(', ')}</div>
      <button class="btn small ghost" data-act="reject" data-oid="${o.id}">Reject</button>
      <button class="btn small gold" data-act="accept" data-oid="${o.id}">Accept</button></div>`).join('')}
    <div class="pos">
      <section>
        <div class="cats">${S.cats.map(c => `<button data-act="cat" data-cat="${c.id}" class="${posCat === c.id ? 'on' : ''}">${c.name}</button>`).join('')}</div>
        <div class="items">${items.map(i => `
          <button class="item" data-act="add" data-t="${t}" data-id="${i.id}">
            ${lines[i.id] ? `<span class="q">${lines[i.id]}</span>` : ''}
            <span class="nm">${esc(i.name)}</span><span class="pr">${rs(i.price)}</span>
          </button>`).join('')}</div>
      </section>
      <aside class="bill" id="bill">
        <h2>Bill</h2>
        ${billLines.length ? billLines.map(([id, q]) => `
          <div class="line"><span class="nm">${esc(item(id)?.name || id)}</span>
            <span class="stepper"><button data-act="dec" data-t="${t}" data-id="${id}" aria-label="Remove one">−</button><span>${q}</span><button data-act="add" data-t="${t}" data-id="${id}" aria-label="Add one">+</button></span>
            <span class="amt">${rs((item(id)?.price || 0) * q)}</span></div>`).join('') : `<div class="empty">No items yet</div>`}
        <div class="total"><span>Total</span><b>${rs(total)}</b></div>
        <div class="row">
          <button class="btn ghost" data-act="clear" data-t="${t}" ${total ? '' : 'disabled'}>Clear</button>
          <button class="btn gold" data-act="settle" data-t="${t}" ${total ? '' : 'disabled'}>Settle bill</button>
        </div>
      </aside>
    </div>
    <div class="mbar"><div class="sum">${linesCount(lines)} items · <b>${rs(total)}</b></div>
      <a class="btn ghost small" href="#bill" style="color:var(--cream);border-color:rgba(255,241,220,.4)">View bill</a>
      <button class="btn gold" data-act="settle" data-t="${t}">Settle</button></div>`;
}
function addLine(t, id, d) {
  // Optimistic: update the screen now, then tell the server.
  const tb = S.tables[t] || (S.tables[t] = { lines: {}, opened: Date.now() });
  tb.lines[id] = Math.max(0, (tb.lines[id] || 0) + d);
  if (!tb.lines[id]) delete tb.lines[id];
  if (!Object.keys(tb.lines).length) delete S.tables[t];
  render();
  op(() => api(`/api/tables/${t}/lines`, { method: 'POST', body: { id, d } }));
}
function openSettle(t) {
  const tb = S.tables[t]; const total = tb ? linesTotal(tb.lines) : 0;
  if (!total) return toast('Bill is empty');
  const upi = S.settings.upi;
  $('#modal').innerHTML = `
    <div class="overlay" data-act="close-modal"><div class="sheet" role="dialog" aria-label="Settle bill">
      <div class="sub">${tname(t)} · ${linesCount(tb.lines)} items</div>
      <div class="big">${rs(total)}</div>
      ${upi ? `<div class="qrbox" data-qr-text="${esc(upiUrl(total))}" data-size="200"></div>
        <div class="sub" style="margin-bottom:16px">Customer scans with any UPI app · amount is filled in</div>`
      : `<p class="sub" style="margin-bottom:16px">${role === 'owner' ? 'Add the cafe’s UPI ID in Settings' : 'Ask the owner to add the UPI ID'} to show a payment QR here.</p>`}
      <div class="row" style="margin-bottom:10px">
        <button class="btn green" data-act="pay" data-t="${t}" data-m="UPI">Paid by UPI</button>
        <button class="btn gold" data-act="pay" data-t="${t}" data-m="Cash">Paid by Cash</button>
      </div>
      <button class="btn ghost block" data-act="close-modal">Cancel</button>
    </div></div>`;
  drawQRs($('#modal'));
}
async function pay(t, method) {
  closeModal();
  const r = await op(() => api(`/api/tables/${t}/settle`, { method: 'POST', body: { method } }));
  if (r) { toast(`${tname(t)} settled · ${rs(r.total)} by ${r.method}`); location.hash = '#/'; }
}
function closeModal() { $('#modal').innerHTML = ''; }

/* ---------------- QR orders ---------------- */
async function accept(oid) {
  handled.add(oid);
  S.pending = S.pending.filter(o => o.id !== oid); render();
  const r = await op(() => api(`/api/orders/${oid}/accept`, { method: 'POST' }));
  if (r) toast(`Added to ${tname(r.table)}`);
}
async function reject(oid) {
  handled.add(oid);
  S.pending = S.pending.filter(o => o.id !== oid); render();
  const r = await op(() => api(`/api/orders/${oid}/reject`, { method: 'POST' }));
  if (r) toast('Order rejected');
}

/* ---------------- customer menu ---------------- */
let cart = {}, lang = 'en', sentFor = null, sending = false;
try { lang = localStorage.getItem('palleturi.lang') || 'en'; } catch (e) {}
const T = {
  en: { table: 'Table', parcel: 'Parcel', add: 'Add', items: 'items', send: 'Send to counter', sending: 'Sending…', sent: 'Order sent!', sentSub: 'The counter has your order. We’ll bring it to your table shortly.', more: 'Order more', pay: 'Pay at the counter when you’re done.' },
  te: { table: 'టేబుల్', parcel: 'పార్సెల్', add: 'జోడించు', items: 'ఐటమ్స్', send: 'కౌంటర్‌కు పంపండి', sending: 'పంపుతోంది…', sent: 'ఆర్డర్ పంపబడింది!', sentSub: 'మీ ఆర్డర్ కౌంటర్‌కు చేరింది. త్వరలో మీ టేబుల్‌కు తీసుకొస్తాము.', more: 'ఇంకా ఆర్డర్ చేయండి', pay: 'తిన్న తర్వాత కౌంటర్‌లో చెల్లించండి.' },
};
function renderMenu(t) {
  t = +t;
  const L = T[lang];
  if (!M) {
    $('#app').innerHTML = `<div class="c-done"><div class="sub">Loading menu…</div></div>`;
    api('/api/menu').then(m => { M = m; render(); }).catch(e => { $('#app').innerHTML = `<div class="c-done"><div><h1>Can’t load the menu</h1><p>${esc(e.message)}</p></div></div>`; });
    return;
  }
  if (!(t >= 0 && t <= M.tableCount)) { $('#app').innerHTML = `<div class="c-done"><div><h1>Table not found</h1><p>Please scan the QR on your table again.</p></div></div>`; return; }
  if (sentFor === t) {
    $('#app').innerHTML = `<div class="c-done"><div>
      <div class="cup"><span class="steam"></span><span class="steam"></span><span class="steam"></span><div class="plate"></div><div class="body"></div><div class="handle"></div></div>
      <h1>${L.sent}</h1><p style="max-width:300px;margin:0 auto 8px">${L.sentSub}</p>
      <p style="color:#8a6a5f;font-size:14px">${L.pay}</p>
      <button class="btn gold" data-act="m-more" style="margin-top:16px">${L.more}</button></div></div>`;
    return;
  }
  const tlabel = t === 0 ? L.parcel : `${L.table} ${t}`;
  const cats = M.cats.map(c => ({ ...c, items: M.items.filter(i => i.cat === c.id) })).filter(c => c.items.length);
  const count = linesCount(cart), total = linesTotal(cart);
  const nm = i => lang === 'te' && i.te ? i.te : i.name;
  const sub = i => lang === 'te' ? i.name : i.te;
  const y = window.scrollY;
  $('#app').innerHTML = `
    <div class="cust" lang="${lang === 'te' ? 'te' : 'en'}">
      <header class="c-hero">
        <img class="photo" src="assets/cafe.jpg" alt="">
        <button class="c-lang" data-act="m-lang">${lang === 'te' ? 'English' : 'తెలుగు'}</button>
        <div class="over"><img src="assets/logo.png" alt="Palleturi Cafe"><span class="tbl">${tlabel}</span></div>
      </header>
      <nav class="c-cats">${cats.map(c => `<a href="#" data-act="m-jump" data-cat="${c.id}">${lang === 'te' ? c.te : c.name}</a>`).join('')}</nav>
      ${cats.map(c => `<section class="c-sec" id="sec-${c.id}"><h2 class="serif">${lang === 'te' ? c.te : c.name}</h2>
        ${c.items.map(i => `<div class="c-item"><div class="info"><div class="nm">${esc(nm(i))}</div>${sub(i) ? `<div class="te">${esc(sub(i))}</div>` : ''}<div class="pr">${rs(i.price)}</div></div>
          ${cart[i.id] ? `<span class="stepper"><button data-act="m-dec" data-id="${i.id}" aria-label="Remove one">−</button><span>${cart[i.id]}</span><button data-act="m-add" data-id="${i.id}" aria-label="Add one">+</button></span>`
          : `<button class="c-add" data-act="m-add" data-id="${i.id}">${L.add}</button>`}</div>`).join('')}
      </section>`).join('')}
      ${count ? `<div class="c-bar"><div class="sum">${count} ${L.items} · <b>${rs(total)}</b></div><button class="btn gold" data-act="m-send" data-t="${t}" ${sending ? 'disabled' : ''}>${sending ? L.sending : L.send}</button></div>` : ''}
    </div>`;
  window.scrollTo(0, y);
}
async function sendOrder(t) {
  if (!linesCount(cart) || sending) return;
  sending = true; render();
  try {
    await api('/api/orders', { method: 'POST', body: { table: t, lines: cart } });
    cart = {}; sentFor = t; window.scrollTo(0, 0);
  } catch (e) { toast(e.message); }
  sending = false; render();
}

/* ---------------- report ---------------- */
function viewReport() {
  if (!R) return `<h1>Today’s report</h1><p class="sub">Loading…</p>`;
  const r = R;
  const max = Math.max(1, ...r.byHour.slice(8, 23));
  const hours = Array.from({ length: 15 }, (_, i) => i + 8); // 8 AM – 10 PM
  return `
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:10px">
      <h1>Today’s report</h1><div class="sub">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    </div>
    <div class="stats">
      <div class="stat hero"><div class="k">Total sales</div><div class="v">${rs(r.total)}</div></div>
      <div class="stat"><div class="k">Bills</div><div class="v">${r.bills}</div></div>
      <div class="stat"><div class="k">UPI</div><div class="v">${rs(r.upi)}</div></div>
      <div class="stat"><div class="k">Cash</div><div class="v">${rs(r.cash)}</div></div>
    </div>
    <div class="rgrid">
      <div class="panel">
        <h2>Items sold</h2>
        ${r.groups.length ? `<table class="list">${r.groups.map(g => `<tr class="cat"><td>${g.name}</td><td class="r">${g.qty}</td><td></td></tr>
          ${g.rows.map(x => `<tr><td>${esc(x.name)}</td><td class="r">× ${x.qty}</td><td class="r">${rs(x.amt)}</td></tr>`).join('')}`).join('')}</table>`
        : `<p class="sub">No bills settled yet today. In Settings you can load a demo day to see how this looks.</p>`}
        <h2 style="margin-top:22px">Sales by hour</h2>
        <div class="bars">${hours.map(h => `<div class="${h === r.peak ? 'top1' : ''}" style="height:${(r.byHour[h] / max) * 100}%" title="${hourLabel(h)}: ${rs(r.byHour[h])}"></div>`).join('')}</div>
        <div class="bars-x">${hours.map(h => `<span>${h % 3 === 2 ? hourLabel(h).replace(' ', '') : ''}</span>`).join('')}</div>
      </div>
      <div class="panel">
        <h2>WhatsApp message</h2>
        <p class="sub" style="margin-top:-6px">Goes to +${esc(r.wa)} at ${hourLabel(S.reportHour)}${r.waAuto ? ' automatically' : ''}</p>
        <div class="wa-preview"><div class="bubble">${esc(r.text)}</div></div>
        <button class="btn green block" style="margin-top:14px" data-act="wa-send">Send to WhatsApp now</button>
      </div>
    </div>`;
}
async function sendReport() {
  if (!S.settings.waAuto) {
    // One tap: open WhatsApp with the report typed in, and mark today as sent.
    const r = R || await api('/api/report').catch(() => null);
    if (!r) return toast('Could not build the report');
    window.open(`https://wa.me/${r.wa}?text=${encodeURIComponent(r.text)}`, '_blank', 'noopener');
    op(() => api('/api/report/send', { method: 'POST' }));
    return;
  }
  const r = await op(() => api('/api/report/send', { method: 'POST' }));
  if (!r) return;
  if (r.sent) return toast('Report sent on WhatsApp');
  $('#modal').innerHTML = `<div class="overlay" data-act="close-modal"><div class="sheet">
    <h1>Couldn’t send automatically</h1><p class="sub">${esc(r.reason || '')}</p>
    <a class="btn green block" href="${esc(r.link)}" target="_blank" rel="noopener" style="margin:14px 0 10px">Open WhatsApp instead</a>
    <button class="btn ghost block" data-act="close-modal">Close</button></div></div>`;
}

/* ---------------- QR stickers ---------------- */
function viewQR() {
  const list = [...Array.from({ length: S.tableCount }, (_, i) => i + 1), 0];
  return `
    <div class="no-print" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
      <div><h1>QR stickers</h1><div class="sub">Print and stick one on each table. Scanning opens that table’s menu.</div></div>
      <button class="btn gold" data-act="print">Print stickers</button>
    </div>
    <div class="stickers">${list.map(t => `
      <div class="sticker">
        <img class="logo" src="assets/logo.png" alt="Palleturi Cafe">
        <div class="tn">${t === 0 ? 'PARCEL' : 'TABLE ' + t}</div>
        <div class="qrbox" data-qr-text="${esc(menuUrl(t))}" data-size="150"></div>
        <div class="cap">Scan to order<br>ఆర్డర్ చేయడానికి స్కాన్ చేయండి</div>
        <a class="no-print" href="${esc(menuUrl(t))}" target="_blank" rel="noopener" style="font-size:12px;opacity:.8">Open as customer ↗</a>
      </div>`).join('')}</div>`;
}

/* ---------------- settings ---------------- */
function viewSettings() {
  const st = S.settings;
  return `
    <h1>Settings</h1>
    <div class="rgrid">
      <div class="panel">
        <h2>Cafe</h2>
        <div class="field"><label for="upi">UPI ID (for the payment QR)</label><input id="upi" data-set="upi" placeholder="name@bank" value="${esc(st.upi)}"></div>
        <div class="field"><label for="wa">Owner WhatsApp (with country code)</label><input id="wa" data-set="wa" inputmode="numeric" value="${esc(st.wa)}"></div>
        <div class="row">
          <div class="field"><label for="op">Owner PIN</label><input id="op" data-set="ownerPin" inputmode="numeric" maxlength="4" value="${esc(st.ownerPin)}"></div>
          <div class="field"><label for="sp">Staff PIN</label><input id="sp" data-set="staffPin" inputmode="numeric" maxlength="4" value="${esc(st.staffPin)}"></div>
        </div>
        <p class="sub">Staff can take orders and settle bills. Only the owner sees the report, QR stickers and settings.</p>
        <p class="sub">Nightly WhatsApp: ${st.waAuto ? 'sends automatically from the server.' : 'one-tap reminder at 10 PM (automatic sending not set up on the server).'}</p>
        <h2 style="margin-top:22px">Demo</h2>
        <div class="row">
          <button class="btn" data-act="seed">Load a demo day</button>
          <button class="btn ghost" data-act="reset">Clear all bills</button>
        </div>
      </div>
      <div class="panel">
        <h2>Menu & prices</h2>
        <p class="sub" style="margin-top:-6px">The toggle shows an item on the customer QR menu.</p>
        ${S.cats.map(c => `<div style="color:var(--gold);font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.06em;margin:16px 0 6px">${c.name}${c.staffOnly ? ' · counter only' : ''}</div>
          ${S.items.filter(i => i.cat === c.id).map(i => `<div class="line">
            <span class="nm">${esc(i.name)}</span>
            ${c.staffOnly ? '' : `<input type="checkbox" class="switch" data-qr="${i.id}" ${i.qr ? 'checked' : ''} aria-label="Show ${esc(i.name)} on QR menu">`}
            <input class="ipt price" data-price="${i.id}" inputmode="numeric" value="${i.price}" aria-label="${esc(i.name)} price">
          </div>`).join('')}`).join('')}
        <h2 style="margin-top:22px">Add item</h2>
        <div class="row">
          <input class="ipt" id="ni-name" placeholder="Item name">
          <select class="ipt" id="ni-cat">${S.cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
        </div>
        <div class="row" style="margin-top:10px">
          <input class="ipt" id="ni-price" inputmode="numeric" placeholder="Price ₹">
          <button class="btn gold" data-act="add-item">Add</button>
        </div>
      </div>
    </div>`;
}

/* ---------------- events ---------------- */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, t = el.dataset.t !== undefined ? +el.dataset.t : null;
  if (a === 'close-modal') { if (e.target === el) closeModal(); return; }
  switch (a) {
    case 'pin': return pressPin(el.dataset.k);
    case 'logout': return logout();
    case 'cat': posCat = el.dataset.cat; return render();
    case 'add': return addLine(t, el.dataset.id, 1);
    case 'dec': return addLine(t, el.dataset.id, -1);
    case 'clear': if (confirm(`Clear the whole bill for ${tname(t)}?`)) { delete S.tables[t]; render(); op(() => api(`/api/tables/${t}`, { method: 'DELETE' })); } return;
    case 'settle': return openSettle(t);
    case 'pay': return pay(t, el.dataset.m);
    case 'accept': return accept(el.dataset.oid);
    case 'reject': return reject(el.dataset.oid);
    case 'm-add': cart[el.dataset.id] = (cart[el.dataset.id] || 0) + 1; return render();
    case 'm-dec': cart[el.dataset.id]--; if (cart[el.dataset.id] <= 0) delete cart[el.dataset.id]; return render();
    case 'm-send': return sendOrder(t);
    case 'm-more': sentFor = null; return render();
    case 'm-lang': lang = lang === 'te' ? 'en' : 'te'; try { localStorage.setItem('palleturi.lang', lang); } catch (x) {} return render();
    case 'm-jump': e.preventDefault(); document.getElementById('sec-' + el.dataset.cat)?.scrollIntoView({ behavior: 'smooth' }); return;
    case 'wa-send': return sendReport();
    case 'print': return window.print();
    case 'seed': { const r = await op(() => api('/api/demo/seed', { method: 'POST' })); if (r) toast(`Demo day loaded (${r.count} bills) — open Today’s report`); return; }
    case 'reset': if (confirm('Delete ALL bills, open tables and QR orders? This cannot be undone.')) { const r = await op(() => api('/api/reset', { method: 'POST' })); if (r) toast('All bills cleared'); } return;
    case 'add-item': {
      const name = $('#ni-name').value.trim(), price = parseInt($('#ni-price').value, 10), cat = $('#ni-cat').value;
      if (!name || !(price > 0)) return toast('Enter a name and price');
      const r = await op(() => api('/api/items', { method: 'POST', body: { name, cat, price } }));
      if (r) toast(`${name} added`);
      return;
    }
  }
});
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.set) {
    const r = await op(() => api('/api/settings', { method: 'PUT', body: { key: el.dataset.set, value: el.value } }));
    if (r) toast('Saved');
  } else if (el.dataset.price) {
    const r = await op(() => api(`/api/items/${el.dataset.price}`, { method: 'PUT', body: { price: el.value } }));
    if (r) toast('Price updated');
  } else if (el.dataset.qr) {
    op(() => api(`/api/items/${el.dataset.qr}`, { method: 'PUT', body: { qr: el.checked } }));
  }
});

/* ---------------- clock, timers, 10 PM reminder ---------------- */
let snoozeUntil = 0;
setInterval(() => {
  const c = $('.clock'); if (c) c.textContent = timeStr(new Date());
  document.querySelectorAll('[data-since]').forEach(el => { const s = ago(+el.dataset.since); el.textContent = el.closest('.when') ? s + ' ago' : s; });
  if (role === 'owner' && S && new Date().getHours() >= S.reportHour && S.settings.lastReport !== dayKey() && Date.now() > snoozeUntil && !$('#modal').innerHTML) {
    $('#modal').innerHTML = `<div class="overlay"><div class="sheet">
      <h1>It’s ${hourLabel(S.reportHour)}</h1><p class="sub">Time to close the day and send today’s report to WhatsApp.</p>
      <div class="row" style="margin-top:16px"><button class="btn ghost" id="later">Later</button>
      <button class="btn green" id="sendnow">Send report</button></div></div></div>`;
    $('#later').onclick = () => { snoozeUntil = Date.now() + 30 * 60000; closeModal(); };
    $('#sendnow').onclick = () => { closeModal(); snoozeUntil = Date.now() + 30 * 60000; sendReport(); };
  }
}, 20000);

/* ---------------- start ---------------- */
render();
if (token && parts()[0] !== 'menu') { refresh().then(() => { if (token) connectEvents(); }); }
