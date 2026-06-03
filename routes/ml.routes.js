const express = require('express');
const { auth, adminAuth, livreurAuth, vetAuth } = require('../middleware/auth');
const {
  getAdminInsights,
  getMlHealth,
  postSeniorDogRank,
  getOrderRisk,
  getClientPack,
  getClientAgentPack,
  getAdminOrdersRisk,
  getAdminPack,
  getAdminAgentPack,
  getLivreurPack,
  getLivreurOrdersRisk,
  getVetPack,
  getVetAgentPack,
  getClinicAgentPack,
  getPharmacyAgentPack,
} = require('../controllers/mlPlatform.controller');
const {
  getPack: getIncidentPack,
  getQueue: getIncidentQueue,
  postProcessOne: processIncidentOne,
  postProcessAll: processIncidentAll,
  postValidate: validateIncidentProposal,
} = require('../controllers/incidentMl.controller');

const router = express.Router();

router.get('/health', auth, adminAuth, getMlHealth);
router.get('/admin/insights', auth, adminAuth, getAdminInsights);
router.get('/admin/orders-risk', auth, adminAuth, getAdminOrdersRisk);
router.get('/client/pack', auth, getClientPack);
router.get('/client/agent', auth, getClientAgentPack);
router.get('/admin/pack', auth, adminAuth, getAdminPack);
router.get('/admin/agent', auth, adminAuth, getAdminAgentPack);
router.get('/livreur/pack', auth, livreurAuth, getLivreurPack);
router.get('/livreur/orders-risk', auth, livreurAuth, getLivreurOrdersRisk);
router.get('/vet/pack', auth, vetAuth, getVetPack);
router.get('/vet/agent', auth, vetAuth, getVetAgentPack);
router.get('/vet/clinic/agent', auth, vetAuth, getClinicAgentPack);
router.get('/vet/pharmacy/agent', auth, vetAuth, getPharmacyAgentPack);
router.get('/rank/senior-dog', auth, postSeniorDogRank);
router.get('/orders/:orderId/cancel-risk', auth, adminAuth, getOrderRisk);

router.get('/incidents/agent', auth, adminAuth, getIncidentPack);
router.get('/incidents/queue', auth, adminAuth, getIncidentQueue);
router.post('/incidents/process-all', auth, adminAuth, processIncidentAll);
router.post('/incidents/:id/process', auth, adminAuth, processIncidentOne);
router.post('/incidents/:id/validate', auth, adminAuth, validateIncidentProposal);

module.exports = router;
