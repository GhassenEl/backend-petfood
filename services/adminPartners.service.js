const { prisma, isDemoMode } = require('../prismaClient');

const demoSupplySuppliers = [
  {
    id: 'sup-1',
    name: 'NutriPet Distribution',
    category: 'alimentation',
    contactName: 'Karim B.',
    email: 'achats@nutripet.tn',
    phone: '+216 71 100 200',
    region: 'Tunis',
    leadTimeDays: 5,
    minOrderDt: 500,
    rating: 4.8,
    contractRef: 'CTR-2026-01',
    isActive: true,
  },
  {
    id: 'sup-2',
    name: 'MediVet Grossiste',
    category: 'pharmacie',
    contactName: 'Dr. Amira',
    email: 'commande@medivet.tn',
    phone: '+216 74 200 300',
    region: 'Sfax',
    leadTimeDays: 3,
    minOrderDt: 200,
    rating: 4.6,
    contractRef: 'CTR-2026-02',
    isActive: true,
  },
  {
    id: 'sup-3',
    name: 'Accessoires Plus',
    category: 'accessoires',
    contactName: 'Sami T.',
    email: 'sami@accessoiresplus.tn',
    phone: '+216 73 400 500',
    region: 'Sousse',
    leadTimeDays: 7,
    minOrderDt: 150,
    rating: 4.2,
    isActive: true,
  },
];

const formatVendor = (v) => ({
  id: v.id,
  shopName: v.shopName,
  slug: v.slug,
  region: v.region,
  status: v.isActive ? (v.applicationStatus === 'pending' ? 'pending' : 'active') : 'suspended',
  commissionRate: v.commissionRate,
  productsCount: v._count?.products ?? v.productCount ?? 0,
  totalSales: v.totalSales ?? 0,
  ownerName: v.owner?.name,
  ownerEmail: v.owner?.email,
  userId: v.ownerUserId,
  commercialVerified: v.commercialVerified,
  createdAt: v.createdAt,
});

const getPartnersOverview = async () => {
  if (isDemoMode()) {
    return {
      mode: 'demo',
      counts: {
        supplySuppliers: demoSupplySuppliers.length,
        marketplaceVendors: 4,
        shelters: 2,
        relayPoints: 5,
        vetPartners: 8,
        petCareProviders: 3,
        pendingApplications: 1,
      },
      supplySuppliers: demoSupplySuppliers,
      marketplaceVendors: [],
      shelters: [
        { id: 'sh1', name: 'Refuge Les Amis à Quatre Pattes', region: 'Tunis', animalsCount: 12, isActive: true },
        { id: 'sh2', name: 'Association Bien-être Animal Sfax', region: 'Sfax', animalsCount: 8, isActive: true },
      ],
      relayPoints: [
        { id: 'relay_anim_1', name: 'Animalerie Les Pattes Heureuses', type: 'pet_shop', region: 'Tunis', isActive: true },
        { id: 'relay_vet_1', name: 'Clinique Vétérinaire Carthage', type: 'vet_clinic', region: 'Tunis', isActive: true },
      ],
      vetPartners: [
        { id: 'vet-1', name: 'Dr. Youssef M.', region: 'Tunis', clinic: 'Clinique Vet\'Ariana', isActive: true },
        { id: 'vet-2', name: 'Dr. Salma K.', region: 'Sousse', clinic: 'Cabinet Vet Sousse', isActive: true },
      ],
      petCareProviders: [
        { id: 'pc-1', displayName: 'Toilettage Royal', types: 'grooming', region: 'Tunis', certified: true, isActive: true },
      ],
    };
  }

  const [
    supplyCount,
    vendors,
    shelters,
    relays,
    vets,
    petCare,
    supplyRows,
  ] = await Promise.all([
    prisma.supplySupplier.count({ where: { isActive: true } }),
    prisma.vendor.findMany({
      include: { owner: { select: { name: true, email: true } }, _count: { select: { products: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.shelter.findMany({ include: { _count: { select: { animals: true } } } }),
    prisma.partnerRelayPoint.findMany({ orderBy: { name: 'asc' } }),
    prisma.user.findMany({
      where: { role: 'vet', isActive: true },
      select: { id: true, name: true, region: true, address: true, phone: true, email: true },
      take: 50,
    }),
    prisma.petCareProvider.findMany({ where: { isActive: true }, take: 50 }),
    prisma.supplySupplier.findMany({ orderBy: { name: 'asc' } }),
  ]);

  const pendingApplications = vendors.filter((v) => v.applicationStatus === 'pending').length;

  return {
    mode: 'live',
    counts: {
      supplySuppliers: supplyCount,
      marketplaceVendors: vendors.filter((v) => v.isActive).length,
      shelters: shelters.filter((s) => s.isActive).length,
      relayPoints: relays.filter((r) => r.isActive).length,
      vetPartners: vets.length,
      petCareProviders: petCare.length,
      pendingApplications,
    },
    supplySuppliers: supplyRows,
    marketplaceVendors: vendors.map(formatVendor),
    shelters: shelters.map((s) => ({
      id: s.id,
      name: s.name,
      region: s.region,
      phone: s.phone,
      email: s.email,
      animalsCount: s._count.animals,
      isActive: s.isActive,
    })),
    relayPoints: relays.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      region: r.region,
      city: r.city,
      partnerCode: r.partnerCode,
      isActive: r.isActive,
    })),
    vetPartners: vets.map((v) => ({
      id: v.id,
      name: v.name,
      region: v.region,
      clinic: v.address,
      phone: v.phone,
      email: v.email,
      isActive: true,
    })),
    petCareProviders: petCare.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      types: p.types,
      region: p.region,
      certified: p.certified,
      hourlyRate: p.hourlyRate,
      isActive: p.isActive,
    })),
  };
};

const listSupplySuppliers = async () => {
  if (isDemoMode()) return { suppliers: demoSupplySuppliers };
  const suppliers = await prisma.supplySupplier.findMany({ orderBy: { name: 'asc' } });
  return { suppliers };
};

const createSupplySupplier = async (body) => {
  const { name, category, contactName, email, phone, region, address, leadTimeDays, minOrderDt, contractRef, notes } = body;
  if (!name?.trim()) {
    const err = new Error('Nom du fournisseur requis');
    err.status = 400;
    throw err;
  }
  if (isDemoMode()) {
    const row = {
      id: `sup_${Date.now()}`,
      name: name.trim(),
      category: category || 'alimentation',
      contactName,
      email,
      phone,
      region,
      address,
      leadTimeDays: Number(leadTimeDays) || 7,
      minOrderDt: minOrderDt != null ? Number(minOrderDt) : null,
      contractRef,
      notes,
      rating: 4.5,
      isActive: true,
    };
    demoSupplySuppliers.push(row);
    return row;
  }
  return prisma.supplySupplier.create({
    data: {
      name: name.trim(),
      category: category || 'alimentation',
      contactName: contactName || null,
      email: email || null,
      phone: phone || null,
      region: region || null,
      address: address || null,
      leadTimeDays: Number(leadTimeDays) || 7,
      minOrderDt: minOrderDt != null ? Number(minOrderDt) : null,
      contractRef: contractRef || null,
      notes: notes || null,
    },
  });
};

const updateSupplySupplier = async (id, body) => {
  if (isDemoMode()) {
    const idx = demoSupplySuppliers.findIndex((s) => s.id === id);
    if (idx < 0) {
      const err = new Error('Fournisseur introuvable');
      err.status = 404;
      throw err;
    }
    demoSupplySuppliers[idx] = { ...demoSupplySuppliers[idx], ...body };
    return demoSupplySuppliers[idx];
  }
  return prisma.supplySupplier.update({ where: { id }, data: body });
};

const upsertShelter = async (body) => {
  const { id, name, region, address, phone, email, description, isActive } = body;
  if (!name?.trim()) {
    const err = new Error('Nom du refuge requis');
    err.status = 400;
    throw err;
  }
  if (isDemoMode()) {
    return { id: id || `sh_${Date.now()}`, name, region, isActive: isActive !== false };
  }
  if (id) {
    return prisma.shelter.update({
      where: { id },
      data: { name, region, address, phone, email, description, isActive: isActive !== false },
    });
  }
  return prisma.shelter.create({
    data: { name: name.trim(), region, address, phone, email, description, isActive: true },
  });
};

const upsertRelayPoint = async (body) => {
  const { id, name, type, address, region, city, phone, hours, partnerCode, isActive } = body;
  if (!name?.trim() || !address?.trim()) {
    const err = new Error('Nom et adresse requis');
    err.status = 400;
    throw err;
  }
  if (isDemoMode()) {
    return { id: id || `relay_${Date.now()}`, name, type: type || 'pet_shop', region, isActive: isActive !== false };
  }
  const data = {
    name: name.trim(),
    type: type || 'pet_shop',
    address: address.trim(),
    region: region || null,
    city: city || null,
    phone: phone || null,
    hours: hours || null,
    partnerCode: partnerCode || null,
    isActive: isActive !== false,
  };
  if (id) return prisma.partnerRelayPoint.update({ where: { id }, data });
  return prisma.partnerRelayPoint.create({ data });
};

const listAdminMarketplaceVendors = async () => {
  if (isDemoMode()) {
    return {
      vendors: [
        { id: 'v-1', shopName: 'Animalerie Tunis Centre', region: 'Tunis', status: 'active', productsCount: 34, revenue30d: 18420, commissionRate: 0.12 },
      ],
      stats: { totalVendors: 24, activeVendors: 21, pendingVendors: 2 },
    };
  }
  const vendors = await prisma.vendor.findMany({
    include: { owner: { select: { name: true, email: true } }, _count: { select: { products: true } } },
    orderBy: { totalSales: 'desc' },
  });
  return {
    vendors: vendors.map((v) => ({
      ...formatVendor(v),
      revenue30d: v.totalSales,
    })),
    stats: {
      totalVendors: vendors.length,
      activeVendors: vendors.filter((v) => v.isActive && v.applicationStatus !== 'pending').length,
      pendingVendors: vendors.filter((v) => v.applicationStatus === 'pending').length,
    },
  };
};

const updateMarketplaceVendor = async (id, body) => {
  const { status, commissionRate, commercialVerified } = body;
  const data = {};
  if (status === 'active') {
    data.isActive = true;
    data.applicationStatus = 'approved';
  } else if (status === 'suspended') {
    data.isActive = false;
  } else if (status === 'pending') {
    data.applicationStatus = 'pending';
    data.isActive = false;
  }
  if (commissionRate != null) data.commissionRate = Number(commissionRate);
  if (commercialVerified != null) data.commercialVerified = !!commercialVerified;

  if (isDemoMode()) return { id, ...data };
  return prisma.vendor.update({ where: { id }, data });
};

module.exports = {
  getPartnersOverview,
  listSupplySuppliers,
  createSupplySupplier,
  updateSupplySupplier,
  upsertShelter,
  upsertRelayPoint,
  listAdminMarketplaceVendors,
  updateMarketplaceVendor,
};
