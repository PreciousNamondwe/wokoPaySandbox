// src/services/fx.service.js - USING EXCHANGERATE-API V4 (NO KEY)
const axios = require('axios');

class FXService {
  constructor() {
    this.cache = new Map();
    this.cacheDuration = 300000; // 5 minutes
  }

  async getFxRate(fromCurrency, toCurrency) {
    const cacheKey = `${fromCurrency}_${toCurrency}`;
    
    // Return from cache if available
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      console.log(`📊 Using cached FX rate: 1 ${fromCurrency} = ${cached.rate} ${toCurrency}`);
      return cached.rate;
    }

    // Same currency
    if (fromCurrency === toCurrency) {
      this.cache.set(cacheKey, { rate: 1, timestamp: Date.now() });
      return 1;
    }

    console.log(`🔄 Fetching FX rate from ExchangeRate-API: ${fromCurrency} → ${toCurrency}`);
    
    try {
      // ExchangeRate-API v4 (no API key required, 1500 requests/month free)
      const response = await axios.get(
        `https://api.exchangerate-api.com/v4/latest/${fromCurrency}`,
        { timeout: 8000 }
      );
      
      if (response.data && response.data.rates && response.data.rates[toCurrency]) {
        const rate = response.data.rates[toCurrency];
        console.log(`✅ ExchangeRate-API: 1 ${fromCurrency} = ${rate} ${toCurrency}`);
        
        // Cache the rate
        this.cache.set(cacheKey, {
          rate: parseFloat(rate),
          timestamp: Date.now()
        });
        
        return parseFloat(rate);
      }
    } catch (apiError) {
      console.log(`ExchangeRate-API failed for ${fromCurrency}:`, apiError.message);
    }

    // Fallback: Try FreeCurrencyAPI (no key, supports African currencies)
    try {
      console.log(`Trying FreeCurrencyAPI: ${fromCurrency} → ${toCurrency}`);
      const response = await axios.get(
        `https://cdn.jsdelivr.net/gh/fawazahmed0/currency-api@1/latest/currencies/${fromCurrency.toLowerCase()}/${toCurrency.toLowerCase()}.json`,
        { timeout: 8000 }
      );
      
      if (response.data && response.data[toCurrency.toLowerCase()]) {
        const rate = response.data[toCurrency.toLowerCase()];
        console.log(`✅ FreeCurrencyAPI: 1 ${fromCurrency} = ${rate} ${toCurrency}`);
        
        this.cache.set(cacheKey, {
          rate: parseFloat(rate),
          timestamp: Date.now()
        });
        
        return parseFloat(rate);
      }
    } catch (freeApiError) {
      console.log(`FreeCurrencyAPI failed: ${freeApiError.message}`);
    }

    console.log('Both APIs failed, using calculated fallback rates');
    
    // Ultimate fallback (your working rates)
    const fallbackRates = {
      'MWK_ZMW': 0.0032,    // 1 MWK = 0.0032 ZMW
      'MWK_ZAR': 0.0085,    // 1 MWK = 0.0085 ZAR
      'MWK_USD': 0.00059,   // 1 MWK = 0.00059 USD
      'ZMW_MWK': 312.5,     // 1 ZMW = 312.5 MWK
      'ZAR_MWK': 117.65,    // 1 ZAR = 117.65 MWK
      'USD_MWK': 1694.92,   // 1 USD = 1694.92 MWK
      'MWK_MWK': 1,
      'ZMW_ZMW': 1,
      'ZAR_ZAR': 1,
      'USD_USD': 1
    };

    const rate = fallbackRates[cacheKey] || 1;
    this.cache.set(cacheKey, { rate, timestamp: Date.now() });
    return rate;
  }

  async convertAmount(fromCurrency, toCurrency, amount) {
    if (fromCurrency === toCurrency) {
      return {
        convertedAmount: parseFloat(amount),
        rate: 1.0,
        fromCurrency,
        toCurrency
      };
    }

    const rate = await this.getFxRate(fromCurrency, toCurrency);
    const convertedAmount = parseFloat(amount) * rate;
    
    return {
      convertedAmount: parseFloat(convertedAmount.toFixed(2)),
      rate: parseFloat(rate.toFixed(6)),
      fromCurrency,
      toCurrency
    };
  }

  calculateFee(amount, fromCountry, toCountry, isCrossBorder = false) {
    const amountNum = parseFloat(amount);
    
    // Fee structure
    const baseFee = isCrossBorder ? 10.00 : 5.00;
    const percentage = isCrossBorder ? 0.025 : 0.01; // 2.5% cross-border, 1% local
    const percentageFee = amountNum * percentage;
    
    return {
      baseFee: baseFee,
      percentageFee: parseFloat(percentageFee.toFixed(2)),
      totalFee: parseFloat((baseFee + percentageFee).toFixed(2)),
      percentageRate: percentage * 100
    };
  }

  // Test API connectivity
  async testAPI() {
    console.log('🧪 Testing ExchangeRate-API connectivity...\n');
    
    const testCurrencies = ['MWK', 'ZMW', 'ZAR', 'USD', 'EUR'];
    
    for (const currency of testCurrencies) {
      try {
        const response = await axios.get(
          `https://api.exchangerate-api.com/v4/latest/${currency}`,
          { timeout: 5000 }
        );
        
        if (response.data) {
          const supportedCurrencies = Object.keys(response.data.rates || {}).length;
          console.log(`✅ ${currency}: Supports ${supportedCurrencies} currencies`);
          
          // Show a few sample rates
          const sampleRates = {};
          const targets = ['USD', 'EUR', 'ZAR', 'MWK', 'ZMW'].filter(c => c !== currency);
          targets.slice(0, 3).forEach(target => {
            if (response.data.rates[target]) {
              sampleRates[target] = response.data.rates[target];
            }
          });
          
          if (Object.keys(sampleRates).length > 0) {
            console.log(`   Sample rates:`, sampleRates);
          }
        }
      } catch (error) {
        console.log(`❌ ${currency}: ${error.message}`);
      }
    }
  }
}

module.exports = new FXService();