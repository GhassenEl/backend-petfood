const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const {
  getPublishedArticles,
  getAdminArticles,
  createArticle,
  updateArticle,
  deleteArticle,
} = require('../controllers/blogArticle.controller');

const router = express.Router();

router.get('/', getPublishedArticles);
router.get('/admin', auth, adminAuth, getAdminArticles);
router.post('/', auth, adminAuth, createArticle);
router.put('/:id', auth, adminAuth, updateArticle);
router.delete('/:id', auth, adminAuth, deleteArticle);

module.exports = router;
