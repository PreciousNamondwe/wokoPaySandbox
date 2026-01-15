// src/routes/bill.routes.js
const express = require('express');
const router = express.Router();
const billService = require('../services/bill.service');
const { v4: uuidv4 } = require("uuid");
const supabase = require("../db/database");

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


router.post("/pay-with-user", async (req, res) => {
  try {
    const { fullName, email, phoneNumber, customerAccountNumber, amount, paymentMethod } = req.body;

    if (!fullName || !email || !phoneNumber || !customerAccountNumber || !amount || !paymentMethod) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 1. Check if user exists
    let { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("phone_number", phoneNumber)
      .single();

    let userId, walletId, providerId, wallet;

    if (!user) {
      // 2. Create mobile provider if not exists
      let { data: provider } = await supabase
        .from("mobile_providers")
        .select("*")
        .eq("phone_number", phoneNumber)
        .single();

      if (!provider) {
        const providerName = fullName.split(" ")[0] + " Mobile";
        const { data: newProvider, error: providerErr } = await supabase
          .from("mobile_providers")
          .insert([{
            provider_name: providerName,
            country_code: "MW",
            phone_number: phoneNumber,
            balance: 50000, // initial balance
            currency: "MWK",
            is_active: true
          }])
          .select()
          .single();

        if (providerErr) throw providerErr;
        providerId = newProvider.id;
      } else {
        providerId = provider.id;
      }

      // 3. Create user
      const { data: newUser, error: newUserErr } = await supabase
        .from("users")
        .insert([{
          phone_number: phoneNumber,
          email,
          full_name: fullName,
          country_code: "MW",
          mobile_provider_id: providerId,
          is_active: true
        }])
        .select()
        .single();

      if (newUserErr) throw newUserErr;
      userId = newUser.id;

      // 4. Create wallet
      const { data: newWallet, error: walletErr } = await supabase
        .from("wokopay_wallets")
        .insert([{
          user_id: userId,
          country_code: "MW",
          currency: "MWK",
          available_balance: 50000,
          is_primary: true,
          wallet_status: "active"
        }])
        .select()
        .single();

      if (walletErr) throw walletErr;
      walletId = newWallet.id;
      wallet = newWallet; // assign wallet for later
    } else {
      userId = user.id;
      // 5. Get wallet for existing user
      const { data: existingWallet, error: walletErr } = await supabase
        .from("wokopay_wallets")
        .select("*")
        .eq("user_id", userId)
        .eq("wallet_status", "active")
        .single();

      if (walletErr) return res.status(400).json({ error: "Wallet not found" });

      wallet = existingWallet;
      walletId = wallet.id;

      if (wallet.available_balance < amount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }
    }

    // 6. Deduct wallet balance
    const newBalance = parseFloat(wallet.available_balance) - parseFloat(amount);
    const { data: updatedWallet, error: updateWalletErr } = await supabase
      .from("wokopay_wallets")
      .update({ available_balance: newBalance })
      .eq("id", walletId)
      .select()
      .single();

    if (updateWalletErr) throw updateWalletErr;

    // 7. Get biller and account (assuming ESCOM)
    const { data: biller } = await supabase
      .from("billers")
      .select("*")
      .eq("biller_code", "ESCOM")
      .single();

    const { data: billerAccount } = await supabase
      .from("biller_accounts")
      .select("*")
      .eq("biller_id", biller.id)
      .limit(1)
      .single();

    // 8. Create transaction
    const transactionId = uuidv4();
    await supabase.from("transactions").insert([{
      id: transactionId,
      transaction_ref: "TRX-" + Date.now(),
      transaction_type: "bill_payment",
      sender_user_id: userId,
      sender_wallet_id: walletId,
      amount,
      currency: "MWK",
      total_amount: amount,
      status: "completed"
    }]);

    // 9. Create bill payment
    const billPaymentId = uuidv4();
    await supabase.from("bill_payments").insert([{
      id: billPaymentId,
      bill_payment_ref: "BILL-" + Date.now(),
      user_id: userId,
      wallet_id: walletId,
      biller_id: biller.id,
      biller_account_id: billerAccount.id,
      customer_account_number: customerAccountNumber,
      bill_amount: amount,
      total_amount: amount,
      currency: "MWK",
      payment_method: paymentMethod,
      transaction_id: transactionId,
      status: "paid",
      paid_at: new Date().toISOString()
    }]);

   res.json({
  status: "success",
  message: "Bill payment completed successfully",

  user: {
    id: userId,
    phoneNumber,
    fullName,
    email
  },

  bill: {
    biller: {
      id: biller.id,
      code: biller.biller_code,
      name: biller.biller_name,
      category: biller.category
    },
    customerAccountNumber,
    amount,
    currency: "MWK"
  },

  payment: {
    method: paymentMethod,
    walletId,
    previousBalance: wallet.available_balance,
    newBalance
  },

  transaction: {
    transactionId,
    billPaymentId,
    status: "paid",
    paidAt: new Date().toISOString()
  }
});

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
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
