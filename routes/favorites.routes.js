const express = require('express');
const { auth } = require('../middleware/auth');
const { list, add, remove, ids, frequent } = require('../controllers/favorite.controller');

const router = express.Router();

router.get('/frequent', auth, frequent);
router.get('/ids', auth, ids);
router.get('/', auth, list);
router.post('/:productId', auth, add);
router.delete('/:productId', auth, remove);

module.exports = router;
