const { prisma } = require('../prismaClient');

const HEALTH_SUBTYPES = [
  { id: 'antiparasitaire', label: 'Antiparasitaires', tags: ['antiparasitaire', 'puces', 'tiques'] },
  { id: 'vermifuge', label: 'Vermifuges', tags: ['vermifuge', 'parasites', 'intestins'] },
  { id: 'vitamine', label: 'Vitamines', tags: ['vitamine', 'complement', 'sante'] },
  { id: 'dents', label: 'Produits pour les dents', tags: ['dents', 'dentaire', 'hygiene buccale'] },
  { id: 'desinfectant', label: 'Désinfectants', tags: ['desinfectant', 'antiseptique', 'hygiene'] },
  { id: 'lingettes', label: 'Lingettes nettoyantes', tags: ['lingettes', 'nettoyage', 'hygiene'] },
  { id: 'oreilles_yeux', label: 'Nettoyants oreilles & yeux', tags: ['oreilles', 'yeux', 'nettoyant'] },
];

const ALLOWED_SUBTYPE_IDS = new Set(HEALTH_SUBTYPES.map((s) => s.id));

const listHealthSubtypes = () => HEALTH_SUBTYPES;

const listPartnerVendors = async () => {
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true, applicationStatus: 'approved' },
    orderBy: { shopName: 'asc' },
    include: {
      owner: { select: { id: true, name: true, email: true } },
    },
  });
  return vendors.map((v) => ({
    id: v.id,
    shopName: v.shopName,
    region: v.region,
    ownerName: v.owner?.name,
    ownerEmail: v.owner?.email,
  }));
};

const serializeOffer = (offer) => ({
  id: offer.id,
  vendorId: offer.vendorId,
  productId: offer.productId,
  price: offer.price,
  stock: offer.stock,
  isActive: offer.isActive,
  moderationStatus: offer.moderationStatus,
  proposedByVetId: offer.proposedByVetId,
  healthSubtype: offer.healthSubtype,
  collaborationNote: offer.collaborationNote,
  submittedAt: offer.submittedAt,
  createdAt: offer.createdAt,
  vendor: offer.vendor
    ? { id: offer.vendor.id, shopName: offer.vendor.shopName, region: offer.vendor.region }
    : null,
  product: offer.product
    ? {
        id: offer.product.id,
        name: offer.product.name,
        price: offer.product.price,
        discount: offer.product.discount,
        description: offer.product.description,
        stock: offer.product.stock,
        category: offer.product.category,
        animalType: offer.product.animalType,
        imageUrl: offer.product.imageUrl,
        tags: typeof offer.product.tags === 'string'
          ? (() => { try { return JSON.parse(offer.product.tags); } catch { return []; } })()
          : (offer.product.tags || []),
      }
    : null,
});

const listVetHealthCollaborations = async (vetUserId) => {
  const offers = await prisma.vendorProduct.findMany({
    where: {
      OR: [
        { proposedByVetId: vetUserId },
        { healthSubtype: { not: null } },
      ],
    },
    include: {
      vendor: true,
      product: true,
    },
    orderBy: { submittedAt: 'desc' },
  });
  return offers.map(serializeOffer);
};

const publishHealthProductWithVendor = async (vetUser, payload = {}) => {
  const subtype = String(payload.healthSubtype || '').trim();
  if (!ALLOWED_SUBTYPE_IDS.has(subtype)) {
    const err = new Error('Type de produit de santé invalide');
    err.status = 400;
    throw err;
  }
  if (!payload.name?.trim()) {
    const err = new Error('Nom du produit requis');
    err.status = 400;
    throw err;
  }
  if (!payload.vendorId) {
    const err = new Error('Vendeur partenaire requis');
    err.status = 400;
    throw err;
  }

  const vendor = await prisma.vendor.findFirst({
    where: { id: payload.vendorId, isActive: true },
  });
  if (!vendor) {
    const err = new Error('Vendeur introuvable ou inactif');
    err.status = 404;
    throw err;
  }

  const subtypeMeta = HEALTH_SUBTYPES.find((s) => s.id === subtype);
  const price = Number(payload.price || 0);
  const stock = Number(payload.stock || 0);
  const animalType = payload.animalType || 'other';
  const tags = Array.from(
    new Set([
      'sante',
      'vet-collab',
      subtype,
      ...(subtypeMeta?.tags || []),
      ...(Array.isArray(payload.tags) ? payload.tags : []),
    ]),
  );

  const product = await prisma.product.create({
    data: {
      name: payload.name.trim(),
      price,
      discount: Number(payload.discount || 0),
      description: payload.description || `${subtypeMeta?.label || 'Produit de santé'} — publication vétérinaire en collaboration vendeur.`,
      stock,
      category: 'sante',
      animalType,
      imageUrl: payload.imageUrl || '',
      tags: JSON.stringify(tags),
      popularity: Number(payload.popularity || 70),
      rating_avg: 0,
      rating_count: 0,
      productKind: 'physical',
    },
  });

  const offer = await prisma.vendorProduct.create({
    data: {
      vendorId: vendor.id,
      productId: product.id,
      price,
      stock,
      isActive: true,
      moderationStatus: 'pending_vendor',
      proposedByVetId: vetUser.id || vetUser._id,
      healthSubtype: subtype,
      collaborationNote: payload.collaborationNote
        || `Proposé par Dr. ${vetUser.name || 'vétérinaire'} — validation vendeur requise.`,
    },
    include: { vendor: true, product: true },
  });

  return serializeOffer(offer);
};

const listVendorHealthProposals = async (vendorOwnerUserId) => {
  const vendor = await prisma.vendor.findFirst({
    where: { ownerUserId: vendorOwnerUserId },
  });
  if (!vendor) return [];

  const offers = await prisma.vendorProduct.findMany({
    where: {
      vendorId: vendor.id,
      proposedByVetId: { not: null },
    },
    include: { vendor: true, product: true },
    orderBy: { submittedAt: 'desc' },
  });
  return offers.map(serializeOffer);
};

const respondVendorHealthProposal = async (vendorOwnerUserId, offerId, action) => {
  const vendor = await prisma.vendor.findFirst({
    where: { ownerUserId: vendorOwnerUserId },
  });
  if (!vendor) {
    const err = new Error('Boutique vendeur introuvable');
    err.status = 404;
    throw err;
  }

  const offer = await prisma.vendorProduct.findFirst({
    where: { id: offerId, vendorId: vendor.id, proposedByVetId: { not: null } },
  });
  if (!offer) {
    const err = new Error('Proposition introuvable');
    err.status = 404;
    throw err;
  }

  const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null;
  if (!status) {
    const err = new Error('Action invalide (approve|reject)');
    err.status = 400;
    throw err;
  }

  const updated = await prisma.vendorProduct.update({
    where: { id: offer.id },
    data: {
      moderationStatus: status,
      isActive: status === 'approved',
    },
    include: { vendor: true, product: true },
  });
  return serializeOffer(updated);
};

module.exports = {
  HEALTH_SUBTYPES,
  listHealthSubtypes,
  listPartnerVendors,
  listVetHealthCollaborations,
  publishHealthProductWithVendor,
  listVendorHealthProposals,
  respondVendorHealthProposal,
};
