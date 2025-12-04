import { db } from '../db/database.js';

export class TransferService {
  
  async calculateTransfer(amount, fromCurrency, toCurrency) {
    const rates = await db.getExchangeRates();
    
    let exchangeRate, convertedAmount;
    
    if (fromCurrency === 'MWK' && toCurrency === 'ZMW') {
      exchangeRate = rates.MWK_ZMW || 0.03;
      convertedAmount = amount * exchangeRate;
    } else if (fromCurrency === 'ZMW' && toCurrency === 'MWK') {
      exchangeRate = rates.ZMW_MWK || 33.33;
      convertedAmount = amount * exchangeRate;
    } else {
      throw new Error('Unsupported currency pair');
    }
    
    // Calculate fees (1.5% or minimum 100)
    const feePercentage = 1.5;
    const minFee = 100;
    const fee = Math.max(amount * (feePercentage / 100), minFee);
    const totalAmount = amount + fee;
    
    return {
      exchangeRate,
      convertedAmount: parseFloat(convertedAmount.toFixed(2)),
      fee: parseFloat(fee.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      amount: parseFloat(amount),
      sourceCurrency: fromCurrency,
      destinationCurrency: toCurrency
    };
  }
  
  async processTransfer(transferData) {
    const {
      senderId,
      senderPhone,
      recipientPhone,
      amount,
      fromCountry,
      toCountry
    } = transferData;
    
    console.log(`📤 Processing transfer: ${amount} from ${fromCountry} to ${toCountry}`);
    
    // Get sender
    const sender = await db.getUserById(senderId);
    if (!sender) throw new Error(`Sender with ID ${senderId} not found`);
    
    // Get or create recipient
    let recipient = await db.getUserByPhone(recipientPhone);
    if (!recipient) {
      console.log(`👤 Creating new recipient: ${recipientPhone}`);
      recipient = await db.createUser({
        name: `User ${recipientPhone}`,
        phone: recipientPhone,
        country: toCountry,
        currency: toCountry === 'MW' ? 'MWK' : 'ZMW',
        balance: 0,
        is_verified: false
      });
    }
    
    // Calculate transfer
    const fromCurrency = fromCountry === 'MW' ? 'MWK' : 'ZMW';
    const toCurrency = toCountry === 'MW' ? 'MWK' : 'ZMW';
    
    const calculation = await this.calculateTransfer(amount, fromCurrency, toCurrency);
    
    // Check sender balance
    if (sender.balance < calculation.totalAmount) {
      throw new Error(`Insufficient balance. Available: ${sender.balance} ${fromCurrency}, Required: ${calculation.totalAmount} ${fromCurrency}`);
    }
    
    // Get merchants
    const sourceMerchant = await db.getMerchantByCountry(fromCountry);
    const destMerchant = await db.getMerchantByCountry(toCountry);
    
    if (!sourceMerchant || !destMerchant) {
      throw new Error('Merchant account not found');
    }
    
    // Check destination merchant balance
    if (destMerchant.balance < calculation.convertedAmount) {
      throw new Error(`Destination merchant has insufficient balance. Available: ${destMerchant.balance} ${toCurrency}, Required: ${calculation.convertedAmount} ${toCurrency}`);
    }
    
    try {
      console.log('💰 Starting transfer process...');
      
      // 1. Update sender balance
      console.log(`💳 Deducting ${calculation.totalAmount} ${fromCurrency} from sender`);
      const updatedSender = await db.updateUser(senderId, {
        balance: sender.balance - calculation.totalAmount
      });
      
      // 2. Update source merchant balance
      console.log(`📈 Adding ${calculation.totalAmount} ${fromCurrency} to ${sourceMerchant.name}`);
      await db.updateMerchant(sourceMerchant.id, {
        balance: sourceMerchant.balance + calculation.totalAmount
      });
      
      // 3. Update destination merchant balance (auto-payout)
      console.log(`📉 Deducting ${calculation.convertedAmount} ${toCurrency} from ${destMerchant.name}`);
      await db.updateMerchant(destMerchant.id, {
        balance: destMerchant.balance - calculation.convertedAmount
      });
      
      // 4. Update recipient balance
      console.log(`💸 Adding ${calculation.convertedAmount} ${toCurrency} to recipient`);
      const updatedRecipient = await db.updateUser(recipient.id, {
        balance: recipient.balance + calculation.convertedAmount
      });
      
      // 5. Create transaction record
      console.log('📝 Creating transaction record...');
      const transaction = await db.createTransaction({
        sender_id: senderId,
        sender_phone: senderPhone,
        recipient_id: recipient.id,
        recipient_phone: recipientPhone,
        amount: calculation.amount,
        from_country: fromCountry,
        to_country: toCountry,
        from_currency: fromCurrency,
        to_currency: toCurrency,
        exchange_rate: calculation.exchangeRate,
        converted_amount: calculation.convertedAmount,
        fee: calculation.fee,
        status: 'completed',
        payout_method: this.getRandomPayoutMethod(toCountry),
        merchant_from: sourceMerchant.id,
        merchant_to: destMerchant.id,
        settled: false,
        completed_at: new Date().toISOString()
      });
      
      console.log(`✅ Transfer completed! Transaction ID: ${transaction.transaction_id}`);
      
      return {
        success: true,
        message: 'Transfer completed successfully',
        transactionId: transaction.transaction_id,
        amountSent: calculation.amount,
        amountReceived: calculation.convertedAmount,
        fee: calculation.fee,
        exchangeRate: calculation.exchangeRate,
        sender: {
          id: senderId,
          name: sender.name,
          newBalance: updatedSender.balance,
          currency: fromCurrency
        },
        recipient: {
          id: recipient.id,
          phone: recipientPhone,
          newBalance: updatedRecipient.balance,
          currency: toCurrency
        },
        merchantBalances: {
          source: {
            name: sourceMerchant.name,
            newBalance: sourceMerchant.balance + calculation.totalAmount,
            currency: fromCurrency
          },
          destination: {
            name: destMerchant.name,
            newBalance: destMerchant.balance - calculation.convertedAmount,
            currency: toCurrency
          }
        },
        status: 'completed',
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Transfer failed:', error);
      throw new Error(`Transfer failed: ${error.message}`);
    }
  }
  
  getRandomPayoutMethod(country) {
    if (country === 'MW') {
      const methods = ['Airtel Money Malawi', 'TNM Mpamba', 'Standard Bank Malawi', 'NBS Bank'];
      return methods[Math.floor(Math.random() * methods.length)];
    } else {
      const methods = ['MTN Money Zambia', 'Airtel Money Zambia', 'Zanaco', 'Stanbic Bank Zambia'];
      return methods[Math.floor(Math.random() * methods.length)];
    }
  }
}

export const transferService = new TransferService();