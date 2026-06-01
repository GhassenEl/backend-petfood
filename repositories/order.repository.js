const { prisma } = require('../prismaClient');

const getOrdersForUser = async (user, role) => {
  const where = {};

  if (role !== 'admin' && role !== 'livreur') {
    where.userId = user.id || user._id;
  } else if (role === 'livreur') {
    const livreur = await prisma.user.findUnique({
      where: { id: user.id || user._id },
      select: { region: true },
    });
    if (livreur?.region) {
      where.region = livreur.region;
    }
  }

  return prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, email: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, price: true, discount: true, imageUrl: true } }
        }
      }
    }
  });
};

const countOrders = async (where = {}) => prisma.order.count({ where });

const aggregateTotal = async () => prisma.order.aggregate({ _sum: { total: true } });

const findById = async (id) => prisma.order.findUnique({
  where: { id },
  include: {
    user: { select: { id: true, name: true, email: true } },
    items: {
      include: {
        product: { select: { id: true, name: true, price: true, discount: true, imageUrl: true } }
      }
    }
  }
});

const create = async (data) => prisma.order.create({
  data,
  include: {
    user: { select: { id: true, name: true, email: true } },
    items: {
      include: {
        product: { select: { id: true, name: true, price: true, discount: true, imageUrl: true } }
      }
    }
  }
});

const update = async (id, data) => prisma.order.update({
  where: { id },
  data,
  include: {
    user: { select: { id: true, name: true, email: true } },
    items: {
      include: {
        product: { select: { id: true, name: true, price: true, discount: true, imageUrl: true } }
      }
    }
  }
});

const deleteWithDependencies = async (id) => prisma.$transaction([
  prisma.invoice.deleteMany({ where: { orderId: id } }),
  prisma.orderItem.deleteMany({ where: { orderId: id } }),
  prisma.order.delete({ where: { id } })
]);

module.exports = {
  getOrdersForUser,
  countOrders,
  aggregateTotal,
  findById,
  create,
  update,
  deleteWithDependencies
};
