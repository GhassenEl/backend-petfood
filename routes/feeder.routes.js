const express = require('express');
const { auth } = require('../middleware/auth');
const feederDeviceAuth = require('../middleware/feederDeviceAuth');
const feederVpnGate = require('../middleware/feederVpnGate');
const {
  getMyFeeders,
  registerFeeder,
  getFeeder,
  updateFeeder,
  addSchedule,
  toggleSchedule,
  deleteSchedule,
  manualDispense,
  markRefill,
  getNutritionPlan,
  applySuggestedSchedules,
  getStats,
  getAlerts,
  getInsights,
  getHistory,
  getFirebaseLatest,
  getFirebaseHistory,
  getFirebaseConfig,
  deviceHeartbeat,
  devicePollCommands,
  deviceAckCommand,
  deviceEvent,
} = require('../controllers/feeder.controller');

const router = express.Router();

// ESP32 — VPN optionnel + authentification par clé appareil
router.post('/device/heartbeat', feederVpnGate, feederDeviceAuth, deviceHeartbeat);
router.get('/device/commands', feederVpnGate, feederDeviceAuth, devicePollCommands);
router.post('/device/ack', feederVpnGate, feederDeviceAuth, deviceAckCommand);
router.post('/device/event', feederVpnGate, feederDeviceAuth, deviceEvent);

// Application web — JWT
router.get('/firebase/status', auth, getFirebaseConfig);
router.get('/', auth, getMyFeeders);
router.post('/', auth, registerFeeder);
router.get('/:id/firebase/latest', auth, getFirebaseLatest);
router.get('/:id/firebase/history', auth, getFirebaseHistory);
router.get('/:id', auth, getFeeder);
router.put('/:id', auth, updateFeeder);
router.get('/:id/nutrition-plan', auth, getNutritionPlan);
router.get('/:id/stats', auth, getStats);
router.get('/:id/alerts', auth, getAlerts);
router.get('/:id/insights', auth, getInsights);
router.get('/:id/history', auth, getHistory);
router.post('/:id/apply-schedules', auth, applySuggestedSchedules);
router.post('/:id/dispense', auth, manualDispense);
router.post('/:id/refill', auth, markRefill);
router.post('/:id/schedules', auth, addSchedule);
router.patch('/schedules/:scheduleId', auth, toggleSchedule);
router.delete('/schedules/:scheduleId', auth, deleteSchedule);

module.exports = router;
