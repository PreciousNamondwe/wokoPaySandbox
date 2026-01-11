# WokoPay Wallet & Payout API – README

## Overview
WokoPay is a local-to-local digital wallet and settlement system designed for Africa (SADC), enabling users to load money from mobile money, hold value in wallets, travel, and send money cross-border without banks in the transaction loop.

## API Base URL
http://localhost:3000/api

## Wallet Load Flow

### Get Wallet Load Quote
```bash
curl -X POST http://localhost:3000/api/wallet/load/quote \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "655abc71-3e34-41fd-9488-8ca08075feae",
    "phoneNumber": "+265881234567",
    "amount": 1000.00
  }'
```

### Load Wallet
```bash
curl -X POST http://localhost:3000/api/wallet/load \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "655abc71-3e34-41fd-9488-8ca08075feae",
    "phoneNumber": "+265881234567",
    "amount": 500.00,
    "currency": "MWK"
  }'
```

### Check Wallet Balance
```bash
curl -X GET http://localhost:3000/api/wallet/balance/655abc71-3e34-41fd-9488-8ca08075feae
```

## Cross-Border Payout Flow

### Get Payout Quote
```bash
curl -X POST http://localhost:3000/api/payout/quote \
  -H "Content-Type: application/json" \
  -d '{
    "senderUserId": "655abc71-3e34-41fd-9488-8ca08075feae",
    "recipientPhone": "+260961234567",
    "amount": 1000.00
  }'
```

### Execute Payout
```bash
curl -X POST http://localhost:3000/api/payout/execute \
  -H "Content-Type: application/json" \
  -d '{
    "senderUserId": "655abc71-3e34-41fd-9488-8ca08075feae",
    "recipientPhone": "+260961234567",
    "amount": 750.00,
    "currency": "MWK",
    "isGuestPayout": false
  }'
```

## Profit Model
- Wallet load fees
- Payout fees
- FX spread
- Guest payout surcharge

## Disclaimer
This is a simulated fintech system for academic and architectural demonstration only.

Author: WokoPay – Final Year Project
