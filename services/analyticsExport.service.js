const { prisma, isDemoMode } = require('../prismaClient');
const { exportMlSnapshot } = require('./mlDataExport.service');

const toCsv = (rows, columns) => {
  if (!rows?.length) return columns.join(',') + '\n';
  const header = columns.join(',');
  const lines = rows.map((row) =>
    columns
      .map((col) => {
        const v = row[col];
        if (v == null) return '';
        const s = String(v).replace(/"/g, '""');
        return s.includes(',') || s.includes('\n') ? `"${s}"` : s;
      })
      .join(',')
  );
  return [header, ...lines].join('\n');
};

const exportOrders = async () => {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5000,
    include: {
      user: { select: { email: true, name: true, region: true } },
      items: { include: { product: { select: { name: true, category: true } } } },
    },
  });
  return orders.map((o) => ({
    orderId: o.id,
    userEmail: o.user?.email,
    region: o.region,
    status: o.status,
    total: o.total,
    paymentMethod: o.paymentMethod,
    itemCount: o.items?.length || 0,
    createdAt: o.createdAt?.toISOString?.() || o.createdAt,
  }));
};

const exportComplaints = async () => {
  return prisma.complaint.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3000,
    include: { user: { select: { email: true, name: true } } },
  }).then((rows) =>
    rows.map((c) => ({
      id: c.id,
      userEmail: c.user?.email,
      subject: c.subject,
      status: c.status,
      aiCategory: c.aiCategory,
      aiPriority: c.aiPriority,
      adminValidated: c.adminValidated,
      orderId: c.orderId,
      createdAt: c.createdAt?.toISOString?.() || c.createdAt,
    }))
  );
};

const exportServiceBookings = async () => {
  return prisma.petAppointment.findMany({
    where: { category: 'service' },
    orderBy: { date: 'desc' },
    take: 3000,
    include: { owner: { select: { email: true } } },
  }).then((rows) =>
    rows.map((a) => ({
      id: a.id,
      type: a.type,
      petName: a.petName,
      animalType: a.animalType,
      status: a.status,
      price: a.price,
      paymentStatus: a.paymentStatus,
      ownerEmail: a.owner?.email,
      date: a.date?.toISOString?.() || a.date,
    }))
  );
};

const exportServiceRatings = async () => {
  return prisma.serviceRating.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3000,
  }).then((rows) =>
    rows.map((r) => ({
      id: r.id,
      type: r.type,
      rating: r.rating,
      emotion: r.emotion,
      region: r.region,
      createdAt: r.createdAt?.toISOString?.() || r.createdAt,
    }))
  );
};

const EXPORTERS = {
  orders: { fn: exportOrders, columns: ['orderId', 'userEmail', 'region', 'status', 'total', 'paymentMethod', 'itemCount', 'createdAt'] },
  complaints: { fn: exportComplaints, columns: ['id', 'userEmail', 'subject', 'status', 'aiCategory', 'aiPriority', 'adminValidated', 'orderId', 'createdAt'] },
  service_bookings: { fn: exportServiceBookings, columns: ['id', 'type', 'petName', 'animalType', 'status', 'price', 'paymentStatus', 'ownerEmail', 'date'] },
  service_ratings: { fn: exportServiceRatings, columns: ['id', 'type', 'rating', 'emotion', 'region', 'createdAt'] },
};

const exportTable = async (table, format = 'json') => {
  const spec = EXPORTERS[table];
  if (!spec) {
    const err = new Error(`Table inconnue. Disponibles: ${Object.keys(EXPORTERS).join(', ')}`);
    err.status = 400;
    throw err;
  }
  const rows = await spec.fn();
  if (format === 'csv') {
    return { contentType: 'text/csv; charset=utf-8', body: toCsv(rows, spec.columns), filename: `petfoodtn_${table}.csv` };
  }
  return { contentType: 'application/json', body: rows, filename: `${table}.json` };
};

const getDatasetsCatalog = async () => {
  const snapshot = await exportMlSnapshot().catch(() => ({}));
  return {
    datasets: Object.keys(EXPORTERS).map((key) => ({
      id: key,
      exportUrl: `/api/analytics/export/${key}`,
      formats: ['json', 'csv'],
    })),
    mlSnapshotAvailable: Boolean(snapshot?.orders?.length),
    powerBiRefreshHint: 'Power BI Desktop → Obtenir des données → Web → URL API avec token admin',
  };
};

module.exports = { exportTable, getDatasetsCatalog, EXPORTERS };
