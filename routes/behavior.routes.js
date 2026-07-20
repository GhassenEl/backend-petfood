const { auth } = require('../middleware/auth');
const {
  analyzeOwnerPets,
  persistAndNotify,
  listAnomalies,
  recordBehaviorEvent,
} = require('../services/petBehavior.service');

const analyze = async (req, res) => {
  try {
    const analysis = await analyzeOwnerPets(req.user);
    const saved = await persistAndNotify(req.user, analysis);
    res.json({ ...analysis, savedCount: saved.length });
  } catch (error) {
    console.error('behavior analyze:', error);
    res.status(500).json({ error: 'Analyse comportementale indisponible' });
  }
};

const getAnomalies = async (req, res) => {
  try {
    const anomalies = await listAnomalies(req.user, { limit: req.query.limit });
    res.json({ anomalies });
  } catch (error) {
    res.status(500).json({ error: 'Historique anomalies indisponible' });
  }
};

const postEvent = async (req, res) => {
  try {
    const event = await recordBehaviorEvent(req.user, req.body || {});
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: 'Enregistrement événement échoué' });
  }
};

const express = require('express');
const router = express.Router();
router.post('/analyze', auth, analyze);
router.get('/anomalies', auth, getAnomalies);
router.post('/events', auth, postEvent);

module.exports = router;
