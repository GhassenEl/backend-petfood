const { prisma, isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const { getPetRecommendations } = require('../services/petRecommendation.service');
const { getPersonalizedRecommendations } = require('../services/aiRecommendationAgent.service');
const { normalizeProductRecord, effectiveDiscount } = require('../utils/productNormalize');
const { enrichProduct } = require('../utils/productDetailsCatalog');
const promoService = require('../services/promo.service');

async function resolveUserForRecommendations(userId, options = {}) {
  if (options.user) return options.user;
  if (isDemoMode()) return demoStore.getUserById(userId) || { _id: userId, id: userId };

  let user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user && options.email) {
    user = await prisma.user.findUnique({ where: { email: String(options.email).toLowerCase() } });
  }
  return user || { id: userId, _id: userId, email: options.email };
}

async function getRecommendationsForUser(userId, limit = 4, options = {}) {
  try {
    if (isDemoMode()) {
      const all = demoStore.getProducts();
      const user = demoStore.getUserById(userId) || options.user;
      const scored = all.map(p => {
        let score = 0;
        let reasons = [];
        if (user?.petType && p.animalType === user.petType) {
          score += 0.35;
          reasons.push('Adapté à votre ' + user.petType);
        }
        if (p.discount > 0) {
          score += (p.discount / 100) * 0.20;
          reasons.push('-' + p.discount + '% réduction');
        }
        if (p.popularity > 80) {
          score += 0.15;
          reasons.push('Très populaire');
        }
        if (p.rating_avg >= 4.5) {
          score += 0.10;
          reasons.push('Bien noté');
        }
        const reason = reasons[0] || 'Recommandé pour vous';
        return { ...p, score, reason, recommendedReason: reason };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit);
    }

    const user = await resolveUserForRecommendations(userId, options);
    const context = options.context || {};
    const petId = options.petId || context?.pet?.id || null;
    const petName = options.petName || context?.pet?.name || null;

    const result = await getPetRecommendations(user, { petId, petName, limit });
    return (result.recommendations || []).map((p) => {
      const normalized = normalizeProductRecord(p);
      const reason = p.recommendedReason || p.reasons?.[0] || 'Recommandé pour votre animal';
      return {
        ...normalized,
        score: p.score,
        reason,
        recommendedReason: reason,
        icon: normalized.icon || normalized.imageUrl || normalized.image || '🛒',
      };
    });
  } catch (err) {
    console.error('Recommendation error:', err);
    return [];
  }
}

function detectIntent(text) {
  const t = String(text || '').toLowerCase();

  const searchWords = /recommand|suggest|idée|besoin|cherche|trouver|quel|quoi|produit|acheter|offre|promo|plan|nutrition|alimentation|croquettes|nourriture|conseil/;
  const promoWords = /promo|promotion|soldes|rabais|offre|discount|réduction|moins cher/;
  const promoCodeWords = /code promo|code-promo|coupon|utiliser un code|code de réduction|promo code/i;
  const orderWords = /ma commande|mes commandes|suivi|livraison|statut|où en est|commande en cours|dernière commande/i;
  const paymentWords = /paiement|payer|stripe|checkout|carte bancaire|mode de paiement|comment payer|facture impay/i;
  const greetingWords = /bonjour|salut|hello|hey|coucou|bonsoir/;
  const thanksWords = /merci|thanks|thank you|cool|super|génial|parfait/;
  const byeWords = /au revoir|bye|adieu|à plus|à bientôt/;
  const profileWords = /profil|mon animal|mon chien|mon chat|âge|type|préférence/;

  // Event / rendez-vous
  const eventWords = /événement|evenement|anniversaire|rendez-vous|rendez vous|rdv|competition|compétition|match|cadeau|avis (événement|evenement)|avis (rendez-vous|rendez vous)|l(aisser)? un avis/;

  // Veterinary / diagnostic
  // Keep broad keywords so the UI can show the veterinary CTA.
  const veterinaryWords = /vétérinaire|veterinary|diagnostic|profil animal|profil du animal|rendez-vous|rendez vous|rdv|consultation|urgence|contacter|contact|cabinet|vétérinaire|vet/i;



  if (byeWords.test(t)) return 'goodbye';
  if (thanksWords.test(t)) return 'thanks';
  if (greetingWords.test(t)) return 'greeting';
  if (promoCodeWords.test(t)) return 'promo_code';
  if (orderWords.test(t)) return 'orders';
  if (paymentWords.test(t)) return 'payment';
  if (promoWords.test(t)) return 'promo';
  if (profileWords.test(t)) return 'profile';
  if (veterinaryWords.test(t)) return 'veterinary';
  if (eventWords.test(t)) return 'events';
  if (searchWords.test(t)) return 'recommend';
  return 'other';
}



function parseUserPreferences(user) {
  const raw = user?.preferences;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function normalizeUserForChat(user) {
  if (!user) return user;
  const preferences = parseUserPreferences(user);
  let favoriteCategories = user.favoriteCategories;
  if (typeof favoriteCategories === 'string' && favoriteCategories.trim()) {
    try {
      favoriteCategories = JSON.parse(favoriteCategories);
    } catch {
      favoriteCategories = favoriteCategories.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return {
    ...user,
    preferences,
    favoriteCategories: Array.isArray(favoriteCategories) ? favoriteCategories : [],
  };
}

function isUserProfileComplete(user) {
  const u = normalizeUserForChat(user);
  return !!(u?.petType && u?.petAge != null && u.preferences.length > 0);
}

const PET_TYPE_LABELS = { dog: 'chien', cat: 'chat', bird: 'oiseau', fish: 'poisson', other: 'animal' };

async function getPromoProducts(limit = 6) {
  if (isDemoMode()) {
    return demoStore.getProducts()
      .filter((p) => effectiveDiscount(p) > 0 || p.isOnSale)
      .slice(0, limit)
      .map((p) => enrichProduct(normalizeProductRecord(p)));
  }
  const products = await prisma.product.findMany({
    where: { OR: [{ discount: { gt: 0 } }, { isOnSale: true }] },
    take: limit * 2,
  });
  return products
    .filter((p) => effectiveDiscount(p) > 0 || p.isOnSale)
    .slice(0, limit)
    .map((p) => enrichProduct(normalizeProductRecord(p)));
}

function buildAutoFaqResponse(userMessage, user) {
  const t = String(userMessage || '').toLowerCase();
  const petLabel = PET_TYPE_LABELS[user?.petType] || 'animal';

  if (/livraison|délai|delai|expédition|expedition|recevoir|quand.*commande|combien.*temps/.test(t)) {
    return {
      content:
        '🚚 **Livraison PetfoodTN**\n\n' +
        '• Délai moyen : **24 à 48 h** (Grand Tunis) · **2 à 4 jours** ailleurs\n' +
        '• Suivi dans **Mes commandes** dès expédition (statut « Expédiée »)\n' +
        '• Livraison gratuite à partir de **80 DT** d\'achat\n\n' +
        'Besoin du statut d\'une commande en cours ?',
      quickReplies: ['Mes commandes', 'Passer commande', 'Guide paiement'],
    };
  }

  if (/stock|disponib|rupture|en stock|reste/.test(t)) {
    return {
      content:
        '📦 **Disponibilité**\n\n' +
        'Les produits affichent leur stock en temps réel sur la boutique. ' +
        'En cas de rupture, nous vous proposons des **alternatives similaires** adaptées à votre ' + petLabel + '.\n\n' +
        'Indiquez-moi un produit ou demandez des recommandations.',
      quickReplies: ['Recommandations', 'Voir les promotions', 'Tous les produits'],
    };
  }

  if (/composition|ingrédient|ingredient|allerg|sans céréale|grain.?free|taurine|protéine/.test(t)) {
    return {
      content:
        '🧪 **Composition & allergies**\n\n' +
        'Chaque fiche produit détaille la **composition** et le **mode d\'emploi**. ' +
        'Pour un ' + petLabel + ', vérifiez les protéines, l\'absence de céréales si sensible, et faites une **transition sur 7 jours**.\n\n' +
        'Ouvrez un produit puis « Demander à l\'IA » pour une analyse personnalisée.',
      quickReplies: ['Recommandations', 'Croquettes sans céréales', 'Voir les promotions'],
    };
  }

  if (/portion|dose|quantit|gramme|g\/jour|combien.*donner|combien.*manger/.test(t)) {
    const ageHint = user?.petAge != null ? ` (${user.petAge} an(s))` : '';
    return {
      content:
        '🥄 **Portions recommandées**\n\n' +
        'Règle générale pour votre ' + petLabel + ageHint + ' :\n' +
        '• **Chat 4–5 kg** : 45–65 g croquettes/jour\n' +
        '• **Chien 15–20 kg** : 250–320 g/jour\n' +
        '• Ajustez selon activité, stérilisation et avis vétérinaire\n\n' +
        'Consultez le dos du produit ou demandez une recommandation sur mesure.',
      quickReplies: ['Recommandations', 'Plan nutritionnel', 'Contacter vétérinaire'],
    };
  }

  if (/retour|rembours|échange|echange|garantie|produit.*abim|endommag/.test(t)) {
    return {
      content:
        '↩️ **Retours & SAV**\n\n' +
        '• Produit endommagé : contactez-nous sous **48 h** avec photo\n' +
        '• Remboursement ou échange sous **5 jours ouvrés**\n' +
        '• Aliments ouverts : retour possible si défaut avéré\n\n' +
        'Une réclamation ? Menu **Réclamations** ou décrivez votre problème ici.',
      quickReplies: ['Mes commandes', 'Recommandations', 'Guide paiement'],
    };
  }

  if (/prix|coût|cout|cher|moins cher|économ|econom|budget/.test(t)) {
    return {
      content:
        '💰 **Prix & économies**\n\n' +
        '• Section **Promotions** : remises jusqu\'à -20 %\n' +
        '• Codes promo : **CHAT10**, **BIENVENUE20**, **FIDELITE15**\n' +
        '• Filtrez par budget « Économique » dans votre profil\n\n' +
        'Je peux lister les promos adaptées à votre ' + petLabel + '.',
      quickReplies: ['Voir les promotions', 'Codes promo disponibles', 'Recommandations'],
    };
  }

  return null;
}

function extractPromoCode(text) {
  const upper = String(text || '').toUpperCase();
  const match = upper.match(/\b([A-Z][A-Z0-9]{3,19})\b/);
  if (!match) return null;
  const candidate = match[1];
  if (['CHAT', 'CHIEN', 'VOIR', 'CODE', 'PROMO', 'BIENVENUE'].includes(candidate)) return null;
  return candidate;
}

const ORDER_STATUS_LABELS = {
  pending: 'En attente',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};

async function getRecentOrdersSummary(userId) {
  if (isDemoMode()) {
    const user = demoStore.getUserById(userId) || { _id: userId, id: userId };
    const orders = demoStore.getOrders(user).slice(0, 3);
    return orders.map((o) => ({
      id: o._id || o.id,
      total: o.total,
      status: o.status,
      createdAt: o.createdAt,
      promoCodeText: o.promoCodeText,
    }));
  }
  return prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: {
      id: true,
      total: true,
      status: true,
      createdAt: true,
      promoCodeText: true,
      promoDiscount: true,
    },
  });
}

async function buildPromoCodeAssistantResponse(userMessage, subtotalHint = 50) {
  const code = extractPromoCode(userMessage);
  if (code) {
    try {
      if (isDemoMode()) {
        const demoCodes = {
          CHAT10: { label: 'Promo chats', pct: 0.1, cap: 25, min: 30 },
          BIENVENUE20: { label: 'Bienvenue', fixed: 20, min: 80 },
          FIDELITE15: { label: 'Fidélité', pct: 0.15, cap: 40, min: 50 },
        };
        const meta = demoCodes[code];
        if (!meta) throw new Error('Code promo invalide ou inactif');
        if (subtotalHint < meta.min) throw new Error(`Montant minimum : ${meta.min} DT`);
        const discount = meta.fixed != null
          ? meta.fixed
          : Math.min(subtotalHint * meta.pct, meta.cap);
        return {
          content:
            `✅ Code **${code}** (${meta.label}) valide pour ~${subtotalHint} DT.\n\n` +
            `• Réduction : **${discount.toFixed(2)} DT**\n` +
            `• Total estimé : **${Math.max(0, subtotalHint - discount).toFixed(2)} DT**\n\n` +
            'Appliquez-le au checkout (section Code promo).',
          quickReplies: ['Passer commande', 'Codes promo disponibles'],
          promoCode: code,
        };
      }
      const result = await promoService.validatePromoCode(code, subtotalHint);
      const label = result.label ? ` (${result.label})` : '';
      return {
        content:
          `✅ Code **${result.code}**${label} valide pour un panier d'environ ${subtotalHint} DT.\n\n` +
          `• Réduction : **${result.discount.toFixed(2)} DT**\n` +
          `• Total estimé : **${result.finalTotal.toFixed(2)} DT**\n\n` +
          'Appliquez-le à l\'étape paiement (section « Code promo ») avant de confirmer.',
        quickReplies: ['Passer commande', 'Codes promo disponibles', 'Voir les promotions'],
        promoCode: result.code,
      };
    } catch (err) {
      return {
        content: `❌ ${err.message || 'Code invalide'}. Demandez « Codes promo disponibles » pour voir les offres actives.`,
        quickReplies: ['Codes promo disponibles', 'Voir les promotions', 'Passer commande'],
      };
    }
  }

  const promos = isDemoMode()
    ? [
        { code: 'CHAT10', label: 'Promo chats — 10 %', discountType: 'percent', discountValue: 10, minOrderAmount: 30 },
        { code: 'BIENVENUE20', label: 'Bienvenue — 20 DT', discountType: 'fixed', discountValue: 20, minOrderAmount: 80 },
        { code: 'FIDELITE15', label: 'Fidélité — 15 %', discountType: 'percent', discountValue: 15, minOrderAmount: 50 },
      ]
    : await prisma.promoCode.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

  if (!promos.length) {
    return {
      content:
        'Aucun code promo actif pour le moment. Les produits en **promotion catalogue** (remise sur fiche produit) restent disponibles.',
      quickReplies: ['Voir les promotions', 'Passer commande', 'Agent IA complet'],
    };
  }

  const lines = promos.map((p) => {
    const val = p.discountType === 'fixed'
      ? `${Number(p.discountValue).toFixed(0)} DT de réduction`
      : `${Number(p.discountValue)} %`;
    const min = Number(p.minOrderAmount || 0) > 0
      ? ` · min. ${Number(p.minOrderAmount).toFixed(0)} DT`
      : '';
    return `• **${p.code}** — ${val}${min}${p.label ? ` (${p.label})` : ''}`;
  });

  return {
    content:
      '🎟️ **Codes promo disponibles :**\n\n' +
      lines.join('\n') +
      '\n\nSaisissez le code au **checkout** (section Code promo) ou demandez « Valider CHAT10 ».',
    quickReplies: ['Passer commande', 'Voir les promotions', 'Guide paiement'],
  };
}

async function buildOrdersAssistantResponse(userId) {
  const orders = await getRecentOrdersSummary(userId);
  if (!orders.length) {
    return {
      content:
        'Vous n\'avez pas encore de commande. Je peux vous recommander des produits ou vous guider vers le paiement.',
      quickReplies: ['Recommandations', 'Passer commande', 'Codes promo disponibles'],
    };
  }

  const lines = orders.map((o) => {
    const ref = String(o.id).slice(-6).toUpperCase();
    const status = ORDER_STATUS_LABELS[o.status] || o.status;
    const date = o.createdAt
      ? new Date(o.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
      : '';
    const promo = o.promoCodeText ? ` · code ${o.promoCodeText}` : '';
    return `• **#${ref}** — ${Number(o.total).toFixed(2)} DT — ${status} (${date})${promo}`;
  });

  return {
    content:
      '📦 **Vos dernières commandes :**\n\n' +
      lines.join('\n') +
      '\n\nDétails complets dans **Mes commandes**. Une livraison en cours apparaît comme « Expédiée ».',
    quickReplies: ['Mes commandes', 'Passer commande', 'Guide paiement', 'Payer mes factures'],
  };
}

function buildPaymentGuideResponse() {
  return {
    content:
      '💳 **Guide paiement PetfoodTN**\n\n' +
      '1. Ajoutez des produits au panier (boutique ou recommandations)\n' +
      '2. **Passer commande** → page checkout\n' +
      '3. Renseignez adresse + téléphone\n' +
      '4. (Optionnel) **Code promo** — ex. CHAT10, BIENVENUE20\n' +
      '5. Choisissez le mode : **Carte/Stripe**, PayPal, espèces, virement ou chèque\n' +
      '6. Confirmez — une facture est créée automatiquement\n\n' +
      'Factures déjà émises : page **Factures** ou « Payer mes factures » ici.',
    quickReplies: ['Passer commande', 'Codes promo disponibles', 'Payer mes factures', 'Mes commandes'],
  };
}
function extractAnimalType(text) {
  const t = text.toLowerCase();
  if (/chien|dog|canin/.test(t)) return 'dog';
  if (/chat|cat|félin/.test(t)) return 'cat';
  if (/oiseau|bird|perroquet|canari/.test(t)) return 'bird';
  if (/poisson|fish|aquarium/.test(t)) return 'fish';
  if (/lapin|rongeur|hamster/.test(t)) return 'other';
  return null;
}

async function buildPetAssistantResponse(userId, userMessage, user, context = {}) {
  user = normalizeUserForChat(user);
  const intent = detectIntent(userMessage);
  const isProfileComplete = isUserProfileComplete(user);
  const recommendations = await getRecommendationsForUser(userId, 4, { user, context, email: user?.email });
  const petName = context?.pet?.name || user?.petName || 'votre animal';
  const petTypeLabel = context?.pet?.type || user?.petType || 'animal';
  const lower = String(userMessage || '').toLowerCase();

  if (context?.type === 'nutrition_recommendation') {
    return {
      content:
        `Voici un plan nutritionnel personnalisé pour ${petName} (${petTypeLabel}). Je vous propose des produits adaptés, un suivi progressif et une validation vétérinaire si nécessaire.`,
      products: recommendations,
      quickReplies: ['Autres recommandations', 'Voir les promotions', 'Contacter vétérinaire'],
      shouldShowVetCTA: true,
    };
  }

  if (!isProfileComplete) {
    return {
      content:
        "Pour vous proposer un plan nutritionnel concret, parlez-moi d'abord de votre animal : type, âge et préférences alimentaires.",
      quickReplies: ['🐶 Chien', '🐱 Chat', '🐦 Oiseau', '🐠 Poisson', '🐾 Autre'],
      products: [],
    };
  }

  if (intent === 'veterinary' || /vétérinaire|veterinaire|consultation|symptôme|symptomes|urgence/.test(lower)) {
    return {
      content:
        "🩺 Pour un suivi vétérinaire, je vous recommande de contacter le vétérinaire. En attendant, voici des recommandations nutritionnelles adaptées à votre animal.",
      products: recommendations,
      quickReplies: ['Contacter vétérinaire', 'Voir les recommandations', 'Modifier mon profil'],
      shouldShowVetCTA: true,
    };
  }

  if (intent === 'recommend' || /plan|nutrition|alimentation|croquettes|nourriture|aliment|régime|régime alimentaire/.test(lower)) {
    return {
      content: `Je vous propose ces recommandations pour ${petName} (${petTypeLabel}) :`,
      products: recommendations,
      quickReplies: ['Autres recommandations', 'Voir les promotions', 'Contacter vétérinaire'],
      shouldShowVetCTA: true,
    };
  }

  if (intent === 'greeting') {
    return {
      content: `Bonjour ! Je peux déjà vous proposer un plan nutritionnel personnalisé pour ${petName} (${petTypeLabel}).`,
      products: recommendations,
      quickReplies: ['Oui, s’il vous plaît', 'Voir les promotions', 'Contacter vétérinaire'],
      shouldShowVetCTA: true,
    };
  }

  return {
    content:
      `Je peux générer un plan nutritionnel et des recommandations de produits pour ${petName} (${petTypeLabel}). Dites-moi vos objectifs, allergies ou préférences.`,
    products: recommendations,
    quickReplies: ['Plan nutritionnel', 'Recommandations', 'Contacter vétérinaire'],
    shouldShowVetCTA: true,
  };
}

/** Réponses assistant pour les comptes admin (pas de flux « animal de compagnie »). */
function buildAdminAssistantResponse(userMessage, user) {
  const t = userMessage.toLowerCase().trim();
  const intent = detectIntent(userMessage);

  if (intent === 'goodbye') {
    return { content: 'Au revoir. Bonne gestion sur PetFoodTN.', quickReplies: [] };
  }
  if (intent === 'thanks') {
    return { content: "Avec plaisir. Revenez vers moi si vous avez besoin d'un rappel sur le back-office.", quickReplies: ['Commandes', 'Produits'] };
  }
  if (intent === 'greeting' || /^(bonjour|salut|hello|hey|coucou|bonsoir)\b/.test(t)) {
    return {
      content:
        'Bonjour ' +
        (user?.name || '') +
        ". Je suis l'assistant PetfoodTN pour l'administration. Je peux vous orienter vers les sections du menu (commandes, produits, avis, réclamations, factures, utilisateurs). Que cherchez-vous ?",
      quickReplies: ['Commandes', 'Produits', 'Avis', 'Réclamations', 'Factures', 'Utilisateurs']
    };
  }
  if (/commande/.test(t)) {
    return {
      content:
        'Les commandes se gèrent dans le menu Gestion > Commandes (chemin /admin/orders). Vous y voyez les statuts et pouvez les mettre à jour.',
      quickReplies: ['Produits', 'Factures', 'Réclamations', 'Dashboard']
    };
  }
  if (/produit/.test(t)) {
    return {
      content: 'Les produits : menu Gestion > Produits (/admin/products). Vous pouvez créer, modifier le stock et les prix.',
      quickReplies: ['Commandes', 'Utilisateurs', 'Avis']
    };
  }
  if (/avis|réclamation|réclam/.test(t)) {
    return {
      content:
        'Feedback : menu Feedback > Avis (/admin/reviews) et Réclamations (/admin/complaints) pour répondre aux clients.',
      quickReplies: ['Commandes', 'Produits', 'Dashboard']
    };
  }
  if (/facture|facturation/.test(t)) {
    return { content: 'Les factures : Gestion > Factures (/admin/invoices).', quickReplies: ['Commandes', 'Produits'] };
  }
  if (/utilisateur|client|membre/.test(t)) {
    return { content: 'Les utilisateurs : Gestion > Utilisateurs (/admin/users).', quickReplies: ['Commandes', 'Produits'] };
  }
  if (/vétérinaire|veterinary/.test(t)) {
    return { content: 'Suivi vétérinaire : Gestion > Suivi Vétérinaire (/admin/veterinary).', quickReplies: ['Commandes', 'Produits'] };
  }
  if (/dashboard|tableau|stat/.test(t)) {
    return { content: 'Le tableau de bord : Analytics > Dashboard (/admin/dashboard) et Historique (/admin/history).', quickReplies: ['Commandes', 'Produits'] };
  }
  return {
    content:
      "Je n'ai pas reconnu le sujet. Utilisez le menu latéral : Analytics (dashboard, historique), Gestion (commandes, factures, produits, utilisateurs, vétérinaire), Feedback (avis, réclamations), Paramètres (profil). Posez un mot-clé : commandes, produits, avis…",
    quickReplies: ['Commandes', 'Produits', 'Avis', 'Dashboard']
  };
}

/** Réponses assistant pour les livreurs. */
function buildLivreurAssistantResponse(userMessage, user) {
  const t = userMessage.toLowerCase().trim();
  const intent = detectIntent(userMessage);

  if (intent === 'goodbye') {
    return { content: 'Bonne route et à bientôt.', quickReplies: [] };
  }
  if (intent === 'thanks') {
    return { content: 'Avec plaisir. Bonne tournée.', quickReplies: ['Commandes', 'Carte'] };
  }
  if (intent === 'greeting' || /^(bonjour|salut|hello|hey|coucou|bonsoir)\b/.test(t)) {
    return {
      content:
        'Bonjour ' +
        (user?.name || '') +
        '. Assistant livreur PetFoodTN : je peux vous rappeler où voir vos livraisons, la carte, les messages et vos gains.',
      quickReplies: ['Commandes', 'Carte', 'Messages', 'Gains', 'Tableau de bord']
    };
  }
  if (/commande|livraison|livrer/.test(t)) {
    return {
      content: 'Vos tournées : Activités > Commandes (/livreur/orders). Mettez à jour le statut des livraisons depuis cette page.',
      quickReplies: ['Carte', 'Messages', 'Gains']
    };
  }
  if (/carte|itinéraire|adresse|gps|map/.test(t)) {
    return {
      content: 'La carte : Activités > Carte (/livreur/map) pour visualiser les points de livraison.',
      quickReplies: ['Commandes', 'Messages']
    };
  }
  if (/message|notif/.test(t)) {
    return { content: 'Les messages : Communications > Messages (/livreur/messages).', quickReplies: ['Commandes', 'Carte'] };
  }
  if (/gain|rémun|argent|paiement/.test(t)) {
    return { content: 'Vos gains : Statistiques > Gains (/livreur/earnings).', quickReplies: ['Commandes', 'Statistiques'] };
  }
  if (/stat|statistique/.test(t)) {
    return { content: 'Statistiques : menu Statistiques > Statistiques (/livreur/stats).', quickReplies: ['Gains', 'Commandes'] };
  }
  if (/historique/.test(t)) {
    return { content: 'Historique : Historique & Profil > Historique (/livreur/history).', quickReplies: ['Commandes', 'Profil'] };
  }
  if (/profil|compte/.test(t)) {
    return { content: 'Votre profil livreur : Historique & Profil > Profil (/livreur/profile).', quickReplies: ['Commandes', 'Carte'] };
  }
  if (/dashboard|tableau/.test(t)) {
    return { content: 'Tableau de bord : Activités > Tableau de bord (/livreur/dashboard).', quickReplies: ['Commandes', 'Carte'] };
  }
  return {
    content:
      "Je n'ai pas reconnu le sujet. Raccourcis : Commandes, Carte, Messages, Gains, Tableau de bord — tout est dans le menu latéral. Posez un mot-clé.",
    quickReplies: ['Commandes', 'Carte', 'Messages', 'Gains']
  };
}

async function buildResponse(userId, userMessage, user, context = {}) {
  user = normalizeUserForChat(user);
  if (user?.role === 'admin') {
    return buildAdminAssistantResponse(userMessage, user);
  }
  if (user?.role === 'livreur') {
    return buildLivreurAssistantResponse(userMessage, user);
  }

  if (context?.type === 'vet_health_assist') {
    const mode = context.mode || 'diagnostic';
    const pet = context.pet || {};
    const petLabel = PET_TYPE_LABELS[pet.type] || pet.type || 'animal';
    const namePart = pet.name ? ` **${pet.name}**` : '';
    const lower = userMessage.toLowerCase();

    if (mode === 'ordonnance' || /ordonnance|médicament|medicament|prescri/.test(lower)) {
      return {
        content:
          `💊 **Orientation ordonnance** pour votre ${petLabel}${namePart}\n\n` +
          'Seul un vétérinaire habilité peut délivrer une ordonnance officielle. Voici ce que vous pouvez préparer :\n\n' +
          '• Listez les symptômes, durée et traitements déjà essayés\n' +
          '• Notez le poids actuel et les allergies connues\n' +
          '• Apportez le carnet de vaccination au RDV\n\n' +
          'Vos ordonnances validées apparaissent dans la section « Ordonnances & suivi » après consultation.',
        quickReplies: ['Contacter vétérinaire', 'Réserver un RDV', 'Plan de suivi'],
        shouldShowVetCTA: true,
      };
    }

    if (mode === 'suivi' || /suivi|surveiller|contrôle|controle|évolution|evolution/.test(lower)) {
      return {
        content:
          `📈 **Plan de suivi** pour votre ${petLabel}${namePart}\n\n` +
          '• Surveillez appétit, boisson, énergie et selles/urines pendant 48–72 h\n' +
          '• Notez toute aggravation (prostration, vomissements répétés, douleur)\n' +
          '• Respectez la posologie prescrite sans modifier les doses\n' +
          '• Planifiez le contrôle recommandé par le vétérinaire\n\n' +
          'Consultez votre dossier médical pour l\'historique complet.',
        quickReplies: ['Contacter vétérinaire', 'Dossier médical', 'Réserver un RDV'],
        shouldShowVetCTA: true,
      };
    }

    return {
      content:
        `🔬 **Analyse préliminaire** pour votre ${petLabel}${namePart}\n\n` +
        'D\'après votre description, voici une orientation (non définitive) :\n\n' +
        '• Surveillez l\'évolution des symptômes sur 24–48 h\n' +
        '• Isolez l\'animal si contagion suspectée (autres animaux)\n' +
        '• Maintenez l\'hydratation et évitez les automédications\n\n' +
        '⚠️ Consultez en **urgence** si : difficulté respiratoire, gencives pâles, vomissements répétés, prostration ou douleur intense.\n\n' +
        'Un vétérinaire proche peut confirmer le diagnostic et prescrire un traitement adapté.',
      quickReplies: ['Contacter vétérinaire', 'Réserver un RDV', 'Plan de suivi'],
      shouldShowVetCTA: true,
    };
  }

  if (context?.type === 'nutrition_recommendation') {
    const recs = await getRecommendationsForUser(userId, 4, { user, context, email: user?.email });
    return {
      content:
        "J'ai analysé votre demande nutritionnelle. Voici des recommandations personnalisées et des produits adaptés à votre animal.",
      products: recs,
      quickReplies: ['Autres recommandations', 'Voir les promotions', 'Contacter vétérinaire'],
      shouldShowVetCTA: true,
    };
  }

  if (context?.type === 'product_question' && context?.product) {
    const p = enrichProduct(normalizeProductRecord(context.product));
    const recs = await getRecommendationsForUser(userId, 4, { user, context, email: user?.email });
    const related = recs.filter((r) => r.animalType === p.animalType || r.category === p.category).slice(0, 3);
    const disc = effectiveDiscount(p);
    const lines = [
      `Voici mon analyse pour **${p.name}** :`,
      p.description ? p.description : 'Produit nutrition PetfoodTN adapté aux besoins de votre compagnon.',
      p.composition ? `**Composition :** ${p.composition}` : null,
      p.usage ? `**Utilisation :** ${p.usage}` : null,
      `Catégorie : ${p.category || 'nourriture'} · Animal : ${p.animalType || '—'} · Prix : ${Number(p.price || 0).toFixed(2)} DT${disc ? ` → **${Number(p.discountPrice || p.price * (1 - disc / 100)).toFixed(2)} DT** (-${disc}%)` : ''}.`,
      p.stock > 0 ? '✅ Disponible en stock.' : '⚠️ Stock limité — vérifiez la disponibilité.',
      'Conseil : respectez la transition alimentaire sur 7 jours et ajustez les portions selon le poids et l\'activité.',
    ].filter(Boolean);
    return {
      content: lines.join('\n\n'),
      products: related.length ? related : recs.slice(0, 3),
      quickReplies: ['Portion recommandée', 'Alternative moins chère', 'Voir promotions'],
    };
  }

  if (context?.type === 'catalog_question') {
    const recs = await getRecommendationsForUser(userId, 6, { user, context, email: user?.email });
    const sample = (context.catalogSample || []).slice(0, 5).map((c) => `• ${c.name} (${c.animalType}, ${Number(c.price || 0).toFixed(2)} DT)`).join('\n');
    const croquetteHint = /croquette|croquettes|kibble/i.test(userMessage)
      ? 'Pour les croquettes, privilégiez une formule adaptée à l\'espèce, l\'âge et le poids. Chat stérilisé ou chien senior = besoins différents.'
      : '';
    return {
      content: [
        croquetteHint || 'Voici des suggestions basées sur notre catalogue et votre profil :',
        sample || recs.map((r) => `• ${r.name}`).join('\n'),
        '\nSouhaitez-vous comparer deux produits ou filtrer par animal (chien/chat) ?',
      ].filter(Boolean).join('\n\n'),
      products: recs.slice(0, 4),
      quickReplies: ['Croquettes chat', 'Croquettes chien', 'Produits en promo', 'Mon profil animal'],
    };
  }

  const intent = detectIntent(userMessage);
  const isProfileComplete = isUserProfileComplete(user);
  const lower = userMessage.toLowerCase();

  const faqHit = buildAutoFaqResponse(userMessage, user);
  if (faqHit && intent === 'other') {
    return faqHit;
  }

  if (intent === 'greeting') {
    if (!isProfileComplete) {
      return {
        content: "Bonjour ! 🐾 Je suis votre assistant PetfoodTN. Pour vous proposer les meilleures recommandations, j'aimerais en savoir plus sur votre animal. Quel type d'animal avez-vous ? (chien, chat, oiseau, poisson, autre)",
        quickReplies: ['🐶 Chien', '🐱 Chat', '🐦 Oiseau', '🐠 Poisson', '🐾 Autre']
      };
    }
    const petLabel = PET_TYPE_LABELS[user.petType] || user.petType;
    const promos = await getPromoProducts(4);
    const recs = await getRecommendationsForUser(userId, 4, { user, context, email: user?.email });
    const promoLine = promos.length
      ? `\n\n🔥 **${promos.length} promotion(s)** en cours — jusqu'à -${Math.max(...promos.map((p) => effectiveDiscount(p)))} % !`
      : '';
    return {
      content:
        'Bonjour ' + (user?.name || '') + ' ! 🐾 Ravi de vous revoir. ' +
        'Voici des produits adaptés à votre **' + petLabel + '**' +
        (user.petAge != null ? ' (' + user.petAge + ' an(s))' : '') +
        ' selon vos préférences (' + user.preferences.join(', ') + ').' + promoLine,
      products: recs.length ? recs : promos,
      quickReplies: ['Oui, montre-moi !', 'Voir les promotions', 'Codes promo disponibles', 'Mon profil']
    };
  }

  const extractedAnimal = extractAnimalType(userMessage);
  if (extractedAnimal && !user?.petType) {
    if (!isDemoMode()) {
      await prisma.user.update({ where: { id: userId }, data: { petType: extractedAnimal } });
    }
    return {
      content: 'Super, un ' + extractedAnimal + ' ! 🎉 Quel est son âge (en années) ?',
      quickReplies: ['Moins d\'1 an', '1-3 ans', '3-7 ans', 'Plus de 7 ans']
    };
  }

  if (/\d+/.test(userMessage) && user?.petType && !user?.petAge) {
    const ageMatch = userMessage.match(/\d+/);
    const age = ageMatch ? parseInt(ageMatch[0]) : null;
    if (age != null) {
      if (!isDemoMode()) {
        await prisma.user.update({ where: { id: userId }, data: { petAge: age } });
      }
      return {
        content: 'Parfait ! Et quelles sont vos préférences ? (premium, bio, sans céréales, grain-free...)',
        quickReplies: ['Premium', 'Bio', 'Sans céréales', 'Économique', 'Peu importe']
      };
    }
  }

  if (user?.petType && user?.petAge != null && !user.preferences.length) {
    const prefs = ['premium', 'bio', 'sans céréales', 'grain-free', 'économique']
      .filter(p => userMessage.toLowerCase().includes(p) || (userMessage.toLowerCase().includes('économique') && p === 'économique'));
    const chosen = prefs.length > 0 ? prefs : [userMessage.trim()];
    if (!isDemoMode()) {
      await prisma.user.update({ where: { id: userId }, data: { preferences: chosen } });
    }
    return {
      content: 'Excellent ! Merci pour ces informations. 🎉 Voici mes recommandations personnalisées pour votre ' + user.petType + ' de ' + user.petAge + ' an(s) :',
      products: await getRecommendationsForUser(userId, 4, { user, context, email: user?.email }),
      quickReplies: ['Autres recommandations', 'Voir les promotions', 'Modifier mon profil']
    };
  }

  // Codes promo, suivi commandes, guide paiement
  if (
    intent === 'promo_code' ||
    /codes promo disponibles|liste des codes/i.test(lower)
  ) {
    return buildPromoCodeAssistantResponse(userMessage);
  }

  if (intent === 'orders') {
    return buildOrdersAssistantResponse(userId);
  }

  if (intent === 'payment') {
    return buildPaymentGuideResponse();
  }

  // Auto workflow: client wants promotions/discounted products
  if (intent === 'promo' || /voir les promotions|produits en promo/.test(lower)) {
    const promos = await getPromoProducts(6);
    if (!isProfileComplete && !promos.length) {
      return {
        content: "Je vais vous aider ! Mais d'abord, quel type d'animal avez-vous ? 🐾",
        quickReplies: ['🐶 Chien', '🐱 Chat', '🐦 Oiseau', '🐠 Poisson', '🐾 Autre']
      };
    }

    if (!promos.length) {
      return {
        content: 'Aucune promotion active pour le moment. Revenez bientôt ou consultez nos recommandations personnalisées !',
        products: await getRecommendationsForUser(userId, 4, { user, context, email: user?.email }),
        quickReplies: ['Recommandations', 'Codes promo disponibles', 'Passer commande'],
      };
    }

    const petLabel = PET_TYPE_LABELS[user?.petType] || 'animal';
    const forPet = user?.petType
      ? promos.filter((p) => p.animalType === user.petType || p.animalType === 'other')
      : promos;
    const list = (forPet.length ? forPet : promos).slice(0, 6);
    const lines = list.map((p) => {
      const d = effectiveDiscount(p);
      return `• **${p.name}** — ${Number(p.price).toFixed(2)} DT → **${Number(p.discountPrice || p.price * (1 - d / 100)).toFixed(2)} DT** (-${d}%)`;
    }).join('\n');

    return {
      content:
        '🔥 **Promotions en cours**' +
        (user?.petType ? ` pour votre ${petLabel}` : '') +
        ' :\n\n' + lines + '\n\nAjoutez-les au panier ou lancez le workflow automatique.',
      products: list,
      workflow: { step: 'select_discounted_products' },
      quickReplies: ['Lancer automatiquement', 'Recommandations', 'Codes promo disponibles'],
    };
  }

  if (intent === 'recommend' || (isProfileComplete && /croquette|croquettes|alimentation|nutrition|plan|nourriture|aliment|conseil|recommandation|suggestion|besoin|tendance|préférence|preference/.test(lower))) {
    if (!isProfileComplete) {
      return {
        content: "Je vais vous aider ! Mais d'abord, quel type d'animal avez-vous ? 🐾",
        quickReplies: ['🐶 Chien', '🐱 Chat', '🐦 Oiseau', '🐠 Poisson', '🐾 Autre']
      };
    }
    try {
      const aiPack = await getPersonalizedRecommendations(user, { limit: 4 });
      const recs = (aiPack.recommendations || []).map((p) => ({
        ...p,
        reason: p.recommendedReason,
        recommendedReason: p.recommendedReason,
        icon: p.icon || p.imageUrl || '🛒',
      }));
      return {
        content: aiPack.summary || 'Voici vos recommandations personnalisées 🎁',
        products: recs.length ? recs : await getRecommendationsForUser(userId, 4, { user, context, email: user?.email }),
        quickReplies: ['Agent IA complet', 'Autres recommandations', 'Voir les promotions', 'Terminer'],
        aiInsightsLink: '/client-ai',
      };
    } catch (aiErr) {
      console.warn('AI recommend fallback:', aiErr.message);
    }
    const recs = await getRecommendationsForUser(userId, 4, { user, context, email: user?.email });
    return {
      content: 'Voici ce que je vous recommande pour votre ' + user.petType + ' 🎁',
      products: recs,
      quickReplies: ['Autres recommandations', 'Filtrer par catégorie', 'Voir les promotions', 'Terminer']
    };
  }

  if (intent === 'profile') {
    const profileInfo = [
      user?.petType ? 'Type: ' + (PET_TYPE_LABELS[user.petType] || user.petType) : '',
      user?.petAge != null ? 'Âge: ' + user.petAge + ' an(s)' : '',
      user.preferences.length ? 'Préférences: ' + user.preferences.join(', ') : '',
      user?.favoriteCategories?.length ? 'Catégories favorites: ' + user.favoriteCategories.join(', ') : ''
    ].filter(Boolean).join(' | ') || 'Votre profil est incomplet.';
    return {
      content: '📋 Voici votre profil : ' + profileInfo + '\n\nSouhaitez-vous le modifier ?',
      quickReplies: ['Modifier mon profil', 'Recommandations', 'Terminer']
    };
  }

  if (intent === 'thanks') {
    return {
      content: "Avec plaisir ! 🐾 N'hésitez pas à revenir si vous avez besoin de nouvelles recommandations. Passez une belle journée !",
      quickReplies: ['Nouvelles recommandations', 'Au revoir']
    };
  }

  if (intent === 'goodbye') {
    return {
      content: 'Au revoir ! 🐾 À bientôt chez PetfoodTN !',
      quickReplies: []
    };
  }

  // Veterinary CTA / diagnostic flow (client)
  if (intent === 'veterinary') {
    return {
      content:
        "🩺 Pour un diagnostic ou un suivi vétérinaire, je vous propose de contacter le vétérinaire via la page 'Consultations & rendez-vous'. Vous pouvez décrire les symptômes, demander une date et suivre l'historique santé.",
      quickReplies: ['Contacter vétérinaire', 'Réserver un RDV', 'Voir l historique santé', 'Mon profil'],
      shouldShowVetCTA: true,
    };
  }

  // Events flow (client)
  if (intent === 'events') {
    return {
      content:
        'Voici la page Événements 📅 : vous pouvez y gérer les anniversaires / compétitions / autres rendez-vous. Pour laisser un avis, choisissez l\'événement puis cliquez sur **Laisser un avis**.',
      quickReplies: ['Aller sur Événements', 'Mon profil', 'Terminer']
    };
  }

  if (!isProfileComplete) {
    const faqIncomplete = buildAutoFaqResponse(userMessage, user);
    if (faqIncomplete) return faqIncomplete;

    return {
      content: 'Je ne suis pas sûr de comprendre. 😅 Commençons par votre animal : quel type avez-vous ?',
      quickReplies: ['🐶 Chien', '🐱 Chat', '🐦 Oiseau', '🐠 Poisson', '🐾 Autre']
    };
  }

  const faqComplete = buildAutoFaqResponse(userMessage, user);
  if (faqComplete) return faqComplete;

  return {
    content:
      "Je ne suis pas sûr de comprendre. 😅 Je peux vous aider sur le **catalogue**, les **codes promo**, vos **commandes**, le **paiement** ou votre profil. Que souhaitez-vous ?",
    quickReplies: ['Recommandations', 'Codes promo disponibles', 'Mes commandes', 'Guide paiement', 'Passer commande']
  };
}


const sendMessage = async (req, res) => {
  try {
    const { message, context } = req.body;
    const userId = req.user.id || req.user._id;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message required' });
    }

    let user;
    if (isDemoMode()) {
      user = normalizeUserForChat(demoStore.getUserById(userId));
    } else {
      user = normalizeUserForChat(await prisma.user.findUnique({ where: { id: userId } }));
    }

    // context currently used for UI workflow hints (not a real model prompt).
    // Keep it safe/deterministic.
    const response = await buildResponse(userId, message.trim(), user, context);


    if (!isDemoMode()) {
      try {
        await prisma.chatMessage.create({
          data: {
            userId,
            role: 'user',
            content: message.trim()
          }
        });

        await prisma.chatMessage.create({
          data: {
            userId,
            role: 'assistant',
            content: response.content,
            products: response.products || null,
            quickReplies: response.quickReplies || null
          }
        });
      } catch (dbErr) {
        console.error('Chat DB save error (non-critical in demo):', dbErr.message);
      }
    }

    res.json({
      message: response.content,
      products: response.products || [],
      quickReplies: response.quickReplies || [],
      shouldShowVetCTA: !!response.shouldShowVetCTA,
      promoCode: response.promoCode || null,
    });
  } catch (error) {
    console.error('Chat message error:', error);
    res.status(500).json({ error: error.message });
  }
};

const sendPetMessage = async (req, res) => {
  try {
    const { message, context } = req.body;
    const userId = req.user.id || req.user._id;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message required' });
    }

    let user;
    if (isDemoMode()) {
      user = normalizeUserForChat(demoStore.getUserById(userId));
    } else {
      user = normalizeUserForChat(await prisma.user.findUnique({ where: { id: userId } }));
    }

    const response = await buildPetAssistantResponse(userId, message.trim(), user, context);

    if (!isDemoMode()) {
      try {
        await prisma.chatMessage.create({
          data: {
            userId,
            role: 'user',
            content: message.trim()
          }
        });

        await prisma.chatMessage.create({
          data: {
            userId,
            role: 'assistant',
            content: response.content,
            products: response.products || null,
            quickReplies: response.quickReplies || null
          }
        });
      } catch (dbErr) {
        console.error('Chat DB save error (non-critical in demo):', dbErr.message);
      }
    }

    res.json({
      message: response.content,
      products: response.products || [],
      quickReplies: response.quickReplies || [],
      shouldShowVetCTA: !!response.shouldShowVetCTA,
    });
  } catch (error) {
    console.error('Pet chat message error:', error);
    res.status(500).json({ error: error.message });
  }
};

const getHistory = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    if (isDemoMode()) {
      // In demo mode we still want the UI to display conversation history.
      // Fetch the same persisted records from DB if available.
      // If DB is not connected, it will be handled by the catch below.
      const messages = await prisma.chatMessage.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        take: 100
      });
      return res.json(messages);
    }

    const messages = await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: 100
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const clearHistory = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    if (isDemoMode()) {
      return res.json({ message: 'Chat cleared' });
    }
    await prisma.chatMessage.deleteMany({ where: { userId } });
    res.json({ message: 'Chat cleared' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  sendMessage,
  sendPetMessage,
  getHistory,
  clearHistory
};
