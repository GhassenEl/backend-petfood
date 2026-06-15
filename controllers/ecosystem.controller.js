const premiumAi = require('../services/ecosystem/premiumAi.service');
const gamification = require('../services/ecosystem/gamification.service');
const marketplace = require('../services/ecosystem/marketplace.service');
const subscription = require('../services/ecosystem/subscription.service');
const shelter = require('../services/ecosystem/shelter.service');
const petCare = require('../services/ecosystem/petCare.service');
const imageAnalysis = require('../services/ecosystem/imageAnalysis.service');
const predictiveDelivery = require('../services/ecosystem/predictiveDelivery.service');
const geoDelivery = require('../services/ecosystem/geoDelivery.service');
const emotionAnalysis = require('../services/ecosystem/emotionAnalysis.service');
const smartLoyalty = require('../services/ecosystem/smartLoyalty.service');
const vetChatbot24 = require('../services/ecosystem/vetChatbot24.service');
const personalizedReco = require('../services/ecosystem/personalizedReco.service');
const productPack = require('../services/ecosystem/productPack.service');
const productComparator = require('../services/ecosystem/productComparator.service');
const smartWeight = require('../services/ecosystem/smartWeight.service');
const blockchainTrace = require('../services/ecosystem/blockchainTraceability.service');
const petRehabilitation = require('../services/ecosystem/petRehabilitation.service');
const partnerRelay = require('../services/ecosystem/partnerRelay.service');
const petDigitalPassport = require('../services/ecosystem/petDigitalPassport.service');
const smartWaterMonitor = require('../services/ecosystem/smartWaterMonitor.service');

const wrap = (fn) => async (req, res) => {
  try {
    const data = await fn(req);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur serveur' });
  }
};

exports.getPremiumPack = (req, res) =>
  wrap(async (r) => premiumAi.getPremiumPack(r.user, r.query))(req, res);

exports.postMealPlan = (req, res) =>
  wrap(async (r) => premiumAi.generateMealPlan(r.user, r.body))(req, res);

exports.getBudget = (req, res) =>
  wrap(async (r) => premiumAi.estimateMonthlyBudget(r.user, r.query))(req, res);

exports.getFutureNeeds = (req, res) =>
  wrap(async (r) => premiumAi.predictFutureNeeds(r.user, r.query))(req, res);

exports.getHealthRisks = (req, res) =>
  wrap(async (r) => premiumAi.detectHealthRisks(r.user, { ...r.query, ...r.body }))(req, res);

exports.getGamification = (req, res) =>
  wrap(async (r) => gamification.getGamificationProfile(r.user))(req, res);

exports.claimChallenge = (req, res) =>
  wrap(async (r) => gamification.claimChallengeReward(r.user))(req, res);

exports.getMarketplace = (req, res) =>
  wrap(async () => marketplace.listMarketplace())(req, res);

exports.getVendorProducts = (req, res) =>
  wrap(async (r) => marketplace.getVendorProducts(r.params.vendorId))(req, res);

exports.postVendorRegister = (req, res) =>
  wrap(async (r) => marketplace.registerVendor(r.user, r.body))(req, res);

exports.getVendorDashboard = (req, res) =>
  wrap(async (r) => marketplace.getVendorDashboard(r.user))(req, res);

exports.getVendorMlAgent = (req, res) =>
  wrap(async (r) => marketplace.getVendorMlAgent(r.user))(req, res);

exports.getSubscriptions = (req, res) =>
  wrap(async (r) => subscription.listSubscriptions(r.user))(req, res);

exports.postSubscription = (req, res) =>
  wrap(async (r) => subscription.createSubscription(r.user, r.body))(req, res);

exports.patchSubscription = (req, res) =>
  wrap(async (r) => subscription.updateSubscription(r.user, r.params.id, r.body))(req, res);

exports.getShelters = (req, res) =>
  wrap(async () => shelter.listShelters())(req, res);

exports.postAdoption = (req, res) =>
  wrap(async (r) => shelter.applyAdoption(r.user, r.body))(req, res);

exports.getMyAdoptions = (req, res) =>
  wrap(async (r) => shelter.myAdoptionRequests(r.user))(req, res);

exports.getRehabOverview = (req, res) =>
  wrap(async (r) => {
    await petRehabilitation.seedRehabData();
    return petRehabilitation.getRehabOverview(r.query);
  })(req, res);

exports.getRehabProgram = (req, res) =>
  wrap(async (r) => petRehabilitation.getProgramByAnimalId(r.params.animalId))(req, res);

exports.getRehabMlAdvice = (req, res) =>
  wrap(async (r) => petRehabilitation.getMlRehabAdvice(r.params.animalId))(req, res);

exports.postRehabTreatment = (req, res) =>
  wrap(async (r) => petRehabilitation.logTreatment(r.user, r.body))(req, res);

exports.getRelayPoints = (req, res) =>
  wrap(async (r) => partnerRelay.listRelayPoints(r.query))(req, res);

exports.getRelayPointById = (req, res) =>
  wrap(async (r) => partnerRelay.getRelayPointById(r.params.id))(req, res);

exports.listPetPassports = (req, res) =>
  wrap(async (r) => petDigitalPassport.listPetPassports(r.user))(req, res);

exports.getPetPassport = (req, res) =>
  wrap(async (r) => petDigitalPassport.getPetPassport(r.user, r.params.petId))(req, res);

exports.getWaterMonitorOverview = (req, res) =>
  wrap(async (r) => smartWaterMonitor.listWaterOverview(r.user))(req, res);

exports.getWaterMonitorAlerts = (req, res) =>
  wrap(async (r) => smartWaterMonitor.listWaterAlerts(r.user))(req, res);

exports.getWaterMonitorTracking = (req, res) =>
  wrap(async (r) => smartWaterMonitor.getWaterTracking(r.user, r.params.petId))(req, res);

exports.postWaterConsumption = (req, res) =>
  wrap(async (r) => smartWaterMonitor.logWaterConsumption(r.user, r.params.petId, r.body))(req, res);

exports.postWaterRefill = (req, res) =>
  wrap(async (r) => smartWaterMonitor.recordRefill(r.user, r.params.petId, r.body))(req, res);

exports.postWaterIotReading = (req, res) =>
  wrap(async (r) => smartWaterMonitor.ingestIotReading(r.user, r.params.petId, r.body))(req, res);

exports.getPetCareCatalog = (req, res) =>
  wrap(async () => petCare.listCatalog())(req, res);

exports.getPetCareProviders = (req, res) =>
  wrap(async (r) => petCare.listProviders(r.query.type))(req, res);

exports.postPetCareBook = (req, res) =>
  wrap(async (r) => petCare.bookCare(r.user, r.body))(req, res);

exports.getPetCareBookings = (req, res) =>
  wrap(async (r) => petCare.myBookings(r.user))(req, res);

exports.postImageAnalysis = (req, res) =>
  wrap(async (r) => imageAnalysis.analyzeImage(r.user, r.body))(req, res);

exports.getImageHistory = (req, res) =>
  wrap(async (r) => imageAnalysis.history(r.user))(req, res);

exports.getPredictiveDelivery = (req, res) =>
  wrap(async (r) => predictiveDelivery.getPredictiveDelivery(r.user, r.query))(req, res);

exports.postProposedOrder = (req, res) =>
  wrap(async (r) => predictiveDelivery.acceptProposedOrder(r.user, r.body))(req, res);

exports.getLiveDeliveries = (req, res) =>
  wrap(async (r) => geoDelivery.getActiveDeliveries(r.user))(req, res);

exports.getLiveDeliveryByOrder = (req, res) =>
  wrap(async (r) => geoDelivery.getDeliveryByOrderId(r.user, r.params.orderId))(req, res);

exports.postEmotionAnalysis = (req, res) =>
  wrap(async (r) => emotionAnalysis.analyzeEmotions(r.user, r.body))(req, res);

exports.getEmotionHistory = (req, res) =>
  wrap(async (r) => emotionAnalysis.history(r.user))(req, res);

exports.getSmartLoyalty = (req, res) =>
  wrap(async (r) => smartLoyalty.getSmartLoyalty(r.user))(req, res);

exports.postVetChat = (req, res) =>
  wrap(async (r) => vetChatbot24.chatVet24(r.user, r.body))(req, res);

exports.getPersonalizedPack = (req, res) =>
  wrap(async (r) => personalizedReco.getFullPersonalizedPack(r.user, r.query))(req, res);

exports.getProductPacks = (req, res) =>
  wrap(async (r) => productPack.listAutoPacks(r.user, r.query))(req, res);

exports.getProductPackByType = (req, res) =>
  wrap(async (r) => productPack.getPackByType(r.user, r.params.packType, r.query))(req, res);

exports.postProductPackCart = (req, res) =>
  wrap(async (r) => {
    const { pack } = await productPack.getPackByType(r.user, r.params.packType, r.body);
    return productPack.packToCart(pack);
  })(req, res);

exports.postCompareProducts = (req, res) =>
  wrap(async (r) => productComparator.compareProducts(r.body?.productIds || []))(req, res);

exports.getPetWeightTracking = (req, res) =>
  wrap(async (r) => smartWeight.getWeightTracking(r.user, r.params.petId))(req, res);

exports.postPetWeightLog = (req, res) =>
  wrap(async (r) => smartWeight.logWeight(r.user, r.params.petId, r.body))(req, res);

exports.getTraceabilityList = (req, res) =>
  wrap(async (r) => blockchainTrace.listTraces(r.query))(req, res);

exports.getProductTraceability = (req, res) =>
  wrap(async (r) => blockchainTrace.getProductTrace(r.params.productId))(req, res);

exports.postVerifyTraceability = (req, res) =>
  wrap(async (r) => blockchainTrace.verifyProductTrace(r.params.productId))(req, res);

exports.getMyOrderTraces = (req, res) =>
  wrap(async (r) => blockchainTrace.getMyOrderTraces(r.user))(req, res);

exports.postVerifyBatchCode = (req, res) =>
  wrap(async (r) => blockchainTrace.verifyByBatchCode(r.body?.batchCode || r.body?.code))(req, res);

exports.getEcosystemHub = (req, res) =>
  wrap(async (r) => ({
    premium: await premiumAi.getPremiumPack(r.user, r.query).catch(() => null),
    gamification: await gamification.getGamificationProfile(r.user).catch(() => null),
    loyalty: await smartLoyalty.getSmartLoyalty(r.user).catch(() => null),
    personalized: await personalizedReco.getFullPersonalizedPack(r.user, r.query).catch(() => null),
    marketplace: await marketplace.listMarketplace().catch(() => ({ vendors: [] })),
    predictiveDelivery: await predictiveDelivery.getPredictiveDelivery(r.user, r.query).catch(() => null),
    liveDelivery: await geoDelivery.getActiveDeliveries(r.user).catch(() => ({ active: [] })),
    productPacks: await productPack.listAutoPacks(r.user, r.query).catch(() => ({ packs: [] })),
  }))(req, res);
