const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const c = require('../controllers/adminRoles.controller');

const router = express.Router();

router.get('/', auth, adminAuth, c.listRoles);
router.get('/permissions', auth, adminAuth, c.getCatalog);
router.get('/:slug', auth, adminAuth, c.getRole);
router.post('/', auth, adminAuth, c.createRole);
router.patch('/:id', auth, adminAuth, c.updateRole);
router.delete('/:id', auth, adminAuth, c.deleteRole);

module.exports = router;
