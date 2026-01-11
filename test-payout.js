// test-payout-complete.js
const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';
const USER_ID = '655abc71-3e34-41fd-9488-8ca08075feae';

async function testCompletePayout() {
  console.log('🧪 COMPLETE PAYOUT TEST\n');
  console.log('='.repeat(50));
  
  // Test 1: Get quote
  console.log('\n1. 📊 Getting payout quote...');
  try {
    const quote = await axios.post(`${API_BASE}/payout/quote`, {
      senderUserId: USER_ID,
      recipientPhone: '+260961234567',
      amount: 500.00
    });
    
    console.log('Quote Details:');
    console.log(`   Send: ${quote.data.data.amount.sendAmount} ${quote.data.data.amount.sendCurrency}`);
    console.log(`   Receive: ${quote.data.data.amount.receiveAmount} ${quote.data.data.amount.receiveCurrency}`);
    console.log(`   FX Rate: ${quote.data.data.amount.fxRate}`);
    console.log(`   Fees: ${quote.data.data.fees.totalFee} ${quote.data.data.amount.sendCurrency}`);
    console.log(`   Total Deducted: ${quote.data.data.totals.totalToDeduct}`);
    console.log(`   Wallet Balance: ${quote.data.data.sender.currentBalance}`);
    
    // Check if sufficient balance
    if (quote.data.data.sender.currentBalance < quote.data.data.totals.totalToDeduct) {
      console.log('❌ Insufficient balance for this payout');
      return;
    }
    
    // Test 2: Execute payout
    console.log('\n2. 🚀 Executing payout...');
    const payout = await axios.post(`${API_BASE}/payout/execute`, {
      senderUserId: USER_ID,
      recipientPhone: '+260961234567',
      amount: 500.00,
      currency: 'MWK',
      isGuestPayout: false
    });
    
    console.log('✅ Payout Result:');
    console.log(`   Transaction ID: ${payout.data.data.transactionId}`);
    console.log(`   Amount Sent: ${payout.data.data.amountSent} ${payout.data.data.currencySent}`);
    console.log(`   Amount Received: ${payout.data.data.amountReceived} ${payout.data.data.currencyReceived}`);
    console.log(`   Fees Paid: ${payout.data.data.fees.totalFee}`);
    console.log(`   New Wallet Balance: ${payout.data.data.walletBalance}`);
    console.log(`   Mobile Provider Balance: ${payout.data.data.mobileProviderBalance}`);
    
    // Test 3: Verify balances
    console.log('\n3. 🔍 Verifying balances...');
    
    // Check wallet balance via API
    const balanceRes = await axios.get(`${API_BASE}/wallet/balance/${USER_ID}`);
    console.log('   Wallet API Balance:', balanceRes.data.data[0].availableBalance);
    
    // Check mobile provider
    const providerRes = await axios.post(`${API_BASE}/mobile-money/verify`, {
      phoneNumber: '+260961234567'
    });
    console.log('   Mobile Provider Balance:', providerRes.data.data.balance);
    
    console.log('\n🎉 TEST COMPLETED SUCCESSFULLY!');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.response?.data?.error || error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run test
testCompletePayout();