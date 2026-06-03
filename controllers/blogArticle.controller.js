const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const blogArticleService = require('../services/blogArticle.service');

const handleError = (res, error, status = 500) =>
  res.status(error.status || status).json({ error: error.message || 'Erreur serveur' });

const getPublishedArticles = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getBlogArticles({ publishedOnly: true }));
    }
    const articles = await blogArticleService.listPublished();
    res.json(articles);
  } catch (error) {
    handleError(res, error);
  }
};

const getAdminArticles = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getBlogArticles({ publishedOnly: false }));
    }
    const articles = await blogArticleService.listAdmin();
    res.json(articles);
  } catch (error) {
    handleError(res, error);
  }
};

const createArticle = async (req, res) => {
  try {
    const { title, excerpt, body } = req.body || {};
    if (!title?.trim() || !excerpt?.trim() || !body?.trim()) {
      return res.status(400).json({ error: 'Titre, extrait et contenu requis' });
    }
    if (isDemoMode()) {
      return res.status(201).json(demoStore.createBlogArticle(req.body, req.user?.id));
    }
    const article = await blogArticleService.createArticle(req.body, req.user?.id);
    res.status(201).json(article);
  } catch (error) {
    handleError(res, error, 400);
  }
};

const updateArticle = async (req, res) => {
  try {
    if (isDemoMode()) {
      const article = demoStore.updateBlogArticle(req.params.id, req.body);
      if (!article) return res.status(404).json({ error: 'Article introuvable' });
      return res.json(article);
    }
    const existing = await blogArticleService.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Article introuvable' });
    const article = await blogArticleService.updateArticle(req.params.id, req.body);
    res.json(article);
  } catch (error) {
    handleError(res, error, error.code === 'P2025' ? 404 : 400);
  }
};

const deleteArticle = async (req, res) => {
  try {
    if (isDemoMode()) {
      const ok = demoStore.deleteBlogArticle(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Article introuvable' });
      return res.json({ message: 'Article supprimé' });
    }
    await blogArticleService.deleteArticle(req.params.id);
    res.json({ message: 'Article supprimé' });
  } catch (error) {
    handleError(res, error, error.code === 'P2025' ? 404 : 500);
  }
};

module.exports = {
  getPublishedArticles,
  getAdminArticles,
  createArticle,
  updateArticle,
  deleteArticle,
};
