const SALES_CHANNELS = [
  {
    id: 'online',
    label: 'En ligne',
    description: 'Boutique marketplace PetfoodTN — panier et paiement web',
    icon: '🛒',
  },
  {
    id: 'instore',
    label: 'Présentiel / magasin',
    description: 'Vente en animalerie, retrait sur place',
    icon: '🏪',
  },
  {
    id: 'phone',
    label: 'Téléphone',
    description: 'Commande prise par appel, confirmation orale',
    icon: '📞',
  },
  {
    id: 'courier',
    label: 'Courrier / livraison postale',
    description: 'Envoi colis postal ou coursier hors livreur plateforme',
    icon: '✉️',
  },
];

const ALLOWED = new Set(SALES_CHANNELS.map((c) => c.id));

const parseChannels = (raw) => {
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    if (!Array.isArray(arr)) return ['online'];
    const cleaned = arr.map(String).filter((id) => ALLOWED.has(id));
    return cleaned.length ? cleaned : ['online'];
  } catch {
    return ['online'];
  }
};

const channelLabel = (id) => SALES_CHANNELS.find((c) => c.id === id)?.label || id;

module.exports = {
  SALES_CHANNELS,
  ALLOWED,
  parseChannels,
  channelLabel,
};
