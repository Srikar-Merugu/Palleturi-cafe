// Sends the daily report through the WhatsApp Business Cloud API (Meta).
// Without WHATSAPP_TOKEN + WHATSAPP_PHONE_ID the app falls back to a one-tap wa.me link.
//
// Note: WhatsApp only lets a business start a conversation with an approved
// *template*. Plain text works only within 24h of the owner messaging the business
// number. For a reliable nightly message set WHATSAPP_TEMPLATE to a template with
// one body variable ({{1}}); the report is sent as that variable on a single line.

const configured = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);

async function sendWhatsApp(to, text) {
  if (!configured()) return { sent: false, reason: 'not-configured' };
  const tpl = process.env.WHATSAPP_TEMPLATE;
  const body = tpl
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: tpl,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
          // Template variables can't contain newlines or long runs of spaces.
          components: [{ type: 'body', parameters: [{ type: 'text', text: text.replace(/\n+/g, ' | ').replace(/\s{2,}/g, ' ').slice(0, 1000) }] }],
        },
      }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { sent: true } : { sent: false, reason: j.error?.message || `HTTP ${r.status}` };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

module.exports = { sendWhatsApp, whatsappConfigured: configured };
