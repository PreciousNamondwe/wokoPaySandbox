// src/services/payout.service.js - COMPLETE UPDATED VERSION
const supabase = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const fxService = require('./fx.service');

class PayoutService {
  async cashoutToMobileMoney(senderUserId, recipientPhone, amount, currency, isGuestPayout = false) {
    console.log(`🚀 Starting payout: ${senderUserId} -> ${recipientPhone} (${amount} ${currency})`);
    
    try {
      // 1. GET SENDER INFO
      const { data: sender, error: senderError } = await supabase
        .from('users')
        .select('*')
        .eq('id', senderUserId)
        .single();

      if (senderError) throw new Error('Sender not found: ' + senderError.message);
      if (!sender.is_active) throw new Error('Sender account is inactive');

      // 2. GET SENDER'S PRIMARY WALLET
      const { data: senderWallet, error: walletError } = await supabase
        .from('wokopay_wallets')
        .select('*')
        .eq('user_id', senderUserId)
        .eq('is_primary', true)
        .single();

      if (walletError) throw new Error('Primary wallet not found: ' + walletError.message);

      // 3. CHECK IF RECIPIENT IS REGISTERED USER
      const { data: recipientUser } = await supabase
        .from('users')
        .select('*')
        .eq('phone_number', recipientPhone)
        .single();

      // 4. GET MOBILE PROVIDER (DESTINATION COUNTRY)
      const { data: mobileProvider, error: providerError } = await supabase
        .from('mobile_providers')
        .select('*')
        .eq('phone_number', recipientPhone)
        .eq('is_active', true)
        .single();

      if (providerError) throw new Error('Mobile provider not found or inactive: ' + providerError.message);

      // 5. GET BOTH COUNTRY ACCOUNTS
      const { data: fromCountryAccount } = await supabase
        .from('wokopay_country_accounts')
        .select('*')
        .eq('country_code', senderWallet.country_code)
        .single();

      const { data: toCountryAccount } = await supabase
        .from('wokopay_country_accounts')
        .select('*')
        .eq('country_code', mobileProvider.country_code)
        .single();

      if (!fromCountryAccount) throw new Error(`WokoPay account not found for ${senderWallet.country_code}`);
      if (!toCountryAccount) throw new Error(`WokoPay account not found for ${mobileProvider.country_code}`);

      const isCrossBorder = senderWallet.country_code !== mobileProvider.country_code;
      
      console.log(`🌍 Payment Flow:`);
      console.log(`   1. User in ${senderWallet.country_code} pays WokoPay`);
      console.log(`   2. ${fromCountryAccount.country_code} WokoPay: INCREASES balance (receives)`);
      console.log(`   3. ${toCountryAccount.country_code} WokoPay: DECREASES balance (pays)`);
      console.log(`   4. ${mobileProvider.provider_name}: INCREASES balance (receives)`);
      console.log(`   Cross-border: ${isCrossBorder ? 'Yes' : 'No'}`);

      // 6. FX CONVERSION
      let convertedAmount = parseFloat(amount);
      let fxRate = 1.0;
      let needsConversion = false;

      if (senderWallet.currency !== mobileProvider.currency) {
        needsConversion = true;
        const conversion = await fxService.convertAmount(
          senderWallet.currency,
          mobileProvider.currency,
          amount
        );
        convertedAmount = conversion.convertedAmount;
        fxRate = conversion.rate;
        console.log(`💱 FX Rate: 1 ${senderWallet.currency} = ${fxRate} ${mobileProvider.currency}`);
        console.log(`💱 Converted: ${amount} ${senderWallet.currency} = ${convertedAmount} ${mobileProvider.currency}`);
      }

      // 7. FEE CALCULATION
      const feeDetails = fxService.calculateFee(
        amount,
        senderWallet.country_code,
        mobileProvider.country_code,
        isCrossBorder
      );

      let guestSurcharge = 0;
      if (isGuestPayout && !recipientUser) {
        guestSurcharge = 10.00;
      }

      const totalFee = feeDetails.totalFee + guestSurcharge;
      const totalDeduction = parseFloat(amount) + totalFee;

      console.log(`💰 Fees: Base=${feeDetails.baseFee}, Percentage=${feeDetails.percentageFee}, Guest=${guestSurcharge}, Total=${totalFee}`);
      console.log(`💰 Total from user: ${totalDeduction} ${senderWallet.currency}`);

      // 8. CHECK BALANCES
      if (parseFloat(senderWallet.available_balance) < totalDeduction) {
        throw new Error(`Insufficient wallet balance. Need: ${totalDeduction}, Have: ${senderWallet.available_balance}`);
      }

      if (parseFloat(toCountryAccount.current_balance) < convertedAmount) {
        console.warn(`⚠️ ${toCountryAccount.country_code} WokoPay low balance: ${toCountryAccount.current_balance} < ${convertedAmount}`);
        // In production, trigger alert or block transaction
      }

      // 9. EXECUTE ALL DATABASE UPDATES
      console.log('💾 Processing settlement...');

      const updates = [];

      // 9A. DEDUCT FROM SENDER WALLET
      const senderNewBalance = parseFloat(senderWallet.available_balance) - totalDeduction;
      updates.push(
        supabase
          .from('wokopay_wallets')
          .update({
            available_balance: senderNewBalance,
            last_transaction_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', senderWallet.id)
      );

      // 9B. ADD TO MOBILE PROVIDER (PAID BY DESTINATION WOKOPAY)
      const providerNewBalance = parseFloat(mobileProvider.balance) + convertedAmount;
      updates.push(
        supabase
          .from('mobile_providers')
          .update({
            balance: providerNewBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', mobileProvider.id)
      );

      // 9C. SOURCE COUNTRY: RECEIVES MONEY FROM USER
      const fromIncomingPool = parseFloat(fromCountryAccount.incoming_pool) + parseFloat(totalDeduction);
      const fromNewBalance = parseFloat(fromCountryAccount.current_balance) + parseFloat(totalDeduction);
      updates.push(
        supabase
          .from('wokopay_country_accounts')
          .update({
            incoming_pool: fromIncomingPool,
            current_balance: fromNewBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', fromCountryAccount.id)
      );

      // 9D. DESTINATION COUNTRY: PAYS OUT TO MOBILE PROVIDER
      const toOutgoingPool = parseFloat(toCountryAccount.outgoing_pool) + parseFloat(convertedAmount);
      const toNewBalance = parseFloat(toCountryAccount.current_balance) - parseFloat(convertedAmount);
      updates.push(
        supabase
          .from('wokopay_country_accounts')
          .update({
            outgoing_pool: toOutgoingPool,
            current_balance: toNewBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', toCountryAccount.id)
      );

      // Execute all updates
      const updateResults = await Promise.all(updates);
      
      for (const result of updateResults) {
        if (result.error) throw new Error('Database update failed: ' + result.error.message);
      }

      console.log('✅ All balances updated successfully');

      // 10. CREATE TRANSACTION RECORD
      const transactionRef = `PAY${Date.now()}${uuidv4().slice(0, 8).toUpperCase()}`;
      const transactionData = {
        transaction_ref: transactionRef,
        transaction_type: isGuestPayout ? 'guest_payout' : 'wallet_cashout',
        sender_user_id: senderUserId,
        sender_wallet_id: senderWallet.id,
        sender_phone: sender.phone_number,
        sender_country: senderWallet.country_code,
        sender_currency: senderWallet.currency,
        recipient_phone: recipientPhone,
        recipient_country: mobileProvider.country_code,
        recipient_currency: mobileProvider.currency,
        amount: parseFloat(amount),
        currency: senderWallet.currency,
        fee_amount: totalFee,
        total_amount: totalDeduction,
        fx_rate: needsConversion ? fxRate : null,
        converted_amount: needsConversion ? convertedAmount : null,
        converted_currency: needsConversion ? mobileProvider.currency : null,
        source_country_account_id: fromCountryAccount.id,
        destination_country_account_id: toCountryAccount.id,
        is_travel_transaction: sender.is_traveling || false,
        status: 'completed',
        description: `Payout to ${mobileProvider.provider_name} via ${toCountryAccount.country_code} WokoPay`,
        completed_at: new Date().toISOString()
      };

      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert(transactionData)
        .select()
        .single();

      if (transactionError) throw new Error('Failed to create transaction: ' + transactionError.message);

      // 11. CREATE PAYOUT INSTRUCTION
      const instructionRef = `PIO${Date.now()}${uuidv4().slice(0, 8).toUpperCase()}`;
      
      const payoutInstructionData = {
        instruction_ref: instructionRef,
        from_country: senderWallet.country_code,
        from_country_account_id: fromCountryAccount.id,
        to_country: mobileProvider.country_code,
        to_country_account_id: toCountryAccount.id,
        amount: parseFloat(amount),
        currency: senderWallet.currency,
        fx_rate: fxRate,
        converted_amount: convertedAmount,
        converted_currency: mobileProvider.currency,
        payout_to_phone: recipientPhone,
        payout_provider_name: mobileProvider.provider_name,
        payout_method: 'mobile_money',
        source_transaction_id: transaction.id,
        destination_transaction_id: null,
        status: 'payout_completed',
        is_guest_payout: isGuestPayout && !recipientUser,
        guest_surcharge: guestSurcharge,
        processing_notes: `Local-to-local: ${fromCountryAccount.country_code} receives, ${toCountryAccount.country_code} pays`,
        processed_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      };

      const { data: payoutInstruction, error: instructionError } = await supabase
        .from('payout_instructions')
        .insert(payoutInstructionData)
        .select()
        .single();

      if (instructionError) {
        console.error('Payout instruction error:', instructionError.message);
      } else {
        await supabase
          .from('transactions')
          .update({
            payout_instruction_id: payoutInstruction.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', transaction.id);
      }

      // 12. CREATE INTERCOUNTRY SETTLEMENT FOR CROSS-BORDER
      if (isCrossBorder) {
        await this.createIntercountrySettlement(
          fromCountryAccount.country_code,
          toCountryAccount.country_code,
          convertedAmount,
          payoutInstruction?.id,
          transaction.id
        );
      }

      // 13. CREATE AUDIT LOG
      await supabase
        .from('audit_logs')
        .insert({
          action_type: 'PAYOUT_COMPLETED',
          table_name: 'transactions',
          record_id: transaction.id,
          old_values: {
            sender_wallet: senderWallet.available_balance,
            from_country_balance: fromCountryAccount.current_balance,
            to_country_balance: toCountryAccount.current_balance,
            provider_balance: mobileProvider.balance
          },
          new_values: {
            sender_wallet: senderNewBalance,
            from_country_balance: fromNewBalance,
            to_country_balance: toNewBalance,
            provider_balance: providerNewBalance
          },
          changed_by: senderUserId,
          changed_by_system: false,
          created_at: new Date().toISOString()
        });

      console.log('🎉 Payout completed successfully!');
      
      return {
        success: true,
        transactionId: transaction.id,
        transactionRef: transaction.transaction_ref,
        payoutInstructionId: payoutInstruction?.id,
        amountDetails: {
          sent: parseFloat(amount),
          sentCurrency: senderWallet.currency,
          received: convertedAmount,
          receivedCurrency: mobileProvider.currency,
          fxRate: fxRate
        },
        fees: {
          baseFee: feeDetails.baseFee,
          percentageFee: feeDetails.percentageFee,
          guestSurcharge: guestSurcharge,
          totalFee: totalFee
        },
        balances: {
          senderWallet: {
            old: senderWallet.available_balance,
            new: senderNewBalance,
            change: -totalDeduction
          },
          fromCountryAccount: {
            country: fromCountryAccount.country_code,
            old: fromCountryAccount.current_balance,
            new: fromNewBalance,
            change: `+${totalDeduction}`,
            type: 'RECEIVED'
          },
          toCountryAccount: {
            country: toCountryAccount.country_code,
            old: toCountryAccount.current_balance,
            new: toNewBalance,
            change: `-${convertedAmount}`,
            type: 'PAID OUT'
          },
          mobileProvider: {
            name: mobileProvider.provider_name,
            old: mobileProvider.balance,
            new: providerNewBalance,
            change: `+${convertedAmount}`,
            type: 'RECEIVED'
          }
        },
        settlement: isCrossBorder ? {
          owing: `${fromCountryAccount.country_code} owes ${toCountryAccount.country_code}`,
          amount: convertedAmount,
          currency: mobileProvider.currency
        } : null,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Payout failed:', error.message);
      throw error;
    }
  }

  async createIntercountrySettlement(fromCountry, toCountry, amount, payoutInstructionId, transactionId) {
    try {
      const settlementRef = `STL${Date.now()}${uuidv4().slice(0, 8).toUpperCase()}`;
      
      await supabase
        .from('intercountry_settlements')
        .insert({
          settlement_ref: settlementRef,
          from_country: fromCountry,
          to_country: toCountry,
          settlement_amount: amount,
          settlement_currency: toCountry,
          instruction_ids: payoutInstructionId ? [payoutInstructionId] : [],
          total_instructions: payoutInstructionId ? 1 : 0,
          status: 'pending',
          settlement_method: 'bilateral',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      console.log(`✅ Settlement record created: ${fromCountry} owes ${toCountry} ${amount}`);
    } catch (error) {
      console.error('Settlement error:', error);
    }
  }

  async calculatePayoutQuote(senderUserId, recipientPhone, amount) {
    try {
      const { data: senderWallet, error: walletError } = await supabase
        .from('wokopay_wallets')
        .select('*')
        .eq('user_id', senderUserId)
        .eq('is_primary', true)
        .single();

      if (walletError) throw new Error('Sender wallet not found');

      const { data: mobileProvider, error: providerError } = await supabase
        .from('mobile_providers')
        .select('*')
        .eq('phone_number', recipientPhone)
        .eq('is_active', true)
        .single();

      if (providerError) throw new Error('Mobile provider not found');

      const { data: recipientUser } = await supabase
        .from('users')
        .select('*')
        .eq('phone_number', recipientPhone)
        .single();

      const { data: fromCountryAccount } = await supabase
        .from('wokopay_country_accounts')
        .select('*')
        .eq('country_code', senderWallet.country_code)
        .single();

      const { data: toCountryAccount } = await supabase
        .from('wokopay_country_accounts')
        .select('*')
        .eq('country_code', mobileProvider.country_code)
        .single();

      let convertedAmount = parseFloat(amount);
      let fxRate = 1.0;
      const isCrossBorder = senderWallet.country_code !== mobileProvider.country_code;

      if (senderWallet.currency !== mobileProvider.currency) {
        const conversion = await fxService.convertAmount(
          senderWallet.currency,
          mobileProvider.currency,
          amount
        );
        convertedAmount = conversion.convertedAmount;
        fxRate = conversion.rate;
      }

      const feeDetails = fxService.calculateFee(
        amount,
        senderWallet.country_code,
        mobileProvider.country_code,
        isCrossBorder
      );

      let guestSurcharge = 0;
      if (!recipientUser) {
        guestSurcharge = 10.00;
      }

      const totalFee = feeDetails.totalFee + guestSurcharge;
      const totalDeduction = parseFloat(amount) + totalFee;

      return {
        success: true,
        quoteId: `QTE${Date.now()}${uuidv4().slice(0, 8).toUpperCase()}`,
        sender: {
          userId: senderUserId,
          currency: senderWallet.currency,
          currentBalance: senderWallet.available_balance,
          country: senderWallet.country_code
        },
        recipient: {
          phone: recipientPhone,
          provider: mobileProvider.provider_name,
          country: mobileProvider.country_code,
          currency: mobileProvider.currency,
          isRegistered: !!recipientUser
        },
        amount: {
          sendAmount: parseFloat(amount),
          sendCurrency: senderWallet.currency,
          receiveAmount: parseFloat(convertedAmount.toFixed(2)),
          receiveCurrency: mobileProvider.currency,
          fxRate: parseFloat(fxRate.toFixed(6))
        },
        fees: {
          baseFee: feeDetails.baseFee,
          percentageFee: feeDetails.percentageFee,
          guestSurcharge: guestSurcharge,
          totalFee: parseFloat(totalFee.toFixed(2))
        },
        totals: {
          totalToDeduct: parseFloat(totalDeduction.toFixed(2)),
          willReceive: parseFloat(convertedAmount.toFixed(2)),
          isCrossBorder: isCrossBorder
        },
        countryAccounts: {
          from: {
            id: fromCountryAccount?.id,
            country: fromCountryAccount?.country_code,
            balance: fromCountryAccount?.current_balance,
            action: 'RECEIVES'
          },
          to: {
            id: toCountryAccount?.id,
            country: toCountryAccount?.country_code,
            balance: toCountryAccount?.current_balance,
            action: 'PAYS'
          }
        },
        timestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      };
    } catch (error) {
      console.error('Quote error:', error);
      throw error;
    }
  }

  async getPayoutStatus(transactionId) {
    try {
      const { data: transaction } = await supabase
        .from('transactions')
        .select(`
          *,
          payout_instructions (*),
          source_country_account:wokopay_country_accounts!transactions_source_country_account_id_fkey (
            country_code,
            currency
          ),
          destination_country_account:wokopay_country_accounts!transactions_destination_country_account_id_fkey (
            country_code,
            currency
          )
        `)
        .eq('id', transactionId)
        .single();

      if (!transaction) throw new Error('Transaction not found');

      return {
        success: true,
        data: transaction
      };
    } catch (error) {
      console.error('Status error:', error);
      throw error;
    }
  }

  async getPayoutHistory(userId, limit = 10, offset = 0) {
    try {
      const { data: transactions } = await supabase
        .from('transactions')
        .select(`
          *,
          payout_instructions (*)
        `)
        .eq('sender_user_id', userId)
        .in('transaction_type', ['wallet_cashout', 'guest_payout'])
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('sender_user_id', userId)
        .in('transaction_type', ['wallet_cashout', 'guest_payout']);

      return {
        success: true,
        data: {
          transactions: transactions || [],
          total: count || 0,
          limit: limit,
          offset: offset
        }
      };
    } catch (error) {
      console.error('History error:', error);
      throw error;
    }
  }

  async retryFailedPayout(payoutInstructionId) {
    try {
      const { data: payoutInstruction } = await supabase
        .from('payout_instructions')
        .select('*')
        .eq('id', payoutInstructionId)
        .eq('status', 'failed')
        .single();

      if (!payoutInstruction) throw new Error('Failed payout instruction not found');

      await supabase
        .from('payout_instructions')
        .update({
          retry_count: (payoutInstruction.retry_count || 0) + 1,
          last_retry_at: new Date().toISOString(),
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', payoutInstructionId);

      // Simulate retry success
      await supabase
        .from('payout_instructions')
        .update({
          status: 'payout_completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', payoutInstructionId);

      return {
        success: true,
        message: 'Payout retry completed'
      };
    } catch (error) {
      console.error('Retry error:', error);
      throw error;
    }
  }
}

module.exports = new PayoutService();