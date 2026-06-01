const {
  getDashboard,
  optimizeRoute,
  getAdvancedStats,
  reportIssue,
  updateGpsPosition,
  claimOrder,
  getActiveMission,
  completeDelivery,
} = require('../services/livreur.service');

const getUserId = (req) => req.user?.id || req.user?._id;

const dashboard = async (req, res) => {
  try {
    const data = await getDashboard(getUserId(req));
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Erreur dashboard livreur' });
  }
};

const routePlan = async (req, res) => {
  try {
    const lat = req.query.lat != null ? Number(req.query.lat) : undefined;
    const lng = req.query.lng != null ? Number(req.query.lng) : undefined;
    const data = await optimizeRoute(getUserId(req), { lat, lng });
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Erreur tournée' });
  }
};

const advancedStats = async (req, res) => {
  try {
    const data = await getAdvancedStats(getUserId(req));
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Erreur statistiques' });
  }
};

const postIssue = async (req, res) => {
  try {
    const { subject, message } = req.body;
    const data = await reportIssue(getUserId(req), req.params.orderId, { subject, message });
    res.status(201).json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Signalement échoué' });
  }
};

const postGps = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      return res.status(400).json({ error: 'lat et lng requis' });
    }
    const data = await updateGpsPosition(getUserId(req), { lat: Number(lat), lng: Number(lng) });
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'GPS non enregistré' });
  }
};

const mission = async (req, res) => {
  try {
    const data = await getActiveMission(getUserId(req));
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Mission indisponible' });
  }
};

const claim = async (req, res) => {
  try {
    const data = await claimOrder(getUserId(req), req.params.orderId);
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Prise en charge échouée' });
  }
};

const complete = async (req, res) => {
  try {
    const { deliveryNote } = req.body;
    const data = await completeDelivery(getUserId(req), req.params.orderId, {
      deliveryNote,
    });
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Clôture livraison échouée' });
  }
};

module.exports = {
  dashboard,
  routePlan,
  advancedStats,
  postIssue,
  postGps,
  mission,
  claim,
  complete,
};
