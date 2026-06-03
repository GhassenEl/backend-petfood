const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const {
  listReports,
  listMyReports,
  getReportById,
  lookupByTag,
  createReport,
  updateReport,
  getMatches,
} = require('../services/foundMe.service');

const resolveUser = (req) =>
  isDemoMode() ? demoStore.getUserById(req.user.id || req.user._id) || req.user : req.user;

const list = async (req, res) => {
  try {
    const reports = await listReports({
      reportType: req.query.type || req.query.reportType,
      animalType: req.query.animalType,
      status: req.query.status || 'active',
      region: req.query.region,
      q: req.query.q,
    });
    res.json(reports);
  } catch (error) {
    console.error('found-me list:', error);
    res.status(500).json({ error: 'Impossible de charger les signalements' });
  }
};

const mine = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const reports = await listMyReports(userId);
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: 'Erreur chargement de vos signalements' });
  }
};

const getOne = async (req, res) => {
  try {
    const report = await getReportById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Signalement introuvable' });
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: 'Erreur chargement signalement' });
  }
};

const lookupTag = async (req, res) => {
  try {
    const withContact = Boolean(req.user);
    const report = await lookupByTag(req.params.tagCode, { withContact });
    if (!report) return res.status(404).json({ error: 'Code Retrouvé Moi introuvable' });
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: 'Recherche par code échouée' });
  }
};

const create = async (req, res) => {
  try {
    const user = resolveUser(req);
    const userId = user.id || user._id;
    const report = await createReport(userId, req.body, user);
    res.status(201).json(report);
  } catch (error) {
    console.error('found-me create:', error);
    res.status(500).json({ error: error.message || 'Création impossible' });
  }
};

const patch = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const isAdmin = req.user.role === 'admin';
    const report = await updateReport(req.params.id, userId, req.body, isAdmin);
    if (!report) return res.status(404).json({ error: 'Signalement introuvable' });
    res.json(report);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Mise à jour impossible' });
  }
};

const matches = async (req, res) => {
  try {
    const result = await getMatches(req.params.id);
    if (!result) return res.status(404).json({ error: 'Signalement introuvable' });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Correspondances indisponibles' });
  }
};

const markReunited = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const isAdmin = req.user.role === 'admin';
    const report = await updateReport(
      req.params.id,
      userId,
      {
        status: 'reunited',
        matchedReportId: req.body.matchedReportId || null,
      },
      isAdmin
    );
    if (!report) return res.status(404).json({ error: 'Signalement introuvable' });
    res.json(report);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Erreur' });
  }
};

module.exports = {
  list,
  mine,
  getOne,
  lookupTag,
  create,
  patch,
  matches,
  markReunited,
};
