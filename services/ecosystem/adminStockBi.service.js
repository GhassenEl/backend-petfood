const { prisma, isDemoMode } = require('../../prismaClient');
const { completionWithSystem } = require('../groq.service');

const STOCK_ML_SYSTEM = `Tu es l'agent BI/ML stock pour l'admin PetfoodTN.
Analyse ruptures, réappro et demande. Réponds en français : 3 actions concrètes (max 5 phrases).`;

const parseStockHistory = (raw) => {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const estimateDailyVelocity = (productId, orderItems) => {
  const related = orderItems.filter((i) => i.productId === productId);
  const units = related.reduce((s, i) => s + Number(i.quantity || 0), 0);
  return units / 30;
};

const getAdminStockBiPack = async () => {
  let products = [];
  let orderItems = [];

  if (isDemoMode()) {
    products = [
      { id: 'prd_dog_1', name: 'Croquettes Premium Chien', stock: 3, category: 'nourriture', popularity: 95 },
      { id: 'prd_cat_1', name: 'Pâtée Équilibre Chat', stock: 31, category: 'nourriture', popularity: 88 },
      { id: 'prd_dog_2', name: 'Snack Dentaire', stock: 0, category: 'friandise', popularity: 72 },
      { id: 'prd_bird_1', name: 'Mélange Oiseaux', stock: 8, category: 'nourriture', popularity: 65 },
      { id: 'prd_fish_1', name: 'Granules Aquarium', stock: 42, category: 'nourriture', popularity: 70 },
    ];
    orderItems = [
      { productId: 'prd_dog_1', quantity: 45 },
      { productId: 'prd_cat_1', quantity: 22 },
      { productId: 'prd_dog_2', quantity: 38 },
      { productId: 'prd_bird_1', quantity: 12 },
    ];
  } else {
    products = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        stock: true,
        category: true,
        popularity: true,
        stockHistory: true,
        price: true,
      },
      orderBy: { popularity: 'desc' },
    });

    const since = new Date();
    since.setDate(since.getDate() - 30);
    orderItems = await prisma.orderItem.findMany({
      where: {
        productId: { not: null },
        order: { createdAt: { gte: since }, status: { in: ['delivered', 'completed', 'paid', 'shipped'] } },
      },
      select: { productId: true, quantity: true },
    });
  }

  const enriched = products.map((p) => {
    const velocity = estimateDailyVelocity(p.id, orderItems);
    const daysOfStock =
      velocity > 0 ? Math.round(Number(p.stock) / velocity) : Number(p.stock) > 0 ? 999 : 0;
    let riskScore = 0;
    if (Number(p.stock) <= 0) riskScore = 0.98;
    else if (daysOfStock < 7) riskScore = 0.85;
    else if (daysOfStock < 14) riskScore = 0.6;
    else if (Number(p.stock) < 5) riskScore = 0.7;

    const reorderQty = Math.max(
      10,
      Math.ceil(velocity * 21) || (Number(p.stock) < 10 ? 20 : 0)
    );

    return {
      productId: p.id,
      name: p.name,
      category: p.category,
      stock: Number(p.stock),
      price: p.price,
      popularity: p.popularity,
      velocityPerDay: Math.round(velocity * 100) / 100,
      daysOfStock,
      riskScore,
      reorderSuggested: riskScore >= 0.6 ? reorderQty : 0,
      trend: velocity > 1.2 ? 'up' : velocity < 0.3 ? 'down' : 'stable',
      historyPoints: parseStockHistory(p.stockHistory).slice(-6),
    };
  });

  const alerts = enriched
    .filter((p) => p.riskScore >= 0.55)
    .sort((a, b) => b.riskScore - a.riskScore);

  const stockoutRisk = alerts.filter((p) => p.stock <= 0).length;
  const lowStock = alerts.filter((p) => p.stock > 0 && p.daysOfStock < 14).length;
  const totalValue = enriched.reduce((s, p) => s + p.stock * (p.price || 0), 0);

  const categoryBreakdown = {};
  enriched.forEach((p) => {
    const cat = p.category || 'autre';
    if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { units: 0, skus: 0, atRisk: 0 };
    categoryBreakdown[cat].units += p.stock;
    categoryBreakdown[cat].skus += 1;
    if (p.riskScore >= 0.6) categoryBreakdown[cat].atRisk += 1;
  });

  const forecastSeries = [];
  const baseDemand = orderItems.reduce((s, i) => s + Number(i.quantity || 0), 0) / 30 || 5;
  for (let m = 0; m < 4; m += 1) {
    const d = new Date();
    d.setMonth(d.getMonth() + m);
    forecastSeries.push({
      month: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      predictedUnits: Math.round(baseDemand * 30 * (1 + m * 0.04)),
      model: 'demand_forecast_v1',
    });
  }

  const ruleSummary = [
    `${alerts.length} SKU(s) à surveiller.`,
    stockoutRisk ? `${stockoutRisk} rupture(s).` : 'Aucune rupture immédiate.',
    `Valeur stock estimée : ${Math.round(totalValue)} DT.`,
  ].join(' ');

  let groqSummary = null;
  if (process.env.GROQ_API_KEY) {
    groqSummary = await completionWithSystem(
      STOCK_ML_SYSTEM,
      JSON.stringify(
        { kpis: { stockoutRisk, lowStock, totalValue }, topAlerts: alerts.slice(0, 6) },
        null,
        2
      ).slice(0, 2800),
      { max_tokens: 380 }
    ).catch(() => null);
  }

  return {
    kpis: {
      totalSkus: products.length,
      stockoutRisk,
      lowStock,
      inventoryValueDt: Math.round(totalValue * 100) / 100,
      avgDaysOfStock:
        enriched.length > 0
          ? Math.round(
              enriched.reduce((s, p) => s + Math.min(p.daysOfStock, 90), 0) / enriched.length
            )
          : 0,
    },
    alerts: alerts.slice(0, 15),
    categoryBreakdown: Object.entries(categoryBreakdown).map(([category, v]) => ({
      category,
      ...v,
    })),
    forecastSeries,
    topMovers: enriched
      .filter((p) => p.velocityPerDay > 0)
      .sort((a, b) => b.velocityPerDay - a.velocityPerDay)
      .slice(0, 8),
    summary: groqSummary || ruleSummary,
    model: groqSummary ? 'groq_stock_bi_v1' : 'heuristic_stock_bi_v1',
    generatedAt: new Date().toISOString(),
  };
};

module.exports = { getAdminStockBiPack };
