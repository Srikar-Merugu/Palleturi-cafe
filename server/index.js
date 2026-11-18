// Local / always-on server: `npm start`. On Vercel, api/index.js is used instead.
const { app, connect, nightlyCheck } = require('./app');

const PORT = process.env.PORT || 3000;

connect()
  .then(() => {
    app.listen(PORT, () => console.log(`Palleturi Cafe running on http://localhost:${PORT}`));
    setInterval(() => nightlyCheck(), 60 * 1000); // sends at REPORT_HOUR if WhatsApp is configured
  })
  .catch((e) => { console.error('Could not connect to MongoDB:', e.message); process.exit(1); });
