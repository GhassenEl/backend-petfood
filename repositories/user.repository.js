const { prisma } = require('../prismaClient');

const findById = async (id) => prisma.user.findUnique({ where: { id } });

module.exports = { findById };