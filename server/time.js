// All "today" / "10 PM" logic runs in the cafe's timezone, not the server's.
const TZ = process.env.CAFE_TIMEZONE || 'Asia/Kolkata';

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });
const labelFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const timeLabel = (d = new Date()) => timeFmt.format(d);
const dayKey = (d = new Date()) => dayFmt.format(d); // YYYY-MM-DD
const hourOf = (d = new Date()) => parseInt(hourFmt.format(d), 10);
const dayLabel = (key) => labelFmt.format(new Date(key + 'T12:00:00Z'));

module.exports = { TZ, dayKey, hourOf, dayLabel, timeLabel };
