// Vercel serverless entry: every /api/* request is handled by the Express app.
const { app } = require('../server/app');

module.exports = app;
