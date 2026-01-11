// src/routes/payout.routes.js
const express = require('express');
const router = express.Router();
const payoutService = require('../services/payout.service');

router.post('/quote', async (req, res) => {
  try {
    const { senderUserId, recipientPhone, amount } = req.body;
    
    if (!senderUserId || !recipientPhone || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const quote = await payoutService.calculatePayoutQuote(senderUserId, recipientPhone, parseFloat(amount));
    
    res.json({
      success: true,
      message: 'Quote generated',
      data: quote
    });
  } catch (error) {
    console.error('Quote error:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/execute', async (req, res) => {
  try {
    const { senderUserId, recipientPhone, amount, currency, isGuestPayout } = req.body;
    
    if (!senderUserId || !recipientPhone || !amount || !currency) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await payoutService.cashoutToMobileMoney(
      senderUserId, 
      recipientPhone, 
      parseFloat(amount), 
      currency,
      isGuestPayout || false
    );
    
    res.json({
      success: true,
      message: 'Payout completed',
      data: result
    });
  } catch (error) {
    console.error('Execute error:', error);
    res.status(400).json({ error: error.message });
  }
});

router.get('/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const status = await payoutService.getPayoutStatus(transactionId);
    res.json(status);
  } catch (error) {
    console.error('Status error:', error);
    res.status(400).json({ error: error.message });
  }
});

router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    const history = await payoutService.getPayoutHistory(userId, parseInt(limit), parseInt(offset));
    res.json(history);
  } catch (error) {
    console.error('History error:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/retry/:payoutInstructionId', async (req, res) => {
  try {
    const { payoutInstructionId } = req.params;
    const result = await payoutService.retryFailedPayout(payoutInstructionId);
    res.json(result);
  } catch (error) {
    console.error('Retry error:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;