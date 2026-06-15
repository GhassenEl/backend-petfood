const svc = require('../services/platformCities.service');

exports.getPublic = async (_req, res) => {
  try {
    res.json(await svc.getPublicCities());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getRegions = async (_req, res) => {
  try {
    const regions = await svc.getRegionNames();
    res.json({ regions, source: 'platform' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPack = async (_req, res) => {
  try {
    res.json(await svc.getPack());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.patchCity = async (req, res) => {
  try {
    res.json(await svc.updateCity(req.params.id, req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.postCity = async (req, res) => {
  try {
    const row = await svc.upsertCity(req.body || {});
    res.status(201).json(row);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.exportCities = async (_req, res) => {
  try {
    res.json(await svc.exportCities());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.importCities = async (req, res) => {
  try {
    const rows = req.body?.rows || req.body?.cities || req.body;
    res.json(await svc.importCities(rows));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
};
