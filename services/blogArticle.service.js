const blogArticleRepository = require('../repositories/blogArticle.repository');

const listPublished = () => blogArticleRepository.findPublished();

const listAdmin = () => blogArticleRepository.findAllAdmin();

const getById = (id) => blogArticleRepository.findById(id);

const createArticle = (payload, authorId) => {
  const readMin = Number(payload.readMin) || 5;
  return blogArticleRepository.create({
    title: String(payload.title || '').trim(),
    category: String(payload.category || 'Guide').trim(),
    excerpt: String(payload.excerpt || '').trim(),
    body: String(payload.body || '').trim(),
    readMin: Math.max(1, Math.min(60, readMin)),
    isPublished: payload.isPublished !== false,
    publishedAt: payload.publishedAt ? new Date(payload.publishedAt) : new Date(),
    authorId: authorId || null,
  });
};

const updateArticle = async (id, payload) => {
  const data = {};
  if (payload.title !== undefined) data.title = String(payload.title).trim();
  if (payload.category !== undefined) data.category = String(payload.category).trim();
  if (payload.excerpt !== undefined) data.excerpt = String(payload.excerpt).trim();
  if (payload.body !== undefined) data.body = String(payload.body).trim();
  if (payload.readMin !== undefined) {
    data.readMin = Math.max(1, Math.min(60, Number(payload.readMin) || 5));
  }
  if (payload.isPublished !== undefined) data.isPublished = Boolean(payload.isPublished);
  if (payload.publishedAt !== undefined) data.publishedAt = new Date(payload.publishedAt);
  return blogArticleRepository.update(id, data);
};

const deleteArticle = (id) => blogArticleRepository.deleteById(id);

module.exports = {
  listPublished,
  listAdmin,
  getById,
  createArticle,
  updateArticle,
  deleteArticle,
};
