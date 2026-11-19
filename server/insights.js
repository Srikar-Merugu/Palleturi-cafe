// Sales history and best sellers: one day, the last 7 days or the last 30 days,
// each compared with the period just before it.
const { summarize } = require('./report');
const { dayKey } = require('./time');

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SPAN = { day: 1, week: 7, month: 30 };

// Day keys are calendar dates, so do the maths at noon UTC to stay clear of timezones.
const shift = (key, n) => { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const pct = (now, before) => (before ? Math.round(((now - before) / before) * 100) : null);

function itemTotals(sales) {
  const m = {};
  for (const s of sales) for (const l of s.lines) {
    const r = m[l.id] || (m[l.id] = { id: l.id, name: l.name, cat: l.cat, qty: 0, amt: 0 });
    r.qty += l.qty; r.amt += l.qty * l.price; r.name = l.name;
  }
  return m;
}

function registerInsights(app, { col, auth, ownerOnly, wrap, getItems }) {
  app.get('/api/insights', auth, ownerOnly, wrap(async (req, res) => {
    const range = SPAN[req.query.range] ? req.query.range : 'day';
    const today = dayKey();
    let end = DAY_RE.test(req.query.day || '') ? req.query.day : today;
    if (end > today) end = today;
    const n = SPAN[range];
    const start = shift(end, -(n - 1));
    const pEnd = shift(start, -1), pStart = shift(pEnd, -(n - 1));

    const [sales, prev, voids, items] = await Promise.all([
      col('sales').find({ day: { $gte: start, $lte: end } }).toArray(),
      col('sales').find({ day: { $gte: pStart, $lte: pEnd } }).toArray(),
      col('voids').find({ day: { $gte: start, $lte: end } }).sort({ at: -1 }).toArray(),
      getItems(),
    ]);
    const r = summarize(sales);
    const p = summarize(prev);

    // Best sellers, ranked by how many were sold, with the change vs the period before.
    const now = itemTotals(sales), before = itemTotals(prev);
    const ranked = Object.values(now).sort((a, b) => b.qty - a.qty || b.amt - a.amt).map((x, i) => ({
      ...x, rank: i + 1, prevQty: before[x.id]?.qty || 0,
      change: pct(x.qty, before[x.id]?.qty || 0),
      share: r.total ? Math.round((x.amt / r.total) * 100) : 0,
    }));
    // Rising: sold noticeably more than last period. Falling: sold noticeably less.
    const moves = Object.keys({ ...now, ...before }).map((id) => {
      const q = now[id]?.qty || 0, pq = before[id]?.qty || 0;
      return { id, name: (now[id] || before[id]).name, qty: q, prevQty: pq, diff: q - pq };
    });
    const rising = moves.filter((m) => m.diff >= 2 && m.prevQty).sort((a, b) => b.diff - a.diff).slice(0, 5);
    const falling = moves.filter((m) => m.diff <= -2).sort((a, b) => a.diff - b.diff).slice(0, 5);
    // On the menu but nothing sold in the whole period.
    const notSelling = range === 'day' ? [] : items.filter((i) => !now[i._id]).map((i) => ({ id: i._id, name: i.name, cat: i.cat }));

    const daily = [];
    for (let d = start; d <= end; d = shift(d, 1)) daily.push({ day: d, total: 0, bills: 0 });
    for (const s of sales) { const x = daily.find((d) => d.day === s.day); if (x) { x.total += s.total; x.bills++; } }
    const best = daily.reduce((a, d) => (d.total > (a?.total || 0) ? d : a), null);

    res.json({
      range, start, end, today, prevStart: pStart, prevEnd: pEnd,
      total: r.total, bills: r.bills, upi: r.upi, cash: r.cash, profit: r.profit,
      avgBill: r.bills ? Math.round(r.total / r.bills) : 0,
      prev: { total: p.total, bills: p.bills, avgBill: p.bills ? Math.round(p.total / p.bills) : 0 },
      change: { total: pct(r.total, p.total), bills: pct(r.bills, p.bills) },
      byHour: r.byHour, peak: r.peak, groups: r.groups,
      daily: range === 'day' ? [] : daily, bestDay: best && best.total ? best : null,
      items: ranked, rising, falling, notSelling,
      voids: { count: voids.length, amount: voids.reduce((a, v) => a + v.total, 0), list: voids.slice(0, 30) },
    });
  }));
}

module.exports = { registerInsights, shift };
