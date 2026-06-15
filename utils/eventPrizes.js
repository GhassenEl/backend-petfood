const PRIZE_TYPES = {
  free_animal: { label: 'Animal offert', icon: '🐾' },
  adoption_voucher: { label: 'Bon adoption', icon: '🏠' },
  product_pack: { label: 'Pack produits', icon: '🎁' },
  loyalty_points: { label: 'Points fidélité', icon: '⭐' },
  voucher_dt: { label: 'Bon d\'achat', icon: '💰' },
};

const COMPETITION_EVENT_TYPES = new Set([
  'concours',
  'competitions',
  'exposition',
  'journee_adoption',
  'cadeau',
]);

const DEFAULT_COMPETITION_PRIZES = [
  { id: 'p1', rank: 1, type: 'free_animal', label: 'Adoption gratuite (chiot ou chaton)', description: 'Frais d\'adoption offerts par un refuge partenaire' },
  { id: 'p2', rank: 2, type: 'product_pack', label: 'Pack croquettes 3 mois', description: 'Alimentation premium adaptée à votre animal' },
  { id: 'p3', rank: 3, type: 'voucher_dt', label: 'Bon d\'achat 80 DT', description: 'Valable sur la boutique PetfoodTN' },
];

const parseEventPrizes = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const stringifyEventPrizes = (prizes) => {
  if (!Array.isArray(prizes) || !prizes.length) return null;
  return JSON.stringify(prizes);
};

const prizeMeta = (type) => PRIZE_TYPES[type] || { label: type || 'Lot', icon: '🎁' };

const isCompetitionEvent = (type) => COMPETITION_EVENT_TYPES.has(type);

module.exports = {
  PRIZE_TYPES,
  COMPETITION_EVENT_TYPES,
  DEFAULT_COMPETITION_PRIZES,
  parseEventPrizes,
  stringifyEventPrizes,
  prizeMeta,
  isCompetitionEvent,
};
