const { CATS } = require('./menu');
const { hourOf, dayLabel, timeLabel } = require('./time');

const rs = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const hourLabel = (h) => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;

function summarize(sales) {
  const byItem = {};
  const byHour = Array(24).fill(0);
  let total = 0, upi = 0, cash = 0, profit = 0, costed = false;
  for (const s of sales) {
    total += s.total;
    if (s.method === 'UPI') upi += s.total; else cash += s.total;
    byHour[hourOf(new Date(s.at))] += s.total;
    for (const l of s.lines) {
      const k = l.id + '|' + l.price;
      const r = byItem[k] || (byItem[k] = { name: l.name, cat: l.cat, qty: 0, amt: 0 });
      r.qty += l.qty;
      r.amt += l.qty * l.price;
      if (typeof l.cost === 'number') { profit += (l.price - l.cost) * l.qty; costed = true; }
    }
  }
  const groups = CATS
    .map((c) => {
      const rows = Object.values(byItem).filter((r) => r.cat === c.id).sort((a, b) => b.qty - a.qty);
      return { id: c.id, name: c.name, qty: rows.reduce((a, r) => a + r.qty, 0), rows };
    })
    .filter((g) => g.rows.length);
  const peak = total ? byHour.indexOf(Math.max(...byHour)) : null;
  // Profit only counts items that have a buying price set in Stock.
  return { total, upi, cash, bills: sales.length, groups, byHour, peak, profit: costed ? Math.round(profit) : null };
}

// closing (optional): { counted, float, expected, diff, by, at, note } from the Close cafe screen
function reportText(r, day, openTables, low = [], closing = null) {
  const out = ['☕ *Palleturi Cafe — Daily Report*', `📅 ${dayLabel(day)}`, ''];
  for (const g of r.groups) {
    out.push(`*${g.name}* (${g.qty})`);
    for (const x of g.rows) out.push(`• ${x.name} × ${x.qty} = ${rs(x.amt)}`);
    out.push('');
  }
  if (!r.groups.length) out.push('No bills today.', '');
  out.push('━━━━━━━━━━━━');
  out.push(`🧾 Bills: ${r.bills}`);
  out.push(`💰 *Total: ${rs(r.total)}*`);
  out.push(`📱 UPI: ${rs(r.upi)}  ·  💵 Cash: ${rs(r.cash)}`);
  if (r.profit !== null) out.push(`📈 Profit: ${rs(r.profit)} (items with buying price)`);
  if (r.peak !== null) out.push(`⏰ Busiest hour: ${hourLabel(r.peak)} – ${hourLabel((r.peak + 1) % 24)}`);
  if (closing) {
    out.push('', '💵 *Cash closing*');
    const d = closing.diff;
    out.push(`Cash in drawer: ${rs(closing.counted)} ${d === 0 ? '✅ matches' : d < 0 ? `❗ ${rs(-d)} short` : `➕ ${rs(d)} extra`}`);
    out.push(`Expected: ${rs(closing.expected)}${closing.float ? ` (opening ${rs(closing.float)} + cash sales ${rs(closing.cashSales ?? r.cash)})` : ''}`);
    if (closing.openedAt) out.push(`☀️ Opened at ${timeLabel(new Date(closing.openedAt))} by ${closing.openedBy} with ${rs(closing.float)}`);
    if (closing.note) out.push(`Note: ${closing.note}`);
    out.push(`🔒 Closed at ${timeLabel(new Date(closing.at))} by ${closing.by}`);
  }
  if (openTables) out.push(`⚠️ ${openTables} table(s) still not settled`);
  if (low.length) {
    out.push('', '📦 *Low stock*');
    for (const i of low) out.push(`• ${i.name}: ${i.stock <= 0 ? 'OUT' : `${i.stock} ${i.unit} left`}`);
  }
  return out.join('\n');
}

module.exports = { summarize, reportText };
