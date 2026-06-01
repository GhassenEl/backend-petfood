const clinicService = require('../services/clinic.service');

const getUserId = (req) => req.user?.id || req.user?._id;

const getProfile = async (req, res) => {
  try {
    const profile = await clinicService.getClinicProfile(getUserId(req));
    res.json(profile);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur profil clinique' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const profile = await clinicService.updateClinicProfile(getUserId(req), req.body || {});
    res.json(profile);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur mise à jour clinique' });
  }
};

const getStats = async (req, res) => {
  try {
    const stats = await clinicService.getClinicStats(getUserId(req));
    res.json(stats);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur statistiques clinique' });
  }
};

module.exports = { getProfile, updateProfile, getStats };
