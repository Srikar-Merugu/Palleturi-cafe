/* Palleturi Cafe — table billing, QR ordering and daily report (prototype).
   All data lives in this browser's localStorage. Tabs in the same browser stay
   in sync, so a customer-menu tab and the owner tab talk to each other.
   For real phones talking to the counter, swap load()/save() for a backend
   (e.g. Supabase with realtime). */

const TABLE_COUNT = 12;
const KEY = 'palleturi.v1';

const CATS = [
  { id: 'tea', name: 'Tea & Coffee', te: 'టీ & కాఫీ' },
  { id: 'snacks', name: 'Snacks', te: 'స్నాక్స్' },
  { id: 'drinks', name: 'Cool Drinks', te: 'కూల్ డ్రింక్స్' },
  { id: 'cookies', name: 'Cookies', te: 'కుకీస్' },
  { id: 'cig', name: 'Cigarettes', te: 'సిగరెట్లు', staffOnly: true },
];

// Prices from the printed menu. Cool drinks / cookies are placeholders the owner edits in Settings.
const DEFAULT_ITEMS = [
  ['tea', 'Tea', 'టీ', 'tea', 10],
  ['ginger', 'Ginger Tea', 'అల్లం టీ', 'tea', 20],
  ['masala', 'Masala Tea', 'మసాలా టీ', 'tea', 20],
  ['blacktea', 'Black Tea', 'బ్లాక్ టీ', 'tea', 20],
  ['blackcoffee', 'Black Coffee', 'బ్లాక్ కాఫీ', 'tea', 20],
  ['coffee', 'Coffee', 'కాఫీ', 'tea', 20],
  ['lemon', 'Lemon Tea', 'లెమన్ టీ', 'tea', 20],
  ['green', 'Green Tea', 'గ్రీన్ టీ', 'tea', 25],
  ['boost', 'Boost', 'బూస్ట్', 'tea', 20],
  ['milk', 'Milk', 'పాలు', 'tea', 20],
  ['samosa', 'Samosa Plate', 'సమోసా ప్లేట్', 'snacks', 30],
  ['rusk', 'Rusk', 'రస్క్', 'snacks', 20],
  ['biscuits', 'Biscuits', 'బిస్కెట్లు', 'snacks', 20],
  ['bun', 'Bun', 'బన్', 'snacks', 10],
  ['cd-small', 'Cool Drink (Small)', 'కూల్ డ్రింక్ (చిన్నది)', 'drinks', 20],
  ['cd-big', 'Cool Drink (Big)', 'కూల్ డ్రింక్ (పెద్దది)', 'drinks', 40],
  ['water', 'Water Bottle', 'వాటర్ బాటిల్', 'drinks', 10],
  ['cookie', 'Cookies', 'కుకీస్', 'cookies', 10],
  ['cig10', 'Cigarette ₹10', '', 'cig', 10],
  ['cig15', 'Cigarette ₹15', '', 'cig', 15],
  ['cig20', 'Cigarette ₹20', '', 'cig', 20],
  ['cig25', 'Cigarette ₹25', '', 'cig', 25],
].map(([id, name, te, cat, price]) => ({ id, name, te, cat, price, qr: cat !== 'cig' }));

/* ---------------- state ---------------- */
function fresh() {
  return {
    items: DEFAULT_ITEMS.map(i => ({ ...i })),
    tables: {},      // { "5": { lines: { itemId: qty }, opened: ts } }, "0" = parcel
    pending: [],     // QR orders waiting for the counter
    sales: [],       // settled bills
    settings: { upi: '', wa: '919398895450', ownerPin: '1234', staffPin: '0000', lastReport: '' },
  };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.items) return { ...fresh(), ...s, settings: { ...fresh().settings, ...s.settings } };
  } catch (e) {}
  return fresh();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
let S = load();
function mutate(fn) { S = load(); fn(S); save(); render(); }

let role = null;
try { role = sessionStorage.getItem('palleturi.role'); } catch (e) {}

/* ---------------- helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rs = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA');
const item = id => S.items.find(i => i.id === id);
const tname = t => (+t === 0 ? 'Parcel' : 'Table ' + t);
const linesTotal = lines => Object.entries(lines).reduce((a, [id, q]) => a + (item(id)?.price || 0) * q, 0);
const linesCount = lines => Object.values(lines).reduce((a, q) => a + q, 0);
const mins = ts => Math.max(0, Math.floor((Date.now() - ts) / 60000));
const ago = ts => { const m = mins(ts); return m < 1 ? 'just now' : m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; };
const timeStr = d => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const hourLabel = h => { const p = h >= 12 ? 'PM' : 'AM'; const x = h % 12 || 12; return x + ' ' + p; };

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
const menuUrl = n => location.href.split('#')[0] + '#/menu/' + n;
const upiUrl = amt => `upi://pay?pa=${encodeURIComponent(S.settings.upi)}&pn=${encodeURIComponent('Palleturi Cafe')}&am=${amt}&cu=INR&tn=${encodeURIComponent('Palleturi Cafe bill')}`;

/* ---------------- routing ---------------- */
function parts() { return (location.hash.slice(1) || '/').split('/').filter(Boolean); }
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
window.addEventListener('storage', e => {
  if (e.key !== KEY) return;
  const before = S.pending.length;
  S = load();
  if (role && S.pending.length > before) {
    const o = S.pending[S.pending.length - 1];
    beep(); toast(`New order from ${tname(o.table)}`);
  }
  if (!$('#modal').innerHTML) render();
});

function render() {
  S = load();
  const p = parts();
  if (p[0] === 'menu') return renderMenu(p[1]);
  if (!role) return renderLogin();
  if (p[0] === 'table') return shell(viewTable(p[1]), 'tables');
  if (p[0] === 'report' && role === 'owner') return shell(viewReport(), 'report');
  if (p[0] === 'qr' && role === 'owner') return shell(viewQR(), 'qr', true);
  if (p[0] === 'settings' && role === 'owner') return shell(viewSettings(), 'settings');
  return shell(viewTables(), 'tables');
}

function shell(html, active, qr) {
  const n = S.pending.length;
  const link = (h, id, label, badge) => `<a href="#/${h}" class="${active === id ? 'on' : ''}">${label}${badge ? `<span class="badge">${badge}</span>` : ''}</a>`;
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
  if (qr) drawQRs($('#app'));
}

/* ---------------- login ---------------- */
let pin = '';
function renderLogin() {
  $('#app').innerHTML = `
    <div class="login"><div class="card">
      <div class="board" style="border-radius:18px"><img src="assets/logo.png" alt="Palleturi Cafe" width="260"></div>
      <div class="sub">Enter PIN to open the counter</div>
      <div class="dots" id="dots">${[0, 1, 2, 3].map(i => `<i class="${i < pin.length ? 'f' : ''}"></i>`).join('')}</div>
      <div class="pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<button data-act="pin" data-k="${k}">${k}</button>`).join('')}
        <button data-act="pin" data-k="c" aria-label="Clear">✕</button>
        <button data-act="pin" data-k="0">0</button>
        <button data-act="pin" data-k="b" aria-label="Backspace">⌫</button>
      </div>
      <p class="sub" style="margin-top:22px">Customer? <a href="#/menu/1">Open the table menu</a></p>
    </div></div>`;
}
function pressPin(k) {
  if (k === 'c') pin = '';
  else if (k === 'b') pin = pin.slice(0, -1);
  else if (pin.length < 4) pin += k;
  if (pin.length === 4) {
    const r = pin === S.settings.ownerPin ? 'owner' : pin === S.settings.staffPin ? 'staff' : null;
    if (r) {
      role = r; pin = '';
      try { sessionStorage.setItem('palleturi.role', r); } catch (e) {}
      location.hash = '#/'; render(); return;
    }
    renderLogin(); $('#dots').classList.add('err'); pin = '';
    setTimeout(renderLogin, 350); return;
  }
  renderLogin();
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
  const pendFor = t => pend.some(o => String(o.table) === String(t));
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
    <div class="tables">${Array.from({ length: TABLE_COUNT }, (_, i) => card(i + 1)).join('')}${card(0)}</div>`;
}

/* ---------------- table billing ---------------- */
let posCat = 'tea';
function viewTable(t) {
  t = +t;
  if (!(t >= 0 && t <= TABLE_COUNT)) return `<p>Unknown table. <a href="#/">Back</a></p>`;
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
        <div class="cats">${CATS.map(c => `<button data-act="cat" data-cat="${c.id}" class="${posCat === c.id ? 'on' : ''}">${c.name}</button>`).join('')}</div>
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
  mutate(s => {
    const tb = s.tables[t] || (s.tables[t] = { lines: {}, opened: Date.now() });
    if (!tb.opened) tb.opened = Date.now();
    tb.lines[id] = Math.max(0, (tb.lines[id] || 0) + d);
    if (!tb.lines[id]) delete tb.lines[id];
    if (!Object.keys(tb.lines).length) delete s.tables[t];
  });
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
      : `<p class="sub" style="margin-bottom:16px">Add the cafe’s UPI ID in Settings to show a payment QR here.</p>`}
      <div class="row" style="margin-bottom:10px">
        <button class="btn green" data-act="pay" data-t="${t}" data-m="UPI">Paid by UPI</button>
        <button class="btn gold" data-act="pay" data-t="${t}" data-m="Cash">Paid by Cash</button>
      </div>
      <button class="btn ghost block" data-act="close-modal">Cancel</button>
    </div></div>`;
  drawQRs($('#modal'));
}
function pay(t, method) {
  let total = 0;
  mutate(s => {
    const tb = s.tables[t]; if (!tb) return;
    const lines = Object.entries(tb.lines).map(([id, qty]) => {
      const it = s.items.find(i => i.id === id) || { name: id, cat: 'tea', price: 0 };
      return { id, name: it.name, cat: it.cat, price: it.price, qty };
    });
    total = lines.reduce((a, l) => a + l.price * l.qty, 0);
    s.sales.push({ id: Date.now().toString(36), table: t, lines, total, method, at: Date.now() });
    delete s.tables[t];
  });
  closeModal();
  toast(`${tname(t)} settled · ${rs(total)} by ${method}`);
  location.hash = '#/';
}
function closeModal() { $('#modal').innerHTML = ''; }

/* ---------------- QR orders ---------------- */
function accept(oid) {
  let t;
  mutate(s => {
    const o = s.pending.find(x => x.id === oid); if (!o) return;
    t = o.table;
    const tb = s.tables[t] || (s.tables[t] = { lines: {}, opened: Date.now() });
    Object.entries(o.lines).forEach(([id, q]) => { tb.lines[id] = (tb.lines[id] || 0) + q; });
    s.pending = s.pending.filter(x => x.id !== oid);
  });
  if (t !== undefined) toast(`Added to ${tname(t)}`);
}
function reject(oid) { mutate(s => { s.pending = s.pending.filter(x => x.id !== oid); }); toast('Order rejected'); }

/* ---------------- customer menu ---------------- */
let cart = {}, lang = 'en', sentFor = null;
try { lang = localStorage.getItem('palleturi.lang') || 'en'; } catch (e) {}
const T = {
  en: { table: 'Table', parcel: 'Parcel', add: 'Add', items: 'items', send: 'Send to counter', sent: 'Order sent!', sentSub: 'The counter has your order. We’ll bring it to your table shortly.', more: 'Order more', pay: 'Pay at the counter when you’re done.' },
  te: { table: 'టేబుల్', parcel: 'పార్సెల్', add: 'జోడించు', items: 'ఐటమ్స్', send: 'కౌంటర్‌కు పంపండి', sent: 'ఆర్డర్ పంపబడింది!', sentSub: 'మీ ఆర్డర్ కౌంటర్‌కు చేరింది. త్వరలో మీ టేబుల్‌కు తీసుకొస్తాము.', more: 'ఇంకా ఆర్డర్ చేయండి', pay: 'తిన్న తర్వాత కౌంటర్‌లో చెల్లించండి.' },
};
function renderMenu(t) {
  S = load();
  t = +t;
  const L = T[lang];
  if (!(t >= 0 && t <= TABLE_COUNT)) { $('#app').innerHTML = `<div class="c-done"><div><h1>Table not found</h1><p>Please scan the QR on your table again.</p></div></div>`; return; }
  if (sentFor === t) {
    $('#app').innerHTML = `<div class="c-done"><div>
      <div class="cup"><span class="steam"></span><span class="steam"></span><span class="steam"></span><div class="plate"></div><div class="body"></div><div class="handle"></div></div>
      <h1>${L.sent}</h1><p style="max-width:300px;margin:0 auto 8px">${L.sentSub}</p>
      <p style="color:#8a6a5f;font-size:14px">${L.pay}</p>
      <button class="btn gold" data-act="m-more" style="margin-top:16px">${L.more}</button></div></div>`;
    return;
  }
  const tlabel = t === 0 ? L.parcel : `${L.table} ${t}`;
  const cats = CATS.filter(c => !c.staffOnly).map(c => ({ ...c, items: S.items.filter(i => i.cat === c.id && i.qr) })).filter(c => c.items.length);
  const count = linesCount(cart), total = linesTotal(cart);
  const nm = i => lang === 'te' && i.te ? i.te : i.name;
  const sub = i => lang === 'te' ? i.name : i.te;
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
      ${count ? `<div class="c-bar"><div class="sum">${count} ${L.items} · <b>${rs(total)}</b></div><button class="btn gold" data-act="m-send" data-t="${t}">${L.send}</button></div>` : ''}
    </div>`;
}
function sendOrder(t) {
  if (!linesCount(cart)) return;
  const order = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), table: t, lines: { ...cart }, at: Date.now() };
  S = load(); S.pending.push(order); save();
  cart = {}; sentFor = t; renderMenu(t); window.scrollTo(0, 0);
}

/* ---------------- report ---------------- */
function todaysSales() { const k = dayKey(); return S.sales.filter(s => dayKey(new Date(s.at)) === k); }
function summarize(sales) {
  const byItem = {}; const byHour = Array(24).fill(0);
  let total = 0, upi = 0, cash = 0;
  sales.forEach(s => {
    total += s.total; if (s.method === 'UPI') upi += s.total; else cash += s.total;
    byHour[new Date(s.at).getHours()] += s.total;
    s.lines.forEach(l => {
      const k = l.id + '|' + l.price;
      const r = byItem[k] || (byItem[k] = { name: l.name, cat: l.cat, qty: 0, amt: 0 });
      r.qty += l.qty; r.amt += l.qty * l.price;
    });
  });
  const groups = CATS.map(c => ({ ...c, rows: Object.values(byItem).filter(r => r.cat === c.id).sort((a, b) => b.qty - a.qty) })).filter(g => g.rows.length);
  const peak = byHour.indexOf(Math.max(...byHour));
  return { total, upi, cash, bills: sales.length, groups, byHour, peak: total ? peak : null };
}
function reportText(r) {
  const d = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const out = [`☕ *Palleturi Cafe — Daily Report*`, `📅 ${d}`, ''];
  r.groups.forEach(g => {
    const q = g.rows.reduce((a, x) => a + x.qty, 0);
    out.push(`*${g.name}* (${q})`);
    g.rows.forEach(x => out.push(`• ${x.name} × ${x.qty} = ${rs(x.amt)}`));
    out.push('');
  });
  out.push('━━━━━━━━━━━━');
  out.push(`🧾 Bills: ${r.bills}`);
  out.push(`💰 *Total: ${rs(r.total)}*`);
  out.push(`📱 UPI: ${rs(r.upi)}  ·  💵 Cash: ${rs(r.cash)}`);
  if (r.peak !== null) out.push(`⏰ Busiest hour: ${hourLabel(r.peak)} – ${hourLabel((r.peak + 1) % 24)}`);
  const open = Object.values(S.tables).filter(t => linesCount(t.lines));
  if (open.length) out.push(`⚠️ ${open.length} table(s) still not settled`);
  return out.join('\n');
}
function viewReport() {
  const r = summarize(todaysSales());
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
        ${r.groups.length ? `<table class="list">${r.groups.map(g => `<tr class="cat"><td>${g.name}</td><td class="r">${g.rows.reduce((a, x) => a + x.qty, 0)}</td><td></td></tr>
          ${g.rows.map(x => `<tr><td>${esc(x.name)}</td><td class="r">× ${x.qty}</td><td class="r">${rs(x.amt)}</td></tr>`).join('')}`).join('')}</table>`
        : `<p class="sub">No bills settled yet today. In Settings you can load a demo day to see how this looks.</p>`}
        <h2 style="margin-top:22px">Sales by hour</h2>
        <div class="bars">${hours.map(h => `<div class="${h === r.peak ? 'top1' : ''}" style="height:${(r.byHour[h] / max) * 100}%" title="${hourLabel(h)}: ${rs(r.byHour[h])}"></div>`).join('')}</div>
        <div class="bars-x">${hours.map(h => `<span>${h % 3 === 2 ? hourLabel(h).replace(' ', '') : ''}</span>`).join('')}</div>
      </div>
      <div class="panel">
        <h2>WhatsApp message</h2>
        <p class="sub" style="margin-top:-6px">Goes to +${esc(S.settings.wa)} at 10 PM</p>
        <div class="wa-preview"><div class="bubble">${esc(reportText(r))}</div></div>
        <button class="btn green block" style="margin-top:14px" data-act="wa-send">Send to WhatsApp now</button>
      </div>
    </div>`;
}
function sendReport() {
  const text = reportText(summarize(todaysSales()));
  mutate(s => { s.settings.lastReport = dayKey(); });
  window.open(`https://wa.me/${S.settings.wa.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

/* ---------------- QR stickers ---------------- */
function viewQR() {
  const list = [...Array.from({ length: TABLE_COUNT }, (_, i) => i + 1), 0];
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
        <div class="field"><label for="upi">UPI ID (for the payment QR)</label><input id="upi" data-set="upi" placeholder="example@upi" value="${esc(st.upi)}"></div>
        <div class="field"><label for="wa">Owner WhatsApp (with country code)</label><input id="wa" data-set="wa" inputmode="numeric" value="${esc(st.wa)}"></div>
        <div class="row">
          <div class="field"><label for="op">Owner PIN</label><input id="op" data-set="ownerPin" inputmode="numeric" maxlength="4" value="${esc(st.ownerPin)}"></div>
          <div class="field"><label for="sp">Staff PIN</label><input id="sp" data-set="staffPin" inputmode="numeric" maxlength="4" value="${esc(st.staffPin)}"></div>
        </div>
        <p class="sub">Staff can take orders and settle bills. Only the owner sees the report, QR stickers and settings.</p>
        <h2 style="margin-top:22px">Demo</h2>
        <div class="row">
          <button class="btn" data-act="seed">Load a demo day</button>
          <button class="btn ghost" data-act="reset">Reset all data</button>
        </div>
      </div>
      <div class="panel">
        <h2>Menu & prices</h2>
        <p class="sub" style="margin-top:-6px">The toggle shows an item on the customer QR menu.</p>
        ${CATS.map(c => `<div style="color:var(--gold);font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.06em;margin:16px 0 6px">${c.name}${c.staffOnly ? ' · counter only' : ''}</div>
          ${S.items.filter(i => i.cat === c.id).map(i => `<div class="line">
            <span class="nm">${esc(i.name)}</span>
            ${c.staffOnly ? '' : `<input type="checkbox" class="switch" data-qr="${i.id}" ${i.qr ? 'checked' : ''} aria-label="Show ${esc(i.name)} on QR menu">`}
            <input class="ipt price" data-price="${i.id}" inputmode="numeric" value="${i.price}" aria-label="${esc(i.name)} price">
          </div>`).join('')}`).join('')}
        <h2 style="margin-top:22px">Add item</h2>
        <div class="row">
          <input class="ipt" id="ni-name" placeholder="Item name">
          <select class="ipt" id="ni-cat">${CATS.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
        </div>
        <div class="row" style="margin-top:10px">
          <input class="ipt" id="ni-price" inputmode="numeric" placeholder="Price ₹">
          <button class="btn gold" data-act="add-item">Add</button>
        </div>
      </div>
    </div>`;
}
function seedDemo() {
  mutate(s => {
    const k = dayKey();
    s.sales = s.sales.filter(x => dayKey(new Date(x.at)) !== k);
    const weights = { tea: 30, masala: 14, ginger: 12, coffee: 8, lemon: 4, blacktea: 3, blackcoffee: 2, green: 2, boost: 3, milk: 3, samosa: 10, biscuits: 8, rusk: 4, bun: 6, 'cd-small': 7, 'cd-big': 3, water: 4, cookie: 6, cig10: 10, cig15: 5, cig20: 6, cig25: 3 };
    const pool = Object.entries(weights).flatMap(([id, w]) => Array(w).fill(id));
    const start = new Date(); start.setHours(8, 0, 0, 0);
    const hourWeight = [1, 2, 2, 1, 1, 1, 1, 2, 3, 4, 6, 6, 4, 2]; // 8 AM .. 9 PM
    const slots = hourWeight.flatMap((w, h) => Array(w).fill(h));
    for (let n = 0; n < 92; n++) {
      const h = slots[Math.floor(Math.random() * slots.length)];
      const at = start.getTime() + h * 3600000 + Math.floor(Math.random() * 3600000);
      if (at > Date.now()) continue;
      const lines = {};
      const k2 = 1 + Math.floor(Math.random() * 4);
      for (let j = 0; j < k2; j++) { const id = pool[Math.floor(Math.random() * pool.length)]; lines[id] = (lines[id] || 0) + 1; }
      const ls = Object.entries(lines).map(([id, qty]) => { const it = s.items.find(i => i.id === id); return it && { id, name: it.name, cat: it.cat, price: it.price, qty }; }).filter(Boolean);
      s.sales.push({ id: 'd' + n, table: 1 + Math.floor(Math.random() * TABLE_COUNT), lines: ls, total: ls.reduce((a, l) => a + l.price * l.qty, 0), method: Math.random() < .6 ? 'UPI' : 'Cash', at });
    }
  });
  toast('Demo day loaded — open Today’s report');
}

/* ---------------- events ---------------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, t = el.dataset.t !== undefined ? +el.dataset.t : null;
  if (a === 'close-modal') { if (e.target === el) closeModal(); return; }
  if (el.tagName === 'A' && a !== 'm-jump') return;
  switch (a) {
    case 'pin': return pressPin(el.dataset.k);
    case 'logout': role = null; try { sessionStorage.removeItem('palleturi.role'); } catch (x) {} location.hash = '#/'; return render();
    case 'cat': posCat = el.dataset.cat; return render();
    case 'add': return addLine(t, el.dataset.id, 1);
    case 'dec': return addLine(t, el.dataset.id, -1);
    case 'clear': if (confirm(`Clear the whole bill for ${tname(t)}?`)) mutate(s => { delete s.tables[t]; }); return;
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
    case 'seed': return seedDemo();
    case 'reset': if (confirm('Delete all bills, open tables and settings on this device?')) { try { localStorage.removeItem(KEY); } catch (x) {} S = fresh(); save(); render(); toast('All data reset'); } return;
    case 'add-item': {
      const name = $('#ni-name').value.trim(), price = parseInt($('#ni-price').value, 10), cat = $('#ni-cat').value;
      if (!name || !(price > 0)) return toast('Enter a name and price');
      mutate(s => s.items.push({ id: 'x' + Date.now().toString(36), name, te: '', cat, price, qr: cat !== 'cig' }));
      return toast(`${name} added`);
    }
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.set) { const k = el.dataset.set, v = el.value.trim(); mutate(s => { s.settings[k] = v; }); toast('Saved'); }
  else if (el.dataset.price) { const v = parseInt(el.value, 10); if (v >= 0) { mutate(s => { s.items.find(i => i.id === el.dataset.price).price = v; }); toast('Price updated'); } }
  else if (el.dataset.qr) { mutate(s => { s.items.find(i => i.id === el.dataset.qr).qr = el.checked; }); }
});

/* ---------------- clock, timers, 10 PM reminder ---------------- */
setInterval(() => {
  const c = $('.clock'); if (c) c.textContent = timeStr(new Date());
  document.querySelectorAll('[data-since]').forEach(el => { const s = ago(+el.dataset.since); el.textContent = el.closest('.when') ? s + ' ago' : s; });
  const now = new Date();
  if (role === 'owner' && now.getHours() >= 22 && S.settings.lastReport !== dayKey() && Date.now() > snoozeUntil && !$('#modal').innerHTML) {
    $('#modal').innerHTML = `<div class="overlay"><div class="sheet">
      <h1>It’s 10 PM</h1><p class="sub">Time to close the day and send today’s report to WhatsApp.</p>
      <div class="row" style="margin-top:16px"><button class="btn ghost" id="later">Later</button>
      <button class="btn green" id="sendnow">Send report</button></div></div></div>`;
    $('#later').onclick = () => { snoozeUntil = Date.now() + 30 * 60000; closeModal(); };
    $('#sendnow').onclick = () => { closeModal(); sendReport(); };
  }
}, 20000);
let snoozeUntil = 0;

render();
