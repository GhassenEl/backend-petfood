const { getClientIoTPack } = require('../services/clientIot.service');

exports.getIoTPack = async (req, res) => {
  try {
    const pack = await getClientIoTPack(req.user);
    res.json(pack);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur IoT' });
  }
};
