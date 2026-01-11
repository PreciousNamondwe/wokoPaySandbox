// src/services/mobile-money.service.js
const supabase = require('../db/database');

class MobileMoneyService {
  async verifyMobileProvider(phoneNumber) {
    const { data, error } = await supabase
      .from('mobile_providers')
      .select('*')
      .eq('phone_number', phoneNumber)
      .eq('is_active', true)
      .single();

    if (error) return null;
    
    return {
      exists: true,
      providerName: data.provider_name,
      countryCode: data.country_code,
      currency: data.currency,
      balance: data.balance
    };
  }

  async registerUserWithMobileMoney(userData) {
    // Check if phone exists in mobile_providers
    const provider = await this.verifyMobileProvider(userData.phone_number);
    
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        phone_number: userData.phone_number,
        full_name: userData.full_name,
        country_code: userData.country_code,
        email: userData.email,
        mobile_verified: !!provider, // Verified if mobile provider exists
        mobile_provider_id: provider ? provider.id : null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw new Error('Failed to create user: ' + error.message);

    // Create wallet for user
    const { data: country } = await supabase
      .from('countries')
      .select('currency_code')
      .eq('code', userData.country_code)
      .single();

    await supabase
      .from('wokopay_wallets')
      .insert({
        user_id: user.id,
        country_code: userData.country_code,
        currency: country.currency_code,
        is_primary: true,
        created_at: new Date().toISOString()
      });

    return {
      userId: user.id,
      phoneNumber: user.phone_number,
      mobileVerified: !!provider,
      walletCreated: true,
      providerInfo: provider
    };
  }

  async getMobileProviders(countryCode = null) {
    let query = supabase
      .from('mobile_providers')
      .select('*')
      .eq('is_active', true);

    if (countryCode) {
      query = query.eq('country_code', countryCode);
    }

    const { data, error } = await query;
    
    if (error) throw error;
    
    return data;
  }
}

module.exports = new MobileMoneyService();