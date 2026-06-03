const {
  getVetAvailability,
  saveVetAvailability,
  getPublicAvailabilitySlots,
  buildSlotsForDay,
} = require('../services/vetAvailability.service');

const resolveVetId = (req) => req.user?.id || req.user?._id;

const getMyAvailability = async (req, res) => {
  try {
    const config = await getVetAvailability(resolveVetId(req));
    res.json(config);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur chargement disponibilité' });
  }
};

const updateMyAvailability = async (req, res) => {
  try {
    const config = await saveVetAvailability(resolveVetId(req), req.body || {});
    res.json(config);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur enregistrement disponibilité' });
  }
};

const previewSlots = async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const config = await getVetAvailability(resolveVetId(req));
    const slots = buildSlotsForDay(date, config);
    res.json({ date, slots, config: { isAvailable: config.isAvailable, slotDurationMinutes: config.slotDurationMinutes } });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur aperçu créneaux' });
  }
};

const getSlotsForClients = async (req, res) => {
  try {
    const { date, vetId } = req.query;
    const result = await getPublicAvailabilitySlots({ date, vetId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Impossible de charger les créneaux' });
  }
};

module.exports = {
  getMyAvailability,
  updateMyAvailability,
  previewSlots,
  getSlotsForClients,
};
