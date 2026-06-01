const path = require('path');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

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

const isDemoMode = () => process.env.DEMO_MODE === 'true';

const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log('✅ SQL database connected successfully');
  } catch (error) {
    console.error('❌ SQL database connection failed:', error.message);
    throw error;
  }
};

module.exports = { prisma, connectDB, isDemoMode };
