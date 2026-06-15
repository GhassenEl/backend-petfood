const { prisma } = require('../prismaClient');
const { DEFAULT_POLICY } = require('./refundRules');

const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const hoursAgo = (n) => new Date(Date.now() - n * 3600000);

const hist = (action, actor, actorRole, note = '', at) => ({
  action,
  actor,
  actorRole,
  note,
  createdAt: at || new Date(),
});

const DEMO_REFUND_ROWS = [
  {
    id: 'ref-1',
    orderRef: 'CMD-8775',
    clientName: 'Leila S.',
    vendorName: 'Leila Mansouri',
    productName: 'Fontaine eau chat 2 L',
    amount: 89,
    reason: 'Produit défectueux — pompe ne fonctionne pas',
    reasonCategory: 'damaged',
    status: 'pending',
    createdAt: daysAgo(1),
    history: [hist('request_created', 'Leila S.', 'client', 'Demande de remboursement', daysAgo(1))],
  },
  {
    id: 'ref-2',
    orderRef: 'CMD-8720',
    clientName: 'Omar B.',
    vendorName: 'Leila Mansouri',
    productName: 'Jouet corde résistant',
    amount: 24,
    reason: 'Article différent de la photo',
    reasonCategory: 'wrong_product',
    status: 'awaiting_return',
    createdAt: daysAgo(4),
    history: [
      hist('request_created', 'Omar B.', 'client', '', daysAgo(4)),
      hist('vendor_approved', 'Leila Mansouri', 'vendor', 'Motif vérifié — retour accepté', daysAgo(3)),
    ],
  },
  {
    id: 'ref-3',
    orderRef: 'CMD-8699',
    clientName: 'Ines M.',
    vendorName: 'Ridha Ben Ammar',
    productName: 'Croquettes premium chien 15 kg',
    amount: 156,
    reason: "Changement d'avis",
    reasonCategory: 'changed_mind',
    status: 'disputed',
    disputed: true,
    fraudScore: 0.15,
    createdAt: daysAgo(7),
    history: [
      hist('request_created', 'Ines M.', 'client', '', daysAgo(7)),
      hist('vendor_rejected', 'Ridha Ben Ammar', 'vendor', 'Hors délai politique retour', daysAgo(5)),
      hist('client_disputed', 'Ines M.', 'client', 'Contestation de la décision', daysAgo(2)),
    ],
  },
  {
    id: 'ref-4',
    orderRef: 'CMD-8650',
    clientName: 'Amira B.',
    vendorName: 'Leila Mansouri',
    productName: 'Pâtée chat saumon x6',
    amount: 42,
    reason: 'Boîtes enfoncées à la livraison',
    reasonCategory: 'damaged',
    status: 'return_received',
    returnReceived: true,
    returnReceivedAt: daysAgo(1),
    createdAt: daysAgo(6),
    history: [
      hist('request_created', 'Amira B.', 'client', '', daysAgo(6)),
      hist('vendor_approved', 'Leila Mansouri', 'vendor', '', daysAgo(5)),
      hist('return_received', 'Leila Mansouri', 'vendor', 'Colis reçu en bon état', daysAgo(1)),
    ],
  },
  {
    id: 'ref-5',
    orderRef: 'CMD-8601',
    clientName: 'Karim M.',
    vendorName: 'Ridha Ben Ammar',
    productName: 'Litière agglomérante 10 L',
    amount: 35,
    reason: 'Colis non reçu après 6 jours de retard',
    reasonCategory: 'late_delivery',
    delayDays: 6,
    noReturnRequired: true,
    status: 'refunded',
    createdAt: daysAgo(12),
    history: [
      hist('request_created', 'Karim M.', 'client', '', daysAgo(12)),
      hist('vendor_approved_no_return', 'Ridha Ben Ammar', 'vendor', 'Retard confirmé — sans retour physique', daysAgo(11)),
      hist('refund_validated', 'Ridha Ben Ammar', 'vendor', '', daysAgo(10)),
      hist('refunded', 'Système', 'system', 'Virement 35 DT', daysAgo(8)),
    ],
  },
  {
    id: 'ref-8',
    orderRef: 'CMD-8791',
    clientName: 'Karim M.',
    vendorName: 'Pets & Co Sfax',
    productName: 'Croquettes chat 3 kg',
    amount: 42,
    reason: 'Livraison prévue sous 3 jours, reçue après 7 jours',
    reasonCategory: 'late_delivery',
    delayDays: 7,
    noReturnRequired: true,
    status: 'pending',
    createdAt: daysAgo(1),
    history: [hist('request_created', 'Karim M.', 'client', 'Retard livraison > 5 jours', daysAgo(1))],
  },
  {
    id: 'ref-6',
    orderRef: 'CMD-8580',
    clientName: 'Youssef G.',
    vendorName: 'Leila Mansouri',
    productName: 'Croquettes chiot 8 kg',
    amount: 120,
    reason: 'Multiples demandes suspectes',
    reasonCategory: 'other',
    status: 'fraud_flagged',
    disputed: true,
    fraudScore: 0.91,
    createdAt: daysAgo(3),
    history: [
      hist('request_created', 'Youssef G.', 'client', '', daysAgo(3)),
      hist('fraud_flagged', 'Système NLP', 'system', 'Score fraude 91 %', hoursAgo(6)),
      hist('moderator_review', 'Nour Modération', 'moderator', '', hoursAgo(5)),
    ],
  },
  {
    id: 'ref-7',
    orderRef: 'CMD-8555',
    clientName: 'Salma K.',
    vendorName: 'Boutique Nour Pets',
    productName: 'Harnais chien réglable',
    amount: 55,
    reason: 'Litige complexe — double débit',
    reasonCategory: 'other',
    status: 'admin_forced',
    returnReceived: true,
    disputed: true,
    fraudScore: 0.2,
    createdAt: daysAgo(15),
    history: [
      hist('request_created', 'Salma K.', 'client', '', daysAgo(15)),
      hist('disputed', 'Salma K.', 'client', '', daysAgo(12)),
      hist('admin_forced_refund', 'Ghassen Admin', 'admin', 'Remboursement forcé après analyse', daysAgo(10)),
    ],
  },
];

const ensureRefundPolicy = async () => {
  const existing = await prisma.refundPolicy.findUnique({ where: { id: 'default' } });
  if (existing) return existing;
  return prisma.refundPolicy.create({ data: { id: 'default', ...DEFAULT_POLICY } });
};

const seedRefunds = async () => {
  await ensureRefundPolicy();
  const count = await prisma.refundRequest.count();
  if (count > 0) {
    console.log(`ℹ️  ${count} demande(s) remboursement déjà présentes`);
    return count;
  }

  const client = await prisma.user.findFirst({ where: { email: 'client@petfood.tn' } });

  for (const row of DEMO_REFUND_ROWS) {
    const { history, createdAt, ...data } = row;
    await prisma.refundRequest.create({
      data: {
        ...data,
        clientId: client?.id || null,
        createdAt: createdAt || new Date(),
        updatedAt: createdAt || new Date(),
        history: { create: history },
      },
    });
  }

  console.log(`✅ ${DEMO_REFUND_ROWS.length} demandes remboursement créées`);
  return DEMO_REFUND_ROWS.length;
};

module.exports = { seedRefunds, ensureRefundPolicy };
