const DEFAULT_STOCK_META = {
  minStock: 10,
  maxStock: 100,
  reorderQty: 20,
  location: 'Entrepôt',
  sku: null,
};

const parseTagsField = (tags) => {
  if (!tags) return { labels: [], stockMeta: {} };
  if (typeof tags === 'string') {
    try {
      return parseTagsField(JSON.parse(tags));
    } catch {
      return { labels: [tags], stockMeta: {} };
    }
  }
  if (Array.isArray(tags)) return { labels: tags, stockMeta: {} };
  if (typeof tags === 'object') {
    return {
      labels: Array.isArray(tags.labels) ? tags.labels : [],
      stockMeta: tags.stockMeta && typeof tags.stockMeta === 'object' ? tags.stockMeta : {},
    };
  }
  return { labels: [], stockMeta: {} };
};

const getStockMeta = (product) => {
  const { stockMeta } = parseTagsField(product?.tags);
  const id = product?.id || product?._id || '';
  return {
    ...DEFAULT_STOCK_META,
    sku: stockMeta.sku || `SKU-${String(id).slice(-4).toUpperCase()}`,
    ...stockMeta,
  };
};

const mergeStockMetaIntoTags = (tags, patch) => {
  const parsed = parseTagsField(tags);
  return {
    labels: parsed.labels,
    stockMeta: {
      ...parsed.stockMeta,
      ...patch,
    },
  };
};

const parseStockHistory = (raw) => {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

module.exports = {
  DEFAULT_STOCK_META,
  parseTagsField,
  getStockMeta,
  mergeStockMetaIntoTags,
  parseStockHistory,
};
