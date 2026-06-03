const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const {
  processComplaintById,
  processAllPendingIncidents,
  getAdminValidationQueue,
  validateIncident,
  getIncidentAgentPack,
} = require('../services/incidentMlAgent.service');

const handleError = (res, error, code = 500) => {
  console.error('Incident ML error:', error);
  res.status(error.status || code).json({ error: error.message || 'Erreur agent incidents' });
};

const getAdminId = (req) => req.user?.id || req.user?._id;

const getPack = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getIncidentAgentPack(req.user));
    }
    const pack = await getIncidentAgentPack();
    res.json(pack);
  } catch (error) {
    handleError(res, error);
  }
};

const getQueue = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getIncidentValidationQueue());
    }
    const data = await getAdminValidationQueue();
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
};

const postProcessOne = async (req, res) => {
  try {
    if (isDemoMode()) {
      const result = demoStore.processComplaintWithAi(req.params.id);
      return res.json(result);
    }
    const result = await processComplaintById(req.params.id);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

const postProcessAll = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    if (isDemoMode()) {
      return res.json(demoStore.processAllPendingIncidentsAi(limit));
    }
    const result = await processAllPendingIncidents(limit);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

const postValidate = async (req, res) => {
  try {
    const { approved, response, rejectReason } = req.body || {};
    if (isDemoMode()) {
      const updated = demoStore.validateIncidentAi(req.params.id, getAdminId(req), {
        approved,
        response,
        rejectReason,
      });
      return res.json(updated);
    }
    const updated = await validateIncident(req.params.id, getAdminId(req), {
      approved: Boolean(approved),
      response,
      rejectReason,
    });
    res.json(updated);
  } catch (error) {
    handleError(res, error, 400);
  }
};

module.exports = {
  getPack,
  getQueue,
  postProcessOne,
  postProcessAll,
  postValidate,
};
