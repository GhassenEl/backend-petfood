/** Émotions propriétaire — alignées avec le frontend client */
const OWNER_EMOTIONS = [
  { id: 'happy', label: 'Très heureux', emoji: '😊', score: 1 },
  { id: 'satisfied', label: 'Satisfait', emoji: '🙂', score: 0.7 },
  { id: 'neutral', label: 'Neutre', emoji: '😐', score: 0 },
  { id: 'disappointed', label: 'Déçu', emoji: '😞', score: -0.5 },
  { id: 'frustrated', label: 'Frustré', emoji: '😠', score: -0.9 },
];

const PLATFORM_SERVICES = [
  { type: 'grooming', label: 'Toilettage', icon: '✂️', category: 'service' },
  { type: 'boarding', label: 'Pension', icon: '🏠', category: 'service' },
  { type: 'training', label: 'Dressage', icon: '🎓', category: 'service' },
  { type: 'delivery', label: 'Livraison', icon: '🚚', category: 'logistics' },
  { type: 'veterinary', label: 'Vétérinaire', icon: '🩺', category: 'health' },
  { type: 'products', label: 'Produits boutique', icon: '🛒', category: 'shop' },
];

const VALID_SERVICE_TYPES = PLATFORM_SERVICES.map((s) => s.type);

const RATING_SERVICE_TYPES = ['grooming', 'boarding', 'training', 'delivery', 'veterinary'];

const emotionMeta = (id) => OWNER_EMOTIONS.find((e) => e.id === id) || OWNER_EMOTIONS[2];

const serviceMeta = (type) => PLATFORM_SERVICES.find((s) => s.type === type) || { type, label: type, icon: '🐾' };

module.exports = {
  OWNER_EMOTIONS,
  PLATFORM_SERVICES,
  VALID_SERVICE_TYPES,
  RATING_SERVICE_TYPES,
  emotionMeta,
  serviceMeta,
};
