# WokoPay Wallet & Payout API – README

## API Base URL
wokopaysandbox.onrender.com
http://localhost:3000

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
## Pay Bills

### Pay bills with wokpay account
```bash
curl -X POST http://localhost:3000/api/bills/pay \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "655abc71-3e34-41fd-9488-8ca08075feae",
    "billerCode": "ESCOM",
    "customerAccountNumber": "123456789",
    "amount": 15000,
    "paymentMethod": "airtel_money"
  }'
```

### Pay bills without wokpay account
```bash
curl -X POST http://localhost:3000/api/bills/pay-with-user \
-H "Content-Type: application/json" \
-d '{
  "fullName": "Precious Namondwe",
  "email": "precious@example.com",
  "phoneNumber": "+265881234569",
  "customerAccountNumber": "123456789",
  "amount": 15000,
  "paymentMethod": "airtel_money"
}'

```

## GET methodz for bills
```bash
curl -X GET http://localhost:3000/api/bills/billers
```

## Disclaimer
This is a simulated fintech system for academic and architectural demonstration only.

Author: (Precious Nmaondwe)WokoPay – Final Year Project
