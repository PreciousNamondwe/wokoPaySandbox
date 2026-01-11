// src/routes/mobile-money.routes.js
const express = require('express');
const router = express.Router();
const mobileMoneyService = require('../services/mobile-money.service');

// Verify mobile provider
router.post('/verify', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const provider = await mobileMoneyService.verifyMobileProvider(phoneNumber);
    
    res.json({
      success: true,
      data: provider
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Register user with mobile money
router.post('/register-user', async (req, res) => {
  try {
    const { phone_number, full_name, country_code, email } = req.body;
    
    if (!phone_number || !full_name || !country_code) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await mobileMoneyService.registerUserWithMobileMoney({
      phone_number,
      full_name,
      country_code,
      email
    });
    
    res.json({
      success: true,
      message: 'User registered successfully',
      data: result
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get mobile providers by country
router.get('/providers', async (req, res) => {
  try {
    const { countryCode } = req.query;
    
    const providers = await mobileMoneyService.getMobileProviders(countryCode);
    
    res.json({
      success: true,
      data: providers
    });
  } catch (error) {
    console.error('Get providers error:', error);
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;