// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// --------------------
// Import routes
// --------------------
const walletRoutes = require('./src/routes/wallet.routes');
const transferRoutes = require('./src/routes/transfer.routes');
const mobileMoneyRoutes = require('./src/routes/mobile-money.routes');
const payoutRoutes = require('./src/routes/payout.routes');
const billRoutes = require('./src/routes/bill.routes'); // ✅ NEW

// --------------------
// Routes
// --------------------
app.use('/api/wallet', walletRoutes);
app.use('/api/transfer', transferRoutes);
app.use('/api/mobile-money', mobileMoneyRoutes);
app.use('/api/payout', payoutRoutes);
app.use('/api/bills', billRoutes); // ✅ NEW

// --------------------
// Health check
// --------------------
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'WokoPay API'
  });
});

// --------------------
// 404 handler
// --------------------
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// --------------------
// Global error handler
// --------------------
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development'
      ? err.message
      : undefined
  });
});

app.listen(PORT, () => {
  console.log(`🚀 WokoPay API running on port ${PORT}`);
});

module.exports = app;
