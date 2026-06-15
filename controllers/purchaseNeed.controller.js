const activityLogService = require('../services/activityLog.service');
const purchaseNeedService = require('../services/purchaseNeed.service');

const getUserId = (req) => req.user?.id || req.user?._id;

const list = async (req, res) => {
  try {
    const needs = await purchaseNeedService.listNeeds({
      status: req.query.status || 'open',
      category: req.query.category,
      animalType: req.query.animalType,
      region: req.query.region,
      q: req.query.q,
      limit: req.query.limit,
    });
    res.json(needs);
  } catch (error) {
    console.error('purchase-needs list:', error);
    res.status(500).json({ error: 'Impossible de charger les annonces' });
  }
};

const mine = async (req, res) => {
  try {
    if (req.user.role !== 'client' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Réservé aux clients' });
    }
    const needs = await purchaseNeedService.listMyNeeds(getUserId(req));
    res.json(needs);
  } catch (error) {
    res.status(500).json({ error: 'Erreur chargement de vos annonces' });
  }
};

const getOne = async (req, res) => {
  try {
    const withResponses =
      req.user.role === 'client' ||
      req.user.role === 'admin' ||
      req.user.role === 'vendor';
    const need = await purchaseNeedService.getNeedById(req.params.id, { withResponses });
    if (!need) return res.status(404).json({ error: 'Annonce introuvable' });
    res.json(need);
  } catch (error) {
    res.status(500).json({ error: 'Erreur chargement annonce' });
  }
};

const create = async (req, res) => {
  try {
    if (req.user.role !== 'client' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Seuls les clients peuvent publier un besoin d\'achat' });
    }
    const need = await purchaseNeedService.createNeed(getUserId(req), req.body, req.user);
    activityLogService
      .logFromRequest(req, {
        action: 'publish_purchase_need',
        target: need.title,
        details: need.category,
        module: 'boutique',
        actorRole: 'client',
      })
      .catch(() => {});
    res.status(201).json(need);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Publication impossible' });
  }
};

const patch = async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const need = await purchaseNeedService.updateNeed(
      req.params.id,
      getUserId(req),
      req.body,
      isAdmin,
    );
    if (!need) return res.status(404).json({ error: 'Annonce introuvable' });
    res.json(need);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Mise à jour impossible' });
  }
};

const respond = async (req, res) => {
  try {
    if (!['vendor', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Réservé aux vendeurs' });
    }
    const response = await purchaseNeedService.addResponse(
      req.params.id,
      getUserId(req),
      req.body,
      req.user,
    );
    if (!response) return res.status(404).json({ error: 'Annonce introuvable' });
    activityLogService
      .logFromRequest(req, {
        action: 'respond_purchase_need',
        target: req.params.id,
        module: 'vendor',
        actorRole: 'vendor',
      })
      .catch(() => {});
    res.status(201).json(response);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Réponse impossible' });
  }
};

const responses = async (req, res) => {
  try {
    const list = await purchaseNeedService.listResponses(req.params.id);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Réponses indisponibles' });
  }
};

const patchResponse = async (req, res) => {
  try {
    const { status } = req.body || {};
    const row = await purchaseNeedService.updateResponseStatus(
      req.params.responseId,
      getUserId(req),
      status,
    );
    if (!row) return res.status(404).json({ error: 'Réponse introuvable' });
    res.json(row);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Mise à jour impossible' });
  }
};

module.exports = {
  list,
  mine,
  getOne,
  create,
  patch,
  respond,
  responses,
  patchResponse,
};
