# Palleturi Cafe — counter app

Table billing, QR ordering and a daily WhatsApp report for Palleturi Cafe, in the
cafe's brand (signboard brown `#8C5862` + marigold logo `#F5A91B`).

- **Front end:** plain HTML/CSS/JS in `public/`
- **Server:** Node.js + Express in `server/`
- **Database:** MongoDB (local or MongoDB Atlas)
- **Live updates:** the counter screen checks for changes every 3 seconds and beeps on new QR orders
- **Hosting:** Vercel (`api/index.js` + `vercel.json`), or any Node host with `npm start`

## Run locally

Needs Node.js 22.9+ and MongoDB.

```bash
npm install
cp .env.example .env      # then edit MONGODB_URI if needed
npm start
```

Open http://localhost:3000.

On first start the server fills the menu and creates the settings. Default PINs
come from `OWNER_PIN` / `STAFF_PIN` in `.env` (`1234` / `0000` if not set); change
them in **Settings**.

- **Owner:** tables, billing, today's report, QR stickers, settings
- **Staff:** tables and billing only

## Screens

| Route | Who | What |
|---|---|---|
| `#/` | Owner / staff | 12 tables + Parcel, incoming QR orders (with sound) |
| `#/table/5` | Owner / staff | Add items, settle bill with UPI QR (amount pre-filled) |
| `#/menu/5` | Customer | QR menu for table 5, English / Telugu, "Send to counter" |
| `#/report` | Owner | Today's totals and the WhatsApp report |
| `#/qr` | Owner | Printable QR stickers for every table |
| `#/settings` | Owner | UPI ID, WhatsApp number, PINs, prices, demo data |

## MongoDB collections

| Collection | Holds |
|---|---|
| `items` | Menu items and prices |
| `tables` | Open bills, one document per table (`_id` = table number, 0 = parcel) |
| `orders` | QR orders waiting for the counter |
| `sales` | Settled bills, with a `day` field (`YYYY-MM-DD`, cafe time) for reports |
| `settings` | UPI ID, WhatsApp number, PINs |
| `sessions` | Login tokens (expire after 30 days) |
| `attempts` | Wrong PIN tries, for the 5-minute lockout |
| `order_log` | Every order sent to the owner (staff "Send order" and QR orders) |
| `push_subs` | Owner phones signed up for notifications |
| `openings` | Each Open cafe: morning cash in the drawer, who, when |
| `closings` | Each Close cafe: cash counted, expected, difference, note, who |
| `stock_moves` | Every stock change: delivery, sale, shelf count, removal |

## Going live (Vercel + MongoDB Atlas)

1. Create a free M0 cluster on **MongoDB Atlas**, a database user, and allow
   network access from `0.0.0.0/0` (Vercel has no fixed IPs). Copy the
   `mongodb+srv://…` connection string.
2. Import the GitHub repo into **Vercel** (no build step needed) and set
   environment variables: `MONGODB_URI`, `MONGODB_DB`, `CRON_SECRET` (any long
   random string), plus the optional WhatsApp ones.
3. Print the stickers from **QR stickers** *after* deploying, so the codes point
   at the live address.

## Stock (inventory)

Owner only. Packaged items (cigarettes, cool drinks, biscuits, cookies, bun, rusk) are
tracked by default; any item can be switched on or off. **Add** records a delivery
(crates/packets + loose, optional amount paid → buying price), paid bills reduce stock
automatically, **Count** records a shelf count and the difference, **Remove** handles
damaged/expired/own use. Low and sold-out items notify the owner, sold-out items are
hidden from the QR menu, and the nightly report adds profit and a low-stock list.
Items start as "not counted" so nothing disappears until the owner enters stock.

## Order notifications on the owner’s phone

Staff add items and tap **Send order**; only items added since the last send go out.
QR orders and paid bills notify too. The owner turns alerts on in **Settings → Order
alerts on this phone** (on iPhone, first Share → Add to Home Screen). Needs the
`VAPID_*` keys from `.env.example`.

## Open cafe (morning) and Close cafe (night)

**Morning — Open cafe** (banner on Tables): asks how much cash is in the drawer and
notifies the owner. **Night — Close cafe**: shows open tables / QR orders, shows the
morning cash, asks only for the cash in the drawer now (expected = morning cash + cash
sales), then records the closing and sends the day report:
the owner’s phone is notified automatically, and the WhatsApp report opens with one
tap (fully automatic if the WhatsApp Cloud API is configured). The owner sees expected
cash and the difference live; staff count blind. At 10 PM the owner app reminds to close.

## Nightly WhatsApp report (10 PM)

- **Without setup:** at 10 PM the owner's screen asks to send the report; one tap
  opens WhatsApp with it already typed.
- **Automatic:** set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` and `WHATSAPP_TEMPLATE`
  (Meta WhatsApp Business Cloud API). The server sends the report itself at
  `REPORT_HOUR` (on Vercel: the cron in `vercel.json`, 17:00 UTC = 10:30 PM IST; the
  free plan may run it any time within that hour). WhatsApp only lets a business start a chat with an approved
  template, so create one with a single body variable `{{1}}`.
