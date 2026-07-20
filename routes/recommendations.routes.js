const express = require('express');
const { auth, adminAuth, vetAuth } = require('../middleware/auth');
const {
  getHybridHandler,
  getAdminClientHandler,
  getExplainSalesHandler,
  getSearchReviewsHandler,
} = require('../controllers/hybridRecommendation.controller');

const router = express.Router();

/** Client, vet, admin — recommandations hybrides personnalisées */
router.get('/hybrid', auth, getHybridHandler);

/** Admin — recommandations pour un client selon profil / similarité */
router.get('/admin/client/:userId', auth, adminAuth, getAdminClientHandler);

/** Admin — interprétation IA trafic CA / ventes */
router.get('/admin/explain-sales', auth, adminAuth, getExplainSalesHandler);

/** Recherche / filtrage produits selon avis NLP */
router.get('/search', auth, getSearchReviewsHandler);

/** Alias vet */
router.get('/vet/hybrid', auth, vetAuth, (req, res, next) => {
  req.query.role = 'vet';
  return getHybridHandler(req, res, next);
});

module.exports = router;
