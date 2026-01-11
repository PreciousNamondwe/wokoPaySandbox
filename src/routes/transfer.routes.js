// src/routes/transfer.routes.js
const express = require('express');
const router = express.Router();
const transferService = require('../services/transfer.service');

// Cross-border transfer endpoint
router.post('/send', async (req, res) => {
  try {
    const { senderUserId, recipientPhone, amount, currency, purpose } = req.body;
    
    if (!senderUserId || !recipientPhone || !amount || !currency) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    const result = await transferService.sendCrossBorder(
      senderUserId, 
      recipientPhone, 
      parseFloat(amount), 
      currency,
      purpose || ''
    );
    
    res.json({
      success: true,
      message: 'Transfer completed successfully',
      data: result
    });
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;