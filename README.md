# PetfoodTN — Backend

Node.js / Express / SQLite backend powering the PetfoodTN platform (admin, client and delivery roles).

Front-end repo: https://github.com/GhassenEl/frontend-petfood

## Stack

- Node.js + Express
- Prisma + SQLite via @prisma/client
- JWT authentication
- bcryptjs for password hashing
- Stripe (optional)
- Nodemon for dev

## Setup

```bash
npm install
cp .env.example .env
# edit .env with a strong JWT_SECRET and optional DEMO_MODE
npm run seed    # populates demo products/orders/messages if users already exist
npm run dev     # nodemon on http://localhost:5002
```

> The auth controller now uses Prisma and SQL. Demo-mode fallback still works when the database is unavailable.

## Project layout

```
backend/
├── controllers/    # request handlers (auth, products, orders, reviews, ...)
├── middleware/     # JWT auth middleware
├── prisma/         # Prisma schema and generated client
├── routes/         # API route definitions
├── utils/          # demoStore fallback, helpers
├── seed.js         # SQLite/Prisma seeder
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
