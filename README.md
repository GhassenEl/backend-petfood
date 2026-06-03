# PetfoodTN — Backend

Node.js / Express / SQLite backend powering the PetfoodTN platform (admin, client, livreur, vet). **Architecture monolithe** : un seul serveur (`server.js`, port 5002) — pas de microservices.

Front-end repo: https://github.com/GhassenEl/frontend-petfood

## Stack

- Node.js + Express
- Prisma + PostgreSQL (Docker) via @prisma/client
- JWT authentication
- bcryptjs for password hashing
- Stripe (optional)
- Nodemon for dev

## Setup

```bash
npm install
cp .env.example .env
# DATABASE_URL PostgreSQL — voir docs/POSTGRES.md
npm run db:setup   # docker + prisma db push + seed (recommandé)
# ou : npm run postgres:up && npm run db:push && npm run seed
npm run dev        # nodemon on http://localhost:5002
```

Guide détaillé : [docs/POSTGRES.md](./docs/POSTGRES.md)

> The auth controller now uses Prisma and SQL. Demo-mode fallback still works when the database is unavailable.

## Project layout

```
backend/
├── controllers/    # request handlers (auth, products, orders, reviews, ...)
├── middleware/     # JWT auth middleware
├── prisma/         # Prisma schema and generated client
├── routes/         # API route definitions
├── utils/          # demoStore fallback, helpers
├── seed.js         # seed principal (comptes, produits, commandes, blog)
├── docker-compose.yml
├── docs/POSTGRES.md
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
