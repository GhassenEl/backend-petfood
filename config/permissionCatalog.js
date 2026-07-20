/**
 * Catalogue des permissions plateforme — utilisé pour créer des rôles custom.
 * Clés stables (slug) ; l’UI admin coche/décoche ces permissions.
 */

const PERMISSION_CATALOG = [
  { key: 'dashboard.view', label: 'Voir le tableau de bord', module: 'général' },
  { key: 'users.read', label: 'Consulter les utilisateurs', module: 'utilisateurs' },
  { key: 'users.write', label: 'Créer / modifier les utilisateurs', module: 'utilisateurs' },
  { key: 'users.suspend', label: 'Suspendre des comptes', module: 'utilisateurs' },
  { key: 'roles.manage', label: 'Gérer les rôles & permissions', module: 'utilisateurs' },
  { key: 'products.read', label: 'Consulter les produits', module: 'catalogue' },
  { key: 'products.write', label: 'Créer / modifier les produits', module: 'catalogue' },
  { key: 'products.moderate', label: 'Valider / modérer les produits', module: 'catalogue' },
  { key: 'orders.read', label: 'Consulter les commandes', module: 'commandes' },
  { key: 'orders.write', label: 'Gérer / mettre à jour les commandes', module: 'commandes' },
  { key: 'stock.read', label: 'Consulter le stock', module: 'stock' },
  { key: 'stock.write', label: 'Ajuster le stock & inventaire', module: 'stock' },
  { key: 'vendors.manage', label: 'Gérer les vendeurs', module: 'acteurs' },
  { key: 'vets.manage', label: 'Gérer les vétérinaires', module: 'acteurs' },
  { key: 'livreurs.manage', label: 'Gérer les livreurs', module: 'acteurs' },
  { key: 'moderators.manage', label: 'Gérer les modérateurs', module: 'acteurs' },
  { key: 'reviews.moderate', label: 'Modérer les avis', module: 'contenu' },
  { key: 'reports.handle', label: 'Traiter les signalements', module: 'contenu' },
  { key: 'refunds.manage', label: 'Gérer les remboursements', module: 'finance' },
  { key: 'promotions.manage', label: 'Gérer promotions & coupons', module: 'marketing' },
  { key: 'analytics.view', label: 'Voir statistiques / BI', module: 'analytics' },
  { key: 'system.config', label: 'Configuration système', module: 'système' },
  { key: 'security.view', label: 'Centre de sécurité', module: 'système' },
  { key: 'vet.appointments', label: 'Rendez-vous vétérinaires', module: 'santé' },
  { key: 'vet.dossiers', label: 'Dossiers médicaux', module: 'santé' },
  { key: 'vet.prescriptions', label: 'Prescriptions', module: 'santé' },
  { key: 'delivery.manage', label: 'Gérer les livraisons', module: 'logistique' },
  { key: 'client.shop', label: 'Boutique client', module: 'client' },
  { key: 'client.orders', label: 'Commandes client', module: 'client' },
  { key: 'vendor.products', label: 'Produits vendeur', module: 'vendeur' },
  { key: 'vendor.orders', label: 'Commandes vendeur', module: 'vendeur' },
];

/** Permissions par défaut des rôles système (non modifiables via UI sauf lecture). */
const SYSTEM_ROLE_PERMISSIONS = {
  admin: ['*'],
  client: ['client.shop', 'client.orders', 'dashboard.view'],
  vendor: ['vendor.products', 'vendor.orders', 'orders.read', 'products.read', 'dashboard.view'],
  vet: ['vet.appointments', 'vet.dossiers', 'vet.prescriptions', 'dashboard.view'],
  livreur: ['delivery.manage', 'orders.read', 'dashboard.view'],
  moderator: [
    'products.moderate',
    'reviews.moderate',
    'reports.handle',
    'refunds.manage',
    'users.suspend',
    'dashboard.view',
  ],
  stock_manager: ['stock.read', 'stock.write', 'products.read', 'dashboard.view'],
};

const SYSTEM_ROLES = [
  { slug: 'admin', label: 'Administrateur', homeRoute: '/admin/dashboard', isSystem: true },
  { slug: 'client', label: 'Client', homeRoute: '/client-products', isSystem: true },
  { slug: 'vendor', label: 'Vendeur', homeRoute: '/vendor/dashboard', isSystem: true },
  { slug: 'vet', label: 'Vétérinaire', homeRoute: '/vet/dashboard', isSystem: true },
  { slug: 'livreur', label: 'Livreur', homeRoute: '/livreur/dashboard', isSystem: true },
  { slug: 'moderator', label: 'Modérateur', homeRoute: '/moderator/dashboard', isSystem: true },
  { slug: 'stock_manager', label: 'Gestionnaire de stock', homeRoute: '/admin/stock', isSystem: true },
];

const VALID_PERMISSION_KEYS = new Set(PERMISSION_CATALOG.map((p) => p.key));

function sanitizePermissions(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(String).filter((k) => VALID_PERMISSION_KEYS.has(k) || k === '*'))];
}

module.exports = {
  PERMISSION_CATALOG,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
  VALID_PERMISSION_KEYS,
  sanitizePermissions,
};
