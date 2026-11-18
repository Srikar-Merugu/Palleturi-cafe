# Palleturi Cafe — counter app (prototype)

Table billing, QR ordering and a daily WhatsApp report, in the Palleturi brand
(signboard brown `#8C5862` + marigold logo `#F5A91B`).

## Run it

```bash
python3 -m http.server 5173
```

Open http://localhost:5173.

Default PINs (change them in **Settings**):
- Owner: `1234` (tables, report, QR stickers, settings)
- Staff: `0000` (tables and billing only)

## Screens

| Route | Who | What |
|---|---|---|
| `#/` | Owner / staff | 12 tables + Parcel, incoming QR orders |
| `#/table/5` | Owner / staff | Add items, settle bill with UPI QR (amount pre-filled) |
| `#/menu/5` | Customer | QR menu for table 5, English / Telugu, "Send to counter" |
| `#/report` | Owner | Today's totals and the WhatsApp report |
| `#/qr` | Owner | Printable QR stickers for every table |
| `#/settings` | Owner | UPI ID, WhatsApp number, PINs, prices, demo data |

## What still needs a backend

Data is saved in this browser only (`localStorage`). Tabs in the same browser stay
in sync, so the demo works, but a customer's phone can't reach the counter yet.
To go live:

1. Move data to Supabase (orders, tables, sales) and use realtime for incoming orders.
2. Host on Vercel so the QR codes point at a real URL.
3. Fully automatic 10 PM report: a Vercel cron job + WhatsApp Business Cloud API.
   Right now the owner gets a 10 PM pop-up and sends it with one tap.
