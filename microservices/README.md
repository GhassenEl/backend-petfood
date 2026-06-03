# Dossier legacy — non utilisé

PetfoodTN tourne en **monolithe** : toutes les routes sont dans `backend/routes/` et montées par `gateway/registerRoutes.js` via `server.js` (port 5002).

Les sous-dossiers `*-service/` ne sont plus lancés en production ni en développement standard.

**Lancement recommandé :**

```bash
cd backend
npm run dev
# ou depuis la racine frontend Lido :
npm run dev
```

Ne pas utiliser `npm run dev:microservices` (script retiré).
