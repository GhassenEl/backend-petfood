const { prisma } = require('../prismaClient');
const { getReviewBasedRecommendations } = require('./reviewRecommendation.service');

const detectProductIntent = (text) =>
  /recommand|suggest|produit|acheter|croquette|nourriture|compar|meilleur|top|avis|note|étoile|etoile|chat|chien|animal/i.test(
    String(text || ''),
  );

const extractAnimal = (text) => {
  const t = String(text || '').toLowerCase();
  if (/chien|dog|canin/.test(t)) return 'dog';
  if (/chat|cat|félin|felin/.test(t)) return 'cat';
  if (/oiseau|bird/.test(t)) return 'bird';
  if (/poisson|fish|aquarium/.test(t)) return 'fish';
  return null;
};

async function loadRecoProducts(message, extra = {}) {
  return getReviewBasedRecommendations({
    query: message,
    animalType: extra.animalType || extractAnimal(message),
    category: extra.category || null,
    limit: extra.limit || 5,
  });
}

function buildModeratorResponse(userMessage, user) {
  const t = String(userMessage || '').toLowerCase().trim();
  const name = user?.name ? ` ${user.name.split(' ')[0]}` : '';

  if (/bonjour|salut|hello|coucou/.test(t)) {
    return {
      content:
        `Bonjour${name} ! Assistant modération PetfoodTN — je réponds à vos questions sur vendeurs, contenu, litiges, anti-fraude et messagerie.`,
      quickReplies: ['Vendeurs en attente', 'Centre anti-fraude', 'Produits à valider', 'Messagerie'],
    };
  }
  if (/vendeur|partenaire|boutique|marketplace/.test(t)) {
    return {
      content:
        '**Vendeurs** : `/moderator/vendors` — valider, vérifier les infos commerciales, suspendre par région. Bouton **Message** pour contacter un vendeur.',
      quickReplies: ['Vendeurs en attente', 'Messagerie', 'Dashboard'],
    };
  }
  if (/fraude|suspect|spam|faux avis/.test(t)) {
    return {
      content:
        '**Anti-fraude** : `/moderator/fraud` — remboursements suspects, litiges ouverts et avis NLP signalés. Actions : rejeter, classer ou résoudre.',
      quickReplies: ['Centre anti-fraude', 'Remboursements', 'Signalements'],
    };
  }
  if (/produit|contenu|validation|image/.test(t)) {
    return {
      content:
        '**Contenu** : `/moderator/content` — produits en attente, descriptions inappropriées, images non conformes.',
      quickReplies: ['Produits à valider', 'Signalements', 'Dashboard'],
    };
  }
  if (/litige|signalement|réclamation|reclamation|dispute/.test(t)) {
    return {
      content:
        '**Signalements & litiges** : `/moderator/reports` et `/moderator/complaints`. Les remboursements litigieux sont dans `/moderator/refunds`.',
      quickReplies: ['Signalements', 'Remboursements', 'Réclamations'],
    };
  }
  if (/rembours|refund/.test(t)) {
    return {
      content: '**Remboursements** : `/moderator/refunds` — valider, rejeter ou signaler fraude avec historique API.',
      quickReplies: ['Remboursements', 'Centre anti-fraude', 'Dashboard'],
    };
  }
  if (/message|contact|client/.test(t)) {
    return {
      content:
        '**Messagerie** : `/moderator/messages` — échange direct avec clients, vendeurs et administration. Filtres par rôle.',
      quickReplies: ['Messagerie', 'Vendeurs en attente', 'Dashboard'],
    };
  }
  if (/utilisateur|compte|suspend/.test(t)) {
    return {
      content: '**Comptes clients** : `/moderator/users` — suspendre, réactiver ou signaler un comportement abusif.',
      quickReplies: ['Dashboard', 'Signalements', 'Messagerie'],
    };
  }
  if (/stat|rapport|analytics|bi|kpi/.test(t)) {
    return {
      content:
        '**Rapports** : `/moderator/analytics` et `/moderator/bi` — KPIs modération, activité vendeurs et file d\'attente.',
      quickReplies: ['Dashboard', 'Rapports', 'Centre anti-fraude'],
    };
  }
  return {
    content:
      'Je peux vous guider sur : **vendeurs**, **anti-fraude**, **contenu**, **litiges**, **remboursements**, **messagerie** et **comptes**. Posez une question précise ou choisissez un raccourci.',
    quickReplies: ['Vendeurs en attente', 'Centre anti-fraude', 'Produits à valider', 'Messagerie', 'Dashboard'],
  };
}

async function buildVendorResponse(userMessage, user) {
  const t = String(userMessage || '').toLowerCase().trim();
  const name = user?.name ? ` ${user.name.split(' ')[0]}` : '';

  if (/bonjour|salut|hello/.test(t)) {
    return {
      content:
        `Bonjour${name} ! Assistant vendeur PetfoodTN — commandes, stock, commissions, assistant ML et communication client.`,
      quickReplies: ['Mes commandes', 'Assistant ML', 'Alertes stock', 'Commissions'],
    };
  }
  if (/ml|ia|prévision|prevision|forecast|promo/.test(t)) {
    return {
      content:
        '**Assistant ML** : `/vendor/ml` — prévisions CA 7j, alertes stock, suggestions promo et score de risque rupture.',
      quickReplies: ['Assistant ML', 'Mes produits', 'Dashboard'],
    };
  }
  if (/commande|livraison|vente/.test(t)) {
    return {
      content: '**Commandes** : `/vendor/orders` et historique `/vendor/sales`. Mettez à jour les statuts depuis le tableau de bord.',
      quickReplies: ['Mes commandes', 'Dashboard', 'Commissions'],
    };
  }
  if (/produit|stock|catalogue|prix/.test(t)) {
    const products = detectProductIntent(t)
      ? await loadRecoProducts(userMessage, { limit: 4 })
      : [];
    return {
      content:
        '**Produits** : `/vendor/products` — gérer catalogue, stocks et promotions. Les best-sellers marketplace ci-dessous sont classés par **avis clients** (notes 1–5 + descriptions).',
      products,
      quickReplies: ['Mes produits', 'Assistant ML', 'Alertes stock'],
    };
  }
  if (/commission|revenu|ca|chiffre/.test(t)) {
    return {
      content:
        '**Commissions** : visible sur `/vendor/dashboard` — taux plateforme ~12 %, commissions en attente et payées.',
      quickReplies: ['Dashboard', 'Mes ventes', 'Assistant ML'],
    };
  }
  if (/retour|rembours|sav/.test(t)) {
    return {
      content: '**Après-vente** : `/vendor/returns` — traiter retours et remboursements clients.',
      quickReplies: ['Retours', 'Messagerie', 'Dashboard'],
    };
  }
  if (/avis|message|client/.test(t)) {
    return {
      content: '**Communication** : `/vendor/communication` — avis produits et messages clients.',
      quickReplies: ['Messagerie', 'Mes produits', 'Dashboard'],
    };
  }
  if (detectProductIntent(t)) {
    const products = await loadRecoProducts(userMessage, { limit: 5 });
    return {
      content:
        'Voici des produits **les mieux notés** par les clients (analyse NLP sur notes 1–5 et commentaires) :',
      products,
      quickReplies: ['Mes produits', 'Assistant ML', 'Voir promotions'],
    };
  }
  return {
    content:
      'Je réponds sur : **commandes**, **produits & stock**, **ML**, **commissions**, **retours** et **communication**. Demandez aussi des recommandations produits basées sur les avis.',
    quickReplies: ['Dashboard', 'Assistant ML', 'Mes commandes', 'Mes produits'],
  };
}

async function buildVisitorResponse(userMessage, user, context = {}) {
  const t = String(userMessage || '').toLowerCase().trim();

  if (/bonjour|salut|hello|coucou/.test(t)) {
    return {
      content:
        'Bonjour ! 👋 Assistant visiteur PetfoodTN — catalogue, outils nutrition, comparateur, points de vente et recommandations par **avis clients** (notes 1 à 5). Sans inscription.',
      quickReplies: ['Recommandations', 'Simulateur nutrition', 'Comparer produits', 'Devenir vendeur'],
    };
  }
  if (/simulateur|calorie|nutrition|ration/.test(t)) {
    return {
      content:
        '**Simulateur nutrition** : `/visitor/tools?tab=simulator` — calories et ration selon espèce, poids et activité.',
      quickReplies: ['Recommandations', 'Races & besoins', 'Packs alimentaires'],
    };
  }
  if (/compar|comparer/.test(t)) {
    return {
      content:
        '**Comparateur** : `/visitor/tools?tab=compare` — comparez jusqu\'à 3 produits (prix, promo, stock).',
      quickReplies: ['Recommandations', 'Catalogue produits', 'Simulateur nutrition'],
    };
  }
  if (/magasin|point de vente|boutique|adresse/.test(t)) {
    return {
      content:
        '**Points de vente** : `/visitor/tools?tab=stores` — animaleries partenaires par région.',
      quickReplies: ['Catalogue produits', 'Recommandations', 'Devenir vendeur'],
    };
  }
  if (/vendeur|partenaire|marketplace|devenir/.test(t)) {
    return {
      content:
        '**Devenir vendeur** : `/vendor#devenir-partenaire` — formulaire candidature et accès dashboard après validation modérateur.',
      quickReplies: ['Hub vendeur', 'Catalogue produits', 'Connexion'],
    };
  }
  if (/modér|moderation|signalement/.test(t)) {
    return {
      content:
        '**Modération publique** : `/moderator` — présentation de l\'espace modération (connexion requise pour agir).',
      quickReplies: ['Catalogue produits', 'Recommandations', 'Hub visiteur'],
    };
  }
  if (/pack|race|chiot|chaton/.test(t)) {
    return {
      content:
        '**Outils visiteur** : packs `/visitor/tools?tab=packs` et races `/visitor/tools?tab=breeds`.',
      quickReplies: ['Simulateur nutrition', 'Recommandations', 'Catalogue'],
    };
  }
  if (/inscri|compte|connexion|commander/.test(t)) {
    return {
      content:
        'Pour commander : **inscription** `/register` ou **connexion** `/login`. En attendant, parcourez le catalogue et les recommandations.',
      quickReplies: ['Catalogue produits', 'Recommandations', 'Simulateur nutrition'],
    };
  }
  if (detectProductIntent(t) || context?.type === 'catalog_question') {
    const animalType = extractAnimal(t) || context?.animalType || null;
    const products = await loadRecoProducts(userMessage, { animalType, limit: 6 });
    const lines = products.slice(0, 3).map(
      (p) => `• **${p.name}** — ${p.recommendedReason || p.reason}`,
    );
    return {
      content:
        'Recommandations basées sur les **notes 1–5** et les **commentaires clients** (NLP sur descriptions + avis) :\n\n' +
        (lines.length ? lines.join('\n') : 'Parcourez le catalogue pour plus de choix.') +
        '\n\nPrécisez espèce (chien/chat) ou besoin (croquettes, sans céréales…) pour affiner.',
      products,
      quickReplies: ['Croquettes chien', 'Croquettes chat', 'Catalogue produits', 'Comparer produits'],
    };
  }
  return {
    content:
      'Je réponds à toutes vos questions sur PetfoodTN : **produits**, **nutrition**, **comparateur**, **points de vente**, **vendeurs** et **inscription**. Essayez « recommandations croquettes chat ».',
    quickReplies: ['Recommandations', 'Catalogue produits', 'Simulateur nutrition', 'Devenir vendeur'],
  };
}

async function buildRoleResponse(userMessage, user, context = {}, nlp = null) {
  const role = context?.role || user?.role || 'client';

  if (role === 'moderator') {
    let res = buildModeratorResponse(userMessage, user);
    if (detectProductIntent(userMessage)) {
      const products = await loadRecoProducts(userMessage, { limit: 4 });
      res = {
        ...res,
        content: `${res.content}\n\n**Produits les mieux notés** (référence modération contenu) :`,
        products,
      };
    }
    return res;
  }

  if (role === 'vendor') {
    return buildVendorResponse(userMessage, user);
  }

  if (role === 'visitor' || context?.public === true) {
    return buildVisitorResponse(userMessage, user, context);
  }

  return null;
}

module.exports = {
  buildModeratorResponse,
  buildVendorResponse,
  buildVisitorResponse,
  buildRoleResponse,
  loadRecoProducts,
  detectProductIntent,
};
