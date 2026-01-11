// src/services/wallet.service.js - UPDATED WITH FEES
const supabase = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const fxService = require('./fx.service');

class WalletService {
  async loadWallet(userId, phoneNumber, amount, currency) {
    console.log(`💰 Wallet load: ${userId} from ${phoneNumber} (${amount} ${currency})`);
    
    try {
      // 1. GET USER INFO
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError) throw new Error('User not found');
      if (!user.is_active) throw new Error('User account is inactive');

      // 2. CHECK MOBILE PROVIDER
      const { data: mobileProvider, error: providerError } = await supabase
        .from('mobile_providers')
        .select('*')
        .eq('phone_number', phoneNumber)
        .eq('is_active', true)
        .single();

      if (providerError) throw new Error('Mobile provider not found or inactive');
      
      // Check if user owns this mobile number
      if (user.phone_number !== phoneNumber) {
        console.warn(`⚠️ User ${user.phone_number} loading from different number ${phoneNumber}`);
      }

      // 3. GET USER'S PRIMARY WALLET
      const { data: wallet, error: walletError } = await supabase
        .from('wokopay_wallets')
        .select('*')
        .eq('user_id', userId)
        .eq('is_primary', true)
        .single();

      if (walletError) throw new Error('Primary wallet not found');

      // 4. CHECK IF CURRENCIES MATCH
      if (wallet.currency !== mobileProvider.currency) {
        console.warn(`⚠️ Currency mismatch: Wallet=${wallet.currency}, Provider=${mobileProvider.currency}`);
        // In production, you might want to block or convert
      }

      // 5. CALCULATE FEES FOR WALLET LOAD
      // Wallet load fees are typically lower than payout fees
      const feeDetails = this.calculateLoadFee(amount, wallet.country_code);
      const totalDeduction = parseFloat(amount) + feeDetails.totalFee;
      
      console.log(`💰 Load fees: ${feeDetails.totalFee} ${wallet.currency}`);
      console.log(`💰 Mobile provider deducts: ${totalDeduction} ${mobileProvider.currency}`);

      // 6. CHECK MOBILE PROVIDER BALANCE
      if (parseFloat(mobileProvider.balance) < totalDeduction) {
        throw new Error(`Insufficient mobile money balance. Need: ${totalDeduction}, Have: ${mobileProvider.balance}`);
      }

      // 7. GET COUNTRY ACCOUNT
      const { data: countryAccount } = await supabase
        .from('wokopay_country_accounts')
        .select('*')
        .eq('country_code', wallet.country_code)
        .single();

      if (!countryAccount) {
        throw new Error(`Country account not found for ${wallet.country_code}`);
      }

      // 8. EXECUTE ALL UPDATES
      console.log('💾 Processing wallet load...');

      const updates = [];

      // 8A. DEDUCT FROM MOBILE PROVIDER (including fees)
      const providerNewBalance = parseFloat(mobileProvider.balance) - totalDeduction;
      updates.push(
        supabase
          .from('mobile_providers')
          .update({ 
            balance: providerNewBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', mobileProvider.id)
      );

      // 8B. ADD TO WALLET (amount only, not fees)
      const walletNewBalance = parseFloat(wallet.available_balance) + parseFloat(amount);
      updates.push(
        supabase
          .from('wokopay_wallets')
          .update({ 
            available_balance: walletNewBalance,
            last_transaction_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', wallet.id)
      );

      // 8C. UPDATE COUNTRY ACCOUNT
      // Country account receives the FULL amount (including fees paid by user)
      const countryIncomingPool = parseFloat(countryAccount.incoming_pool) + parseFloat(totalDeduction);
      const countryNewBalance = parseFloat(countryAccount.current_balance) + parseFloat(totalDeduction);
      
      updates.push(
        supabase
          .from('wokopay_country_accounts')
          .update({
            incoming_pool: countryIncomingPool,
            current_balance: countryNewBalance,
            updated_at: new Date().toISOString()
          })
          .eq('id', countryAccount.id)
      );

      // Execute updates
      const updateResults = await Promise.all(updates);
      for (const result of updateResults) {
        if (result.error) throw new Error('Update failed: ' + result.error.message);
      }

      console.log('✅ Balances updated');

      // 9. CREATE TRANSACTION RECORD
      const transactionRef = `WLT${Date.now()}${uuidv4().slice(0, 8).toUpperCase()}`;
      const transactionData = {
        transaction_ref: transactionRef,
        transaction_type: 'wallet_load',
        sender_user_id: userId,
        sender_phone: phoneNumber,
        sender_country: wallet.country_code,
        sender_currency: wallet.currency,
        recipient_wallet_id: wallet.id,
        recipient_user_id: userId,
        recipient_phone: user.phone_number,
        recipient_country: wallet.country_code,
        recipient_currency: wallet.currency,
        amount: parseFloat(amount),
        currency: wallet.currency,
        fee_amount: feeDetails.totalFee,
        total_amount: totalDeduction,
        source_country_account_id: countryAccount.id,
        destination_country_account_id: countryAccount.id, // Same country for wallet load
        status: 'completed',
        description: `Wallet load from ${mobileProvider.provider_name}`,
        completed_at: new Date().toISOString()
      };

      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert(transactionData)
        .select()
        .single();

      if (transactionError) throw new Error('Failed to create transaction: ' + transactionError.message);

      // 10. CREATE AUDIT LOG
      await supabase
        .from('audit_logs')
        .insert({
          action_type: 'WALLET_LOAD',
          table_name: 'wokopay_wallets',
          record_id: wallet.id,
          old_values: { 
            wallet_balance: wallet.available_balance,
            provider_balance: mobileProvider.balance,
            country_balance: countryAccount.current_balance
          },
          new_values: { 
            wallet_balance: walletNewBalance,
            provider_balance: providerNewBalance,
            country_balance: countryNewBalance
          },
          changed_by: userId,
          changed_by_system: false,
          created_at: new Date().toISOString()
        });

      console.log('🎉 Wallet load completed!');
      
      return {
        success: true,
        transactionId: transaction.id,
        transactionRef: transaction.transaction_ref,
        amountLoaded: parseFloat(amount),
        currency: wallet.currency,
        fees: {
          baseFee: feeDetails.baseFee,
          percentageFee: feeDetails.percentageFee,
          totalFee: feeDetails.totalFee,
          percentageRate: feeDetails.percentageRate
        },
        mobileProviderDeduction: totalDeduction,
        balances: {
          wallet: {
            old: wallet.available_balance,
            new: walletNewBalance,
            change: `+${amount}`
          },
          mobileProvider: {
            name: mobileProvider.provider_name,
            old: mobileProvider.balance,
            new: providerNewBalance,
            change: `-${totalDeduction}`
          },
          countryAccount: {
            country: countryAccount.country_code,
            old: countryAccount.current_balance,
            new: countryNewBalance,
            change: `+${totalDeduction}`
          }
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Wallet load failed:', error.message);
      throw error;
    }
  }

  calculateLoadFee(amount, countryCode) {
    const amountNum = parseFloat(amount);
    
    // Wallet load fees are typically lower than payout fees
    // Base fee + small percentage
    const baseFee = 2.00; // Lower base fee for loading
    const percentage = 0.005; // 0.5% for wallet loads
    
    const percentageFee = amountNum * percentage;
    const totalFee = baseFee + percentageFee;
    
    return {
      baseFee: baseFee,
      percentageFee: parseFloat(percentageFee.toFixed(2)),
      totalFee: parseFloat(totalFee.toFixed(2)),
      percentageRate: percentage * 100
    };
  }

  async calculateLoadQuote(userId, phoneNumber, amount) {
    console.log(`📊 Calculating load quote for ${userId}`);
    
    try {
      // Get user info
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (!user) throw new Error('User not found');

      // Get mobile provider
      const { data: mobileProvider } = await supabase
        .from('mobile_providers')
        .select('*')
        .eq('phone_number', phoneNumber)
        .eq('is_active', true)
        .single();

      if (!mobileProvider) throw new Error('Mobile provider not found');

      // Get user's primary wallet
      const { data: wallet } = await supabase
        .from('wokopay_wallets')
        .select('*')
        .eq('user_id', userId)
        .eq('is_primary', true)
        .single();

      if (!wallet) throw new Error('Wallet not found');

      // Get country account
      const { data: countryAccount } = await supabase
        .from('wokopay_country_accounts')
        .select('*')
        .eq('country_code', wallet.country_code)
        .single();

      // Calculate fees
      const feeDetails = this.calculateLoadFee(amount, wallet.country_code);
      const totalDeduction = parseFloat(amount) + feeDetails.totalFee;

      // Check if mobile provider has enough
      const hasSufficientBalance = parseFloat(mobileProvider.balance) >= totalDeduction;

      return {
        success: true,
        quoteId: `LQT${Date.now()}${uuidv4().slice(0, 8).toUpperCase()}`,
        user: {
          id: userId,
          phone: user.phone_number,
          name: user.full_name
        },
        wallet: {
          id: wallet.id,
          currency: wallet.currency,
          currentBalance: wallet.available_balance,
          country: wallet.country_code
        },
        mobileProvider: {
          name: mobileProvider.provider_name,
          phone: mobileProvider.phone_number,
          currency: mobileProvider.currency,
          currentBalance: mobileProvider.balance,
          hasSufficientBalance: hasSufficientBalance,
          required: totalDeduction
        },
        amount: {
          loadAmount: parseFloat(amount),
          currency: wallet.currency
        },
        fees: {
          baseFee: feeDetails.baseFee,
          percentageFee: feeDetails.percentageFee,
          totalFee: feeDetails.totalFee,
          percentageRate: feeDetails.percentageRate
        },
        totals: {
          mobileProviderDeducts: totalDeduction,
          walletReceives: parseFloat(amount),
          netCostToUser: totalDeduction // What user pays from mobile money
        },
        countryAccount: countryAccount ? {
          id: countryAccount.id,
          country: countryAccount.country_code,
          currentBalance: countryAccount.current_balance,
          receives: totalDeduction
        } : null,
        timestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      };
    } catch (error) {
      console.error('Load quote error:', error);
      throw error;
    }
  }

  async getWalletBalance(userId) {
    try {
      const { data: wallets, error } = await supabase
        .from('wokopay_wallets')
        .select(`
          *,
          countries (
            name,
            currency_code
          )
        `)
        .eq('user_id', userId)
        .eq('wallet_status', 'active');

      if (error) throw error;

      // Get total balance across all wallets
      let totalBalance = 0;
      const walletDetails = wallets.map(wallet => {
        totalBalance += parseFloat(wallet.available_balance || 0);
        return {
          id: wallet.id,
          country: wallet.country_code,
          currency: wallet.currency,
          availableBalance: wallet.available_balance,
          pendingBalance: wallet.pending_balance,
          isPrimary: wallet.is_primary,
          travelAccess: wallet.travel_access,
          status: wallet.wallet_status,
          lastTransaction: wallet.last_transaction_at,
          countryName: wallet.countries?.name
        };
      });

      return {
        wallets: walletDetails,
        summary: {
          totalWallets: wallets.length,
          totalBalance: totalBalance,
          primaryWallet: walletDetails.find(w => w.isPrimary)
        }
      };
    } catch (error) {
      console.error('Get balance error:', error);
      throw error;
    }
  }

  async getWalletTransactions(userId, limit = 10, offset = 0) {
    try {
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select(`
          *,
          payout_instructions (*)
        `)
        .or(`sender_user_id.eq.${userId},recipient_user_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const { count } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .or(`sender_user_id.eq.${userId},recipient_user_id.eq.${userId}`);

      // Categorize transactions
      const categorized = {
        loads: [],
        payouts: [],
        transfers: [],
        others: []
      };

      transactions.forEach(tx => {
        const txData = {
          id: tx.id,
          ref: tx.transaction_ref,
          type: tx.transaction_type,
          amount: tx.amount,
          currency: tx.currency,
          fee: tx.fee_amount,
          total: tx.total_amount,
          status: tx.status,
          date: tx.created_at,
          description: tx.description
        };

        if (tx.transaction_type.includes('load')) {
          categorized.loads.push(txData);
        } else if (tx.transaction_type.includes('payout') || tx.transaction_type.includes('cashout')) {
          categorized.payouts.push(txData);
        } else if (tx.transaction_type.includes('transfer')) {
          categorized.transfers.push(txData);
        } else {
          categorized.others.push(txData);
        }
      });

      return {
        transactions: categorized,
        total: count || 0,
        limit: limit,
        offset: offset
      };
    } catch (error) {
      console.error('Transactions error:', error);
      throw error;
    }
  }

  async createWallet(userId, countryCode, isPrimary = false) {
    try {
      // Check if user exists
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (!user) throw new Error('User not found');

      // Get country info
      const { data: country } = await supabase
        .from('countries')
        .select('*')
        .eq('code', countryCode)
        .single();

      if (!country) throw new Error('Country not found');

      // Check if user already has a wallet for this country
      const { data: existingWallets } = await supabase
        .from('wokopay_wallets')
        .select('*')
        .eq('user_id', userId)
        .eq('country_code', countryCode);

      if (existingWallets && existingWallets.length > 0) {
        throw new Error(`User already has a wallet for ${country.name}`);
      }

      // If this is primary, unset any existing primary wallets
      if (isPrimary) {
        await supabase
          .from('wokopay_wallets')
          .update({ is_primary: false })
          .eq('user_id', userId)
          .eq('is_primary', true);
      }

      // Create new wallet
      const { data: wallet, error: walletError } = await supabase
        .from('wokopay_wallets')
        .insert({
          user_id: userId,
          country_code: countryCode,
          currency: country.currency_code,
          available_balance: 0.00,
          is_primary: isPrimary,
          wallet_status: 'active',
          travel_access: true
        })
        .select()
        .single();

      if (walletError) throw walletError;

      // Create audit log
      await supabase
        .from('audit_logs')
        .insert({
          action_type: 'WALLET_CREATED',
          table_name: 'wokopay_wallets',
          record_id: wallet.id,
          old_values: {},
          new_values: {
            userId: userId,
            country: countryCode,
            currency: country.currency_code,
            isPrimary: isPrimary
          },
          changed_by: userId,
          created_at: new Date().toISOString()
        });

      return {
        success: true,
        walletId: wallet.id,
        country: countryCode,
        currency: country.currency_code,
        isPrimary: isPrimary
      };
    } catch (error) {
      console.error('Create wallet error:', error);
      throw error;
    }
  }
}

module.exports = new WalletService();