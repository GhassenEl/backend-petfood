const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const {
  getAdminAdvancedPack,
  postAdminCopilot,
  getClientAdvancedPack,
} = require('../services/advancedAi.service');

const resolveUser = (req) =>
  isDemoMode() ? demoStore.getUserById(req.user.id || req.user._id) || req.user : req.user;

const handleError = (res, error, code = 500) => {
  console.error('Advanced AI error:', error);
  res.status(error.status || code).json({ error: error.message || 'Erreur IA avancée' });
};

exports.getAdminAdvancedPack = async (req, res) => {
  try {
    const pack = await getAdminAdvancedPack();
    res.json(pack);
  } catch (error) {
    handleError(res, error);
  }
};

exports.postAdminCopilot = async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message requis' });
    const result = await postAdminCopilot(message, req.body?.context || {});
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

exports.getClientAdvancedPack = async (req, res) => {
  try {
    const user = resolveUser(req);
    const pack = await getClientAdvancedPack(user);
    res.json(pack);
  } catch (error) {
    handleError(res, error);
  }
};
