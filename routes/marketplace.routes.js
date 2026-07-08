const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const { getKpiSummary } = require('../controllers/marketplace.controller');

const router = express.Router();

router.get('/kpis', auth, adminAuth, getKpiSummary);

/** Lecture publique limitée pour chat visiteur (synthèse sans auth admin en démo) */
router.get('/kpis/public-summary', (req, res) => {
  const { loadMarketplaceKpis } = require('../services/marketplaceKpiChat.service');
  const kpis = loadMarketplaceKpis();
  if (!kpis) {
    return res.status(503).json({ error: 'KPI indisponibles' });
  }
  res.json({
    total_products: kpis.total_products,
    avg_star_rated_only: kpis.avg_star_rated_only,
    total_sold_units_est: kpis.total_sold_units_est,
    total_wished: kpis.total_wished,
    zero_sold_pct: kpis.zero_sold_pct,
    top_sold: (kpis.top_sold || []).slice(0, 3),
    top_wished: (kpis.top_wished || []).slice(0, 3),
  });
});

module.exports = router;
