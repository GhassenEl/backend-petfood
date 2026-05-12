# PetfoodTN — Backend

Node.js / Express / MongoDB backend powering the PetfoodTN platform (admin, client and delivery roles).

Front-end repo: https://github.com/GhassenEl/frontend-petfood

## Stack

- Node.js + Express
- MongoDB Atlas via Mongoose
- JWT authentication
- bcryptjs for password hashing
- Stripe (optional)
- Nodemon for dev

## Setup

```bash
npm install
cp .env.example .env
# edit .env with your MongoDB Atlas credentials and a strong JWT_SECRET
npm run seed    # populates Atlas with demo users / products / orders
npm run dev     # nodemon on http://localhost:5002
```

## Demo accounts (after seeding)

| Role    | Email                  | Password         |
|---------|------------------------|------------------|
| Admin   | admin@petfood.tn       | PetfoodTN2024!   |
| Client  | client@petfood.tn      | MonChat123!      |
| Livreur | livreur@petfood.tn     | Livreur123!      |

> The auth controller prefers MongoDB; the hard-coded demo accounts are only used as a fallback when MongoDB is unreachable.

## Project layout

```
backend/
├── config/         # express middleware, helpers
├── controllers/    # request handlers (auth, products, orders, reviews, ...)
├── middleware/     # JWT auth middleware
├── models/         # Mongoose schemas
├── routes/         # API route definitions
├── scripts/seed.js # Atlas seeder
├── utils/          # demoStore fallback, helpers
└── server.js       # entry point
```

## Main API routes (prefix `/api`)

- `POST /auth/register`, `POST /auth/login`
- `GET/POST/PUT/DELETE /products`
- `GET/POST/PUT /orders`
- `GET/POST /reviews`
- `GET/POST /complaints`
- `GET/POST /veterinary`
- `GET/POST /chat`
- `POST /stripe/create-payment-intent` (optional)
