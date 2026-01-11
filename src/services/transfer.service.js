// src/services/transfer.service.js
const supabase = require('../db/database');
const { v4: uuidv4 } = require('uuid');

class TransferService {
  async sendCrossBorder(senderUserId, recipientPhone, amount, fromCurrency, purpose = '') {
    // Get sender info
    const { data: sender, error: senderError } = await supabase
      .from('users')
      .select('*')
      .eq('id', senderUserId)
      .single();

    if (senderError) throw new Error('Sender not found');
    if (!sender.is_active) throw new Error('Sender account is inactive');

    // Get sender's primary wallet
    const { data: senderWallet, error: walletError } = await supabase
      .from('wokopay_wallets')
      .select('*')
      .eq('user_id', senderUserId)
      .eq('is_primary', true)
      .single();

    if (walletError) throw new Error('Sender wallet not found');
    if (parseFloat(senderWallet.available_balance) < parseFloat(amount)) {
      throw new Error('Insufficient balance');
    }

    // Check if sender is traveling
    if (sender.is_traveling && sender.current_country) {
      // Use current country for FX
      senderWallet.country_code = sender.current_country;
    }

    // Find recipient
    const { data: recipient, error: recipientError } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', recipientPhone)
      .eq('is_active', true)
      .single();

    if (recipientError) throw new Error('Recipient not found');

    // Get recipient's primary wallet
    const { data: recipientWallet, error: recipientWalletError } = await supabase
      .from('wokopay_wallets')
      .select('*')
      .eq('user_id', recipient.id)
      .eq('is_primary', true)
      .single();

    if (recipientWalletError) throw new Error('Recipient wallet not found');

    // Check if recipient is traveling
    if (recipient.is_traveling && recipient.current_country) {
      recipientWallet.country_code = recipient.current_country;
    }

    // Get FX rate
    const fxRate = await this.getFxRate(
      senderWallet.currency,
      recipientWallet.currency
    );

    // Calculate converted amount
    const convertedAmount = parseFloat(amount) * fxRate;
    const feeAmount = this.calculateFee(amount, senderWallet.country_code, recipientWallet.country_code);
    const totalAmount = parseFloat(amount) + feeAmount;

    // Deduct from sender wallet
    const senderNewBalance = parseFloat(senderWallet.available_balance) - totalAmount;
    await supabase
      .from('wokopay_wallets')
      .update({
        available_balance: senderNewBalance,
        last_transaction_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', senderWallet.id);

    // Add to recipient wallet
    const recipientNewBalance = parseFloat(recipientWallet.available_balance) + convertedAmount;
    await supabase
      .from('wokopay_wallets')
      .update({
        available_balance: recipientNewBalance,
        last_transaction_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', recipientWallet.id);

    // Update country accounts
    await this.updateCountryAccounts(
      senderWallet.country_code,
      recipientWallet.country_code,
      totalAmount,
      convertedAmount
    );

    // Create transaction record
    const transactionRef = `TRF${Date.now()}${uuidv4().slice(0, 8).toUpperCase()}`;
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .insert({
        transaction_ref: transactionRef,
        transaction_type: 'cross_border_send',
        sender_user_id: senderUserId,
        sender_wallet_id: senderWallet.id,
        sender_phone: sender.phone_number,
        sender_country: senderWallet.country_code,
        sender_currency: senderWallet.currency,
        recipient_user_id: recipient.id,
        recipient_wallet_id: recipientWallet.id,
        recipient_phone: recipient.phone_number,
        recipient_country: recipientWallet.country_code,
        recipient_currency: recipientWallet.currency,
        amount: amount,
        currency: senderWallet.currency,
        fee_amount: feeAmount,
        total_amount: totalAmount,
        fx_rate: fxRate,
        converted_amount: convertedAmount,
        converted_currency: recipientWallet.currency,
        status: 'completed',
        description: `Cross-border transfer: ${purpose}`,
        completed_at: new Date().toISOString()
      })
      .select()
      .single();

    if (transactionError) throw new Error('Failed to create transaction');

    // Create audit logs
    await Promise.all([
      supabase.from('audit_logs').insert({
        action_type: 'TRANSFER_SEND',
        table_name: 'wokopay_wallets',
        record_id: senderWallet.id,
        old_values: { balance: senderWallet.available_balance },
        new_values: { balance: senderNewBalance },
        changed_by: senderUserId,
        created_at: new Date().toISOString()
      }),
      supabase.from('audit_logs').insert({
        action_type: 'TRANSFER_RECEIVE',
        table_name: 'wokopay_wallets',
        record_id: recipientWallet.id,
        old_values: { balance: recipientWallet.available_balance },
        new_values: { balance: recipientNewBalance },
        changed_by: senderUserId,
        created_at: new Date().toISOString()
      })
    ]);

    // Create settlement instruction
    await this.createSettlementInstruction(
      transaction.id,
      senderWallet.country_code,
      recipientWallet.country_code,
      totalAmount,
      convertedAmount
    );

    return {
      success: true,
      transactionId: transaction.id,
      transactionRef: transaction.transaction_ref,
      amountSent: amount,
      currencySent: senderWallet.currency,
      amountReceived: convertedAmount,
      currencyReceived: recipientWallet.currency,
      fxRate: fxRate,
      fee: feeAmount,
      timestamp: new Date().toISOString()
    };
  }

  async getFxRate(fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) return 1.0;

    const { data: fxRate, error } = await supabase
      .from('exchange_rates')
      .select('rate')
      .eq('base_currency', fromCurrency)
      .eq('target_currency', toCurrency)
      .eq('is_active', true)
      .gte('valid_from', new Date().toISOString())
      .or(`valid_to.is.null,valid_to.gte.${new Date().toISOString()}`)
      .order('valid_from', { ascending: false })
      .limit(1)
      .single();

    if (error || !fxRate) {
      // Fallback to mock rate (in production, use real FX API)
      return 0.85; // Example: 1 USD = 0.85 EUR
    }

    return parseFloat(fxRate.rate);
  }

  calculateFee(amount, fromCountry, toCountry) {
    // Simple fee calculation logic
    const baseFee = 5.00; // Base fee in currency
    const percentageFee = 0.02; // 2%
    
    return baseFee + (parseFloat(amount) * percentageFee);
  }

  async updateCountryAccounts(fromCountry, toCountry, outgoingAmount, incomingAmount) {
    // Update source country account (outgoing)
    const { data: fromAccount } = await supabase
      .from('wokopay_country_accounts')
      .select('*')
      .eq('country_code', fromCountry)
      .single();

    if (fromAccount) {
      await supabase
        .from('wokopay_country_accounts')
        .update({
          outgoing_pool: parseFloat(fromAccount.outgoing_pool) + parseFloat(outgoingAmount),
          current_balance: parseFloat(fromAccount.current_balance) - parseFloat(outgoingAmount),
          updated_at: new Date().toISOString()
        })
        .eq('id', fromAccount.id);
    }

    // Update destination country account (incoming)
    const { data: toAccount } = await supabase
      .from('wokopay_country_accounts')
      .select('*')
      .eq('country_code', toCountry)
      .single();

    if (toAccount) {
      await supabase
        .from('wokopay_country_accounts')
        .update({
          incoming_pool: parseFloat(toAccount.incoming_pool) + parseFloat(incomingAmount),
          current_balance: parseFloat(toAccount.current_balance) + parseFloat(incomingAmount),
          updated_at: new Date().toISOString()
        })
        .eq('id', toAccount.id);
    }
  }

  async createSettlementInstruction(transactionId, fromCountry, toCountry, outgoingAmount, incomingAmount) {
    const instructionRef = `STL${Date.now()}${uuidv4().slice(0, 8).toUpperCase()}`;
    
    await supabase
      .from('payout_instructions')
      .insert({
        instruction_ref: instructionRef,
        from_country: fromCountry,
        to_country: toCountry,
        amount: outgoingAmount,
        currency: fromCountry, // Use country code as currency placeholder
        converted_amount: incomingAmount,
        converted_currency: toCountry, // Use country code as currency placeholder
        payout_to_phone: 'system_settlement',
        payout_method: 'net_settlement',
        source_transaction_id: transactionId,
        status: 'pending',
        created_at: new Date().toISOString()
      });
  }
}

module.exports = new TransferService();