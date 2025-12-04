-- Merchants table
CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL CHECK (country IN ('MW', 'ZM')),
  currency TEXT NOT NULL CHECK (currency IN ('MWK', 'ZMW')),
  balance DECIMAL(15, 2) DEFAULT 0,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  country TEXT NOT NULL CHECK (country IN ('MW', 'ZM')),
  currency TEXT NOT NULL CHECK (currency IN ('MWK', 'ZMW')),
  balance DECIMAL(15, 2) DEFAULT 0,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  transaction_id TEXT UNIQUE NOT NULL,
  sender_id TEXT NOT NULL REFERENCES users(id),
  sender_phone TEXT NOT NULL,
  recipient_id TEXT NOT NULL REFERENCES users(id),
  recipient_phone TEXT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  from_country TEXT NOT NULL CHECK (from_country IN ('MW', 'ZM')),
  to_country TEXT NOT NULL CHECK (to_country IN ('MW', 'ZM')),
  from_currency TEXT NOT NULL CHECK (from_currency IN ('MWK', 'ZMW')),
  to_currency TEXT NOT NULL CHECK (to_currency IN ('MWK', 'ZMW')),
  exchange_rate DECIMAL(10, 4) NOT NULL,
  converted_amount DECIMAL(15, 2) NOT NULL,
  fee DECIMAL(15, 2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  payout_method TEXT,
  merchant_from TEXT NOT NULL REFERENCES merchants(id),
  merchant_to TEXT NOT NULL REFERENCES merchants(id),
  settled BOOLEAN DEFAULT FALSE,
  settlement_reference TEXT,
  settled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Exchange rates table
CREATE TABLE IF NOT EXISTS exchange_rates (
  id TEXT PRIMARY KEY,
  pair TEXT UNIQUE NOT NULL,
  rate DECIMAL(10, 4) NOT NULL,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Insert initial data
INSERT INTO merchants (id, name, country, currency, balance, phone) VALUES
('MER_MW_001', 'WokoPay Malawi', 'MW', 'MWK', 1000000, '+265991000000'),
('MER_ZM_001', 'WokoPay Zambia', 'ZM', 'ZMW', 50000, '+260961000000')
ON CONFLICT (id) DO UPDATE SET
balance = EXCLUDED.balance;

INSERT INTO users (id, name, phone, country, currency, balance, is_verified) VALUES
('USR001', 'John Banda', '+265881234567', 'MW', 'MWK', 100000, true),
('USR002', 'Sarah Phiri', '+260971234567', 'ZM', 'ZMW', 5000, true),
('USR003', 'Mike Jere', '+265991111111', 'MW', 'MWK', 200000, true),
('USR004', 'Grace Lungu', '+260972222222', 'ZM', 'ZMW', 10000, true)
ON CONFLICT (id) DO UPDATE SET
balance = EXCLUDED.balance;

INSERT INTO exchange_rates (id, pair, rate) VALUES
('rate1', 'MWK_ZMW', 0.03),
('rate2', 'ZMW_MWK', 33.33)
ON CONFLICT (pair) DO UPDATE SET
rate = EXCLUDED.rate;