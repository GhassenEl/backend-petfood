/**
 * Catalogue RAG compact — pages, API et docs par rôle PetfoodTN.
 */
const DOC_BASE = 'ARCHITECTURE.md';

const SHARED = [
  { route: '/login', label: 'Connexion', api: 'POST /api/auth/login', description: 'Authentification JWT plateforme.' },
  { route: '/register', label: 'Inscription', api: 'POST /api/auth/register', description: 'Création compte client ou vendeur.' },
  { route: '/contact', label: 'Contact', description: 'Formulaire contact et support.' },
];

const BY_ROLE = {
  client: [
    { route: '/client-products', label: 'Boutique produits', api: 'GET /api/products', description: 'Catalogue croquettes, accessoires, avis et promos.' },
    { route: '/client-orders', label: 'Mes commandes', api: 'GET /api/orders', description: 'Suivi statut et historique commandes.' },
    { route: '/client-invoices', label: 'Factures', api: 'GET /api/invoices', description: 'Factures et paiements.' },
    { route: '/checkout', label: 'Paiement', api: 'POST /api/orders', description: 'Panier, livraison, Flouci, wallet, Stripe.' },
    { route: '/client-reviews', label: 'Mes avis', api: 'GET /api/reviews', description: 'Avis produits 1–5 étoiles.' },
    { route: '/client-recommendations', label: 'Recommandations IA', api: 'GET /api/recommendations/hybrid', description: 'Produits adaptés au profil animal.' },
    { route: '/veterinary', label: 'Vétérinaire', api: 'GET /api/veterinary', description: 'RDV et téléconsultation.' },
    { route: '/client-complaints', label: 'Réclamations', api: 'POST /api/complaints', description: 'Tickets support client.' },
    { route: '/client/chat-history', label: 'Historique chatbot', api: 'GET /api/chat/history', description: 'Messages assistant IA.' },
  ],
  admin: [
    { route: '/admin/dashboard', label: 'Dashboard admin', api: 'GET /api/admin/dashboard', description: 'KPIs ventes et activité.' },
    { route: '/admin/orders', label: 'Commandes', api: 'GET /api/orders', description: 'Gestion et assignation livreur.' },
    { route: '/admin/products', label: 'Produits', api: 'GET /api/products', description: 'Catalogue et prix.' },
    { route: '/admin/stock', label: 'Stock', description: 'Seuils et mouvements inventaire.' },
    { route: '/admin/users', label: 'Utilisateurs', api: 'GET /api/users', description: 'Clients, rôles et comptes.' },
    { route: '/admin/reviews', label: 'Avis', api: 'GET /api/reviews', description: 'Modération avis 1–5 étoiles.' },
    { route: '/admin/powerbi', label: 'BI Power BI', description: 'Analytics et rapports.' },
    { route: '/admin/security', label: 'Sécurité', description: 'Audit, 2FA, logs.' },
    { route: '/admin/chat-history', label: 'Historique chatbot', api: 'GET /api/chat/history/admin', description: 'Historique conversations utilisateurs.' },
  ],
  livreur: [
    { route: '/livreur/orders', label: 'Commandes livreur', description: 'Tournées et statuts livraison.' },
    { route: '/livreur/map', label: 'Carte GPS', description: 'Itinéraires et points de livraison.' },
    { route: '/livreur/messages', label: 'Messages', description: 'Contact clients et dispatch.' },
    { route: '/livreur/earnings', label: 'Gains', description: 'Rémunération et bonus.' },
    { route: '/livreur/chat-history', label: 'Historique chatbot', api: 'GET /api/chat/history', description: 'Historique assistant livreur.' },
  ],
  vet: [
    { route: '/vet/dashboard', label: 'Dashboard vétérinaire', description: 'Agenda et patients.' },
    { route: '/vet/diagnostics', label: 'Diagnostics IA', api: 'POST /api/vet/ai/chat', description: 'Analyse symptômes (Groq).' },
    { route: '/vet/medical-dossiers', label: 'Dossiers médicaux', description: 'Historique santé animaux.' },
    { route: '/vet/chat-history', label: 'Historique chatbot', api: 'GET /api/chat/history', description: 'Historique assistant vétérinaire.' },
  ],
  vendor: [
    { route: '/vendor/dashboard', label: 'Dashboard vendeur', description: 'Ventes et KPIs marketplace.' },
    { route: '/vendor/products', label: 'Mes produits', api: 'GET /api/products', description: 'Catalogue vendeur et stock.' },
    { route: '/vendor/orders', label: 'Commandes vendeur', description: 'Commandes marketplace.' },
    { route: '/vendor/ml', label: 'Assistant ML', description: 'Prévisions stock et promos.' },
    { route: '/vendor/chat-history', label: 'Historique chatbot', api: 'GET /api/chat/history', description: 'Historique assistant vendeur.' },
  ],
  moderator: [
    { route: '/moderator/vendors', label: 'Vendeurs en attente', description: 'Validation KYC marketplace.' },
    { route: '/moderator/fraud', label: 'Anti-fraude', description: 'Scores ML et comptes suspects.' },
    { route: '/moderator/content', label: 'Validation contenu', description: 'Produits et descriptions.' },
    { route: '/moderator/reviews', label: 'Modération avis', api: 'GET /api/reviews', description: 'Avis 1–5 étoiles signalés.' },
    { route: '/moderator/refunds', label: 'Remboursements', description: 'Litiges et arbitrage.' },
    { route: '/moderator/chat-history', label: 'Historique chatbot', api: 'GET /api/chat/history', description: 'Historique assistant modération.' },
  ],
  visitor: [
    { route: '/marketing', label: 'Présentation', description: 'Découverte plateforme PetfoodTN.' },
    { route: '/register', label: 'Inscription', api: 'POST /api/auth/register', description: 'Créer un compte client.' },
    { route: '/vendor', label: 'Devenir vendeur', description: 'Hub partenaires marketplace.' },
  ],
};

const ROUTE_LABELS = {};
Object.values(BY_ROLE).flat().concat(SHARED).forEach((entry) => {
  if (entry.route) ROUTE_LABELS[entry.route] = entry.label;
});

function getCatalogForRole(role = 'visitor') {
  const roleEntries = BY_ROLE[role] || BY_ROLE.visitor;
  return [...roleEntries, ...SHARED];
}

module.exports = {
  DOC_BASE,
  BY_ROLE,
  ROUTE_LABELS,
  getCatalogForRole,
};
