// Phone notifications for the owner (Web Push). Free and instant.
// Needs VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (generate with: npx web-push generate-vapid-keys).
const webpush = require('web-push');

const configured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
let ready = false;
function init() {
  if (ready || !configured()) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://palleturi-cafe.vercel.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  ready = true;
}

// payload: { title, body, url, tag }. Returns how many phones it reached.
// Awaited by the caller so it finishes before a serverless function freezes.
async function notifyOwners(col, payload) {
  if (!configured()) return 0;
  init();
  const subs = await col('push_subs').find({ role: 'owner' }).toArray();
  if (!subs.length) return 0;
  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(subs.map((s) => webpush.sendNotification(s.sub, body, { TTL: 6 * 3600, urgency: 'high', timeout: 5000 })));
  const gone = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') return;
    const code = r.reason?.statusCode;
    if (code === 404 || code === 410) gone.push(subs[i]._id); // phone unsubscribed / app removed
    else console.error('Push failed', code || '', r.reason?.body || r.reason?.message);
  });
  if (gone.length) await col('push_subs').deleteMany({ _id: { $in: gone } });
  return results.filter((r) => r.status === 'fulfilled').length;
}

module.exports = { notifyOwners, pushConfigured: configured };
