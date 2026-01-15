// src/services/bill.service.js
const supabase = require('../db/database');
const { v4: uuidv4 } = require('uuid');

class BillService {

  /* -----------------------------
     GET ACTIVE BILLERS
  ------------------------------*/
  async getActiveBillers() {
    const { data, error } = await supabase
      .from('billers')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;
    return data;
  }

  /* -----------------------------
     CALCULATE BILL QUOTE
  ------------------------------*/
  async calculateBillQuote(userId, billerCode, amount) {
    const { data: wallet } = await supabase
      .from('wokopay_wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .single();

    if (!wallet) throw new Error('Primary wallet not found');

    const { data: biller } = await supabase
      .from('billers')
      .select('*')
      .eq('biller_code', billerCode)
      .eq('is_active', true)
      .single();

    if (!biller) throw new Error('Biller not found');

    // Fee calculation
    let fee = 0;
    if (biller.fee_type === 'flat') {
      fee = biller.fee_value;
    } else {
      fee = (amount * biller.fee_value) / 100;
    }

    const total = amount + fee;

    return {
      quoteId: `BILLQ${Date.now()}`,
      biller: {
        code: biller.biller_code,
        name: biller.biller_name,
        category: biller.category
      },
      amount: {
        billAmount: amount,
        fee: fee,
        totalPayable: total,
        currency: wallet.currency
      },
      wallet: {
        availableBalance: wallet.available_balance,
        sufficient: wallet.available_balance >= total
      },
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    };
  }

  /* -----------------------------
     PAY BILL
  ------------------------------*/
  async payBill({ userId, billerCode, customerAccountNumber, amount, paymentMethod }) {

    // 1. User + Wallet
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    const { data: wallet } = await supabase
      .from('wokopay_wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .single();

    if (!wallet) throw new Error('Wallet not found');

    // 2. Biller + Account
    const { data: biller } = await supabase
      .from('billers')
      .select('*')
      .eq('biller_code', billerCode)
      .single();

    const { data: billerAccount } = await supabase
      .from('biller_accounts')
      .select('*')
      .eq('biller_id', biller.id)
      .eq('is_active', true)
      .single();

    if (!billerAccount) throw new Error('Biller account not configured');

    // 3. Fee
    let fee = biller.fee_type === 'flat'
      ? biller.fee_value
      : (amount * biller.fee_value) / 100;

    const total = amount + fee;

    if (wallet.available_balance < total) {
      throw new Error('Insufficient wallet balance');
    }

    // 4. Deduct wallet
    const newWalletBalance = wallet.available_balance - total;

    await supabase
      .from('wokopay_wallets')
      .update({
        available_balance: newWalletBalance,
        last_transaction_at: new Date().toISOString()
      })
      .eq('id', wallet.id);

    // 5. Credit biller account
    await supabase
      .from('biller_accounts')
      .update({
        current_balance: billerAccount.current_balance + amount,
        updated_at: new Date().toISOString()
      })
      .eq('id', billerAccount.id);

    // 6. Transaction
    const transactionRef = `BILL${Date.now()}${uuidv4().slice(0, 6).toUpperCase()}`;

    const { data: transaction } = await supabase
      .from('transactions')
      .insert({
        transaction_ref: transactionRef,
        transaction_type: 'bill_payment',
        sender_user_id: userId,
        sender_wallet_id: wallet.id,
        sender_phone: user.phone_number,
        sender_country: wallet.country_code,
        sender_currency: wallet.currency,
        amount: amount,
        fee_amount: fee,
        total_amount: total,
        currency: wallet.currency,
        status: 'completed',
        description: `Bill payment to ${biller.biller_name}`,
        completed_at: new Date().toISOString()
      })
      .select()
      .single();

    // 7. Bill payment record
    const billRef = `BP${Date.now()}${uuidv4().slice(0, 6).toUpperCase()}`;

    await supabase
      .from('bill_payments')
      .insert({
        bill_payment_ref: billRef,
        user_id: userId,
        wallet_id: wallet.id,
        biller_id: biller.id,
        biller_account_id: billerAccount.id,
        customer_account_number: customerAccountNumber,
        bill_amount: amount,
        fee_amount: fee,
        total_amount: total,
        currency: wallet.currency,
        payment_method: paymentMethod,
        transaction_id: transaction.id,
        status: 'paid',
        paid_at: new Date().toISOString()
      });

    // 8. Audit log
    await supabase.from('audit_logs').insert({
      action_type: 'BILL_PAYMENT',
      table_name: 'bill_payments',
      record_id: transaction.id,
      new_values: {
        biller: biller.biller_name,
        amount,
        fee,
        total
      },
      changed_by: userId
    });

    return {
      transactionRef,
      biller: biller.biller_name,
      customerAccountNumber,
      amount,
      fee,
      total,
      currency: wallet.currency,
      walletBalanceAfter: newWalletBalance,
      status: 'PAID'
    };
  }

  /* -----------------------------
     BILL HISTORY
  ------------------------------*/
  async getBillHistory(userId) {
    const { data } = await supabase
      .from('bill_payments')
      .select(`
        *,
        billers (biller_name, category)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    return data || [];
  }
}

module.exports = new BillService();
