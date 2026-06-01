/** Fiches produits détaillées (composition, usage, conseils) — catalogue démo PetfoodTN */
const PRODUCT_DETAILS = {
  prd_dog_1: {
    description: 'Croquettes premium pour chien adulte — protéines animales de qualité, sans colorants artificiels.',
    composition: 'Poulet déshydraté 28 %, riz, maïs, graisses animales, pulpe de betterave, vitamines A/D/E, minéraux.',
    usage: '2 repas/jour. Chattez 7 jours en cas de changement d\'aliment. Eau fraîche à volonté.',
    benefits: ['Digestion facilitée', 'Pelage brillant', 'Énergie au quotidien'],
    tags: ['croquettes', 'premium', 'chien', 'adulte'],
    category: 'croquettes',
  },
  prd_cat_1: {
    description: 'Pâtée équilibrée pour chat adulte — texture fondante, appétence élevée.',
    composition: 'Viandes et sous-produits 40 %, poisson 8 %, minéraux, taurine, vitamines.',
    usage: '1 à 2 sachets/jour selon le poids (4–5 kg). Compléter avec croquettes si ration mixte.',
    benefits: ['Hydratation', 'Riche en taurine', 'Appétence chat difficile'],
    tags: ['patee', 'chat', 'adulte', 'humide'],
    category: 'patee',
  },
  prd_bird_1: {
    description: 'Mélange vitalité pour oiseaux — graines sélectionnées pour canaris et perruches.',
    composition: 'Mil, alpiste, lin, vitamines, sélénium, calcium.',
    usage: 'Servir à volonté dans une mangeoire propre. Renouveler quotidiennement.',
    benefits: ['Plumage éclatant', 'Énergie', 'Facile à digérer'],
    tags: ['oiseau', 'graines', 'vitamines'],
    category: 'nourriture',
  },
  prd_fish_1: {
    description: 'Granulés aquarium pro — flottants, ne troublent pas l\'eau.',
    composition: 'Poisson, crevettes, algues, spiruline, vitamines hydrosolubles.',
    usage: '2 à 3 petites pincées/jour. Retirer l\'excédent après 2 minutes.',
    benefits: ['Couleurs vives', 'Eau claire', 'Croissance poissons tropicaux'],
    tags: ['poisson', 'aquarium', 'granules'],
    category: 'nourriture',
  },
  prd_dog_2: {
    description: 'Snack dentaire naturel — aide à réduire le tartre entre les repas.',
    composition: 'Riz, protéines animales, chlorophylle, menthe, sans sucres ajoutés.',
    usage: '1 bâtonnet/jour max. Surveiller la mastication (chien > 10 kg).',
    benefits: ['Hygiène bucco-dentaire', 'Fraîche haleine', 'Occupation'],
    tags: ['friandise', 'chien', 'dental'],
    category: 'friandises',
  },
  prd_cat_2: {
    description: 'Litière confort agglomérante — contrôle des odeurs, grains moyens.',
    composition: 'Argile bentonite, parfum léger, sans poussière excessive.',
    usage: 'Couche 5–7 cm. Retirer les agglomérats quotidiennement. Changer toutes les 3–4 semaines.',
    benefits: ['Odeurs neutralisées', 'Facile à nettoyer', 'Confort patte chat'],
    tags: ['litiere', 'chat', 'accessoire'],
    category: 'accessoires',
  },
  prd_dog_3: {
    description: 'Pâtée boîte chien adulte — recette classique, haute digestibilité.',
    composition: 'Viande bovine 4 %, céréales, minéraux, vitamines.',
    usage: '1 boîte/10 kg poids corporel/jour (répartir en 2 repas).',
    benefits: ['Prix accessible', 'Bonne digestibilité', 'Idéal ration mixte'],
    tags: ['patee', 'chien', 'economique'],
    category: 'patee',
  },
  prd_cat_3: {
    description: 'Croquettes sans céréales chat — formule grain-free pour intolérances légères.',
    composition: 'Saumon 26 %, patate douce, pois, huile de poisson, probiotiques.',
    usage: 'Quantité selon tableau au dos (4–6 kg : 45–65 g/jour). Transition 7 jours.',
    benefits: ['Sans céréales', 'Peau & pelage', 'Digestion sensible'],
    tags: ['croquettes', 'chat', 'grain-free', 'premium'],
    category: 'croquettes',
  },
};

const enrichProduct = (product) => {
  if (!product) return product;
  const id = product.id || product._id;
  const extra = PRODUCT_DETAILS[id];
  if (!extra) return product;
  return {
    ...product,
    description: product.description || extra.description,
    composition: extra.composition,
    usage: extra.usage,
    benefits: extra.benefits,
    tags: product.tags?.length ? product.tags : extra.tags,
    category: product.category || extra.category,
  };
};

module.exports = { PRODUCT_DETAILS, enrichProduct };
