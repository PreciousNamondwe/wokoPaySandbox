import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import { transferService } from './services/transfer.service.js';
import { settlementService } from './services/settlement.service.js';
import { db } from './db/database.js';

import {
  registerDeveloper,
  loginDeveloper,
  rotateKeys
} from "./auth/developer.auth.js";
import { validateApiKey } from "./auth/apiKey.middleware.js";

dotenv.config();

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(cors({
  origin: function (origin, callback) {
    const allowed = [
      "http://localhost:3000",
      "https://woko-sandbox.vercel.app",
      "https://wokopaysandbox.onrender.com"
    ];

    // Allow server-to-server or no-origin requests
    if (!origin) return callback(null, true);

    if (allowed.includes(origin)) {
      return callback(null, true);
    }

    console.log("CORS BLOCKED:", origin);
    return callback(new Error("CORS not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "x-api-key",
    "x-secret-key",
    "Authorization"
  ],
}));

// Required for preflight
app.options("*", cors());

app.options("*", cors());

app.use(express.json());


app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});


app.get('/', (req, res) => {
  res.json({
    service: 'WokoPay API',
    version: '1.0.0',
    status: 'running',
    database: 'Supabase',
    endpoints: {
      send: 'POST /api/send',
      ledger: 'GET /api/settlement/ledger',
      summary: 'GET /api/settlement/summary',
      history: 'GET /api/settlement/history',
      users: 'GET /api/users',
      merchants: 'GET /api/merchants',
      transactions: 'GET /api/transactions',
      dev_register: "POST /api/dev/register",
      dev_login: "POST /api/dev/login",
      dev_rotate_keys: "POST /api/dev/keys/rotate"
    }
  });
});


app.post("/api/dev/register", registerDeveloper);
app.post("/api/dev/login", loginDeveloper);
app.post("/api/dev/keys/rotate", rotateKeys);


app.post('/api/send', validateApiKey, async (req, res) => {
  try {
    const result = await transferService.processTransfer(req.body);
    res.json(result);
  } catch (error) {
    console.error('Send error:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});


app.get('/api/settlement/ledger', async (req, res) => {
  try {
    const summary = await settlementService.getSettlementSummary();
    res.json({
      success: true,
      ...summary,
      note: 'This is a settlement ledger only. Actual settlement must be arranged externally.'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/settlement/summary', async (req, res) => {
  try {
    const summary = await settlementService.getSettlementSummary();
    res.json({
      success: true,
      netSettlement: summary.netSettlement,
      unsettledCount: summary.unsettledCount,
      timestamp: summary.timestamp
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/settlement/history', async (req, res) => {
  try {
    const history = await settlementService.getSettlementHistory();
    res.json({ success: true, ...history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/settlement/mark-settled', async (req, res) => {
  try {
    const { transactionIds, settlementReference } = req.body;
    
    if (!transactionIds || !Array.isArray(transactionIds)) {
      return res.status(400).json({
        success: false,
        error: 'transactionIds array is required'
      });
    }
    
    const result = await settlementService.markAsSettled(
      transactionIds,
      settlementReference
    );
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


app.get('/api/users', async (req, res) => {
  try {
    const users = await db.getUsers();
    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/merchants', async (req, res) => {
  try {
    const merchants = await db.getMerchants();
    res.json({
      success: true,
      merchants
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const transactions = await db.getTransactions();
    res.json({
      success: true,
      count: transactions.length,
      transactions: transactions.map(t => ({
        id: t.transaction_id,
        from: t.from_country,
        to: t.to_country,
        amount: t.amount,
        convertedAmount: t.converted_amount,
        fee: t.fee,
        status: t.status,
        settled: t.settled,
        date: t.created_at
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});



app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default app;
