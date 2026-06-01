const { prisma } = require('../prismaClient');
const { normalizeProductRecord } = require('../utils/productNormalize');

const findAll = async () => {
  const products = await prisma.product.findMany();
  return products.map(normalizeProductRecord);
};

const findById = async (id) => {
  const product = await prisma.product.findUnique({ where: { id } });
  return normalizeProductRecord(product);
};

const create = async (data) => prisma.product.create({ data });

const update = async (id, data) => prisma.product.update({ where: { id }, data });

const deleteById = async (id) => prisma.product.delete({ where: { id } });

const findLowStock = async (threshold = 10) => {
  const products = await prisma.product.findMany({
    where: { stock: { lt: threshold, gte: 0 } },
    orderBy: { stock: 'asc' },
  });
  return products.map(normalizeProductRecord);
};

const findNearby = async (limit = 6) => {
  const products = await prisma.product.findMany({ take: limit });
  return products.map(normalizeProductRecord);
};

const updateStock = async (id, stock, history) => prisma.product.update({
  where: { id },
  data: { stock, stockHistory: history }
});

module.exports = {
  findAll,
  findById,
  create,
  update,
  deleteById,
  findLowStock,
  findNearby,
  updateStock
};