import app from './src/app.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3000;

// Start settlement checker (every 3 minutes)
let settlementInterval;
function startSettlementChecker() {
  console.log('Starting settlement checker (every 3 minutes)');
  
  const checkSettlement = async () => {
    try {
      const { settlementService } = await import('./src/services/settlement.service.js');
      const summary = await settlementService.getSettlementSummary();
      
      if (summary.unsettledCount > 0) {
        console.log('\n SETTLEMENT LEDGER CHECK:');
        console.log(`   Unsettled transactions: ${summary.unsettledCount}`);
        console.log(`   Net settlement: ${summary.netSettlement.amount} ZMW ${summary.netSettlement.direction}`);
        console.log(`   Action: ${summary.netSettlement.description}`);
        console.log(`   Check: http://localhost:${PORT}/api/settlement/ledger`);
      } else {
        console.log('✅ All transactions are settled');
      }
    } catch (error) {
      console.error('Settlement check error:', error.message);
    }
  };
  
  // Run immediately
  checkSettlement();
  
  // Then every 3 minutes
  settlementInterval = setInterval(checkSettlement, 3 * 60 * 1000);
}

// Graceful shutdown
function gracefulShutdown() {
  console.log('\n🛑 Shutting down gracefully...');
  
  if (settlementInterval) {
    clearInterval(settlementInterval);
    console.log('✅ Settlement checker stopped');
  }
  
  console.log('👋 Goodbye!');
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Start server
app.listen(PORT, () => {
  console.log(`
  🚀 WokoPay API with Supabase
  📍 Port: ${PORT}
  🗄️  Database: Supabase
  
  📋 Available Endpoints:
  POST /api/send              - Send money (auto-payout)
  GET  /api/settlement/ledger - Settlement ledger
  GET  /api/settlement/summary - Settlement summary
  GET  /api/settlement/history - Settlement history
  POST /api/settlement/mark-settled - Mark as settled
  GET  /api/users             - View users
  GET  /api/merchants         - View merchants
  GET  /api/transactions      - View transactions
  
  🔧 Database Setup:
  1. Go to Supabase Dashboard → SQL Editor
  2. Copy SQL from src/supabase/schema.sql
  3. Run the SQL to create tables
  4. Your database will be ready!
  `);
  
  // Start settlement checker
  startSettlementChecker();
});