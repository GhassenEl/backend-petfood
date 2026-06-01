/** Méthodes de paiement acceptées côté client (IDs stables en base). */
const PAYMENT_METHODS = [
  { id: 'stripe', label: 'Stripe', icon: 'stripe', online: true, provider: 'stripe' },
  { id: 'paypal', label: 'PayPal', icon: 'paypal', online: true, provider: 'paypal' },
  { id: 'card', label: 'Carte bancaire', icon: 'card', online: true, provider: 'stripe' },
  { id: 'check', label: 'Chèque', icon: 'check', online: false },
  { id: 'cash', label: 'Espèces', icon: 'cash', online: false },
  { id: 'transfer', label: 'Virement bancaire', icon: 'transfer', online: false },
  { id: 'pro_card', label: 'Carte professionnelle', icon: 'pro_card', online: false },
];

const PAYMENT_METHOD_IDS = new Set(PAYMENT_METHODS.map((m) => m.id));
const ONLINE_PAYMENT_IDS = new Set(
  PAYMENT_METHODS.filter((m) => m.online).map((m) => m.id)
);
const STRIPE_CARD_METHODS = new Set(['stripe', 'card']);

const PAYMENT_LABELS = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.id, m.label])
);

/** Alias historiques */
const ALIASES = {
  cheque: 'check',
  espece: 'cash',
  especes: 'cash',
  virement: 'transfer',
  carte: 'card',
  carte_bancaire: 'card',
  carte_pro: 'pro_card',
};

const normalizePaymentMethod = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  const mapped = ALIASES[key] || key;
  return PAYMENT_METHOD_IDS.has(mapped) ? mapped : null;
};

const isValidPaymentMethod = (raw) => normalizePaymentMethod(raw) !== null;

const getPaymentLabel = (raw) => {
  const id = normalizePaymentMethod(raw) || raw;
  return PAYMENT_LABELS[id] || id || 'Non précisé';
};

const requiresOnlineCapture = (methodId) =>
  ONLINE_PAYMENT_IDS.has(normalizePaymentMethod(methodId) || '');

const usesStripeCard = (methodId) =>
  STRIPE_CARD_METHODS.has(normalizePaymentMethod(methodId) || '');

const BANK_TRANSFER_DETAILS = {
  beneficiary: 'PetfoodTN SARL',
  bank: 'BIAT Tunisie',
  rib: '08 012 000 1234567890 12',
  iban: 'TN59 0812 0001 2345 6789 0123',
  swift: 'BIATTNTT',
  currency: 'TND',
  referenceHint: 'Référence : votre numéro de commande ou facture',
};

module.exports = {
  PAYMENT_METHODS,
  PAYMENT_METHOD_IDS,
  ONLINE_PAYMENT_IDS,
  STRIPE_CARD_METHODS,
  PAYMENT_LABELS,
  BANK_TRANSFER_DETAILS,
  normalizePaymentMethod,
  isValidPaymentMethod,
  getPaymentLabel,
  requiresOnlineCapture,
  usesStripeCard,
};
