const {
  getDashboard,
  optimizeRoute,
  getAdvancedStats,
  reportIssue,
  updateGpsPosition,
  claimOrder,
  getActiveMission,
  completeDelivery,
  cancelDelivery,
} = require('../services/livreur.service');
const { getLivreurOrdersRiskMap } = require('../services/mlOrchestrator.service');
const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');

const getUserId = (req) => req.user?.id || req.user?._id;

const resolveUser = (req) =>
  isDemoMode() ? demoStore.getUserById(getUserId(req)) || req.user : req.user;

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
    const user = resolveUser(req);
    const [data, ml] = await Promise.all([
      optimizeRoute(getUserId(req), { lat, lng }),
      getLivreurOrdersRiskMap(user).catch(() => null),
    ]);
    if (ml?.risks) {
      data.mlPowered = ml.pythonPowered;
      data.poolPriority = ml.poolPriority;
      data.stops = (data.stops || []).map((stop) => {
        const orderId = stop.order?.id;
        const risk = orderId ? ml.risks[orderId] : null;
        const priority = ml.poolPriority?.find((p) => p.orderId === orderId);
        return {
          ...stop,
          mlRisk: risk,
          mlPriorityScore: priority?.priorityScore ?? null,
        };
      });
      if (ml.poolPriority?.length) {
        const scoreMap = Object.fromEntries(
          ml.poolPriority.map((p) => [p.orderId, p.priorityScore])
        );
        data.stops.sort((a, b) => {
          const aShip = a.order?.status === 'shipped' ? 1 : 0;
          const bShip = b.order?.status === 'shipped' ? 1 : 0;
          if (bShip !== aShip) return bShip - aShip;
          return (scoreMap[b.order?.id] || 0) - (scoreMap[a.order?.id] || 0);
        });
        data.stops.forEach((s, i) => {
          s.stopNumber = i + 1;
        });
      }
    }
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

const cancel = async (req, res) => {
  try {
    const { reason } = req.body || {};
    if (isDemoMode()) {
      const result = demoStore.livreurCancelOrder(req.params.orderId, getUserId(req), { reason });
      if (!result) return res.status(404).json({ error: 'Commande introuvable' });
      if (result.error) return res.status(400).json({ error: result.error });
      return res.json(result);
    }
    const data = await cancelDelivery(getUserId(req), req.params.orderId, { reason });
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Annulation de course échouée' });
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
  cancel,
};
