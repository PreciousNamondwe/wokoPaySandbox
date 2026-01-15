// src/routes/bill.routes.js
const express = require('express');
const router = express.Router();
const billService = require('../services/bill.service');

// Get available billers (ESCOM, Water Board)
router.get('/billers', async (req, res) => {
  try {
    const billers = await billService.getActiveBillers();
    res.json({ success: true, data: billers });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get bill payment quote
router.post('/quote', async (req, res) => {
  try {
    const { userId, billerCode, amount } = req.body;

    if (!userId || !billerCode || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const quote = await billService.calculateBillQuote(
      userId,
      billerCode,
      parseFloat(amount)
    );

    res.json({
      success: true,
      message: 'Bill payment quote generated',
      data: quote
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Execute bill payment
router.post('/pay', async (req, res) => {
  try {
    const {
      userId,
      billerCode,
      customerAccountNumber,
      amount,
      paymentMethod
    } = req.body;

    if (!userId || !billerCode || !customerAccountNumber || !amount || !paymentMethod) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await billService.payBill({
      userId,
      billerCode,
      customerAccountNumber,
      amount: parseFloat(amount),
      paymentMethod
    });

    res.json({
      success: true,
      message: 'Bill payment successful',
      data: result
    });
  } catch (error) {
    console.error('Bill payment error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Bill payment history
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const history = await billService.getBillHistory(userId);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
