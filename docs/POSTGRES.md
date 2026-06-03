# PostgreSQL + seed.js

## Prérequis

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (pour PostgreSQL local)
- Node.js 18+

## Démarrage rapide

```bash
cd backend
cp .env.example .env
# Vérifier DATABASE_URL=postgresql://petfood:petfood@localhost:5432/petfoodtn?schema=public

npm install
npm run db:setup
```

`db:setup` exécute : `docker compose up -d` → `prisma generate` → `prisma db push` → `node seed.js`.

## Commandes utiles

| Commande | Description |
|----------|-------------|
| `npm run postgres:up` | Démarre PostgreSQL (Docker) |
| `npm run postgres:down` | Arrête le conteneur |
| `npm run db:push` | Applique le schéma Prisma |
| `npm run seed` | Vide la base (sauf `SEED_SKIP_RESET=1`) et remplit les données démo |
| `npm run seed:platform` | Enrichissement supplémentaire (BI, dossiers, promos…) |
| `npx prisma studio` | Interface web pour voir les tables |

## Comptes créés par `seed.js`

| Rôle | Email | Mot de passe |
|------|--------|----------------|
| Admin | admin@petfood.tn | PetfoodTN2024! |
| Client | client@petfood.tn | MonChat123! |
| Vétérinaire | vet@petfood.tn | Vet2024! |
| Livreur | livreur@petfood.tn | Livreur123! |

Animaux : Mimi, Rex (client@petfood.tn), etc.

## Variables

- `SEED_SKIP_RESET=1` — ajoute des données sans vider les tables
- `DEMO_MODE=true` — mode mémoire (sans base) ; laisser `false` avec PostgreSQL

## Dépannage

**Connexion refusée** : `docker compose ps` puis `npm run postgres:up`.

**Schéma obsolète** : `npx prisma db push` puis `npm run seed`.

**Seed partiel** : enchaîner `npm run seed` puis `npm run seed:platform`.
