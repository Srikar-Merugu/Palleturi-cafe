const { CATS } = require('./menu');
const { hourOf, dayLabel } = require('./time');

const rs = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const hourLabel = (h) => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;

function summarize(sales) {
  const byItem = {};
  const byHour = Array(24).fill(0);
  let total = 0, upi = 0, cash = 0;
  for (const s of sales) {
    total += s.total;
    if (s.method === 'UPI') upi += s.total; else cash += s.total;
    byHour[hourOf(new Date(s.at))] += s.total;
    for (const l of s.lines) {
      const k = l.id + '|' + l.price;
      const r = byItem[k] || (byItem[k] = { name: l.name, cat: l.cat, qty: 0, amt: 0 });
      r.qty += l.qty;
      r.amt += l.qty * l.price;
    }
  }
  const groups = CATS
    .map((c) => {
      const rows = Object.values(byItem).filter((r) => r.cat === c.id).sort((a, b) => b.qty - a.qty);
      return { id: c.id, name: c.name, qty: rows.reduce((a, r) => a + r.qty, 0), rows };
    })
    .filter((g) => g.rows.length);
  const peak = total ? byHour.indexOf(Math.max(...byHour)) : null;
  return { total, upi, cash, bills: sales.length, groups, byHour, peak };
}

function reportText(r, day, openTables) {
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
  if (r.peak !== null) out.push(`⏰ Busiest hour: ${hourLabel(r.peak)} – ${hourLabel((r.peak + 1) % 24)}`);
  if (openTables) out.push(`⚠️ ${openTables} table(s) still not settled`);
  return out.join('\n');
}

module.exports = { summarize, reportText };
