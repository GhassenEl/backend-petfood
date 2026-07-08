/**
 * Réponses KPI marketplace (dataset AliExpress / catalogue externe) pour le chatbot PetfoodTN.
 * Source : data/marketplace/kpi_summary.json (généré par scripts/build_marketplace_kpi_dataset.py)
 */
const fs = require('fs');
const path = require('path');

const KPI_CANDIDATES = [
  path.join(__dirname, '../data/marketplace/kpi_summary.json'),
  path.join(__dirname, '../../data/marketplace/kpi_summary.json'),
];

const CATEGORY_ALIASES = {
  jouets: ['jouet', 'jouets', 'toy', 'toys', 'interactive'],
  alimentation_eau: ['alimentation', 'eau', 'gamelle', 'feeder', 'bowl', 'fountain', 'nourriture', 'boisson'],
  litiere_hygiene: ['litiere', 'litière', 'hygiene', 'hygiène', 'litter', 'poop', 'sac', 'proprete'],
  grooming_soin: ['grooming', 'toilettage', 'bain', 'bross', 'shampoo', 'soin', 'peigne'],
  colliers_harnais: ['collier', 'harnais', 'laisse', 'leash', 'harness', 'collar'],
  lits_niches: ['lit', 'lits', 'niche', 'bed', 'panier', 'coussin', 'matelas'],
  transport_securite: ['transport', 'cage', 'porte', 'sac', 'carrier', 'crate', 'ceinture'],
  dressage: ['dressage', 'training', 'clicker', 'aboiement', 'bark'],
  accessoires_mode: ['accessoire', 'mode', 'noeud', 'bow', 'fashion'],
  vet_sante: ['veterinaire', 'vétérinaire', 'sante', 'santé', 'medicament'],
  autres: ['autre', 'autres', 'divers'],
};

const CATEGORY_LABELS = {
  jouets: 'jouets',
  alimentation_eau: 'alimentation et eau',
  litiere_hygiene: 'litière et hygiène',
  grooming_soin: 'toilettage et soin',
  colliers_harnais: 'colliers et harnais',
  lits_niches: 'lits et niches',
  transport_securite: 'transport et sécurité',
  dressage: 'dressage',
  accessoires_mode: 'accessoires mode',
  vet_sante: 'santé vétérinaire',
  autres: 'autres',
};

let cachedKpis = null;

function fmt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function loadMarketplaceKpis() {
  if (cachedKpis) return cachedKpis;
  for (const p of KPI_CANDIDATES) {
    try {
      if (fs.existsSync(p)) {
        cachedKpis = JSON.parse(fs.readFileSync(p, 'utf8'));
        return cachedKpis;
      }
    } catch {
      /* try next path */
    }
  }
  return null;
}

function detectMarketplaceKpiIntent(text) {
  const t = String(text || '').toLowerCase().trim();
  const quickHits = [
    'kpi marketplace',
    'top ventes',
    'top souhaits',
    'note moyenne',
    'répartition catégories',
    'repartition categories',
    'kpi ventes',
    'kpi stock',
    'souhaits clients',
    'moyenne ventes',
    'produits sans vente',
  ];
  if (quickHits.some((q) => t === q || t.includes(q))) return true;
  return /kpi|marketplace|catalogue externe|dataset|wished|souhait|tradeamount|vente|vendu|note moyenne|étoile|etoile|stock total|répartition|repartition|pourcentage|moyenne|somme|top produit|best.?seller|popularité|popularite|combien de produit|sans vente|rupture|corrélation|correlation|catégorie|categorie|sku|reference/i.test(
    t,
  );
}

function matchQuickKpi(t, kpis, role) {
  if (/^kpi marketplace$/.test(t)) {
    return {
      content:
        `**Synthèse marketplace** — ${fmt(kpis.total_products)} produits | ` +
        `Ventes est. **${fmt(kpis.total_sold_units_est)}** | Souhaits **${fmt(kpis.total_wished)}** | ` +
        `Note moy. **${kpis.avg_star_rated_only}/5** | Sans vente **${kpis.zero_sold_pct}%**.`,
      quickReplies: ['Top ventes', 'Top souhaits', 'Répartition catégories', 'Note moyenne'],
    };
  }
  if (/^top ventes$/.test(t)) {
    return { content: `Top ventes marketplace :\n${topSoldAnswer(kpis, 5)}`, quickReplies: ['Top souhaits', 'KPI marketplace'] };
  }
  if (/^top souhaits$/.test(t)) {
    return { content: topWishedAnswer(kpis), quickReplies: ['Top ventes', 'KPI marketplace'] };
  }
  if (/^note moyenne$/.test(t)) {
    return {
      content:
        `Note moyenne globale : **${kpis.avg_star_all}/5** | Notés uniquement : **${kpis.avg_star_rated_only}/5**.`,
      quickReplies: ['Top ventes', 'Répartition catégories'],
    };
  }
  if (/^répartition catégories$|^repartition categories$/.test(t)) {
    return { content: categoryDistributionAnswer(kpis), quickReplies: ['KPI marketplace', 'Top ventes'] };
  }
  return null;
}

function extractCategoryKey(text) {
  const t = String(text || '').toLowerCase();
  for (const [key, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((a) => t.includes(a))) return key;
  }
  return null;
}

function categoryDistributionAnswer(kpis) {
  const cats = kpis.by_category || {};
  const total = kpis.total_products || 0;
  const lines = [`Répartition sur **${fmt(total)}** produits :`];
  Object.entries(cats)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([name, c]) => {
      lines.push(`• ${CATEGORY_LABELS[name] || name} : ${c.count} (${c.share_pct}%)`);
    });
  return lines.join('\n');
}

function categoryAnswer(kpis, catKey) {
  const c = (kpis.by_category || {})[catKey];
  if (!c) return null;
  const label = CATEGORY_LABELS[catKey] || catKey;
  return (
    `**${label.charAt(0).toUpperCase() + label.slice(1)}** — ` +
    `**${fmt(c.count)}** références (${c.share_pct}% du catalogue), ` +
    `ventes est. **${fmt(c.total_sold_est)}**, souhaits **${fmt(c.total_wished)}**, ` +
    `note moy. **${c.avg_star}/5**, ${c.zero_sold_pct}% sans vente.`
  );
}

function topCategoryByWishes(kpis) {
  const cats = kpis.by_category || {};
  const best = Object.entries(cats).sort((a, b) => b[1].total_wished - a[1].total_wished)[0];
  if (!best) return 'Données catégories indisponibles.';
  const [name, c] = best;
  return (
    `La catégorie **${CATEGORY_LABELS[name] || name}** cumule **${fmt(c.total_wished)}** souhaits ` +
    `(${c.share_pct}% du catalogue, ${fmt(c.count)} SKU).`
  );
}

function topSoldAnswer(kpis, n = 3) {
  const items = (kpis.top_sold || []).slice(0, n);
  if (!items.length) return 'Aucun top vente disponible.';
  return items
    .map((p, i) => `${i + 1}. ${p.title} — ~${fmt(p.sold)} ventes (★ ${p.star})`)
    .join('\n');
}

function topWishedAnswer(kpis, n = 5) {
  const items = (kpis.top_wished || []).slice(0, n);
  if (!items.length) return 'Aucune donnée wishedCount.';
  return (
    'Top listes de souhaits :\n' +
    items.map((p) => `• ${p.title} — ${fmt(p.wished)} souhaits (${fmt(p.sold)} ventes)`).join('\n')
  );
}

function topRatedAnswer(kpis, n = 5) {
  const items = (kpis.top_rated_popular || []).slice(0, n);
  if (!items.length) return 'Aucun produit populaire bien noté.';
  return (
    'Produits populaires et bien notés :\n' +
    items.map((p) => `• ★ ${p.star} — ${p.title} (${fmt(p.sold)} ventes)`).join('\n')
  );
}

function buildAdminKpiResponse(t, kpis) {
  if (/top|meilleur|best|plus vendu/.test(t) && /vente|vendu|seller/.test(t)) {
    return { content: `Top ventes marketplace :\n${topSoldAnswer(kpis, 5)}`, quickReplies: ['Top souhaits', 'Note moyenne', 'Dashboard'] };
  }
  if (/top|meilleur|populaire/.test(t) && /souhait|wished/.test(t)) {
    return { content: topWishedAnswer(kpis), quickReplies: ['Top ventes', 'Répartition', 'Dashboard'] };
  }
  if (/combien.*produit|nombre.*produit|total.*produit|catalogue/.test(t) && !/catégorie|categorie/.test(t)) {
    return {
      content: `Le catalogue marketplace compte **${fmt(kpis.total_products)}** produits uniques.`,
      quickReplies: ['KPI ventes', 'Note moyenne', 'Répartition catégories', 'Dashboard'],
    };
  }
  if (/sans vente|0 sold|zero vente|pas vendu/.test(t)) {
    return {
      content: `**${kpis.zero_sold_pct}%** des produits n'ont aucune vente enregistrée (**${fmt(kpis.zero_sold_count)}** références).`,
      quickReplies: ['Top ventes', 'KPI stock', 'Dashboard'],
    };
  }
  if (/note moyenne|moyenne.*note|étoile|etoile|rating/.test(t)) {
    return {
      content:
        `Note moyenne globale : **${kpis.avg_star_all}/5**. ` +
        `Sur les produits notés : **${kpis.avg_star_rated_only}/5** (${kpis.rated_products_pct}% du catalogue).`,
      quickReplies: ['Produits ≥4,5★', 'Sans note', 'Top ventes'],
    };
  }
  if (/vente|vendu|tradeamount|chiffre.*vente|volume/.test(t) && !/sans vente/.test(t)) {
    return {
      content: `Volume total de ventes estimé : **${fmt(kpis.total_sold_units_est)}** unités (tradeAmount parsé).`,
      quickReplies: ['Top ventes', 'Moyenne ventes', 'Souhaits clients'],
    };
  }
  if (/souhait|wished|wishlist|liste de souhait/.test(t)) {
    return {
      content: `Total wishedCount : **${fmt(kpis.total_wished)}** | Moyenne : **${kpis.avg_wished}** par produit.`,
      quickReplies: ['Top souhaits', 'Ratio souhaits/ventes', 'Marketing'],
    };
  }
  if (/stock|quantity|inventaire/.test(t)) {
    return {
      content:
        `Stock catalogue total : **${fmt(kpis.total_stock_units)}** unités | ` +
        `Moyenne/SKU : **${fmt(kpis.avg_stock)}** | Rupture (qty=0) : **${kpis.zero_stock_pct}%**.`,
      quickReplies: ['Produits sans vente', 'KPI ventes', 'Dashboard'],
    };
  }
  if (/répartition|repartition|distribution|part du catalogue/.test(t)) {
    return { content: categoryDistributionAnswer(kpis), quickReplies: ['KPI jouets', 'KPI ventes', 'Dashboard'] };
  }
  if (/pourcentage|pour cent|%/.test(t) && /4[,.]5|excellent|bien noté|bien note/.test(t)) {
    return {
      content: `**${kpis.products_star_ge_4_5_pct}%** du catalogue atteint ≥4,5★.`,
      quickReplies: ['Note moyenne', 'Produits <3★', 'Dashboard'],
    };
  }
  if (/médiane|mediane/.test(t)) {
    return { content: `Médiane des ventes par produit : **${fmt(kpis.median_sold)}** unités.`, quickReplies: ['Moyenne ventes', 'Top ventes'] };
  }
  if (/moyenne/.test(t) && /vente/.test(t)) {
    return {
      content: `Moyenne **${kpis.avg_sold_per_product}** ventes/SKU | Médiane **${fmt(kpis.median_sold)}**.`,
      quickReplies: ['Total ventes', 'Top ventes'],
    };
  }
  const catKey = extractCategoryKey(t);
  if (catKey) {
    const ans = categoryAnswer(kpis, catKey);
    if (ans) return { content: ans, quickReplies: ['Répartition catégories', 'Top ventes', 'Dashboard'] };
  }
  if (/kpi|marketplace|stat/.test(t)) {
    return {
      content:
        `**Synthèse marketplace** — ${fmt(kpis.total_products)} produits | ` +
        `Ventes est. **${fmt(kpis.total_sold_units_est)}** | Souhaits **${fmt(kpis.total_wished)}** | ` +
        `Note moy. **${kpis.avg_star_rated_only}/5** | Sans vente **${kpis.zero_sold_pct}%**.\n\n` +
        `Posez : « top ventes », « répartition catégories », « note moyenne », « stock total », « KPI jouets »…`,
      quickReplies: ['Top ventes', 'Répartition catégories', 'Note moyenne', 'Souhaits clients'],
    };
  }
  return null;
}

function buildVendorKpiResponse(t, kpis) {
  const catKey = extractCategoryKey(t) || 'jouets';
  if (/kpi|stat|performance|benchmark|moyenne|vente|note/.test(t) || extractCategoryKey(t)) {
    const ans = categoryAnswer(kpis, catKey) || categoryAnswer(kpis, 'jouets');
    return {
      content: `**Benchmark marketplace (vendeur)**\n${ans}`,
      quickReplies: ['KPI alimentation', 'Top ventes catégorie', 'Assistant ML'],
    };
  }
  if (/moyenne.*vente|vente.*moyenne/.test(t)) {
    return {
      content: `Moyenne marketplace : **${kpis.avg_sold_per_product}** ventes/SKU (médiane ${fmt(kpis.median_sold)}).`,
      quickReplies: ['Mes produits', 'Assistant ML'],
    };
  }
  return null;
}

function buildClientKpiResponse(t, kpis) {
  if (/populaire|souhait|tendance|top|best|mieux noté|mieux note/.test(t)) {
    if (/souhait|wish|populaire/.test(t)) {
      return { content: topWishedAnswer(kpis, 5), quickReplies: ['Mieux notés', 'Catalogue', 'Recommandations'] };
    }
    if (/noté|note|étoile|etoile|mieux/.test(t)) {
      return { content: topRatedAnswer(kpis), quickReplies: ['Top souhaits', 'Catalogue'] };
    }
    return { content: `Produit le plus vendu :\n${topSoldAnswer(kpis, 1)}`, quickReplies: ['Top souhaits', 'Mieux notés'] };
  }
  return null;
}

function buildAnalystKpiResponse(t, kpis) {
  if (/ratio|corrélation|correlation|wished.*vente|souhait.*vente/.test(t)) {
    const ratio = (kpis.total_wished / Math.max(kpis.total_sold_units_est, 1)).toFixed(2);
    return {
      content:
        `Total wished : **${fmt(kpis.total_wished)}** | Ventes est. : **${fmt(kpis.total_sold_units_est)}** | ` +
        `Ratio : **${ratio}** souhaits/unité vendue.`,
      quickReplies: ['Répartition', 'Note <3★', 'Dashboard BI'],
    };
  }
  if (/répartition|distribution|part/.test(t)) {
    return { content: categoryDistributionAnswer(kpis), quickReplies: ['Ratio souhaits/ventes', 'KPI global'] };
  }
  if (/<\s*3|inférieur.*3|mauvaise note/.test(t)) {
    return {
      content: `**${kpis.products_star_lt_3_pct}%** sous 3★ | **${kpis.no_rating_pct}%** sans note (0.0).`,
      quickReplies: ['Répartition', 'Top ventes'],
    };
  }
  if (/kpi|analyt|marketplace|moyenne/.test(t)) {
    return {
      content:
        `**Analyse marketplace** — Note moy. notés : **${kpis.avg_star_rated_only}/5** | ` +
        `≥4,5★ : **${kpis.products_star_ge_4_5_pct}%** | Sans vente : **${kpis.zero_sold_pct}%**.\n\n` +
        categoryDistributionAnswer(kpis),
      quickReplies: ['Ratio souhaits/ventes', 'Dashboard BI'],
    };
  }
  return null;
}

function buildMarketingKpiResponse(t, kpis) {
  if (/catégorie|categorie|demande|souhait|wished/.test(t)) {
    return { content: topCategoryByWishes(kpis), quickReplies: ['Top souhaits produits', 'Réputation ≥4,5★'] };
  }
  if (/réputation|4[,.]5|étoile|etoile|bien noté/.test(t)) {
    return {
      content: `**${kpis.products_star_ge_4_5_pct}%** du catalogue ≥4,5★ — levier campagne « best sellers ».`,
      quickReplies: ['Catégorie la plus demandée', 'Top souhaits'],
    };
  }
  if (/top|populaire/.test(t)) {
    return { content: topWishedAnswer(kpis, 3), quickReplies: ['Catégorie demandée', '≥4,5★'] };
  }
  if (/kpi|marketplace|stat/.test(t)) {
    return {
      content: `${topCategoryByWishes(kpis)}\n\n${topWishedAnswer(kpis, 3)}`,
      quickReplies: ['Réputation ≥4,5★', 'Dashboard'],
    };
  }
  return null;
}

function buildModeratorKpiResponse(t, kpis) {
  if (/mauvaise note|mal noté|mal note|<\s*2[,.]5|modération|moderation|qualité|qualite/.test(t)) {
    return {
      content:
        `**${kpis.products_star_lt_3_pct}%** des produits notés sont sous 3★. ` +
        `**${kpis.no_rating_pct}%** n'ont aucune note — à surveiller pour confiance catalogue.\n\n` +
        `Consultez aussi \`/moderator/content\` pour validation manuelle.`,
      quickReplies: ['Centre anti-fraude', 'Produits à valider', 'Rapports'],
    };
  }
  if (/kpi|marketplace|stat|rapport/.test(t)) {
    return {
      content:
        `**KPI modération marketplace** — ${fmt(kpis.total_products)} SKU | ` +
        `Sans vente ${kpis.zero_sold_pct}% | Sans note ${kpis.no_rating_pct}% | <3★ ${kpis.products_star_lt_3_pct}%.\n\n` +
        `Rapports : \`/moderator/analytics\` et \`/moderator/bi\`.`,
      quickReplies: ['Produits à valider', 'Anti-fraude', 'Dashboard'],
    };
  }
  return null;
}

function buildLivreurKpiResponse(t, kpis) {
  if (/catégorie|categorie|volume|référence|reference|colis|sku/.test(t)) {
    return {
      content: `**Volume catalogue par catégorie** (indicateur colis potentiels) :\n${categoryDistributionAnswer(kpis)}`,
      quickReplies: ['Commandes', 'Carte', 'Gains'],
    };
  }
  if (/kpi|marketplace|stat/.test(t)) {
    return {
      content: `Catalogue : **${fmt(kpis.total_products)}** références. Catégorie la plus fournie : **jouets** (${kpis.by_category?.jouets?.share_pct || '?'}%).`,
      quickReplies: ['Répartition catégories', 'Commandes'],
    };
  }
  return null;
}

/**
 * @param {string} userMessage
 * @param {string} role - admin | vendor | client | moderator | livreur | analyst | marketing
 * @returns {{ content: string, quickReplies?: string[] } | null}
 */
function buildMarketplaceKpiResponse(userMessage, role = 'admin') {
  if (!detectMarketplaceKpiIntent(userMessage)) return null;

  const kpis = loadMarketplaceKpis();
  if (!kpis) {
    return {
      content:
        'Les KPI marketplace ne sont pas encore chargés. Exécutez `python scripts/build_marketplace_kpi_dataset.py` puis redémarrez le serveur.',
      quickReplies: ['Dashboard'],
    };
  }

  const t = String(userMessage || '').toLowerCase().trim();
  const r = String(role || 'admin').toLowerCase();

  const quick = matchQuickKpi(t, kpis, r);
  if (quick) return quick;

  const builders = {
    admin: buildAdminKpiResponse,
    vendor: buildVendorKpiResponse,
    client: buildClientKpiResponse,
    visitor: buildClientKpiResponse,
    moderator: buildModeratorKpiResponse,
    livreur: buildLivreurKpiResponse,
    analyst: buildAdminKpiResponse,
    marketing: buildMarketingKpiResponse,
  };

  const fn = builders[r] || buildAdminKpiResponse;
  const hit = fn(t, kpis);
  if (hit) return hit;

  return buildAdminKpiResponse(t, kpis);
}

module.exports = {
  loadMarketplaceKpis,
  detectMarketplaceKpiIntent,
  buildMarketplaceKpiResponse,
  fmt,
};
