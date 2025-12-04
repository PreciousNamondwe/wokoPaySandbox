import { db } from '../db/database.js';

export class SettlementService {
  
  async getSettlementSummary() {
    const unsettled = await db.getUnsettledTransactions();
    
    let mwOwesZm = 0; // ZMW value MW needs to send to ZM
    let zmOwesMw = 0; // ZMW equivalent value ZM needs to send to MW
    
    unsettled.forEach(tx => {
      if (tx.from_country === 'MW' && tx.to_country === 'ZM') {
        mwOwesZm += tx.converted_amount;
      } else if (tx.from_country === 'ZM' && tx.to_country === 'MW') {
        zmOwesMw += (tx.converted_amount * 0.03); // Convert to ZMW
      }
    });
    
    const netPosition = mwOwesZm - zmOwesMw;
    
    return {
      timestamp: new Date().toISOString(),
      unsettledCount: unsettled.length,
      positions: {
        mwOwesZm: {
          amount: parseFloat(mwOwesZm.toFixed(2)),
          currency: 'ZMW',
          description: 'Value MW needs to transfer to ZM'
        },
        zmOwesMw: {
          amount: parseFloat(zmOwesMw.toFixed(2)),
          currency: 'ZMW',
          description: 'Value ZM needs to transfer to MW (in ZMW equivalent)'
        }
      },
      netSettlement: {
        amount: parseFloat(Math.abs(netPosition).toFixed(2)),
        currency: 'ZMW',
        direction: netPosition > 0 ? 'MW → ZM' : 'ZM → MW',
        description: netPosition > 0 
          ? `MW should send ${Math.abs(netPosition).toFixed(2)} ZMW value to ZM`
          : `ZM should send ${Math.abs(netPosition).toFixed(2)} ZMW equivalent value to MW`
      },
      unsettledTransactions: unsettled.map(tx => ({
        id: tx.transaction_id,
        from: `${tx.from_country} (${tx.amount} ${tx.from_currency})`,
        to: `${tx.to_country} (${tx.converted_amount} ${tx.to_currency})`,
        fee: `${tx.fee} ${tx.from_currency}`,
        date: tx.created_at
      }))
    };
  }
  
  async markAsSettled(transactionIds, settlementReference) {
    if (!transactionIds || !Array.isArray(transactionIds)) {
      throw new Error('transactionIds must be an array');
    }
    
    const result = await db.markTransactionsAsSettled(
      transactionIds, 
      settlementReference || `SETTLE_${Date.now()}`
    );
    
    return {
      success: true,
      settledCount: result.length,
      settledTransactions: result.map(t => t.transaction_id),
      settlementReference,
      timestamp: new Date().toISOString()
    };
  }
  
  async getSettlementHistory() {
    const transactions = await db.getTransactions();
    
    const settled = transactions
      .filter(tx => tx.settled)
      .map(tx => ({
        transactionId: tx.transaction_id,
        settledAt: tx.settled_at,
        settlementReference: tx.settlement_reference,
        from: tx.from_country,
        to: tx.to_country,
        amount: tx.amount,
        currency: tx.from_currency
      }));
    
    // Group by settlement reference
    const settlements = {};
    settled.forEach(tx => {
      if (!settlements[tx.settlementReference]) {
        settlements[tx.settlementReference] = {
          reference: tx.settlementReference,
          date: tx.settledAt,
          transactions: []
        };
      }
      settlements[tx.settlementReference].transactions.push(tx);
    });
    
    return {
      settlementBatches: Object.values(settlements),
      totalSettledTransactions: settled.length,
      lastSettlement: settled.slice(-1)[0]
    };
  }
}

export const settlementService = new SettlementService();