// Inventory for packaged items (cigarettes, cool drinks, biscuits, cookies…).
// item fields: track (bool), stock (number | null = not counted yet), lowAt, unit,
//              packName/packSize (e.g. crate of 24), cost (buying price per unit | null)
// stock_moves: every change — in (delivery), sale, count (shelf count), remove (damaged…)

const DEFAULTS = {
  drinks: { unit: 'bottles', packName: 'crate', packSize: 24, lowAt: 12 },
  cookies: { unit: 'pcs', packName: 'jar', packSize: 0, lowAt: 10 },
  cig: { unit: 'sticks', packName: 'packet', packSize: 10, lowAt: 20 },
  snacks: { unit: 'packets', packName: 'box', packSize: 0, lowAt: 5 },
  tea: { unit: 'cups', packName: '', packSize: 0, lowAt: 0 },
};
const PACKAGED_SNACKS = ['biscuits', 'rusk', 'bun'];

function stockDefaults(id, cat) {
  const d = DEFAULTS[cat] || { unit: 'pcs', packName: '', packSize: 0, lowAt: 5 };
  const track = ['drinks', 'cookies', 'cig'].includes(cat) || PACKAGED_SNACKS.includes(id);
  return { track, stock: null, lowAt: d.lowAt, unit: d.unit, packName: d.packName, packSize: d.packSize, cost: null };
}

function status(it) {
  if (!it.track) return 'untracked';
  if (it.stock === null || it.stock === undefined) return 'unset';
  if (it.stock <= 0) return 'out';
  if (it.stock <= (it.lowAt || 0)) return 'low';
  return 'ok';
}
const isOut = (it) => it.track && typeof it.stock === 'number' && it.stock <= 0;

function registerStock(app, { col, auth, ownerOnly, wrap, bad, broadcast, notifyOwners, dayKey }) {
  // One-time: give existing items stock fields.
  async function migrate() {
    const items = await col('items').find({ track: { $exists: false } }).toArray();
    for (const it of items) await col('items').updateOne({ _id: it._id }, { $set: stockDefaults(it._id, it.cat) });
  }

  async function addMove(m) {
    const now = new Date();
    await col('stock_moves').insertOne({ ...m, at: now.getTime(), day: dayKey(now) });
  }
  const findItem = (id) => (typeof id === 'string' && /^[\w-]{1,40}$/.test(id) ? col('items').findOne({ _id: id }) : null);
  const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : NaN);

  // Called after a bill is paid: reduce stock and alert the owner when an item gets low / runs out.
  async function deductForSale(lines, ref, by) {
    const now = new Date(), alerts = [], moves = [];
    for (const l of lines) {
      const it = await col('items').findOneAndUpdate({ _id: l.id, track: true, stock: { $type: 'number' } }, { $inc: { stock: -l.qty } }, { returnDocument: 'after' });
      if (!it) continue;
      moves.push({ item: l.id, name: it.name, qty: -l.qty, type: 'sale', ref, by, after: it.stock, at: now.getTime(), day: dayKey(now) });
      const before = it.stock + l.qty;
      if (before > 0 && it.stock <= 0) alerts.push(`❌ ${it.name} is out of stock`);
      else if (before > it.lowAt && it.stock <= it.lowAt) alerts.push(`⚠️ ${it.name}: only ${it.stock} ${it.unit} left`);
    }
    if (moves.length) await col('stock_moves').insertMany(moves);
    if (alerts.length) {
      await notifyOwners(col, {
        title: alerts.length === 1 ? alerts[0] : `⚠️ ${alerts.length} items need restocking`,
        body: alerts.length === 1 ? 'Open Stock to add more.' : alerts.join(' · '),
        url: '/#/stock', tag: `stock-${now.getTime()}`,
      });
    }
  }

  async function lowStockList() {
    const items = await col('items').find({ track: true, stock: { $type: 'number' } }).sort({ sort: 1 }).toArray();
    return items.filter((i) => i.stock <= i.lowAt).map((i) => ({ name: i.name, stock: i.stock, unit: i.unit }));
  }

  /* ---------- routes (owner only) ---------- */
  app.get('/api/stock', auth, ownerOnly, wrap(async (req, res) => {
    const [items, lastIn, moves] = await Promise.all([
      col('items').find().sort({ sort: 1 }).toArray(),
      col('stock_moves').aggregate([{ $match: { type: 'in' } }, { $group: { _id: '$item', at: { $max: '$at' } } }]).toArray(),
      col('stock_moves').find().sort({ at: -1 }).limit(80).toArray(),
    ]);
    const last = Object.fromEntries(lastIn.map((x) => [x._id, x.at]));
    res.json({
      items: items.map((i) => ({ id: i._id, name: i.name, cat: i.cat, price: i.price, track: !!i.track, stock: i.stock ?? null, lowAt: i.lowAt ?? 0, unit: i.unit || 'pcs', packName: i.packName || '', packSize: i.packSize || 0, cost: i.cost ?? null, status: status(i), lastIn: last[i._id] || null })),
      moves: moves.map((m) => ({ ...m, _id: undefined })),
    });
  }));

  app.get('/api/stock/:id/moves', auth, ownerOnly, wrap(async (req, res) => {
    const moves = await col('stock_moves').find({ item: req.params.id }).sort({ at: -1 }).limit(30).toArray();
    res.json({ moves: moves.map((m) => ({ ...m, _id: undefined })) });
  }));

  // Delivery from the supplier. qty in units; billAmount (optional) = what was paid for this delivery.
  app.post('/api/stock/:id/in', auth, ownerOnly, wrap(async (req, res) => {
    const it = await findItem(req.params.id); if (!it) return bad(res, 'Unknown item', 404);
    const qty = int(req.body?.qty), bill = req.body?.billAmount === '' || req.body?.billAmount == null ? null : Number(req.body.billAmount);
    if (!(qty > 0 && qty <= 100000)) return bad(res, 'Enter how many came in');
    if (bill !== null && !(bill >= 0 && bill <= 10000000)) return bad(res, 'Bad amount');
    const supplier = String(req.body?.supplier || '').trim().slice(0, 60);
    const cost = bill !== null && bill > 0 ? Math.round((bill / qty) * 100) / 100 : null;
    const set = { stock: { $add: [{ $ifNull: ['$stock', 0] }, qty] }, track: true };
    if (cost !== null) set.cost = cost;
    const after = await col('items').findOneAndUpdate({ _id: it._id }, [{ $set: set }], { returnDocument: 'after' });
    await addMove({ item: it._id, name: it.name, qty, type: 'in', supplier, bill, cost, by: req.role, after: after.stock });
    await broadcast();
    res.json({ ok: true, stock: after.stock });
  }));

  // Shelf count: set the real number, record the difference (missing / extra).
  app.post('/api/stock/:id/count', auth, ownerOnly, wrap(async (req, res) => {
    const it = await findItem(req.params.id); if (!it) return bad(res, 'Unknown item', 404);
    const actual = int(req.body?.actual);
    if (!(actual >= 0 && actual <= 100000)) return bad(res, 'Enter the number on the shelf');
    const expected = typeof it.stock === 'number' ? it.stock : null;
    await col('items').updateOne({ _id: it._id }, { $set: { stock: actual, track: true } });
    await addMove({ item: it._id, name: it.name, qty: expected === null ? actual : actual - expected, type: 'count', expected, actual, by: req.role, after: actual });
    await broadcast();
    res.json({ ok: true, stock: actual, diff: expected === null ? null : actual - expected });
  }));

  // Damaged / expired / own use.
  app.post('/api/stock/:id/remove', auth, ownerOnly, wrap(async (req, res) => {
    const it = await findItem(req.params.id); if (!it) return bad(res, 'Unknown item', 404);
    const qty = int(req.body?.qty);
    const reason = ['damaged', 'expired', 'own use', 'other'].includes(req.body?.reason) ? req.body.reason : 'other';
    if (!(qty > 0 && qty <= 100000)) return bad(res, 'Enter how many to remove');
    const after = await col('items').findOneAndUpdate({ _id: it._id }, [{ $set: { stock: { $subtract: [{ $ifNull: ['$stock', 0] }, qty] }, track: true } }], { returnDocument: 'after' });
    await addMove({ item: it._id, name: it.name, qty: -qty, type: 'remove', reason, by: req.role, after: after.stock });
    await broadcast();
    res.json({ ok: true, stock: after.stock });
  }));

  app.put('/api/stock/:id/settings', auth, ownerOnly, wrap(async (req, res) => {
    const it = await findItem(req.params.id); if (!it) return bad(res, 'Unknown item', 404);
    const b = req.body || {}, set = {};
    if (b.track !== undefined) set.track = Boolean(b.track);
    if (b.lowAt !== undefined) { const v = int(b.lowAt); if (!(v >= 0 && v <= 100000)) return bad(res, 'Bad low-stock level'); set.lowAt = v; }
    if (b.unit !== undefined) { const v = String(b.unit).trim().slice(0, 20); if (!v) return bad(res, 'Enter a unit, like bottles'); set.unit = v; }
    if (b.packName !== undefined) set.packName = String(b.packName).trim().slice(0, 20);
    if (b.packSize !== undefined) { const v = int(b.packSize); if (!(v >= 0 && v <= 1000)) return bad(res, 'Bad pack size'); set.packSize = v; }
    if (b.cost !== undefined) { const v = b.cost === '' || b.cost === null ? null : Number(b.cost); if (v !== null && !(v >= 0 && v <= 100000)) return bad(res, 'Bad buying price'); set.cost = v; }
    await col('items').updateOne({ _id: it._id }, { $set: set });
    await broadcast();
    res.json({ ok: true });
  }));

  return { migrate, deductForSale, lowStockList };
}

module.exports = { registerStock, stockDefaults, status, isOut };
