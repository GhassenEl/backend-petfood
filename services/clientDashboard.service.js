const { prisma, isDemoMode } = require('../prismaClient');
const subscription = require('./ecosystem/subscription.service');
const smartWaterMonitor = require('./ecosystem/smartWaterMonitor.service');
const familyHousehold = require('./familyHousehold.service');

const uid = (u) => String(u?.id || u?._id);

const ACTIVE_ORDER_STATUSES = ['pending', 'paid', 'shipped', 'processing'];

const demoDashboard = () => ({
  activeOrder: {
    id: 'demo-order-002',
    status: 'shipped',
    total: 42,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    items: [{ quantity: 2, productId: { name: 'Pâtée chat saumon 400 g' } }],
  },
  nextAppointment: {
    id: 'demo-appt-1',
    petName: 'Max',
    type: 'Consultation',
    date: new Date(Date.now() + 3 * 86400000).toISOString(),
    status: 'scheduled',
    visitMode: 'cabinet',
  },
  loyalty: { points: 142, tier: 'standard' },
  iotAlerts: [
    { id: 'iot-1', type: 'feeder', level: 'warning', message: 'Distributeur : niveau bas (18%)', petName: 'Max' },
    { id: 'iot-2', type: 'water', level: 'info', message: 'Hydratation sous l\'objectif — Luna', petName: 'Luna' },
  ],
  subscriptions: [
    {
      id: 'demo-sub-1',
      productId: 'demo-prod-croq',
      product: { name: 'Croquettes Premium Chien Adulte 12 kg', price: 54.9 },
      quantity: 1,
      frequencyDays: 30,
      nextDeliveryAt: new Date(Date.now() + 12 * 86400000).toISOString(),
      status: 'active',
      discountPercent: 10,
    },
  ],
  household: {
    id: 'demo-hh',
    name: 'Foyer démo',
    inviteCode: 'PET-DEMO01',
    myRole: 'owner',
    members: [
      { userId: 'demo_client', name: 'Client Test', email: 'client@petfood.tn', role: 'owner' },
      { userId: 'demo_member', name: 'Conjoint(e)', email: 'conjoint@petfood.tn', role: 'member' },
    ],
  },
  stats: {
    ordersActive: 1,
    appointmentsUpcoming: 1,
    iotAlertCount: 2,
    subscriptionCount: 1,
    familyMembers: 2,
  },
});

const getClientDashboard = async (user) => {
  const userId = uid(user);

  if (isDemoMode()) {
    const household = await familyHousehold.findHouseholdForUser(userId);
    const dash = demoDashboard();
    if (household) dash.household = household;
    return dash;
  }

  const memberIds = await familyHousehold.getHouseholdMemberIds(userId);

  const [orders, appointments, subsPack, waterAlerts, household, userRow, feeders] = await Promise.all([
    prisma.order.findMany({
      where: {
        userId: { in: memberIds },
        status: { in: ACTIVE_ORDER_STATUSES },
      },
      include: {
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    }),
    prisma.petAppointment.findMany({
      where: {
        ownerId: { in: memberIds },
        category: 'vet',
        status: { in: ['scheduled', 'confirmed', 'pending'] },
        date: { gte: new Date() },
      },
      orderBy: { date: 'asc' },
      take: 1,
    }),
    subscription.listSubscriptions(user),
    smartWaterMonitor.listWaterAlerts(user).catch(() => ({ alerts: [] })),
    familyHousehold.findHouseholdForUser(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { loyaltyPoints: true, vipTier: true },
    }),
    prisma.petFeeder.findMany({
      where: { ownerId: { in: memberIds } },
      select: { id: true, name: true, isLowFood: true, foodGrams: true, status: true },
      take: 5,
    }),
  ]);

  const activeOrder = orders[0]
    ? {
        id: orders[0].id,
        status: orders[0].status,
        total: orders[0].total,
        createdAt: orders[0].createdAt,
        items: orders[0].items.map((i) => ({
          quantity: i.quantity,
          productId: { name: i.product?.name || 'Produit' },
        })),
      }
    : null;

  const nextAppointment = appointments[0]
    ? {
        id: appointments[0].id,
        petName: appointments[0].petName,
        type: appointments[0].type,
        date: appointments[0].date,
        status: appointments[0].status,
        visitMode: appointments[0].visitMode,
      }
    : null;

  const iotAlerts = [];
  (waterAlerts?.alerts || []).slice(0, 3).forEach((a) => {
    iotAlerts.push({
      id: `water-${a.petId || a.id}`,
      type: 'water',
      level: a.severity === 'high' ? 'critical' : a.severity === 'medium' ? 'warning' : 'info',
      message: a.message || 'Alerte hydratation',
      petName: a.petName,
    });
  });
  feeders.filter((f) => f.isLowFood || f.status === 'offline').forEach((f) => {
    iotAlerts.push({
      id: `feeder-${f.id}`,
      type: 'feeder',
      level: f.status === 'offline' ? 'critical' : 'warning',
      message: f.isLowFood ? `${f.name} : niveau bas` : `${f.name} : hors ligne`,
      petName: null,
    });
  });

  const subscriptions = (subsPack?.subscriptions || []).filter((s) => s.status === 'active');

  return {
    activeOrder,
    nextAppointment,
    loyalty: {
      points: userRow?.loyaltyPoints ?? 0,
      tier: userRow?.vipTier ?? 'standard',
    },
    iotAlerts,
    subscriptions,
    household,
    stats: {
      ordersActive: orders.length,
      appointmentsUpcoming: appointments.length,
      iotAlertCount: iotAlerts.length,
      subscriptionCount: subscriptions.length,
      familyMembers: household?.members?.length ?? 1,
    },
  };
};

module.exports = { getClientDashboard };
