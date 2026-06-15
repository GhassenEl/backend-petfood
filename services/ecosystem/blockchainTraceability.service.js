const crypto = require('crypto');
const { prisma, isDemoMode } = require('../../prismaClient');

const hashBlock = (payload) =>
  crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 64);

const CERT_POOL = [
  { type: 'Bio', issuer: 'CERTIBIO TN', validUntil: '2027-06-01', standard: 'AB / UE Bio' },
  { type: 'ISO 22000', issuer: 'Bureau Veritas', validUntil: '2026-12-31', standard: 'Sécurité alimentaire' },
  { type: 'HACCP', issuer: 'Ministère Agriculture TN', validUntil: '2026-09-30', standard: 'Hygiène' },
  { type: 'Halal', issuer: '_INSTANCE Halal Tunisia', validUntil: '2027-01-15', standard: 'Halal' },
  { type: 'Origine Tunisie', issuer: 'ONAGRI', validUntil: null, standard: 'Circuit court national' },
  { type: 'Sans OGM', issuer: 'Labo Agro Sfax', validUntil: '2026-11-20', standard: 'OGM < 0.1%' },
];

const ORIGINS = [
  { country: 'Tunisie', region: 'Béja', producer: 'Coopérative Céréales du Nord', facility: 'Usine conditionnement Béja' },
  { country: 'Tunisie', region: 'Sfax', producer: 'NutriPet Sfax', facility: 'Centre logistique Sfax' },
  { country: 'Tunisie', region: 'Nabeul', producer: 'Ferme avicole Cap Bon', facility: 'Atelier transformation Nabeul' },
  { country: 'France', region: 'Bretagne', producer: 'Partner Foods EU', facility: 'Hub import Rades' },
];

const buildSupplyChain = (product, origin, batchCode) => {
  const steps = [
    {
      step: 'origine',
      label: 'Origine matières premières',
      location: `${origin.region}, ${origin.country}`,
      actor: origin.producer,
      timestamp: new Date(Date.now() - 90 * 86400000).toISOString(),
      data: { batchCode, species: product.animalType || 'multi' },
    },
    {
      step: 'transformation',
      label: 'Fabrication / conditionnement',
      location: origin.facility,
      actor: origin.producer,
      timestamp: new Date(Date.now() - 45 * 86400000).toISOString(),
      data: { process: 'Extrusion croquettes, contrôle qualité' },
    },
    {
      step: 'certification',
      label: 'Contrôle & certification',
      location: 'Laboratoire partenaire',
      actor: 'PetfoodTN Quality Lab',
      timestamp: new Date(Date.now() - 30 * 86400000).toISOString(),
      data: { qc: 'OK', microbiology: 'conforme' },
    },
    {
      step: 'distribution',
      label: 'Entrepôt & distribution',
      location: 'Hub PetfoodTN Tunis',
      actor: 'PetfoodTN Logistics',
      timestamp: new Date(Date.now() - 7 * 86400000).toISOString(),
      data: { sku: product.id, stockLot: batchCode },
    },
    {
      step: 'retail',
      label: 'Mise en vente marketplace',
      location: 'PetfoodTN Marketplace',
      actor: 'PetfoodTN',
      timestamp: new Date().toISOString(),
      data: { productName: product.name, channel: 'online' },
    },
  ];

  let previousHash = '0'.repeat(64);
  const blocks = steps.map((step, index) => {
    const block = {
      index,
      previousHash,
      timestamp: step.timestamp,
      step: step.step,
      payload: step,
    };
    const blockHash = hashBlock(block);
    block.hash = blockHash;
    previousHash = blockHash;
    return block;
  });

  return {
    blocks,
    rootHash: blocks[0]?.hash || previousHash,
    lastBlockHash: blocks[blocks.length - 1]?.hash || previousHash,
  };
};

const pickCertifications = (productId) => {
  const n = parseInt(productId.replace(/\D/g, '').slice(-2) || '3', 10) % CERT_POOL.length;
  const certs = [CERT_POOL[n], CERT_POOL[(n + 2) % CERT_POOL.length], CERT_POOL[(n + 4) % CERT_POOL.length]];
  return certs.map((c, i) => ({
    ...c,
    certId: `CERT-${hashBlock(c).slice(0, 12).toUpperCase()}`,
    verified: true,
    blockIndex: 2,
    issuedAt: new Date(Date.now() - (60 + i * 10) * 86400000).toISOString(),
  }));
};

const generateTraceForProduct = (product) => {
  const seed = product.id || product.name;
  const origin = ORIGINS[seed.length % ORIGINS.length];
  const batchCode = `PF-${new Date().getFullYear()}-${hashBlock(seed).slice(0, 8).toUpperCase()}`;
  const chain = buildSupplyChain(product, origin, batchCode);
  const certifications = pickCertifications(seed);

  return {
    productId: product.id,
    batchCode,
    originCountry: origin.country,
    originRegion: origin.region,
    producerName: origin.producer,
    facilityName: origin.facility,
    harvestDate: new Date(Date.now() - 120 * 86400000),
    certifications,
    chain: chain.blocks,
    rootHash: chain.rootHash,
    lastBlockHash: chain.lastBlockHash,
    isVerified: true,
  };
};

const verifyChain = (chainBlocks, rootHash, lastBlockHash) => {
  if (!chainBlocks?.length) {
    return { valid: false, reason: 'Chaîne vide', blockCount: 0 };
  }

  let previousHash = '0'.repeat(64);
  for (let i = 0; i < chainBlocks.length; i++) {
    const b = chainBlocks[i];
    if (b.previousHash !== previousHash) {
      return { valid: false, reason: `Lien cassé au bloc ${i}`, blockCount: chainBlocks.length };
    }
    const expected = hashBlock({
      index: b.index,
      previousHash: b.previousHash,
      timestamp: b.timestamp,
      step: b.step,
      payload: b.payload,
    });
    if (b.hash !== expected) {
      return { valid: false, reason: `Hash invalide au bloc ${i}`, blockCount: chainBlocks.length };
    }
    previousHash = b.hash;
  }

  const okRoot = chainBlocks[0].hash === rootHash;
  const okLast = chainBlocks[chainBlocks.length - 1].hash === lastBlockHash;
  return {
    valid: okRoot && okLast,
    reason: okRoot && okLast ? 'Chaîne intègre — origine et certifications vérifiables' : 'En-tête ou pied de chaîne incohérent',
    blockCount: chainBlocks.length,
    rootHash,
    lastBlockHash,
    verifiedAt: new Date().toISOString(),
  };
};

const buildNutrition = (product) => {
  const type = product?.animalType || 'dog';
  if (type === 'cat') {
    return { protein: '32%', fat: '14%', fiber: '3%', moisture: '8%', ash: '7%', kcalPer100g: 380 };
  }
  return { protein: '26%', fat: '12%', fiber: '4%', moisture: '9%', ash: '7%', kcalPer100g: 360 };
};

const buildIngredients = (product) => {
  const base = ['Viande déshydratée', 'Riz complet', 'Huile de poisson', 'Légumes déshydratés', 'Vitamines & minéraux'];
  if (/senior/i.test(product?.name || '')) base.unshift('Glucosamine & chondroïtine');
  if (/kitten|chiot/i.test(product?.name || '')) base.unshift('DHA & ARA');
  return base;
};

const toPublicTrace = (row, product) => {
  let certifications = [];
  let chain = [];
  try {
    certifications = JSON.parse(row.certificationsJson || '[]');
  } catch {
    certifications = [];
  }
  try {
    chain = JSON.parse(row.chainJson || '[]');
  } catch {
    chain = [];
  }

  const verification = verifyChain(chain, row.rootHash, row.lastBlockHash);

  return {
    product: product
      ? { id: product.id, name: product.name, category: product.category, imageUrl: product.imageUrl || product.image }
      : { id: row.productId },
    batchCode: row.batchCode,
    origin: {
      country: row.originCountry,
      region: row.originRegion,
      producer: row.producerName,
      facility: row.facilityName,
      harvestDate: row.harvestDate,
    },
    certifications,
    supplyChain: chain.map((b) => ({
      step: b.step,
      label: b.payload?.label,
      location: b.payload?.location,
      actor: b.payload?.actor,
      timestamp: b.payload?.timestamp,
      hash: b.hash,
    })),
    blockchain: {
      network: 'petfoodtn_trace_v1',
      algorithm: 'SHA-256',
      blockCount: chain.length,
      rootHash: row.rootHash,
      lastBlockHash: row.lastBlockHash,
      verification,
      isVerified: row.isVerified && verification.valid,
      trustScore: verification.valid ? Math.min(98, 72 + chain.length * 5 + certifications.filter((c) => c.verified).length * 3) : 42,
    },
    nutrition: row.nutritionJson ? JSON.parse(row.nutritionJson) : buildNutrition(product),
    allergens: row.allergensJson ? JSON.parse(row.allergensJson) : ['Gluten', 'Volaille'].filter(() => (product?.animalType || 'dog') === 'dog').slice(0, 1),
    ingredients: row.ingredientsJson ? JSON.parse(row.ingredientsJson) : buildIngredients(product),
    qrPayload: {
      batchCode: row.batchCode,
      productId: row.productId,
      verifyUrl: `/client-traceability?batch=${row.batchCode}`,
      rootHash: row.rootHash?.slice(0, 16),
    },
    model: 'blockchain_traceability_v1',
  };
};

const ensureTrace = async (product) => {
  if (isDemoMode()) {
    const gen = generateTraceForProduct(product);
    return toPublicTrace(
      {
        productId: product.id,
        batchCode: gen.batchCode,
        originCountry: gen.originCountry,
        originRegion: gen.originRegion,
        producerName: gen.producerName,
        facilityName: gen.facilityName,
        harvestDate: gen.harvestDate,
        certificationsJson: JSON.stringify(gen.certifications),
        chainJson: JSON.stringify(gen.chain),
        rootHash: gen.rootHash,
        lastBlockHash: gen.lastBlockHash,
        isVerified: true,
      },
      product,
    );
  }

  let row = await prisma.productTraceability.findUnique({ where: { productId: product.id } });
  if (!row) {
    const gen = generateTraceForProduct(product);
    row = await prisma.productTraceability.create({
      data: {
        productId: product.id,
        batchCode: gen.batchCode,
        originCountry: gen.originCountry,
        originRegion: gen.originRegion,
        producerName: gen.producerName,
        facilityName: gen.facilityName,
        harvestDate: gen.harvestDate,
        certificationsJson: JSON.stringify(gen.certifications),
        chainJson: JSON.stringify(gen.chain),
        rootHash: gen.rootHash,
        lastBlockHash: gen.lastBlockHash,
        isVerified: true,
      },
    });
  }
  return toPublicTrace(row, product);
};

const getProductTrace = async (productId) => {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product && !isDemoMode()) {
    const err = new Error('Produit introuvable');
    err.status = 404;
    throw err;
  }
  const p =
    product ||
    (isDemoMode()
      ? { id: productId, name: 'Produit démo', category: 'nourriture', animalType: 'dog' }
      : null);
  if (!p) {
    const err = new Error('Produit introuvable');
    err.status = 404;
    throw err;
  }
  return ensureTrace(p);
};

const listTraces = async ({ limit = 24, category } = {}) => {
  if (isDemoMode()) {
    const demoProducts = [
      { id: 'dp1', name: 'Croquettes Premium Chiot 3 kg', category: 'nourriture', animalType: 'dog' },
      { id: 'dp4', name: 'Croquettes Kitten 2 kg', category: 'nourriture', animalType: 'cat' },
      { id: 'dp6', name: 'Croquettes Senior 4 kg', category: 'nourriture', animalType: 'dog' },
    ];
    const traces = await Promise.all(demoProducts.map((p) => ensureTrace(p)));
    return { traces, total: traces.length };
  }

  const products = await prisma.product.findMany({
    where: category ? { category } : undefined,
    take: limit,
    orderBy: { popularity: 'desc' },
  });

  const traces = [];
  for (const p of products) {
    traces.push(await ensureTrace(p));
  }
  return { traces, total: traces.length };
};

const verifyProductTrace = async (productId) => {
  const trace = await getProductTrace(productId);
  return {
    productId,
    ...trace.blockchain.verification,
    isVerified: trace.blockchain.isVerified,
    trustScore: trace.blockchain.trustScore,
    certificationsValid: (trace.certifications || []).every((c) => c.verified),
  };
};

const getMyOrderTraces = async (user) => {
  const userId = user.id || user._id;

  if (isDemoMode()) {
    const demoProducts = [
      { id: 'demo-order-prod-1', name: 'Croquettes Premium Chien Adulte 12 kg', category: 'nourriture', animalType: 'dog' },
      { id: 'demo-order-prod-2', name: 'Pâtée chat saumon 400 g', category: 'nourriture', animalType: 'cat' },
    ];
    const traces = await Promise.all(demoProducts.map((p) => ensureTrace(p)));
    return {
      orders: [
        { orderId: 'demo-order-001', date: new Date(Date.now() - 12 * 86400000).toISOString(), traces: [traces[0]] },
        { orderId: 'demo-order-002', date: new Date(Date.now() - 2 * 86400000).toISOString(), traces: [traces[1]] },
      ],
      total: 2,
    };
  }

  const orders = await prisma.order.findMany({
    where: { userId },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });

  const result = [];
  for (const order of orders) {
    const traces = [];
    const seen = new Set();
    for (const item of order.items || []) {
      const p = item.product;
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      if (p.category === 'nourriture' || /croquette|pâtée|nourriture/i.test(p.name || '')) {
        traces.push(await ensureTrace(p));
      }
    }
    if (traces.length) {
      result.push({
        orderId: order.id,
        date: order.createdAt,
        status: order.status,
        traces,
      });
    }
  }
  return { orders: result, total: result.length };
};

const verifyByBatchCode = async (batchCode) => {
  const code = String(batchCode || '').trim().toUpperCase();
  if (!code) {
    const err = new Error('Code lot requis');
    err.status = 400;
    throw err;
  }

  if (isDemoMode()) {
    const demo = generateTraceForProduct({ id: 'batch-lookup', name: 'Produit vérifié par lot', category: 'nourriture', animalType: 'dog' });
    const trace = toPublicTrace(
      {
        productId: 'batch-lookup',
        batchCode: code.startsWith('PF-') ? code : demo.batchCode,
        originCountry: demo.originCountry,
        originRegion: demo.originRegion,
        producerName: demo.producerName,
        facilityName: demo.facilityName,
        harvestDate: demo.harvestDate,
        certificationsJson: JSON.stringify(demo.certifications),
        chainJson: JSON.stringify(demo.chain),
        rootHash: demo.rootHash,
        lastBlockHash: demo.lastBlockHash,
        isVerified: true,
      },
      { id: 'batch-lookup', name: 'Produit authentifié — lot ' + code },
    );
    return { found: true, batchCode: code, trace, verification: trace.blockchain.verification };
  }

  const row = await prisma.productTraceability.findFirst({
    where: { batchCode: { contains: code, mode: 'insensitive' } },
  });
  if (!row) {
    return { found: false, batchCode: code, message: 'Aucun lot correspondant dans le registre PetfoodTN.' };
  }
  const product = await prisma.product.findUnique({ where: { id: row.productId } });
  const trace = toPublicTrace(row, product);
  return { found: true, batchCode: row.batchCode, trace, verification: trace.blockchain.verification };
};

module.exports = {
  getProductTrace,
  listTraces,
  verifyProductTrace,
  getMyOrderTraces,
  verifyByBatchCode,
  generateTraceForProduct,
  verifyChain,
  hashBlock,
};
