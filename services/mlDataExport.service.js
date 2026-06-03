const { prisma, isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const { aggregateMonthly } = require('./salesForecast.service');

const EXCLUDED = ['cancelled', 'canceled', 'refunded'];

const mapOrder = (o) => ({
  id: String(o.id || o._id),
  userId: String(o.userId || o.user?._id || o.user?.id),
  total: Number(o.total || 0),
  status: String(o.status || 'pending'),
  paymentMethod: o.paymentMethod || null,
  region: o.region || null,
  createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : new Date().toISOString(),
  items: (o.items || []).map((it) => ({
    productId: it.productId ? String(it.productId) : it.product?.id ? String(it.product.id) : null,
    quantity: Number(it.quantity || 1),
    price: Number(it.price || 0),
    category: it.product?.category || it.category || null,
    animalType: it.product?.animalType || it.animalType || null,
    productName: it.product?.name || it.productName || null,
  })),
});

const buildSnapshotFromDemo = () => {
  const orders = (demoStore.getOrders({ role: 'admin', _id: 'demo_admin' }) || []).map((o) => {
    const items = (o.items || []).map((it) => {
      const pid = it.productId?._id || it.productId;
      const prod =
        (demoStore.getProducts?.() || []).find(
          (p) => String(p._id || p.id) === String(pid)
        ) || {};
      return {
        productId: String(pid || ''),
        quantity: Number(it.quantity || 1),
        price: Number(it.price || 0),
        category: prod.category,
        animalType: prod.animalType,
        productName: prod.name,
      };
    });
    return mapOrder({ ...o, items });
  });

  const products = (demoStore.getProducts?.() || []).map((p) => ({
    id: String(p._id || p.id),
    name: p.name,
    price: Number(p.price || 0),
    category: p.category || 'nourriture',
    animalType: p.animalType || 'other',
    tags: Array.isArray(p.tags) ? p.tags.join(',') : p.tags,
    popularity: Number(p.popularity || 0),
    rating_avg: Number(p.rating_avg || 0),
    stock: Number(p.stock || 0),
  }));

  const users = [
    { id: 'demo_client', role: 'client', name: 'Client Test', createdAt: new Date().toISOString() },
    { id: 'demo_admin', role: 'admin', name: 'Admin', createdAt: new Date().toISOString() },
  ];

  const pets = [
    {
      id: 'pet_mimi',
      ownerId: 'demo_client',
      name: 'Mimi',
      type: 'cat',
      birthDate: new Date(2018, 0, 1).toISOString(),
    },
    {
      id: 'pet_rex',
      ownerId: 'demo_client',
      name: 'Rex',
      type: 'dog',
      breed: 'Berger',
      birthDate: new Date(2016, 5, 1).toISOString(),
      weight: 22,
    },
    {
      id: 'pet_coco',
      ownerId: 'demo_client',
      name: 'Coco',
      type: 'bird',
      birthDate: new Date(2023, 2, 1).toISOString(),
      weight: 0.05,
    },
    {
      id: 'pet_nibbles',
      ownerId: 'demo_client',
      name: 'Nibbles',
      type: 'rabbit',
      birthDate: new Date(2024, 8, 1).toISOString(),
      weight: 1.2,
    },
  ];

  let finalOrders = orders;
  if (finalOrders.length < 8) {
    const prods = products.length ? products : [{ id: 'p1', name: 'Croquettes Senior', category: 'nourriture', animalType: 'dog' }];
    finalOrders = [];
    const now = new Date();
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
      const p = prods[i % prods.length];
      finalOrders.push(
        mapOrder({
          id: `syn_o_${i}`,
          userId: 'demo_client',
          total: 3200 + (11 - i) * 220,
          status: i === 0 ? 'pending' : 'delivered',
          paymentMethod: i % 3 === 0 ? 'cash' : 'card',
          createdAt: d.toISOString(),
          items: [{ productId: p.id, quantity: 2 + (i % 4), price: p.price || 50, category: p.category, animalType: p.animalType, productName: p.name }],
        })
      );
    }
  }

  return {
    orders: finalOrders,
    products,
    users,
    pets,
    revenue_history: aggregateMonthly(
      finalOrders.filter((o) => !EXCLUDED.includes(o.status.toLowerCase()))
    ),
  };
};

const exportMlSnapshot = async () => {
  if (isDemoMode()) {
    return buildSnapshotFromDemo();
  }

  try {
    return await exportMlSnapshotFromDb();
  } catch (err) {
    console.warn('[ML Export] DB indisponible, données démo:', err.message);
    return buildSnapshotFromDemo();
  }
};

const exportMlSnapshotFromDb = async () => {
  const since = new Date();
  since.setMonth(since.getMonth() - 18);

  const [orders, products, users, pets] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: since } },
      include: {
        items: { include: { product: { select: { id: true, name: true, category: true, animalType: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 5000,
    }),
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        price: true,
        category: true,
        animalType: true,
        tags: true,
        popularity: true,
        rating_avg: true,
        stock: true,
      },
    }),
    prisma.user.findMany({
      where: { role: { in: ['client', 'admin', 'livreur', 'vet'] } },
      select: { id: true, name: true, role: true, region: true, createdAt: true },
      take: 2000,
    }),
    prisma.pet.findMany({
      select: {
        id: true,
        ownerId: true,
        name: true,
        type: true,
        breed: true,
        birthDate: true,
        weight: true,
      },
    }),
  ]);

  const mappedOrders = orders.map((o) =>
    mapOrder({
      ...o,
      items: o.items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        price: it.price,
        product: it.product,
      })),
    })
  );

  const activeOrders = mappedOrders.filter((o) => !EXCLUDED.includes(o.status.toLowerCase()));

  return {
    orders: mappedOrders,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      category: p.category,
      animalType: p.animalType,
      tags: p.tags,
      popularity: p.popularity,
      rating_avg: p.rating_avg,
      stock: p.stock,
    })),
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      region: u.region,
      createdAt: u.createdAt?.toISOString?.() || null,
    })),
    pets: pets.map((p) => ({
      id: p.id,
      ownerId: p.ownerId,
      name: p.name,
      type: p.type,
      breed: p.breed,
      birthDate: p.birthDate?.toISOString?.() || null,
      weight: p.weight,
    })),
    revenue_history: aggregateMonthly(activeOrders),
  };
};

module.exports = { exportMlSnapshot, exportMlSnapshotFromDb, buildSnapshotFromDemo };
