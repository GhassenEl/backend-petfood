const {
  getPlatformInsights,
  rankSeniorDogProducts,
  getOrderCancelRisk,
} = require('../services/mlPlatform.service');
const {
  getClientAiPack,
  getClientMlAgentPack,
  getAdminMlPack,
  getAdminMlAgentPack,
  getLivreurMlPack,
  getLivreurOrdersRiskMap,
  getVetMlPack,
  getVetMlAgentPack,
  getClinicMlAgentPack,
  getPharmacyMlAgentPack,
  getAdminOrdersRiskMap,
} = require('../services/mlOrchestrator.service');
const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const { exportMlSnapshot } = require('../services/mlDataExport.service');
const { checkPythonMlHealth } = require('../services/mlPythonClient');

const handleError = (res, error, code = 500) => {
  console.error('ML platform error:', error);
  res.status(error.status || code).json({ error: error.message || 'Erreur ML' });
};

const resolveUser = (req) =>
  isDemoMode() ? demoStore.getUserById(req.user.id || req.user._id) || req.user : req.user;

const getAdminInsights = async (req, res) => {
  try {
    const result = await getPlatformInsights();
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

const getMlHealth = async (req, res) => {
  try {
    const health = await checkPythonMlHealth();
    res.json(health);
  } catch (error) {
    handleError(res, error);
  }
};

const postSeniorDogRank = async (req, res) => {
  try {
    const { petId, limit = 12 } = req.query;
    const snapshot = await exportMlSnapshot();
    const userId = req.user.id || req.user._id;
    const pet =
      snapshot.pets.find((p) => p.id === petId && p.ownerId === userId) ||
      snapshot.pets.find((p) => p.ownerId === userId && p.type === 'dog') ||
      snapshot.pets.find((p) => p.type === 'dog');

    if (!pet) {
      return res.status(404).json({ error: 'Aucun chien trouvé pour le ranking' });
    }

    const userOrders = snapshot.orders.filter((o) => o.userId === userId);
    const ranking = await rankSeniorDogProducts({
      pet,
      products: snapshot.products,
      orders: userOrders.length ? userOrders : snapshot.orders,
      limit: Math.min(Number(limit) || 12, 24),
    });

    if (!ranking?.length) {
      return res.status(503).json({ error: 'Service ML ranking indisponible' });
    }

    const productMap = new Map(snapshot.products.map((p) => [p.id, p]));
    res.json({
      pet,
      ranking: ranking.map((r) => ({
        ...r,
        product: productMap.get(r.productId) || { id: r.productId, name: r.productName },
      })),
      pythonPowered: true,
    });
  } catch (error) {
    handleError(res, error);
  }
};

const getOrderRisk = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const snapshot = await exportMlSnapshot();
    const order = snapshot.orders.find((o) => o.id === orderId);
    if (!order) {
      return res.status(404).json({ error: 'Commande introuvable' });
    }
    const history = snapshot.orders.filter((o) => o.userId === order.userId && o.id !== orderId);
    const risk = await getOrderCancelRisk(order, history);
    res.json(risk);
  } catch (error) {
    handleError(res, error);
  }
};

const getClientPack = async (req, res) => {
  try {
    const user = resolveUser(req);
    const pack = await getClientAiPack(user);
    res.json(pack);
  } catch (error) {
    handleError(res, error);
  }
};

const getClientAgentPack = async (req, res) => {
  try {
    const pack = await getClientMlAgentPack(resolveUser(req));
    res.json(pack);
  } catch (error) {
    handleError(res, error);
  }
};

const getAdminOrdersRisk = async (req, res) => {
  try {
    const data = await getAdminOrdersRiskMap();
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
};

const getAdminPack = async (req, res) => {
  try {
    const pack = await getAdminMlPack();
    res.json(pack);
  } catch (error) {
    handleError(res, error);
  }
};

const getAdminAgentPack = async (req, res) => {
  try {
    const pack = await getAdminMlAgentPack();
    res.json(pack);
  } catch (error) {
    handleError(res, error);
  }
};

const getLivreurPack = async (req, res) => {
  try {
    const pack = await getLivreurMlPack(resolveUser(req));
    res.json(pack);
  } catch (error) {
    handleError(res, error);
  }
};

const getVetPack = async (req, res) => {
  try {
    const pack = await getVetMlPack(resolveUser(req));
    res.json(pack);
  } catch (error) {
    handleError(res, error);
  }
};

const getVetAgentPack = async (req, res) => {
  try {
    const pack = await getVetMlAgentPack(resolveUser(req));
    res.json(pack);
  } catch (error) {
    handleError(res, error);
  }
};

const getClinicAgentPack = async (req, res) => {
  try {
    const pack = await getClinicMlAgentPack(resolveUser(req));
    res.json(pack);
  } catch (error) {
    handleError(res, error);
  }
};

const getPharmacyAgentPack = async (req, res) => {
  try {
    const pack = await getPharmacyMlAgentPack(resolveUser(req));
    res.json(pack);
  } catch (error) {
    handleError(res, error);
  }
};

const getLivreurOrdersRisk = async (req, res) => {
  try {
    const data = await getLivreurOrdersRiskMap(resolveUser(req));
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
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
};
