const { getClientIoTPack } = require('../services/clientIot.service');
const {
  getWearablesForUser,
  ensureCollarsForOwnerPets,
  simulateReading,
} = require('../services/petCollar.service');

exports.getIoTPack = async (req, res) => {
  try {
    const pack = await getClientIoTPack(req.user);
    res.json(pack);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur IoT' });
  }
};

exports.getWearables = async (req, res) => {
  try {
    const userId = String(req.user.id || req.user._id);
    await ensureCollarsForOwnerPets(userId).catch(() => []);
    const data = await getWearablesForUser(req.user);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur colliers' });
  }
};

exports.postWearableSimulate = async (req, res) => {
  try {
    const reading = await simulateReading(req.params.id, req.user);
    if (!reading) return res.status(404).json({ error: 'Collier introuvable' });
    res.json({ reading });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Simulation impossible' });
  }
};
