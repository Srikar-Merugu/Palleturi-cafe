const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const { CATS, DEFAULT_ITEMS } = require('./menu');
const { dayKey, hourOf } = require('./time');
const { summarize, reportText } = require('./report');
const { sendWhatsApp, whatsappConfigured } = require('./whatsapp');
const { notifyOwners, pushConfigured } = require('./push');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB || 'palleturi';
const TABLE_COUNT = parseInt(process.env.TABLE_COUNT || '12', 10);
const REPORT_HOUR = parseInt(process.env.REPORT_HOUR || '22', 10); // 22 = 10 PM cafe time

let db;
const col = (name) => db.collection(name);

/* ---------------- database setup ---------------- */
// Connect once per server instance and reuse it (serverless functions are reused between requests).
let ready = null;
function connect() {
  if (!ready) ready = setup().catch((e) => { ready = null; throw e; });
  return ready;
}
async function setup() {
  const client = new MongoClient(MONGODB_URI, { maxPoolSize: 5 });
  await client.connect();
  db = client.db(DB_NAME);
  await col('sessions').createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
  await col('attempts').createIndex({ at: 1 }, { expireAfterSeconds: 5 * 60 });
  await col('sales').createIndex({ day: 1 });
  await col('orders').createIndex({ at: 1 });
  await col('order_log').createIndex({ day: 1 });
  if (!(await col('items').countDocuments())) await col('items').insertMany(DEFAULT_ITEMS);
  await col('settings').updateOne(
    { _id: 'cafe' },
    { $setOnInsert: { upi: '', wa: '919398895450', ownerPin: process.env.OWNER_PIN || '1234', staffPin: process.env.STAFF_PIN || '0000', lastReport: '', lastAutoReport: '' } },
    { upsert: true },
  );
  console.log(`MongoDB connected (${DB_NAME})`);
}
const getSettings = () => col('settings').findOne({ _id: 'cafe' });
const getItems = () => col('items').find().sort({ sort: 1 }).toArray();
const itemOut = (i) => ({ id: i._id, name: i.name, te: i.te, cat: i.cat, price: i.price, qr: i.qr });
const placeName = (t) => (t === 0 ? 'Parcel' : 'Table ' + t);
const rs = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
// "2 × Masala Tea, 1 × Samosa Plate" and the total, using current prices.
function describe(lines, items) {
  let total = 0;
  const text = Object.entries(lines).filter(([, q]) => q > 0).map(([id, q]) => {
    const it = items.find((i) => i._id === id) || { name: id, price: 0 };
    total += it.price * q;
    return `${q} × ${it.name}`;
  }).join(', ');
  return { text, total };
}
// Record an order (for history) and tell the owner's phone(s).
async function logAndNotify({ table, lines, source, by, title }) {
  const items = await getItems();
  const { text, total } = describe(lines, items);
  const now = new Date();
  await col('order_log').insertOne({ table, lines, total, source, by, at: now.getTime(), day: dayKey(now) });
  await notifyOwners(col, { title, body: `${text} · ${rs(total)}`, url: `/#/table/${table}`, tag: `order-${table}-${now.getTime()}` });
}

/* ---------------- live updates ---------------- */
// Every change bumps a counter in MongoDB. Counter screens poll /api/rev every few
// seconds and reload only when it moved. Works on serverless hosts like Vercel.
async function broadcast() {
  await col('settings').updateOne({ _id: 'cafe' }, { $inc: { rev: 1 } });
}

/* ---------------- small helpers ---------------- */
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', (req, res, next) => connect().then(() => next(), (e) => { console.error(e); res.status(503).json({ error: 'Database not reachable' }); }));

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Server error' }); });
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const validTable = (t) => Number.isInteger(t) && t >= 0 && t <= TABLE_COUNT; // 0 = parcel
const validId = (id) => typeof id === 'string' && /^[\w-]{1,40}$/.test(id);

// Very small in-memory rate limiter (per IP + key).
const hits = new Map();
function limited(req, key, max, windowMs) {
  const k = key + '|' + req.ip, now = Date.now();
  const h = (hits.get(k) || []).filter((t) => now - t < windowMs);
  h.push(now); hits.set(k, h);
  return h.length > max;
}
setInterval(() => hits.clear(), 60 * 60 * 1000).unref();

async function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '') || req.query.token;
    const s = token && (await col('sessions').findOne({ _id: String(token) }));
    if (!s) return bad(res, 'Please log in again', 401);
    req.role = s.role;
    next();
  } catch (e) { next(e); }
}
const ownerOnly = (req, res, next) => (req.role === 'owner' ? next() : bad(res, 'Owner only', 403));

/* ---------------- public: customer QR menu ---------------- */
app.get('/api/menu', wrap(async (req, res) => {
  const items = (await getItems()).filter((i) => i.qr && !CATS.find((c) => c.id === i.cat)?.staffOnly);
  res.json({ tableCount: TABLE_COUNT, cats: CATS.filter((c) => !c.staffOnly), items: items.map(itemOut) });
}));

app.post('/api/orders', wrap(async (req, res) => {
  const table = Number(req.body?.table);
  const raw = req.body?.lines;
  if (!validTable(table)) return bad(res, 'Unknown table');
  if (!raw || typeof raw !== 'object') return bad(res, 'Empty order');
  if (limited(req, 'order', 6, 60 * 1000)) return bad(res, 'Too many orders, please wait a minute', 429);
  const items = await getItems();
  const lines = {};
  for (const [id, q] of Object.entries(raw).slice(0, 40)) {
    const it = items.find((i) => i._id === id);
    const qty = Math.floor(Number(q));
    if (!it || !it.qr || it.cat === 'cig' || !(qty > 0 && qty <= 20)) continue;
    lines[id] = qty;
  }
  if (!Object.keys(lines).length) return bad(res, 'Empty order');
  const order = { table, lines, at: Date.now() };
  const r = await col('orders').insertOne(order);
  await broadcast();
  await logAndNotify({ table, lines, source: 'qr', by: 'customer', title: `📱 QR order · ${placeName(table)}` });
  res.json({ ok: true, id: r.insertedId });
}));

/* ---------------- login ---------------- */
app.post('/api/login', wrap(async (req, res) => {
  // Wrong PINs are counted in MongoDB (shared by all server instances); 8 per IP per 5 minutes.
  const ip = String(req.ip || 'unknown');
  if ((await col('attempts').countDocuments({ ip })) >= 8) return bad(res, 'Too many tries. Wait 5 minutes.', 429);
  const pin = String(req.body?.pin || '');
  const st = await getSettings();
  const role = pin === st.ownerPin ? 'owner' : pin === st.staffPin ? 'staff' : null;
  if (!role) { await col('attempts').insertOne({ ip, at: new Date() }); return bad(res, 'Wrong PIN', 401); }
  const token = crypto.randomBytes(24).toString('hex');
  await col('sessions').insertOne({ _id: token, role, createdAt: new Date() });
  res.json({ token, role });
}));
app.post('/api/logout', auth, wrap(async (req, res) => {
  await col('sessions').deleteOne({ _id: (req.headers.authorization || '').replace(/^Bearer /, '') });
  res.json({ ok: true });
}));

/* ---------------- counter (owner + staff) ---------------- */
// Cheap check the counter screen polls every few seconds.
app.get('/api/rev', auth, wrap(async (req, res) => {
  const st = await col('settings').findOne({ _id: 'cafe' }, { projection: { rev: 1 } });
  res.set('Cache-Control', 'no-store').json({ rev: st?.rev || 0 });
}));

app.get('/api/state', auth, wrap(async (req, res) => {
  // Read settings (and its change counter) first: if something changes while we read
  // the rest, the screen sees a newer counter on its next check and reloads again.
  const st = await getSettings();
  const [items, tables, orders] = await Promise.all([getItems(), col('tables').find().toArray(), col('orders').find().sort({ at: 1 }).toArray()]);
  const settings = { upi: st.upi, wa: st.wa, lastReport: st.lastReport, waAuto: whatsappConfigured() };
  if (req.role === 'owner') Object.assign(settings, { ownerPin: st.ownerPin, staffPin: st.staffPin });
  // Today's takings, owner only (staff don't see revenue).
  let today = null;
  if (req.role === 'owner') {
    const [agg] = await col('sales').aggregate([{ $match: { day: dayKey() } }, { $group: { _id: null, total: { $sum: '$total' }, bills: { $sum: 1 } } }]).toArray();
    today = { total: agg?.total || 0, bills: agg?.bills || 0 };
  }
  res.json({
    role: req.role,
    tableCount: TABLE_COUNT,
    reportHour: REPORT_HOUR,
    rev: st.rev || 0,
    today,
    cats: CATS,
    items: items.map(itemOut),
    tables: Object.fromEntries(tables.map((t) => [t._id, { lines: t.lines, sent: t.sent || {}, opened: t.opened }])),
    pushKey: process.env.VAPID_PUBLIC_KEY || null,
    pending: orders.map((o) => ({ id: String(o._id), table: o.table, lines: o.lines, at: o.at })),
    settings,
  });
}));

app.post('/api/tables/:t/lines', auth, wrap(async (req, res) => {
  const t = Number(req.params.t), id = req.body?.id, d = Number(req.body?.d);
  if (!validTable(t) || !validId(id) || ![1, -1].includes(d)) return bad(res, 'Bad request');
  if (!(await col('items').findOne({ _id: id }))) return bad(res, 'Unknown item');
  const key = 'lines.' + id;
  if (d > 0) {
    await col('tables').updateOne({ _id: t }, { $inc: { [key]: 1 }, $setOnInsert: { opened: Date.now() } }, { upsert: true });
  } else {
    await col('tables').updateOne({ _id: t, [key]: { $gt: 0 } }, { $inc: { [key]: -1 } });
    await col('tables').updateOne({ _id: t, [key]: { $lte: 0 } }, { $unset: { [key]: '' } });
    await col('tables').deleteOne({ _id: t, lines: {} });
    // If an already-sent item is removed, lower its "sent" count too, so adding it
    // back later counts as new and is sent again.
    const tb = await col('tables').findOne({ _id: t });
    const have = tb?.lines?.[id] || 0;
    if (tb && (tb.sent?.[id] || 0) > have) await col('tables').updateOne({ _id: t }, have ? { $set: { ['sent.' + id]: have } } : { $unset: { ['sent.' + id]: '' } });
  }
  await broadcast();
  res.json({ ok: true });
}));

// Staff tap "Send order": everything added since the last send goes to the owner.
app.post('/api/tables/:t/send', auth, wrap(async (req, res) => {
  const t = Number(req.params.t);
  if (!validTable(t)) return bad(res, 'Unknown table');
  const tb = await col('tables').findOne({ _id: t });
  const fresh = {};
  for (const [id, q] of Object.entries(tb?.lines || {})) { const d = q - (tb.sent?.[id] || 0); if (d > 0) fresh[id] = d; }
  if (!Object.keys(fresh).length) return bad(res, 'Nothing new to send');
  // $max: items added while we were working stay "not sent".
  await col('tables').updateOne({ _id: t }, { $max: Object.fromEntries(Object.keys(fresh).map((id) => ['sent.' + id, tb.lines[id]])) });
  await broadcast();
  await logAndNotify({ table: t, lines: fresh, source: 'staff', by: req.role, title: `🧾 ${placeName(t)} · new order` });
  res.json({ ok: true, count: Object.values(fresh).reduce((a, q) => a + q, 0) });
}));

app.delete('/api/tables/:t', auth, wrap(async (req, res) => {
  await col('tables').deleteOne({ _id: Number(req.params.t) });
  await broadcast();
  res.json({ ok: true });
}));

app.post('/api/tables/:t/settle', auth, wrap(async (req, res) => {
  const t = Number(req.params.t), method = req.body?.method === 'UPI' ? 'UPI' : 'Cash';
  const tb = await col('tables').findOneAndDelete({ _id: t });
  if (!tb) return bad(res, 'This table has no bill', 404);
  const items = await getItems();
  const lines = Object.entries(tb.lines || {}).filter(([, q]) => q > 0).map(([id, qty]) => {
    const it = items.find((i) => i._id === id) || { name: id, cat: 'tea', price: 0 };
    return { id, name: it.name, cat: it.cat, price: it.price, qty };
  });
  const now = new Date();
  const sale = { table: t, lines, total: lines.reduce((a, l) => a + l.price * l.qty, 0), method, at: now.getTime(), day: dayKey(now), by: req.role };
  await col('sales').insertOne(sale);
  await broadcast();
  await notifyOwners(col, {
    title: `✅ ${placeName(t)} paid ${rs(sale.total)} · ${method}`,
    body: lines.map((l) => `${l.qty} × ${l.name}`).join(', '),
    url: '/#/', tag: `paid-${t}-${sale.at}`,
  });
  res.json({ ok: true, total: sale.total, method });
}));

app.post('/api/orders/:id/accept', auth, wrap(async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return bad(res, 'Bad order');
  const o = await col('orders').findOneAndDelete({ _id: new ObjectId(req.params.id) });
  if (!o) return bad(res, 'Order already handled', 404);
  // The owner was already notified when the customer ordered, so mark these as sent.
  const inc = Object.fromEntries(Object.entries(o.lines).flatMap(([id, q]) => [['lines.' + id, q], ['sent.' + id, q]]));
  await col('tables').updateOne({ _id: o.table }, { $inc: inc, $setOnInsert: { opened: Date.now() } }, { upsert: true });
  await broadcast();
  res.json({ ok: true, table: o.table });
}));

app.post('/api/orders/:id/reject', auth, wrap(async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return bad(res, 'Bad order');
  await col('orders').deleteOne({ _id: new ObjectId(req.params.id) });
  await broadcast();
  res.json({ ok: true });
}));

/* ---------------- owner: phone notifications ---------------- */
app.post('/api/push/subscribe', auth, ownerOnly, wrap(async (req, res) => {
  const sub = req.body?.sub;
  const ok = sub && typeof sub.endpoint === 'string' && /^https:\/\//.test(sub.endpoint) && sub.endpoint.length < 1000 && typeof sub.keys?.p256dh === 'string' && typeof sub.keys?.auth === 'string';
  if (!ok) return bad(res, 'Bad subscription');
  const clean = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
  await col('push_subs').updateOne({ _id: sub.endpoint }, { $set: { sub: clean, role: 'owner', device: String(req.body?.device || '').slice(0, 80), createdAt: new Date() } }, { upsert: true });
  res.json({ ok: true, phones: await col('push_subs').countDocuments({ role: 'owner' }) });
}));
app.post('/api/push/unsubscribe', auth, wrap(async (req, res) => {
  if (typeof req.body?.endpoint === 'string') await col('push_subs').deleteOne({ _id: req.body.endpoint });
  res.json({ ok: true });
}));
app.post('/api/push/test', auth, ownerOnly, wrap(async (req, res) => {
  if (!pushConfigured()) return bad(res, 'Notifications are not set up on the server');
  const n = await notifyOwners(col, { title: '🔔 Palleturi Cafe', body: 'Notifications are working on this phone.', url: '/#/', tag: 'test' });
  res.json({ ok: true, phones: n });
}));

/* ---------------- owner: report ---------------- */
async function buildReport(day) {
  const [sales, open] = await Promise.all([col('sales').find({ day }).toArray(), col('tables').countDocuments()]);
  const r = summarize(sales);
  return { day, ...r, open, text: reportText(r, day, open) };
}

app.get('/api/report', auth, ownerOnly, wrap(async (req, res) => {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(req.query.day || '') ? req.query.day : dayKey();
  const st = await getSettings();
  res.json({ ...(await buildReport(day)), wa: st.wa, waAuto: whatsappConfigured() });
}));

app.post('/api/report/send', auth, ownerOnly, wrap(async (req, res) => {
  const day = dayKey();
  const [rep, st] = await Promise.all([buildReport(day), getSettings()]);
  const result = await sendWhatsApp(st.wa, rep.text);
  await col('settings').updateOne({ _id: 'cafe' }, { $set: { lastReport: day } });
  res.json({ ...result, link: `https://wa.me/${st.wa}?text=${encodeURIComponent(rep.text)}` });
}));

/* ---------------- owner: settings & menu ---------------- */
app.put('/api/settings', auth, ownerOnly, wrap(async (req, res) => {
  const { key } = req.body || {};
  let value = String(req.body?.value ?? '').trim();
  if (!['upi', 'wa', 'ownerPin', 'staffPin'].includes(key)) return bad(res, 'Unknown setting');
  if ((key === 'ownerPin' || key === 'staffPin') && !/^\d{4}$/.test(value)) return bad(res, 'PIN must be 4 digits');
  if (key === 'wa') { value = value.replace(/\D/g, ''); if (value.length === 10) value = '91' + value; if (!/^\d{11,15}$/.test(value)) return bad(res, 'Enter a valid WhatsApp number'); }
  if (key === 'upi' && value && !/^[\w.\-]{2,256}@[a-zA-Z][\w.\-]{1,64}$/.test(value)) return bad(res, 'Enter a valid UPI ID, like name@bank');
  const st = await getSettings();
  if (key === 'ownerPin' && value === st.staffPin) return bad(res, 'Owner and staff PINs must be different');
  if (key === 'staffPin' && value === st.ownerPin) return bad(res, 'Owner and staff PINs must be different');
  await col('settings').updateOne({ _id: 'cafe' }, { $set: { [key]: value } });
  await broadcast();
  res.json({ ok: true, value });
}));

app.put('/api/items/:id', auth, ownerOnly, wrap(async (req, res) => {
  const set = {};
  if (req.body?.price !== undefined) { const p = Math.floor(Number(req.body.price)); if (!(p >= 0 && p <= 100000)) return bad(res, 'Bad price'); set.price = p; }
  if (req.body?.qr !== undefined) set.qr = Boolean(req.body.qr);
  const r = await col('items').updateOne({ _id: req.params.id }, { $set: set });
  if (!r.matchedCount) return bad(res, 'Unknown item', 404);
  await broadcast();
  res.json({ ok: true });
}));

app.post('/api/items', auth, ownerOnly, wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 60), cat = req.body?.cat, price = Math.floor(Number(req.body?.price));
  if (!name || !CATS.find((c) => c.id === cat) || !(price > 0 && price <= 100000)) return bad(res, 'Enter a name, category and price');
  const last = await col('items').find().sort({ sort: -1 }).limit(1).next();
  await col('items').insertOne({ _id: 'x' + Date.now().toString(36), name, te: '', cat, price, qr: cat !== 'cig', sort: (last?.sort ?? 0) + 1 });
  await broadcast();
  res.json({ ok: true });
}));

app.post('/api/demo/seed', auth, ownerOnly, wrap(async (req, res) => {
  const day = dayKey();
  const items = await getItems();
  const weights = { tea: 30, masala: 14, ginger: 12, coffee: 8, lemon: 4, blacktea: 3, blackcoffee: 2, green: 2, boost: 3, milk: 3, samosa: 10, biscuits: 8, rusk: 4, bun: 6, 'cd-small': 7, 'cd-big': 3, water: 4, cookie: 6, cig10: 10, cig15: 5, cig20: 6, cig25: 3 };
  const pool = Object.entries(weights).flatMap(([id, w]) => Array(w).fill(id));
  const hourWeight = [1, 2, 2, 1, 1, 1, 1, 2, 3, 4, 6, 6, 4, 2]; // 8 AM .. 9 PM
  const slots = hourWeight.flatMap((w, h) => Array(w).fill(h + 8));
  const now = Date.now(), currentHour = hourOf();
  const sales = [];
  for (let n = 0; n < 92; n++) {
    const h = slots[Math.floor(Math.random() * slots.length)];
    if (h > currentHour) continue;
    const at = now - (currentHour - h) * 3600000 - Math.floor(Math.random() * 3000000);
    const counts = {};
    for (let j = 0, k = 1 + Math.floor(Math.random() * 4); j < k; j++) { const id = pool[Math.floor(Math.random() * pool.length)]; counts[id] = (counts[id] || 0) + 1; }
    const lines = Object.entries(counts).map(([id, qty]) => { const it = items.find((i) => i._id === id); return it && { id, name: it.name, cat: it.cat, price: it.price, qty }; }).filter(Boolean);
    sales.push({ table: 1 + Math.floor(Math.random() * TABLE_COUNT), lines, total: lines.reduce((a, l) => a + l.price * l.qty, 0), method: Math.random() < 0.6 ? 'UPI' : 'Cash', at, day, demo: true });
  }
  await col('sales').deleteMany({ day, demo: true });
  if (sales.length) await col('sales').insertMany(sales);
  res.json({ ok: true, count: sales.length });
}));

app.post('/api/reset', auth, ownerOnly, wrap(async (req, res) => {
  await Promise.all([col('sales').deleteMany({}), col('tables').deleteMany({}), col('orders').deleteMany({}), col('order_log').deleteMany({})]);
  await broadcast();
  res.json({ ok: true });
}));


/* ---------------- nightly WhatsApp report ---------------- */
// force = called by the scheduled job (Vercel Cron), which already runs after closing.
async function nightlyCheck(force = false) {
  try {
    if (!whatsappConfigured()) return { sent: false, reason: 'not-configured' };
    if (!force && hourOf() < REPORT_HOUR) return { sent: false, reason: 'too-early' };
    const day = dayKey();
    // Claim today's send atomically so two server instances can't both send it.
    const claim = await col('settings').updateOne({ _id: 'cafe', lastAutoReport: { $ne: day } }, { $set: { lastAutoReport: day } });
    if (!claim.modifiedCount) return { sent: false, reason: 'already-sent' };
    const [rep, st] = await Promise.all([buildReport(day), getSettings()]);
    const r = await sendWhatsApp(st.wa, rep.text);
    // On failure we don't retry automatically; the owner app shows its 10 PM pop-up
    // because lastReport is still not today.
    if (r.sent) { await col('settings').updateOne({ _id: 'cafe' }, { $set: { lastReport: day } }); await broadcast(); }
    console.log(`Nightly report ${day}:`, r.sent ? 'sent' : r.reason);
    return r;
  } catch (e) { console.error('Nightly report failed', e); return { sent: false, reason: e.message }; }
}

// Vercel Cron calls this with "Authorization: Bearer <CRON_SECRET>".
app.get('/api/cron/nightly', wrap(async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return bad(res, 'Forbidden', 403);
  res.json(await nightlyCheck(true));
}));

app.use('/api', (req, res) => bad(res, 'Not found', 404));

module.exports = { app, connect, nightlyCheck };
