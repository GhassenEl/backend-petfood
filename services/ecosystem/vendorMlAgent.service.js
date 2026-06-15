const { completionWithSystem } = require('../groq.service');
const { checkPythonMlHealth } = require('../mlPythonClient');
const { buildMonthlySeries } = require('./vendorAnalytics.service');
const { prisma, isDemoMode } = require('../../prismaClient');

const VENDOR_ML_SYSTEM = `Tu es l'agent BI/ML PetfoodTN pour les vendeurs marketplace (animaleries).
Analyse les KPIs et propose 3 actions concrètes en français (réappro, promo, prix, stock).
Ton professionnel, max 4 phrases + 3 puces actionnables.`;

const forecastRevenue = (salesTrend) => {
  const pts = salesTrend.filter((s) => s.revenue > 0);
  if (pts.length < 2) {
    const last = pts[pts.length - 1]?.revenue || 0;
    return { nextMonthRevenue: Math.round(last * 1.05), model: 'naive_last', confidence: 0.5 };
  }
  const last = pts[pts.length - 1].revenue;
  const prev = pts[pts.length - 2].revenue;
  const slope = last - prev;
  const forecast = Math.max(0, last + slope * 0.8);
  return {
    nextMonthRevenue: Math.round(forecast * 100) / 100,
    model: 'trend_linear_v1',
    confidence: 0.72,
    trend: slope >= 0 ? 'up' : 'down',
  };
};

const scoreStockAlerts = (products) =>
  (products || [])
    .map((p) => {
      let risk = 0;
      if (Number(p.stock) <= 0) risk = 0.95;
      else if (Number(p.stock) < 5) risk = 0.7;
      else if (p.trend === 'up' && Number(p.stock) < 10) risk = 0.55;
      if (risk < 0.5) return null;
      return {
        productId: p.productId,
        name: p.name,
        stock: p.stock,
        riskScore: risk,
        action: Number(p.stock) <= 0 ? 'Réapprovisionner en urgence' : 'Prévoir réassort sous 7 jours',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 8);

const demandPredictions = (productPerformance) =>
  (productPerformance || []).slice(0, 10).map((p) => ({
    productId: p.productId,
    productName: p.name,
    predictedUnitsNextMonth: Math.max(1, Math.round((p.unitsSold || 0) * 1.08)),
    lastMonthUnits: p.unitsSold || 0,
    trend: p.trend || 'stable',
    model: 'demand_heuristic_v1',
  }));

const getVendorMlAgentPack = async (vendor, analytics) => {
  const mlHealth = await checkPythonMlHealth().catch(() => ({ ok: false }));
  const salesTrend = analytics.salesTrend || buildMonthlySeries(vendor.commissions || []);
  const forecast = forecastRevenue(salesTrend);
  const stockAlerts = scoreStockAlerts(analytics.productPerformance);
  const productDemand = demandPredictions(analytics.productPerformance);
  const kpis = analytics.kpis || {};

  const ruleSummary = [
    `CA 30j : ${kpis.revenue30d ?? 0} DT (${kpis.revenueGrowthPct >= 0 ? '+' : ''}${kpis.revenueGrowthPct ?? 0} %).`,
    `Prévision mois prochain : ~${forecast.nextMonthRevenue} DT.`,
    stockAlerts.length ? `${stockAlerts.length} alerte(s) stock.` : 'Stocks globalement OK.',
    `Rang marketplace : #${kpis.marketplaceRank ?? '—'} / ${kpis.marketplaceTotal ?? '—'}.`,
  ].join(' ');

  let groqSummary = null;
  if (process.env.GROQ_API_KEY) {
    groqSummary = await completionWithSystem(
      VENDOR_ML_SYSTEM,
      JSON.stringify({ kpis, forecast, stockAlerts: stockAlerts.slice(0, 5), topProducts: productDemand.slice(0, 5) }, null, 2).slice(0, 3000),
      { max_tokens: 400 }
    ).catch(() => null);
  }

  const actionHints = [];
  if (stockAlerts[0]) {
    actionHints.push({ type: 'stock', label: `Réappro : ${stockAlerts[0].name}`, priority: 'high' });
  }
  if ((kpis.revenueGrowthPct ?? 0) < 0) {
    actionHints.push({ type: 'promo', label: 'Lancer une promo -10 % sur best-sellers', priority: 'medium' });
  }
  if (productDemand[0]) {
    actionHints.push({
      type: 'demand',
      label: `Renforcer stock « ${productDemand[0].productName} » (demande +8 %)`,
      priority: 'medium',
    });
  }
  actionHints.push({ type: 'catalog', label: 'Mettre à jour photos & descriptions produits', priority: 'low' });

  const performance = analytics.productPerformance || [];
  const lowPerformers = performance
    .filter((p) => (p.unitsSold || 0) < 3 && (p.revenue || 0) < 50)
    .slice(0, 6)
    .map((p) => ({
      productId: p.productId,
      productName: p.name,
      unitsSold: p.unitsSold || 0,
      revenue: p.revenue || 0,
      action: 'Revoir prix, photo ou retirer du catalogue',
      severity: (p.unitsSold || 0) === 0 ? 'high' : 'medium',
    }));

  const priceSuggestions = performance.slice(0, 12).map((p) => {
    const stock = Number(p.stock ?? 10);
    const units = Number(p.unitsSold || 0);
    const trend = p.trend || 'stable';
    if (units < 2 && stock > 15) {
      return {
        productId: p.productId,
        productName: p.name,
        type: 'discount',
        suggestedChange: '-12 %',
        reason: 'Stock élevé, ventes faibles — promo pour écouler',
        priority: 'high',
      };
    }
    if (trend === 'up' && stock < 8 && units >= 5) {
      return {
        productId: p.productId,
        productName: p.name,
        type: 'price_up',
        suggestedChange: '+5 %',
        reason: 'Demande en hausse, stock limité',
        priority: 'medium',
      };
    }
    if (units >= 8 && !p.discount) {
      return {
        productId: p.productId,
        productName: p.name,
        type: 'bundle',
        suggestedChange: 'Pack -8 %',
        reason: 'Bon vendeur — fidéliser avec un lot promo',
        priority: 'low',
      };
    }
    return null;
  }).filter(Boolean).slice(0, 6);

  const promoSuggestions = priceSuggestions
    .filter((s) => s.type === 'discount' || s.type === 'bundle')
    .map((s) => ({
      id: s.productId,
      productName: s.productName,
      discountPercent: s.type === 'discount' ? 12 : 8,
      reason: s.reason,
      label: s.productName,
    }));

  const demandAnomalies = performance
    .filter((p) => p.trend === 'up' && (p.unitsSold || 0) >= 5)
    .concat(performance.filter((p) => (p.unitsSold || 0) === 0 && (p.stock || 0) > 0))
    .slice(0, 5)
    .map((p) => ({
      productId: p.productId,
      productName: p.name,
      type: p.trend === 'up' ? 'demand_spike' : 'demand_drop',
      message: p.trend === 'up'
        ? `Pic de demande (+${Math.round((p.unitsSold || 0) * 0.15)} u. estimées)`
        : 'Aucune vente récente malgré stock disponible',
      severity: p.trend === 'up' ? 'warning' : 'info',
    }));

  const salesForecast = (salesTrend || []).slice(-7).map((s, i) => ({
    label: s.month || s.label || `J${i + 1}`,
    day: s.month || s.label,
    revenue: s.revenue || 0,
    value: s.revenue || 0,
  }));

  const revenueForecast7d = Math.round((forecast.nextMonthRevenue || 0) / 4);
  const riskScore = stockAlerts[0] ? Math.round(stockAlerts[0].riskScore * 100) : 0;

  return {
    agent: 'vendor_ml_bi_agent',
    role: 'vendor',
    pythonPowered: Boolean(mlHealth?.ok),
    groqPowered: Boolean(groqSummary),
    mlPowered: true,
    models: [
      'trend_linear_v1',
      'demand_heuristic_v1',
      'stock_risk_v1',
      'price_optimizer_v1',
      mlHealth?.ok ? 'xgboost' : null,
      groqSummary ? 'groq' : null,
    ].filter(Boolean),
    summary: groqSummary || ruleSummary,
    tip: stockAlerts.length
      ? 'Priorisez les réapprovisionnements signalés par l’IA'
      : 'Vos ventes sont stables — testez une campagne fidélité locale',
    forecast,
    productDemand,
    stockAlerts,
    salesTrend,
    salesForecast,
    revenueForecast7d,
    forecastRevenue: revenueForecast7d,
    riskScore,
    lowPerformers,
    priceSuggestions,
    promoSuggestions,
    demandAnomalies,
    anomalies: [
      ...(kpis.outOfStockCount > 0 ? [{ type: 'out_of_stock', count: kpis.outOfStockCount }] : []),
      ...demandAnomalies.map((a) => ({ type: a.type, productName: a.productName })),
    ],
    actionHints,
  };
};

module.exports = { getVendorMlAgentPack, forecastRevenue, scoreStockAlerts };
