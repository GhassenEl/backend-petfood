const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

/** Corrige DATABASE_URL SQLite (évite l’erreur Prisma « must start with file: »). */
const normalizeDatabaseUrl = () => {
  const raw = String(process.env.DATABASE_URL || '').trim();
  if (!raw) {
    process.env.DATABASE_URL = 'file:./dev.db';
    return;
  }
  if (raw.startsWith('file:')) return;
  if (raw.startsWith('sqlite:')) {
    process.env.DATABASE_URL = raw.replace(/^sqlite:/, 'file:');
    return;
  }
  if (!raw.includes('://') && (raw.endsWith('.db') || raw.includes('dev.db'))) {
    const rel = raw.replace(/\\/g, '/').replace(/^\.\//, '');
    process.env.DATABASE_URL = `file:./${rel}`;
  }
};
normalizeDatabaseUrl();

const { PrismaClient } = require('@prisma/client');

const jsonFieldsByModel = {
  User: ['location', 'preferences', 'favoriteCategories'],
  Product: ['tags', 'stockHistory'],
  PetFeeder: ['pendingCommand'],
  Order: ['deliveryLocation'],
  ChatMessage: ['products', 'quickReplies'],
  VeterinaryRecord: ['medications'],
  Prescription: ['medications'],
};

const encodeJsonFields = (model, data) => {
  if (!data || !jsonFieldsByModel[model]) return data;

  const fields = jsonFieldsByModel[model];
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(data, field) && data[field] !== undefined && data[field] !== null) {
      data[field] = typeof data[field] === 'string' ? data[field] : JSON.stringify(data[field]);
    }
  }
  return data;
};

const decodeJsonFields = (model, value) => {
  if (!value || !jsonFieldsByModel[model]) return value;

  if (Array.isArray(value)) {
    return value.map((entry) => decodeJsonFields(model, entry));
  }

  const fields = jsonFieldsByModel[model];
  for (const field of fields) {
    if (typeof value[field] === 'string') {
      try {
        value[field] = JSON.parse(value[field]);
      } catch {
        value[field] = null;
      }
    }
  }
  return value;
};

const normalizeApiShape = (value) => {
  if (!value) return value;

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeApiShape(entry));
  }

  if (typeof value !== 'object' || value instanceof Date) {
    return value;
  }

  if (value.id !== undefined && value._id === undefined) {
    value._id = value.id;
  }

  for (const key of Object.keys(value)) {
    value[key] = normalizeApiShape(value[key]);
  }

  if (value.user && value.userId !== undefined) {
    value.userId = value.user;
  }
  if (value.owner && value.ownerId !== undefined) {
    value.ownerId = value.owner;
  }
  if (value.product && value.productId !== undefined) {
    value.productId = value.product;
  }
  if (value.order && value.orderId !== undefined) {
    value.orderId = value.order;
  }

  return value;
};

const encodeArgs = (model, args = {}) => {
  if (args.data) {
    if (Array.isArray(args.data)) {
      args.data = args.data.map((entry) => encodeJsonFields(model, entry));
    } else {
      encodeJsonFields(model, args.data);
    }
  }
  if (args.create) {
    encodeJsonFields(model, args.create);
  }
  if (args.update) {
    encodeJsonFields(model, args.update);
  }
  return args;
};

const prisma = new PrismaClient().$extends({
  query: {
    $allModels: {
      async $allOperations({ model, args, query }) {
        encodeArgs(model, args);
        const result = await query(args);
        return normalizeApiShape(decodeJsonFields(model, result));
      }
    }
  }
});

/** SQL prioritaire : si DATABASE_URL est défini, la plateforme utilise la base (pas le mode démo mémoire). */
const isDemoMode = () => {
  if (process.env.FORCE_DEMO_MODE === 'true') return true;
  if (process.env.DEMO_MODE !== 'true') return false;
  const db = String(process.env.DATABASE_URL || '').trim();
  return !db;
};

const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log('✅ SQL database connected successfully');
  } catch (error) {
    const hint =
      error.message?.includes('file:') || error.message?.includes('datasource')
        ? ' Vérifiez DATABASE_URL=file:./dev.db dans backend/.env'
        : '';
    console.error('❌ SQL database connection failed:', error.message + hint);
    throw error;
  }
};

module.exports = { prisma, connectDB, isDemoMode };
