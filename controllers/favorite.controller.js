const favoriteService = require('../services/favorite.service');

const getUserId = (req) => req.user?.id || req.user?._id;

const list = async (req, res) => {
  try {
    const products = await favoriteService.listFavorites(getUserId(req));
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const add = async (req, res) => {
  try {
    const product = await favoriteService.addFavorite(getUserId(req), req.params.productId);
    res.status(201).json(product);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
};

const remove = async (req, res) => {
  try {
    await favoriteService.removeFavorite(getUserId(req), req.params.productId);
    res.json({ message: 'Retiré des favoris' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const ids = async (req, res) => {
  try {
    const productIds = await favoriteService.getFavoriteIds(getUserId(req));
    res.json({ productIds });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const frequent = async (req, res) => {
  try {
    const products = await favoriteService.getFrequentProducts(getUserId(req), Number(req.query.limit) || 8);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { list, add, remove, ids, frequent };
