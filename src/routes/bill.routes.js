const express = require('express');
const router = express.Router();
const billService = require('../services/bill.service');
const { v4: uuidv4 } = require("uuid");
const supabase = require("../db/database");

// Helper: Detect Malawi mobile network
const detectMWNetwork = (phone) => {
  const normalized = phone.replace(/\s+/g, "");

  if (normalized.startsWith("+26599") || normalized.startsWith("+26598")) {
    return "airtel";
  }

  if (normalized.startsWith("+26588") || normalized.startsWith("+26589")) {
    return "tnm";
  }

  return null;
};

// Get available billers
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
    const {
      fullName,
      email,
      phoneNumber,
      customerAccountNumber,
      amount,
      paymentMethod,
      billerCode
    } = req.body;

    if (!fullName || !email || !phoneNumber || !customerAccountNumber || !amount || !paymentMethod || !billerCode) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Detect Malawi mobile network
    const detectedNetwork = detectMWNetwork(phoneNumber);
    if (!detectedNetwork) return res.status(400).json({ error: "Invalid Malawi phone number" });
    if ((paymentMethod === "airtel_money" && detectedNetwork !== "airtel") ||
        (paymentMethod === "tnm_mpamba" && detectedNetwork !== "tnm")) {
      return res.status(400).json({
        error: `Phone number does not match selected payment method. Detected ${detectedNetwork.toUpperCase()} number.`
      });
    }

    // 1. Get Malawi country account (for biller accounts & FK)
    const { data: countryAccount } = await supabase
      .from("wokopay_country_accounts")
      .select("*")
      .eq("country_code", "MW")
      .single();
    if (!countryAccount) throw new Error("Malawi country account not found");

    // 2. Check or create user
    let { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("phone_number", phoneNumber)
      .single();

    let userId, walletId, wallet;

    if (!user) {
      // 2a. Create mobile provider if needed
      let { data: provider } = await supabase
        .from("mobile_providers")
        .select("*")
        .eq("phone_number", phoneNumber)
        .single();

      if (!provider) {
        const { data: newProvider, error: providerErr } = await supabase
          .from("mobile_providers")
          .insert([{
            provider_name: fullName.split(" ")[0] + " Mobile",
            country_code: "MW",
            phone_number: phoneNumber,
            balance: 50000,
            currency: "MWK",
            is_active: true
          }])
          .select()
          .single();
        if (providerErr) throw providerErr;
        provider = newProvider;
      }

      // 2b. Create user
      const { data: newUser, error: userErr } = await supabase
        .from("users")
        .insert([{
          phone_number: phoneNumber,
          email,
          full_name: fullName,
          country_code: "MW",
          mobile_provider_id: provider.id,
          is_active: true
        }])
        .select()
        .single();
      if (userErr) throw userErr;
      userId = newUser.id;

      // 2c. Create wallet
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
      wallet = newWallet;
    } else {
      userId = user.id;

      // Get wallet
      const { data: existingWallet, error: walletErr } = await supabase
        .from("wokopay_wallets")
        .select("*")
        .eq("user_id", userId)
        .eq("wallet_status", "active")
        .single();
      if (walletErr) return res.status(400).json({ error: "Wallet not found" });

      if (existingWallet.available_balance < amount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }
      walletId = existingWallet.id;
      wallet = existingWallet;
    }

    // Deduct balance
    const newBalance = parseFloat(wallet.available_balance) - parseFloat(amount);
    const { data: updatedWallet, error: updateWalletErr } = await supabase
      .from("wokopay_wallets")
      .update({ available_balance: newBalance })
      .eq("id", walletId)
      .select()
      .single();
    if (updateWalletErr) throw updateWalletErr;

    // 3. Get or create biller
    let { data: biller } = await supabase
      .from("billers")
      .select("*")
      .eq("biller_code", billerCode)
      .single();

    if (!biller) {
      const { data: newBiller, error: billerErr } = await supabase
        .from("billers")
        .insert([{
          biller_code: billerCode,
          biller_name: billerCode.replace(/_/g, " "),
          category: billerCode.includes("WATER") ? "water" : "telecom",
          country_code: "MW",
          supports_partial_payment: true,
          is_active: true
        }])
        .select()
        .single();
      if (billerErr) throw billerErr;
      biller = newBiller;
    }

    // 4. Get or create biller account (use Malawi country account)
    let { data: billerAccount } = await supabase
      .from("biller_accounts")
      .select("*")
      .eq("biller_id", biller.id)
      .limit(1)
      .single();

    if (!billerAccount) {
      const { data: newBillerAccount, error: baErr } = await supabase
        .from("biller_accounts")
        .insert([{
          biller_id: biller.id,
          country_account_id: countryAccount.id,
          settlement_currency: "MWK",
          is_active: true
        }])
        .select()
        .single();
      if (baErr) throw baErr;
      billerAccount = newBillerAccount;
    }

    // 5. Create transaction
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

    // 6. Create bill payment
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
      user: { id: userId, phoneNumber, fullName, email },
      bill: {
        biller: { id: biller.id, code: biller.biller_code, name: biller.biller_name, category: biller.category },
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
