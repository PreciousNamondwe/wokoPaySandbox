import { supabase } from '../supabase/client.js';
import { v4 as uuidv4 } from 'uuid';

export class Database {
  
  // === USERS ===
  async getUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error getting users:', error);
      throw error;
    }
    return data;
  }
  
  async getUserById(id) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) return null;
    return data;
  }
  
  async getUserByPhone(phone) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .single();
    
    if (error) return null;
    return data;
  }
  
  async createUser(userData) {
    const user = {
      id: `USR_${uuidv4().slice(0, 8)}`,
      ...userData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('users')
      .insert([user])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  async updateUser(id, updates) {
    const { data, error } = await supabase
      .from('users')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  // === MERCHANTS ===
  async getMerchants() {
    const { data, error } = await supabase
      .from('merchants')
      .select('*');
    
    if (error) throw error;
    return data;
  }
  
  async getMerchantByCountry(country) {
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .eq('country', country)
      .single();
    
    if (error) throw error;
    return data;
  }
  
  async updateMerchant(id, updates) {
    const { data, error } = await supabase
      .from('merchants')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  // === TRANSACTIONS ===
  async createTransaction(transactionData) {
    const transaction = {
      id: `TXN_${uuidv4().slice(0, 8)}`,
      transaction_id: `WKP${Date.now().toString().slice(-8)}`,
      ...transactionData,
      created_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('transactions')
      .insert([transaction])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  async getTransactions() {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  }
  
  async getUnsettledTransactions() {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('status', 'completed')
      .eq('settled', false)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    return data;
  }
  
  async updateTransaction(id, updates) {
    const { data, error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
  
  async markTransactionsAsSettled(transactionIds, settlementReference) {
    const { data, error } = await supabase
      .from('transactions')
      .update({
        settled: true,
        settled_at: new Date().toISOString(),
        settlement_reference: settlementReference,
        updated_at: new Date().toISOString()
      })
      .in('transaction_id', transactionIds)
      .select();
    
    if (error) throw error;
    return data;
  }
  
  // === EXCHANGE RATES ===
  async getExchangeRates() {
    const { data, error } = await supabase
      .from('exchange_rates')
      .select('*');
    
    if (error) throw error;
    
    const rates = {};
    data.forEach(r => {
      rates[r.pair] = r.rate;
    });
    
    return rates;
  }
}

export const db = new Database();