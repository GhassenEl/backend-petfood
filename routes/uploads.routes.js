const express = require('express');
const { auth } = require('../middleware/auth');
const { authorizeUpload, handleUpload } = require('../middleware/upload.middleware');
const { uploadImage } = require('../controllers/upload.controller');

const router = express.Router();

router.post('/:folder', auth, authorizeUpload, handleUpload, uploadImage);

module.exports = router;
