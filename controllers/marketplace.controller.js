const { loadMarketplaceKpis } = require('../services/marketplaceKpiChat.service');

const handleError = (res, error, code = 500) => {
  res.status(error.status || code).json({ error: error.message || 'Erreur marketplace KPI' });
};

/** GET /api/marketplace/kpis — snapshot agrégé pour dashboard et chatbot */
const getKpiSummary = async (req, res) => {
  try {
    const kpis = loadMarketplaceKpis();
    if (!kpis) {
      return res.status(503).json({
        error: 'KPI marketplace indisponibles. Exécutez scripts/build_marketplace_kpi_dataset.py',
      });
    }
    res.json({
      source: 'marketplace-dataset',
      updatedAt: kpis.generatedAt || null,
      ...kpis,
    });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { getKpiSummary };
