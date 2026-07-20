const express = require('express');
const { auth, adminAuth, vetAuth, vendorAuth, moderatorAuth } = require('../middleware/auth');
const c = require('../controllers/ecosystem.controller');
const refund = require('../controllers/refund.controller');
const mod = require('../controllers/moderator.controller');

const router = express.Router();

router.get('/hub', auth, c.getEcosystemHub);

router.get('/premium', auth, c.getPremiumPack);
router.post('/premium/meal-plan', auth, c.postMealPlan);
router.get('/premium/budget', auth, c.getBudget);
router.get('/premium/future-needs', auth, c.getFutureNeeds);
router.post('/premium/health-risks', auth, c.getHealthRisks);

router.get('/gamification', auth, c.getGamification);
router.post('/gamification/claim-challenge', auth, c.claimChallenge);

router.get('/marketplace', auth, c.getMarketplace);
router.get('/marketplace/vendors/:vendorId/products', auth, c.getVendorProducts);
router.post('/vendor/register', auth, c.postVendorRegister);
router.get('/vendor/dashboard', auth, c.getVendorDashboard);
router.get('/vendor/ml-agent', auth, c.getVendorMlAgent);

router.get('/subscriptions', auth, c.getSubscriptions);
router.post('/subscriptions', auth, c.postSubscription);
router.patch('/subscriptions/:id', auth, c.patchSubscription);

router.get('/shelters', auth, c.getShelters);
router.post('/shelters/adopt', auth, c.postAdoption);
router.get('/shelters/my-applications', auth, c.getMyAdoptions);

router.get('/rehabilitation', auth, c.getRehabOverview);
router.get('/rehabilitation/animals/:animalId', auth, c.getRehabProgram);
router.get('/rehabilitation/animals/:animalId/advice', auth, c.getRehabMlAdvice);
router.post('/rehabilitation/treatments', auth, vetAuth, c.postRehabTreatment);

router.get('/relay-points', auth, c.getRelayPoints);
router.get('/relay-points/:id', auth, c.getRelayPointById);

router.get('/pet-passport', auth, c.listPetPassports);
router.get('/pet-passport/:petId', auth, c.getPetPassport);

router.get('/water-monitor', auth, c.getWaterMonitorOverview);
router.get('/water-monitor/alerts', auth, c.getWaterMonitorAlerts);
router.get('/water-monitor/:petId', auth, c.getWaterMonitorTracking);
router.post('/water-monitor/:petId/log', auth, c.postWaterConsumption);
router.post('/water-monitor/:petId/refill', auth, c.postWaterRefill);
router.post('/water-monitor/:petId/iot', auth, c.postWaterIotReading);

router.get('/pet-care/catalog', auth, c.getPetCareCatalog);
router.get('/pet-care/providers', auth, c.getPetCareProviders);
router.post('/pet-care/book', auth, c.postPetCareBook);
router.get('/pet-care/bookings', auth, c.getPetCareBookings);

router.post('/image/analyze', auth, c.postImageAnalysis);
router.get('/image/history', auth, c.getImageHistory);

router.get('/delivery/predictive', auth, c.getPredictiveDelivery);
router.post('/delivery/propose-order', auth, c.postProposedOrder);
router.get('/delivery/live', auth, c.getLiveDeliveries);
router.get('/delivery/live/:orderId', auth, c.getLiveDeliveryByOrder);

router.post('/emotion/analyze', auth, c.postEmotionAnalysis);
router.get('/emotion/history', auth, c.getEmotionHistory);

router.get('/loyalty/smart', auth, c.getSmartLoyalty);

router.post('/vet-chat', auth, c.postVetChat);

router.get('/recommendations/full', auth, c.getPersonalizedPack);

router.get('/packs', auth, c.getProductPacks);
router.get('/packs/:packType', auth, c.getProductPackByType);
router.post('/packs/:packType/add-to-cart', auth, c.postProductPackCart);

router.post('/products/compare', auth, c.postCompareProducts);
router.get('/pets/:petId/weight', auth, c.getPetWeightTracking);
router.post('/pets/:petId/weight', auth, c.postPetWeightLog);

router.get('/traceability', auth, c.getTraceabilityList);
router.get('/traceability/my-orders', auth, c.getMyOrderTraces);
router.post('/traceability/verify-batch', auth, c.postVerifyBatchCode);
router.get('/traceability/product/:productId', auth, c.getProductTraceability);
router.post('/traceability/product/:productId/verify', auth, c.postVerifyTraceability);

router.get('/vendor/refunds', auth, vendorAuth, refund.getVendorRefunds);
router.post('/vendor/refunds/:id/approve', auth, vendorAuth, refund.vendorApprove);
router.post('/vendor/refunds/:id/reject', auth, vendorAuth, refund.vendorReject);
router.post('/vendor/refunds/:id/confirm-return', auth, vendorAuth, refund.vendorConfirmReturn);
router.post('/vendor/refunds/:id/validate', auth, vendorAuth, refund.vendorValidate);
router.post('/vendor/refunds/:id/refund', auth, vendorAuth, refund.vendorMarkRefunded);

const salesChannelsCtrl = require('../controllers/vendorSalesChannels.controller');
router.get('/vendor/sales-channels', auth, vendorAuth, salesChannelsCtrl.getConfig);
router.put('/vendor/sales-channels', auth, vendorAuth, salesChannelsCtrl.putConfig);
router.post('/vendor/offline-orders', auth, vendorAuth, salesChannelsCtrl.postOfflineOrder);
router.get('/marketplace/vendors/:vendorId/channels', auth, salesChannelsCtrl.getPublicChannels);

const vetHealth = require('../controllers/vetHealthProducts.controller');
router.get('/vendor/health-proposals', auth, vendorAuth, vetHealth.listVendorProposals);
router.patch('/vendor/health-proposals/:id', auth, vendorAuth, vetHealth.respondProposal);

router.get('/moderator/refunds', auth, moderatorAuth, refund.getModeratorRefunds);
router.post('/moderator/refunds/:id/resolve', auth, moderatorAuth, refund.moderatorResolve);
router.post('/moderator/refunds/:id/fraud', auth, moderatorAuth, refund.moderatorFlagFraud);

router.get('/moderator/dashboard', auth, moderatorAuth, mod.getDashboard);
router.get('/moderator/analytics', auth, moderatorAuth, mod.getAnalytics);
router.get('/moderator/stats/realtime', auth, moderatorAuth, mod.getRealtimeStats);
router.get('/moderator/bi/dashboard', auth, moderatorAuth, mod.getBiDashboard);

router.get('/moderator/users', auth, moderatorAuth, mod.listUsers);
router.patch('/moderator/users/:id/suspend', auth, moderatorAuth, mod.suspendUser);
router.patch('/moderator/users/:id/reactivate', auth, moderatorAuth, mod.reactivateUser);
router.post('/moderator/users/:id/flag', auth, moderatorAuth, mod.flagUser);

router.get('/moderator/vendors', auth, moderatorAuth, mod.listVendors);
router.patch('/moderator/vendors/:id/approve', auth, moderatorAuth, mod.approveVendor);
router.patch('/moderator/vendors/:id/verify', auth, moderatorAuth, mod.verifyVendor);
router.patch('/moderator/vendors/:id/suspend', auth, moderatorAuth, mod.suspendVendor);

router.get('/moderator/products/pending', auth, moderatorAuth, mod.listPendingProducts);
router.patch('/moderator/products/:id/approve', auth, moderatorAuth, mod.approveProduct);
router.patch('/moderator/products/:id/reject', auth, moderatorAuth, mod.rejectProduct);

router.get('/moderator/content/flagged', auth, moderatorAuth, mod.listFlaggedContent);
router.delete('/moderator/content/:id', auth, moderatorAuth, mod.deleteContent);
router.patch('/moderator/images/:productId/approve', auth, moderatorAuth, mod.approveImage);

router.get('/moderator/disputes', auth, moderatorAuth, mod.listDisputes);
router.patch('/moderator/disputes/:id/resolve', auth, moderatorAuth, mod.resolveDispute);

router.get('/moderator/reviews/fake', auth, moderatorAuth, mod.listFakeReviews);
router.get('/moderator/nlp/insights', auth, moderatorAuth, mod.getNlpInsights);
router.delete('/moderator/reviews/fake/:id', auth, moderatorAuth, mod.rejectReview);
router.patch('/moderator/reviews/fake/:id/clear', auth, moderatorAuth, mod.clearReview);

const adminPartners = require('../controllers/adminPartners.controller');
router.get('/admin/vendors', auth, adminAuth, adminPartners.getAdminVendors);
router.patch('/admin/vendors/:id', auth, adminAuth, adminPartners.patchAdminVendor);
router.get('/admin/marketplace', auth, adminAuth, adminPartners.getAdminMarketplaceStats);

module.exports = router;
