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
const {
  getAgentPack: getVetClinicalAgentPack,
  postAnalyze: postVetClinicalAnalyze,
  getPatientContext: getVetClinicalPatientContext,
  postApplyDossier: postVetClinicalApplyDossier,
  postApplyPrescription: postVetClinicalApplyPrescription,
} = require('../controllers/vetClinicalMl.controller');
const { postEarlyDetection } = require('../controllers/vetEarlyDetection.controller');
const {
  getNlpBenchmarkHandler,
  getNlpConfigHandler,
  putNlpConfigHandler,
  postNlpAnalyzeHandler,
} = require('../controllers/nlpModel.controller');
const {
  postAnalyzeComment,
  getMyCommentSentiments,
  getAdminCommentSentiments,
} = require('../controllers/commentSentiment.controller');

const router = express.Router();

router.get('/health', auth, adminAuth, getMlHealth);
router.get('/admin/insights', auth, adminAuth, getAdminInsights);
router.get('/admin/nlp-models/benchmark', auth, adminAuth, getNlpBenchmarkHandler);
router.get('/admin/nlp-models/config', auth, adminAuth, getNlpConfigHandler);
router.put('/admin/nlp-models/config', auth, adminAuth, putNlpConfigHandler);
router.post('/nlp/analyze', auth, postNlpAnalyzeHandler);
router.post('/sentiment/comment', auth, postAnalyzeComment);
router.get('/sentiment/comments/me', auth, getMyCommentSentiments);
router.get('/sentiment/comments', auth, adminAuth, getAdminCommentSentiments);
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
router.get('/vet/clinical/agent', auth, vetAuth, getVetClinicalAgentPack);
router.post('/vet/clinical/analyze', auth, vetAuth, postVetClinicalAnalyze);
router.post('/vet/early-detection/analyze', auth, vetAuth, postEarlyDetection);
router.get('/vet/clinical/patient-context', auth, vetAuth, getVetClinicalPatientContext);
router.post('/vet/clinical/analyses/:id/apply-dossier', auth, vetAuth, postVetClinicalApplyDossier);
router.post('/vet/clinical/analyses/:id/apply-prescription', auth, vetAuth, postVetClinicalApplyPrescription);
router.get('/rank/senior-dog', auth, postSeniorDogRank);
router.get('/orders/:orderId/cancel-risk', auth, adminAuth, getOrderRisk);

router.get('/incidents/agent', auth, adminAuth, getIncidentPack);
router.get('/incidents/queue', auth, adminAuth, getIncidentQueue);
router.post('/incidents/process-all', auth, adminAuth, processIncidentAll);
router.post('/incidents/:id/process', auth, adminAuth, processIncidentOne);
router.post('/incidents/:id/validate', auth, adminAuth, validateIncidentProposal);

module.exports = router;
