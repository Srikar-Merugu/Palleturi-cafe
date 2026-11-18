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

/* ---------------- icons (inline SVG, stroke = currentColor) ---------------- */
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  chart: '<path d="M3 20h18"/><path d="M6 16v-5M11 16V6M16 16v-8M20 16v-3"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20.5h.01M17.5 20.5H21V17"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  lock: '<rect x="4.5" y="11" width="15" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  receipt: '<path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21V3z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/><path d="M10 11v6M14 11v6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 10v4M18 10v4"/>',
  back: '<path d="m14.5 18-6-6 6-6"/>',
  send: '<path d="M21 3 10 14"/><path d="M21 3 14.5 21l-4.5-7-7-4.5L21 3z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  cup: '<path d="M4 9.5h12V14a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9.5z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3.5c-.8.9.8 1.6 0 2.5M12 3.5c-.8.9.8 1.6 0 2.5"/>',
  samosa: '<path d="M12 4 3.5 19h17L12 4z"/><path d="M8.5 15h7M10 11.5h4"/>',
  bottle: '<path d="M10 2.5h4V5l1.6 2.6V20a1.8 1.8 0 0 1-1.8 1.8h-3.6A1.8 1.8 0 0 1 8.4 20V7.6L10 5V2.5z"/><path d="M8.4 12h7.2M8.4 16h7.2"/>',
  cookie: '<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="9" r=".9" fill="currentColor"/><circle cx="14.5" cy="9.5" r=".9" fill="currentColor"/><circle cx="9.5" cy="14.5" r=".9" fill="currentColor"/><circle cx="15" cy="14.5" r=".9" fill="currentColor"/>',
  cig: '<rect x="2.5" y="13" width="15" height="4" rx="1"/><path d="M13.5 13v4"/><path d="M20.5 13v4M18.5 4.5c0 2 2 2 2 4M16.5 6.5c0 1.5 1 2 1 3"/>',
};
const CAT_ICON = { tea: 'cup', snacks: 'samosa', drinks: 'bottle', cookies: 'cookie', cig: 'cig' };

/* ---------------- phone notifications (owner) ---------------- */
// pushState: 'unknown' | 'on' | 'off' | 'blocked' | 'ios-install' | 'unsupported'
let swReg = null, pushState = 'unknown';
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64ToU8 = s => { const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
const deviceName = () => { const ua = navigator.userAgent; return /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iPhone' : /mac/i.test(ua) ? 'Mac' : /windows/i.test(ua) ? 'Windows' : 'Browser'; };

async function checkPush() {
  try {
    if (!pushSupported() || !swReg) pushState = isIOS && !isStandalone() ? 'ios-install' : 'unsupported';
    else if (Notification.permission === 'denied') pushState = 'blocked';
    else pushState = (await swReg.pushManager.getSubscription()) ? 'on' : 'off';
  } catch (e) { pushState = 'unsupported'; }
  if (S && !$('#modal').innerHTML) render();
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(r => { swReg = r; checkPush(); }).catch(() => checkPush());
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.open) location.href = e.data.open; });
} else { checkPush(); }

async function enablePush() {
  if (!S.pushKey) return toast('Notifications are not set up on the server yet');
  if (!pushSupported() || !swReg) return toast(isIOS ? 'On iPhone, add the app to the Home Screen first' : 'This browser can’t show notifications');
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { pushState = perm === 'denied' ? 'blocked' : 'off'; render(); return toast('Notifications were not allowed'); }
    const sub = await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(S.pushKey) });
    await api('/api/push/subscribe', { method: 'POST', body: { sub: sub.toJSON(), device: deviceName() } });
    pushState = 'on'; render(); toast('Order alerts are on for this phone');
  } catch (e) { toast(e.message || 'Could not turn on notifications'); }
}
async function disablePush() {
  try {
    const sub = swReg && await swReg.pushManager.getSubscription();
    if (sub) { await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
  } catch (e) {}
  pushState = 'off'; render(); toast('Order alerts turned off on this phone');
}
function pushCard() {
  const msg = {
    on: `<p class="sub">${ico('check', 16)} <b style="color:var(--green)">On.</b> This phone gets a notification for every staff order, QR order and paid bill, even when the app is closed.</p>
         <div class="row"><button class="btn" data-act="push-test">Send a test</button><button class="btn ghost" data-act="push-off">Turn off</button></div>`,
    off: `<p class="sub">Get a notification on this phone for every order and paid bill, even when the app is closed.</p>
          <button class="btn gold" data-act="push-on">${ico('bell', 18)} Turn on order alerts</button>`,
    blocked: `<p class="sub">Notifications are blocked for this site. Allow them in the browser’s site settings (tap the lock icon next to the address), then reload.</p>`,
    'ios-install': `<p class="sub">On iPhone: tap <b>Share</b> → <b>Add to Home Screen</b>, open <b>Palleturi</b> from the home screen, log in, and turn on alerts here.</p>`,
    unsupported: `<p class="sub">This browser can’t show notifications. Use Chrome on Android, or Safari on iPhone with the app added to the Home Screen.</p>`,
    unknown: `<p class="sub">Checking…</p>`,
  };
  return `<h2>Order alerts on this phone</h2>${msg[pushState] || msg.unknown}`;
}
function pushBanner() {
  let hidden = false; try { hidden = localStorage.getItem('palleturi.pushBanner') === 'hide'; } catch (e) {}
  if (role !== 'owner' || hidden || !['off', 'ios-install'].includes(pushState) || !S.pushKey) return '';
  return `<div class="alert-banner">${ico('bell', 22)}
    <div class="txt"><b>Get every order on your phone</b><div class="sub">${pushState === 'off' ? 'Staff orders, QR orders and paid bills — even when the app is closed.' : 'On iPhone, first add Palleturi to the Home Screen (Share → Add to Home Screen).'}</div></div>
    ${pushState === 'off' ? `<button class="btn gold small" data-act="push-on">Turn on</button>` : ''}
    <button class="x" data-act="push-hide" aria-label="Hide">×</button></div>`;
}


/* ---------------- stock (owner) ---------------- */
let STK = null, stockTab = 'items', stockFilter = 'all', stockQ = '', stkItem = null, stkMoves = null;
const STATUS_LABEL = { ok: 'In stock', low: 'Low', out: 'Out', unset: 'Not counted', untracked: 'Not tracked' };
const MOVE_LABEL = { in: 'Added', sale: 'Sold', count: 'Counted', remove: 'Removed' };
const fmtQty = (n, unit) => `${n} ${unit}`;
const agoDays = ts => { if (!ts) return 'never'; const d = Math.floor((Date.now() - ts) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; };
const whenStr = ts => { const d = new Date(ts); return dayKey(d) === dayKey() ? timeStr(d) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' + timeStr(d); };
async function loadStock() { try { STK = await api('/api/stock'); if (stkItem) stkItem = STK.items.find(i => i.id === stkItem.id) || null; } catch (e) { toast(e.message); } }

function viewStock() {
  if (!STK) return `<div class="page-head"><h1>Stock</h1></div><p class="sub">Loading…</p>`;
  const tracked = STK.items.filter(i => i.track);
  const n = s => tracked.filter(i => i.status === s).length;
  const value = tracked.reduce((a, i) => a + (i.cost && i.stock > 0 ? i.cost * i.stock : 0), 0);
  const q = stockQ.trim().toLowerCase();
  const list = STK.items.filter(i => (stockFilter === 'all' ? i.track : stockFilter === 'untracked' ? !i.track : i.track && i.status === stockFilter) && (!q || i.name.toLowerCase().includes(q)));
  const chip = (id, label, count) => `<button data-act="stk-filter" data-f="${id}" class="${stockFilter === id ? 'on' : ''}">${label}${count ? `<span class="cnt">${count}</span>` : ''}</button>`;
  const head = `
    <div class="page-head">
      <div><h1>Stock</h1><div class="sub">Packaged items: cigarettes, cool drinks, biscuits, cookies…</div></div>
      <div class="seg">
        <button data-act="stk-tab" data-tab="items" class="${stockTab === 'items' ? 'on' : ''}">Items</button>
        <button data-act="stk-tab" data-tab="history" class="${stockTab === 'history' ? 'on' : ''}">History</button>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="ico">${ico('box')}</div><div><div class="k">Items tracked</div><b>${tracked.length}</b></div></div>
      <div class="kpi ${n('low') ? 'hot' : ''}"><div class="ico">${ico('bell')}</div><div><div class="k">Running low</div><b>${n('low')}</b></div></div>
      <div class="kpi ${n('out') ? 'danger' : ''}"><div class="ico">${ico('box')}</div><div><div class="k">Out of stock</div><b>${n('out')}</b></div></div>
      <div class="kpi brand"><div class="ico">${ico('cash')}</div><div><div class="k">Stock value (buying price)</div><b>${value ? rs(Math.round(value)) : '—'}</b></div></div>
    </div>`;
  if (stockTab === 'history') {
    return head + `<div class="panel">${STK.moves.length ? `<div class="moves">${STK.moves.map(moveRow).join('')}</div>` : `<p class="sub">No stock changes yet. Add your first delivery from the Items tab.</p>`}</div>`;
  }
  return head + `
    ${n('unset') ? `<div class="alert-banner">${ico('box', 22)}<div class="txt"><b>${n('unset')} item${n('unset') === 1 ? '' : 's'} not counted yet</b><div class="sub">Count what’s on the shelf once (tap <b>Count</b>), or add the next delivery. Until then they always show as available.</div></div></div>` : ''}
    <div class="stk-bar">
      <div class="cats">${chip('all', 'All tracked')}${chip('low', 'Low', n('low'))}${chip('out', 'Out', n('out'))}${chip('unset', 'Not counted', n('unset'))}${chip('untracked', 'Not tracked')}</div>
      <label class="search">${ico('search', 18)}<input id="stk-search" type="search" placeholder="Search stock…" value="${esc(stockQ)}" autocomplete="off" aria-label="Search stock"></label>
    </div>
    <div class="stk-list" id="stk-list">${stockRows(list)}</div>`;
}
function stockRows(list) {
  if (!list.length) return `<div class="panel sub" style="text-align:center">Nothing here.</div>`;
  return list.map(i => `
    <div class="srow st-${i.status} cat-${esc(i.cat)}">
      <span class="ic">${ico(CAT_ICON[i.cat] || 'box', 20)}</span>
      <button class="nm" data-act="stk-open" data-id="${i.id}"><b>${esc(i.name)}</b><span class="meta">${i.track ? `Last added ${agoDays(i.lastIn)}${i.cost ? ` · buys at ${rs(i.cost)}` : ''}` : 'Not tracked'}</span></button>
      ${i.track ? `<div class="qty">${i.stock === null ? '<span class="sub">—</span>' : `<b>${i.stock}</b> <span>${esc(i.unit)}</span>`}</div><span class="chip">${STATUS_LABEL[i.status]}</span>` : '<div class="qty"></div><span></span>'}
      <div class="acts">${i.track
        ? `<button class="btn small gold" data-act="stk-in" data-id="${i.id}">${ico('plus', 16)} Add</button><button class="btn small ghost" data-act="stk-count" data-id="${i.id}">Count</button>`
        : `<button class="btn small ghost" data-act="stk-track" data-id="${i.id}" data-on="1">Start tracking</button>`}</div>
    </div>`).join('');
}
function moveRow(m) {
  const sign = m.qty > 0 ? '+' : '';
  const detail = m.type === 'in' ? [m.supplier && `from ${esc(m.supplier)}`, m.bill ? `bill ${rs(m.bill)}` : ''].filter(Boolean).join(' · ')
    : m.type === 'count' ? (m.expected === null ? 'first count' : m.qty === 0 ? 'matched' : m.qty < 0 ? `${-m.qty} missing (expected ${m.expected})` : `${m.qty} extra (expected ${m.expected})`)
    : m.type === 'remove' ? esc(m.reason || '') : m.type === 'sale' ? 'paid bill' : '';
  return `<div class="mrow mv-${m.type}${m.type === 'count' && m.qty < 0 ? ' miss' : ''}">
    <span class="mt">${MOVE_LABEL[m.type] || m.type}</span>
    <div class="mn"><b>${esc(m.name)}</b><span class="meta">${whenStr(m.at)}${detail ? ' · ' + detail : ''}${m.by ? ' · ' + m.by : ''}</span></div>
    <span class="mq">${m.type === 'count' && m.expected === null ? m.qty : sign + m.qty}</span>
    <span class="ma">→ ${m.after}</span>
  </div>`;
}

/* pop-ups */
function stkFind(id) { return STK && STK.items.find(i => i.id === id); }
function openStockIn(id) {
  const it = stkFind(id); if (!it) return;
  const pack = it.packSize > 0;
  $('#modal').innerHTML = `<div class="overlay" data-act="close-modal"><div class="sheet left" role="dialog" aria-label="Add stock">
    <h1>Add stock</h1><div class="sub" style="margin-bottom:16px">${esc(it.name)} · now ${it.stock === null ? 'not counted' : fmtQty(it.stock, esc(it.unit))}</div>
    <div class="grid2">
      ${pack ? `<div class="field"><label for="stk-packs">${esc(cap(it.packName || 'pack'))}s (${it.packSize} each)</label><input id="stk-packs" inputmode="numeric" placeholder="0"></div>` : ''}
      <div class="field"><label for="stk-loose">${pack ? 'Loose ' : ''}${esc(it.unit)}</label><input id="stk-loose" inputmode="numeric" placeholder="0"></div>
    </div>
    <div class="change ok" id="stk-total"><span>Adding</span><b>0 ${esc(it.unit)}</b></div>
    <div class="grid2">
      <div class="field"><label for="stk-bill">Amount paid (optional)</label><input id="stk-bill" inputmode="decimal" placeholder="₹ total for this delivery"></div>
      <div class="field"><label for="stk-supplier">Supplier (optional)</label><input id="stk-supplier" placeholder="e.g. Ravi Agencies" maxlength="60"></div>
    </div>
    <p class="sub" id="stk-costline" style="margin:-4px 0 14px">${it.cost ? `Last buying price: ${rs(it.cost)} per ${esc(singular(it.unit))}` : 'Add the amount paid to see profit in the daily report.'}</p>
    <div class="row"><button class="btn ghost" data-act="close-modal">Cancel</button><button class="btn gold" id="stk-save" data-act="stk-in-save" data-id="${id}" disabled>Add to stock</button></div>
  </div></div>`;
  ($('#stk-packs') || $('#stk-loose')).focus();
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const singular = u => u.replace(/s$/, '');
const numIn = id => parseInt(($('#' + id)?.value || '').replace(/\D/g, ''), 10) || 0;
function stockInTotal() {
  const it = stkFind($('#stk-save')?.dataset.id); if (!it) return 0;
  const total = numIn('stk-packs') * (it.packSize || 0) + numIn('stk-loose');
  const after = (it.stock || 0) + total;
  $('#stk-total').innerHTML = `<span>Adding</span><b>${total} ${esc(it.unit)}${total ? ` <small class="sub">→ ${after} in stock</small>` : ''}</b>`;
  $('#stk-save').disabled = !total;
  const bill = parseFloat($('#stk-bill')?.value || '');
  if (total && bill > 0) $('#stk-costline').textContent = `Buying price: ${rs(Math.round(bill / total * 100) / 100)} per ${singular(it.unit)} · sells at ${rs(it.price)}`;
  return total;
}
function openCount(id) {
  const it = stkFind(id); if (!it) return;
  $('#modal').innerHTML = `<div class="overlay" data-act="close-modal"><div class="sheet left" role="dialog" aria-label="Count stock">
    <h1>Count stock</h1><div class="sub" style="margin-bottom:16px">${esc(it.name)} · count what’s on the shelf right now</div>
    <div class="grid2">
      <div class="field"><label>App expects</label><div class="ipt ro">${it.stock === null ? 'not counted yet' : fmtQty(it.stock, esc(it.unit))}</div></div>
      <div class="field"><label for="stk-actual">Actually on shelf</label><input id="stk-actual" inputmode="numeric" placeholder="0"></div>
    </div>
    <div class="change" id="stk-diff"><span>Difference</span><b>—</b></div>
    <div class="row"><button class="btn ghost" data-act="close-modal">Cancel</button><button class="btn gold" id="stk-save" data-act="stk-count-save" data-id="${id}" disabled>Save count</button></div>
  </div></div>`;
  $('#stk-actual').focus();
}
function countDiff() {
  const it = stkFind($('#stk-save')?.dataset.id); if (!it) return;
  const raw = ($('#stk-actual').value || '').replace(/\D/g, ''), box = $('#stk-diff');
  $('#stk-save').disabled = raw === '';
  if (raw === '' || it.stock === null) { box.className = 'change'; box.innerHTML = `<span>Difference</span><b>—</b>`; return; }
  const d = parseInt(raw, 10) - it.stock;
  box.className = 'change ' + (d < 0 ? 'short' : 'ok');
  box.innerHTML = d === 0 ? `<span>Matches</span><b>✓</b>` : d < 0 ? `<span>Missing</span><b>${-d} ${esc(it.unit)}</b>` : `<span>Extra</span><b>+${d} ${esc(it.unit)}</b>`;
}
async function openStockItem(id) {
  stkItem = stkFind(id); if (!stkItem) return;
  stkMoves = null; renderStockItem();
  try { stkMoves = (await api(`/api/stock/${id}/moves`)).moves; } catch (e) { stkMoves = []; }
  if (stkItem && stkItem.id === id && $('#stk-sheet')) renderStockItem();
}
function renderStockItem() {
  const it = stkItem;
  $('#modal').innerHTML = `<div class="overlay" data-act="close-modal"><div class="sheet left wide" id="stk-sheet" role="dialog" aria-label="${esc(it.name)} stock">
    <div class="stk-top st-${it.status}">
      <div><h1>${esc(it.name)}</h1><span class="chip">${STATUS_LABEL[it.status]}</span></div>
      <div class="big">${it.stock === null ? '—' : it.stock}<small> ${esc(it.unit)}</small></div>
    </div>
    <div class="row" style="margin:14px 0 18px">
      <button class="btn gold" data-act="stk-in" data-id="${it.id}">${ico('plus', 16)} Add stock</button>
      <button class="btn" data-act="stk-count" data-id="${it.id}">Count</button>
      <button class="btn ghost" data-act="stk-remove" data-id="${it.id}">Remove</button>
    </div>
    <h2>Settings</h2>
    <div class="grid2">
      <div class="field"><label for="ss-low">Alert me when below</label><input id="ss-low" data-stkset="lowAt" inputmode="numeric" value="${it.lowAt}"></div>
      <div class="field"><label for="ss-unit">Unit</label><input id="ss-unit" data-stkset="unit" value="${esc(it.unit)}" maxlength="20"></div>
      <div class="field"><label for="ss-pack">Pack name</label><input id="ss-pack" data-stkset="packName" value="${esc(it.packName)}" placeholder="crate, box…" maxlength="20"></div>
      <div class="field"><label for="ss-size">${esc(it.unit)} per pack</label><input id="ss-size" data-stkset="packSize" inputmode="numeric" value="${it.packSize || ''}" placeholder="0 = no packs"></div>
      <div class="field"><label for="ss-cost">Buying price per ${esc(singular(it.unit))} (₹)</label><input id="ss-cost" data-stkset="cost" inputmode="decimal" value="${it.cost ?? ''}" placeholder="for profit"></div>
      <div class="field"><label>Tracking</label><button class="btn ghost" data-act="stk-track" data-id="${it.id}" data-on="0">Stop tracking</button></div>
    </div>
    <h2 style="margin-top:8px">Recent changes</h2>
    ${stkMoves === null ? '<p class="sub">Loading…</p>' : stkMoves.length ? `<div class="moves">${stkMoves.map(moveRow).join('')}</div>` : '<p class="sub">No changes yet.</p>'}
    <button class="btn ghost block" data-act="close-modal" style="margin-top:16px">Close</button>
  </div></div>`;
}
function openRemove(id) {
  const it = stkFind(id); if (!it) return;
  $('#modal').innerHTML = `<div class="overlay" data-act="close-modal"><div class="sheet left" role="dialog" aria-label="Remove stock">
    <h1>Remove stock</h1><div class="sub" style="margin-bottom:16px">${esc(it.name)} · damaged, expired or used by staff</div>
    <div class="field"><label for="stk-rm">How many ${esc(it.unit)}</label><input id="stk-rm" inputmode="numeric" placeholder="0"></div>
    <div class="field"><label>Reason</label><div class="cats" id="stk-reason">${['damaged', 'expired', 'own use', 'other'].map((r, i) => `<button data-act="stk-reason" data-r="${r}" class="${i === 0 ? 'on' : ''}">${cap(r)}</button>`).join('')}</div></div>
    <div class="row"><button class="btn ghost" data-act="close-modal">Cancel</button><button class="btn gold" data-act="stk-remove-save" data-id="${id}">Remove</button></div>
  </div></div>`;
  $('#stk-rm').focus();
}
async function stockSave(path, body, msg) {
  const r = await op(() => api(path, { method: 'POST', body }));
  if (!r) return;
  closeModal(); toast(msg(r)); await loadStock(); render();
}

const ico = (name, size = 22) => `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

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
    if (parts()[0] === 'stock' && role === 'owner') await loadStock();
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
  window.scrollTo(0, 0); posQ = '';
  if (parts()[0] === 'stock' && role === 'owner') loadStock().then(render);
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
  if (p[0] === 'stock' && role === 'owner') return shell(viewStock(), 'stock');
  if (p[0] === 'qr' && role === 'owner') return shell(viewQR(), 'qr', true);
  if (p[0] === 'settings' && role === 'owner') return shell(viewSettings(), 'settings');
  return shell(viewTables(), 'tables');
}

const NAV = [['', 'tables', 'Tables', 'grid'], ['stock', 'stock', 'Stock', 'box'], ['report', 'report', 'Report', 'chart'], ['qr', 'qr', 'QR codes', 'qr'], ['settings', 'settings', 'Settings', 'sliders']];
function shell(html, active, qr) {
  const n = S.pending.length;
  const act = document.activeElement, focusId = act && act.id, caret = act && act.selectionStart;
  const y = window.scrollY;
  const nav = NAV.filter(([, id]) => id === 'tables' || role === 'owner');
  $('#app').innerHTML = `
    <div class="app">
      <header class="mtop"><img src="assets/logo.png" alt="Palleturi Cafe"><span class="clock">${timeStr(new Date())}</span></header>
      <aside class="rail" aria-label="Main menu">
        <a class="rail-logo board" href="#/" aria-label="Palleturi Cafe home"><img src="assets/logo.png" alt=""></a>
        <nav>${nav.map(([h, id, label, ic]) => `<a href="#/${h}" class="${active === id ? 'on' : ''}" ${active === id ? 'aria-current="page"' : ''}>${ico(ic, 22)}<span>${label}</span>${id === 'tables' && n ? `<span class="badge">${n}</span>` : ''}</a>`).join('')}</nav>
        <div class="rail-foot">
          <span class="clock">${timeStr(new Date())}</span>
          <span class="who">${role === 'owner' ? 'Owner' : 'Staff'}</span>
          <button data-act="logout" title="Lock the counter">${ico('lock', 20)}<span>Lock</span></button>
        </div>
      </aside>
      <main>${html}</main>
    </div>`;
  window.scrollTo(0, y);
  if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) {} } }
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
const LATE_MIN = 30; // a table open this long gets a red "long wait" warning
function viewTables() {
  const pend = S.pending;
  const open = Object.entries(S.tables).filter(([, t]) => linesCount(t.lines) > 0);
  const openAmt = open.reduce((a, [, t]) => a + linesTotal(t.lines), 0);
  const occupied = open.filter(([k]) => +k !== 0).length;
  const oldest = open.reduce((m, [, t]) => Math.min(m, t.opened || Date.now()), Date.now());
  const kpis = `
    <div class="kpis">
      <div class="kpi"><div class="ico">${ico('grid')}</div><div><div class="k">Tables occupied</div><b>${occupied}<small> / ${S.tableCount}</small></b></div></div>
      <div class="kpi"><div class="ico">${ico('receipt')}</div><div><div class="k">Running bills</div><b>${rs(openAmt)}</b></div></div>
      <div class="kpi ${pend.length ? 'hot' : ''}"><div class="ico">${ico('bell')}</div><div><div class="k">New QR orders</div><b>${pend.length}</b></div></div>
      ${S.today
        ? `<div class="kpi brand"><div class="ico">${ico('chart')}</div><div><div class="k">Today’s sales</div><b>${rs(S.today.total)} <small>· ${S.today.bills} bills</small></b></div></div>`
        : `<div class="kpi"><div class="ico">${ico('clock')}</div><div><div class="k">Longest open bill</div><b>${open.length ? `<span data-since="${oldest}">${ago(oldest)}</span>` : '—'}</b></div></div>`}
    </div>`;
  const incoming = pend.length ? `
    <h2>New QR orders</h2>
    <div class="incoming">${pend.map(o => `
      <div class="order-card">
        <div class="t">${+o.table === 0 ? 'P' : 'T' + o.table}</div>
        <div class="lines">${Object.entries(o.lines).map(([id, q]) => `<b>${q} ×</b> ${esc(item(id)?.name || id)}`).join(' · ')}
          <div class="when">${tname(o.table)} · <span data-since="${o.at}">${ago(o.at)}</span> ago</div></div>
        <button class="btn small ghost" data-act="reject" data-oid="${o.id}">Reject</button>
        <button class="btn small gold" data-act="accept" data-oid="${o.id}">Accept</button>
      </div>`).join('')}</div>` : '';
  const card = t => {
    const tb = S.tables[t]; const busy = tb && linesCount(tb.lines) > 0;
    const ping = pend.some(o => +o.table === t);
    const late = busy && mins(tb.opened) >= LATE_MIN;
    const chip = ping ? 'New order' : late ? 'Long wait' : busy ? 'Occupied' : 'Free';
    return `<a href="#/table/${t}" class="tcard ${busy ? 'busy' : ''} ${late ? 'late' : ''} ${ping ? 'ping' : ''}" aria-label="${tname(t)}, ${chip}${busy ? ', ' + rs(linesTotal(tb.lines)) : ''}">
      <div class="tc-top"><span class="tc-n">${t === 0 ? 'Parcel' : `<small>T</small>${t}`}</span><span class="chip">${chip}</span></div>
      ${busy
        ? `<div class="tc-amt">${rs(linesTotal(tb.lines))}</div><div class="tc-meta">${ico('clock', 14)}<span data-since="${tb.opened}">${ago(tb.opened)}</span><span>·</span><span>${linesCount(tb.lines)} items</span></div>`
        : `<div class="tc-amt empty">Tap to start a bill</div>`}
    </a>`;
  };
  return `
    <div class="page-head">
      <div><h1>Tables</h1><div class="sub">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      <div class="legend"><span><i></i>Free</span><span><i class="busy"></i>Occupied</span><span><i class="ping"></i>New QR order</span><span><i class="late"></i>Open ${LATE_MIN}+ min</span></div>
    </div>
    ${pushBanner()}
    ${kpis}
    ${incoming}
    <div class="tables">${Array.from({ length: S.tableCount }, (_, i) => card(i + 1)).join('')}${card(0)}</div>`;
}

/* ---------------- table billing ---------------- */
let posCat = 'tea', posQ = '';
function itemsHTML(t) {
  const lines = (S.tables[t] || { lines: {} }).lines;
  const q = posQ.trim().toLowerCase();
  const list = q ? S.items.filter(i => i.name.toLowerCase().includes(q) || (i.te || '').includes(posQ.trim())) : S.items.filter(i => i.cat === posCat);
  if (!list.length) return `<div class="none">No items match “${esc(posQ)}”</div>`;
  const reserved = id => Object.values(S.tables).reduce((a, tb) => a + ((tb.lines || {})[id] || 0), 0);
  return list.map(i => {
    const n = lines[i.id] || 0;
    const left = i.track && i.stock !== null ? i.stock - reserved(i.id) : null;
    const stk = left === null ? '' : `<span class="stk ${left <= 0 ? 'out' : left <= i.lowAt ? 'low' : ''}">${left <= 0 ? 'Out of stock' : left + ' left'}</span>`;
    return `<div class="item cat-${esc(i.cat)} ${n ? 'sel' : ''} ${bumpId === i.id ? 'bump' : ''}">
      <button class="item-add" data-act="add" data-t="${t}" data-id="${i.id}" aria-label="Add ${esc(i.name)}${n ? `, ${n} on bill` : ''}">
        <span class="ic">${ico(CAT_ICON[i.cat] || 'cup', 20)}</span>
        <span class="nm">${esc(i.name)}${stk}</span>
        <span class="foot"><span class="pr">${rs(i.price)}</span>${n ? `<span class="q">× ${n}</span>` : ''}</span>
      </button>
      ${n ? `<button class="item-minus" data-act="dec" data-t="${t}" data-id="${i.id}" aria-label="Remove one ${esc(i.name)}">−</button>` : ''}
    </div>`;
  }).join('');
}
function viewTable(t) {
  t = +t;
  if (!(t >= 0 && t <= S.tableCount)) return `<p>Unknown table. <a href="#/">Back</a></p>`;
  const tb = S.tables[t] || { lines: {} };
  const lines = tb.lines, total = linesTotal(lines), count = linesCount(lines);
  const sent = tb.sent || {};
  const unsent = Object.entries(lines).reduce((a, [id, q]) => a + Math.max(0, q - (sent[id] || 0)), 0);
  const billLines = Object.entries(lines).filter(([, q]) => q > 0);
  const pendHere = S.pending.filter(o => +o.table === t);
  const catCount = c => S.items.filter(i => i.cat === c.id).reduce((a, i) => a + (lines[i.id] || 0), 0);
  const payBtns = `
    <button class="paybtn upi" data-act="pay-open" data-m="UPI" data-t="${t}" ${total ? '' : 'disabled'}>${ico('qr', 20)} UPI</button>
    <button class="paybtn cash" data-act="pay-open" data-m="Cash" data-t="${t}" ${total ? '' : 'disabled'}>${ico('cash', 20)} Cash</button>`;
  return `
    <div class="pos">
      <section>
        <div class="pos-head">
          <a class="back" href="#/" aria-label="Back to tables">${ico('back', 20)}</a>
          <div class="ttl"><h1>${tname(t)}</h1>
            <div class="sub">${tb.opened ? `${ico('clock', 14)} Open since ${timeStr(new Date(tb.opened))} · <span data-since="${tb.opened}">${ago(tb.opened)}</span>` : 'New bill · tap items to add'}</div></div>
          <label class="search">${ico('search', 18)}<input id="search" type="search" placeholder="Search items…" value="${esc(posQ)}" autocomplete="off" aria-label="Search items"></label>
        </div>
        ${pendHere.map(o => `<div class="qr-banner">${ico('bell', 20)}
          <div class="lines"><b>QR order:</b> ${Object.entries(o.lines).map(([id, q]) => `${q} × ${esc(item(id)?.name || id)}`).join(', ')}</div>
          <button class="btn small ghost" data-act="reject" data-oid="${o.id}">Reject</button>
          <button class="btn small gold" data-act="accept" data-oid="${o.id}">Accept</button></div>`).join('')}
        <div class="cats">${S.cats.map(c => { const n = catCount(c); return `<button data-act="cat" data-cat="${c.id}" class="cat-${c.id} ${!posQ && posCat === c.id ? 'on' : ''}"><span class="dot"></span>${c.name}${n ? `<span class="cnt">${n}</span>` : ''}</button>`; }).join('')}</div>
        <div class="items" id="items">${itemsHTML(t)}</div>
      </section>
      <aside class="receipt" id="bill" aria-label="Bill for ${tname(t)}">
        <div class="r-head">
          <div class="t"><div class="r-title">${t === 0 ? 'PARCEL' : 'TABLE ' + t}</div>
            <div class="r-sub">${tb.opened ? `Since ${timeStr(new Date(tb.opened))} · ${count} item${count === 1 ? '' : 's'}` : 'No items yet'}</div></div>
          ${total ? `<button class="r-clear" data-act="clear" data-t="${t}" aria-label="Clear bill" title="Clear bill">${ico('trash', 18)}</button>` : ''}
        </div>
        <div class="r-lines">${billLines.length ? billLines.map(([id, q]) => { const it = item(id); return `
          <div class="r-line">
            <div><div class="nm">${esc(it?.name || id)}${q > (sent[id] || 0) ? `<span class="new">+${q - (sent[id] || 0)} new</span>` : ''}</div><div class="each">${rs(it?.price || 0)} each</div></div>
            <span class="stepper"><button data-act="dec" data-t="${t}" data-id="${id}" aria-label="Remove one">−</button><span>${q}</span><button data-act="add" data-t="${t}" data-id="${id}" aria-label="Add one">+</button></span>
            <span class="amt">${rs((it?.price || 0) * q)}</span>
          </div>`; }).join('') : `<div class="r-empty">${ico('receipt', 38)}<div>Tap items on the left<br>to add them to this bill</div></div>`}</div>
        <div class="r-sum">
          <div class="r-row"><span>Items</span><span class="num">${count}</span></div>
          <div class="r-total"><span>Total</span><b>${rs(total)}</b></div>
        </div>
        <div class="r-send">${unsent ? `<button class="sendbtn" data-act="send" data-t="${t}">${ico('send', 19)} Send order · ${unsent} new item${unsent === 1 ? '' : 's'}</button>` : count ? `<div class="sent-ok">${ico('check', 16)} All items sent to the owner</div>` : ''}</div>
        <div class="r-pay">${payBtns}</div>
      </aside>
    </div>
    <div class="mbar"><div class="sum">${count} item${count === 1 ? '' : 's'}<b>${rs(total)}</b></div>${unsent ? `<button class="paybtn cash" data-act="send" data-t="${t}">${ico('send', 18)} Send ${unsent} new</button>` : payBtns}</div>`;
}
let bumpId = null, bumpTimer = null;
function addLine(t, id, d) {
  // Tap feedback: the tapped card plays a short bounce (cleared so later re-renders don't replay it).
  bumpId = d > 0 ? id : null;
  clearTimeout(bumpTimer); bumpTimer = setTimeout(() => { bumpId = null; }, 400);
  // Optimistic: update the screen now, then tell the server.
  const tb = S.tables[t] || (S.tables[t] = { lines: {}, opened: Date.now() });
  tb.lines[id] = Math.max(0, (tb.lines[id] || 0) + d);
  if (!tb.lines[id]) delete tb.lines[id];
  if (!Object.keys(tb.lines).length) delete S.tables[t];
  render();
  op(() => api(`/api/tables/${t}/lines`, { method: 'POST', body: { id, d } }));
}
let payTotal = 0;
function openPay(t, method) {
  const tb = S.tables[t]; const total = tb ? linesTotal(tb.lines) : 0;
  if (!total) return toast('Bill is empty');
  payTotal = total;
  const head = `<div class="sub">${tname(t)} · ${linesCount(tb.lines)} items</div><div class="big">${rs(total)}</div>`;
  if (method === 'UPI') {
    const upi = S.settings.upi;
    $('#modal').innerHTML = `
      <div class="overlay" data-act="close-modal"><div class="sheet" role="dialog" aria-label="UPI payment">
        <h1>UPI payment</h1>${head}
        ${upi ? `<div class="qrbox" data-qr-text="${esc(upiUrl(total))}" data-size="210"></div>
          <div class="sub" style="margin-bottom:18px">Customer scans with any UPI app · amount is filled in</div>`
        : `<p class="sub" style="margin-bottom:18px">${role === 'owner' ? 'Add the cafe’s UPI ID in Settings' : 'Ask the owner to add the UPI ID'} to show a payment QR here.</p>`}
        <div class="row">
          <button class="btn ghost" data-act="close-modal">Cancel</button>
          <button class="btn green" data-act="pay" data-t="${t}" data-m="UPI">Payment received</button>
        </div>
      </div></div>`;
    drawQRs($('#modal'));
    return;
  }
  const quick = [50, 100, 200, 500, 1000, 2000].filter(v => v > total).slice(0, 3);
  $('#modal').innerHTML = `
    <div class="overlay" data-act="close-modal"><div class="sheet" role="dialog" aria-label="Cash payment">
      <h1>Cash payment</h1>${head}
      <label class="sub" for="cash" style="display:block;text-align:left">Cash received</label>
      <div class="cash-in"><span>₹</span><input id="cash" inputmode="numeric" value="${total}" autocomplete="off"></div>
      <div class="quick">
        <button data-act="cash-quick" data-v="${total}">Exact</button>
        ${quick.map(v => `<button data-act="cash-quick" data-v="${v}">₹${v}</button>`).join('')}
      </div>
      <div class="change ok" id="change"><span>Change to return</span><b>${rs(0)}</b></div>
      <div class="row">
        <button class="btn ghost" data-act="close-modal">Cancel</button>
        <button class="btn gold" id="cash-done" data-act="pay" data-t="${t}" data-m="Cash">Done · settle bill</button>
      </div>
    </div></div>`;
  const inp = $('#cash'); inp.focus(); inp.select();
}
function updateChange() {
  const got = parseInt(($('#cash')?.value || '').replace(/\D/g, ''), 10) || 0;
  const diff = got - payTotal, box = $('#change'); if (!box) return;
  box.className = 'change ' + (diff >= 0 ? 'ok' : 'short');
  box.innerHTML = diff >= 0 ? `<span>Change to return</span><b>${rs(diff)}</b>` : `<span>Still to pay</span><b>${rs(-diff)}</b>`;
  $('#cash-done').disabled = diff < 0;
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
      <div class="stat hero"><div class="k">Total sales</div><div class="v">${rs(r.total)}</div>${r.profit !== null ? `<div class="k" style="margin-top:4px">Profit ${rs(r.profit)}</div>` : ''}</div>
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
        ${r.low && r.low.length ? `<h2 style="margin-top:22px">Low stock</h2><table class="list">${r.low.map(x => `<tr><td>${esc(x.name)}</td><td class="r" style="color:${x.stock <= 0 ? 'var(--red)' : 'var(--gold)'}">${x.stock <= 0 ? 'Out' : x.stock + ' ' + esc(x.unit) + ' left'}</td></tr>`).join('')}</table>` : ''}
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
        ${pushCard()}
        <h2 style="margin-top:22px">Cafe</h2>
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
    case 'cat': posCat = el.dataset.cat; posQ = ''; return render();
    case 'add': return addLine(t, el.dataset.id, 1);
    case 'dec': return addLine(t, el.dataset.id, -1);
    case 'clear': if (confirm(`Clear the whole bill for ${tname(t)}?`)) { delete S.tables[t]; render(); op(() => api(`/api/tables/${t}`, { method: 'DELETE' })); } return;
    case 'send': { const tb = S.tables[t]; if (tb) { tb.sent = { ...tb.lines }; render(); } const r = await op(() => api(`/api/tables/${t}/send`, { method: 'POST' })); if (r) toast(`Order sent · ${r.count} item${r.count === 1 ? '' : 's'}`); return; }
    case 'push-on': return enablePush();
    case 'push-off': return disablePush();
    case 'push-test': { const r = await op(() => api('/api/push/test', { method: 'POST' })); if (r) toast(r.phones ? `Test sent to ${r.phones} phone${r.phones === 1 ? '' : 's'}` : 'No phones are signed up yet'); return; }
    case 'push-hide': try { localStorage.setItem('palleturi.pushBanner', 'hide'); } catch (x) {} return render();
    case 'stk-filter': stockFilter = el.dataset.f; return render();
    case 'stk-tab': stockTab = el.dataset.tab; return render();
    case 'stk-open': return openStockItem(el.dataset.id);
    case 'stk-in': return openStockIn(el.dataset.id);
    case 'stk-count': return openCount(el.dataset.id);
    case 'stk-remove': return openRemove(el.dataset.id);
    case 'stk-reason': document.querySelectorAll('#stk-reason button').forEach(b => b.classList.toggle('on', b === el)); return;
    case 'stk-track': { const on = el.dataset.on === '1'; const r = await op(() => api(`/api/stock/${el.dataset.id}/settings`, { method: 'PUT', body: { track: on } })); if (r) { closeModal(); toast(on ? 'Now tracking this item' : 'Stopped tracking'); await loadStock(); render(); } return; }
    case 'stk-in-save': { const qty = stockInTotal(); if (!qty) return; const bill = $('#stk-bill').value.trim(); return stockSave(`/api/stock/${el.dataset.id}/in`, { qty, billAmount: bill === '' ? null : bill, supplier: $('#stk-supplier').value }, r => `Added ${qty} · now ${r.stock} in stock`); }
    case 'stk-count-save': { const actual = ($('#stk-actual').value || '').replace(/\D/g, ''); if (actual === '') return; return stockSave(`/api/stock/${el.dataset.id}/count`, { actual: +actual }, r => r.diff === null ? 'Count saved' : r.diff === 0 ? 'Count matches ✓' : r.diff < 0 ? `Count saved · ${-r.diff} missing` : `Count saved · ${r.diff} extra`); }
    case 'stk-remove-save': { const qty = numIn('stk-rm'); if (!qty) return toast('Enter how many'); const reason = $('#stk-reason .on')?.dataset.r || 'other'; return stockSave(`/api/stock/${el.dataset.id}/remove`, { qty, reason }, r => `Removed ${qty} · now ${r.stock} in stock`); }
    case 'pay-open': return openPay(t, el.dataset.m);
    case 'cash-quick': $('#cash').value = el.dataset.v; return updateChange();
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
// Search and cash box update only their own part of the page (keeps typing smooth).
document.addEventListener('input', e => {
  if (e.target.id === 'search') { posQ = e.target.value; const box = $('#items'); if (box) box.innerHTML = itemsHTML(+parts()[1]); document.querySelectorAll('.cats button').forEach(b => b.classList.toggle('on', !posQ && b.dataset.cat === posCat)); }
  else if (e.target.id === 'cash') updateChange();
  else if (e.target.id === 'stk-search') { stockQ = e.target.value; render(); }
  else if (['stk-packs', 'stk-loose', 'stk-bill'].includes(e.target.id)) stockInTotal();
  else if (e.target.id === 'stk-actual') countDiff();
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && ['stk-actual', 'stk-loose', 'stk-packs', 'stk-supplier', 'stk-bill', 'stk-rm'].includes(e.target.id)) { const b = $('#stk-save') || $('[data-act=stk-remove-save]'); if (b && !b.disabled) b.click(); }
  if (e.key === 'Enter' && e.target.id === 'cash' && !$('#cash-done').disabled) $('#cash-done').click(); if (e.key === 'Escape' && $('#modal').innerHTML) closeModal(); });
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.stkset && stkItem) {
    const r = await op(() => api(`/api/stock/${stkItem.id}/settings`, { method: 'PUT', body: { [el.dataset.stkset]: el.value } }));
    if (r) { toast('Saved'); await loadStock(); }
    return;
  }
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
  document.querySelectorAll('.clock').forEach(c => { c.textContent = timeStr(new Date()); });
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
