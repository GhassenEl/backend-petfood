const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const c = require('../controllers/platformCities.controller');

const router = express.Router();

router.get('/cities', c.getPublic);
router.get('/regions', c.getRegions);
router.get('/cities/pack', auth, adminAuth, c.getPack);
router.patch('/cities/:id', auth, adminAuth, c.patchCity);
router.post('/cities', auth, adminAuth, c.postCity);
router.get('/cities/export', auth, adminAuth, c.exportCities);
router.post('/cities/import', auth, adminAuth, c.importCities);

module.exports = router;
