// src/routes/wallet.routes.js - UPDATED
const express = require('express');
const router = express.Router();
const walletService = require('../services/wallet.service');

// Get load quote
router.post('/load/quote', async (req, res) => {
  try {
    const { userId, phoneNumber, amount } = req.body;
    
    if (!userId || !phoneNumber || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const quote = await walletService.calculateLoadQuote(userId, phoneNumber, parseFloat(amount));
    
    res.json({
      success: true,
      message: 'Load quote generated',
      data: quote
    });
  } catch (error) {
    console.error('Load quote error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Load wallet
router.post('/load', async (req, res) => {
  try {
    const { userId, phoneNumber, amount, currency } = req.body;
    
    if (!userId || !phoneNumber || !amount || !currency) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await walletService.loadWallet(userId, phoneNumber, parseFloat(amount), currency);
    
    res.json({
      success: true,
      message: 'Wallet loaded successfully',
      data: result
    });
  } catch (error) {
    console.error('Load error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get wallet balance
router.get('/balance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const balance = await walletService.getWalletBalance(userId);
    
    res.json({
      success: true,
      data: balance
    });
  } catch (error) {
    console.error('Balance error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Get wallet transactions
router.get('/transactions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    
    const transactions = await walletService.getWalletTransactions(
      userId, 
      parseInt(limit), 
      parseInt(offset)
    );
    
    res.json({
      success: true,
      data: transactions
    });
  } catch (error) {
    console.error('Transactions error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Create new wallet
router.post('/create', async (req, res) => {
  try {
    const { userId, countryCode, isPrimary } = req.body;
    
    if (!userId || !countryCode) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const wallet = await walletService.createWallet(
      userId, 
      countryCode, 
      isPrimary || false
    );
    
    res.json({
      success: true,
      message: 'Wallet created successfully',
      data: wallet
    });
  } catch (error) {
    console.error('Create wallet error:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;