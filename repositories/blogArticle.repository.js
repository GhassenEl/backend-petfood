const { prisma } = require('../prismaClient');

const normalize = (row) => {
  if (!row) return null;
  return {
    ...row,
    _id: row.id,
    id: row.id,
    date: row.publishedAt,
  };
};

const findPublished = async () => {
  const rows = await prisma.blogArticle.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: 'desc' },
  });
  return rows.map(normalize);
};

const findAllAdmin = async () => {
  const rows = await prisma.blogArticle.findMany({
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(normalize);
};

const findById = async (id) => normalize(await prisma.blogArticle.findUnique({ where: { id } }));

const create = async (data) => normalize(await prisma.blogArticle.create({ data }));

const update = async (id, data) => normalize(await prisma.blogArticle.update({ where: { id }, data }));

const deleteById = async (id) => prisma.blogArticle.delete({ where: { id } });

module.exports = {
  findPublished,
  findAllAdmin,
  findById,
  create,
  update,
  deleteById,
};
