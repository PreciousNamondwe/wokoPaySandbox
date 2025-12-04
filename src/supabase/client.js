import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Add SUPABASE_URL and SUPABASE_ANON_KEY to .env file');
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey);