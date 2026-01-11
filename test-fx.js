// test-fx.js
const fxService = require('./src/services/fx.service');

async function testFxRates() {
  console.log('🧪 Testing FX Rates\n');
  
  const testPairs = [
    { from: 'MWK', to: 'ZMW', amount: 1000 },
    { from: 'MWK', to: 'USD', amount: 1000 },
    { from: 'USD', to: 'MWK', amount: 100 },
    { from: 'ZMW', to: 'MWK', amount: 100 },
    { from: 'MWK', to: 'MWK', amount: 1000 }
  ];
  
  for (const pair of testPairs) {
    console.log(`\n📊 ${pair.from} → ${pair.to}:`);
    try {
      const result = await fxService.convertAmount(pair.from, pair.to, pair.amount);
      console.log(`   ${pair.amount} ${pair.from} = ${result.convertedAmount} ${pair.to}`);
      console.log(`   Rate: 1 ${pair.from} = ${result.rate} ${pair.to}`);
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n💰 Testing Fee Calculations:');
  console.log('Local (MW to MW):', fxService.calculateFee(1000, 'MW', 'MW', false));
  console.log('Cross-border (MW to ZM):', fxService.calculateFee(1000, 'MW', 'ZM', true));
  console.log('Cross-border (MW to ZM, 10000):', fxService.calculateFee(10000, 'MW', 'ZM', true));
}

testFxRates();