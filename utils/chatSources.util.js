const { ROUTE_LABELS, DOC_BASE } = require('../data/chatRagCatalog');

const ROUTE_RE = /`?(\/[a-z][\w/-]*)`?/gi;
const API_RE = /(GET|POST|PUT|DELETE|PATCH)\s+(\/api\/[\w/-]+)/gi;

const dedupeSources = (list) => {
  const seen = new Set();
  return (list || []).filter((s) => {
    const key = `${s.type}:${s.ref || s.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
};

const sourceFromRoute = (route) => ({
  type: 'page',
  label: ROUTE_LABELS[route] || route.replace(/^\//, '').replace(/-/g, ' '),
  ref: route,
});

const sourceFromApi = (method, path) => ({
  type: 'api',
  label: `${method} ${path}`,
  ref: path,
});

const sourceFromDoc = (label = 'Documentation architecture') => ({
  type: 'doc',
  label,
  ref: DOC_BASE,
});

const sourcesFromChunks = (chunks = []) =>
  dedupeSources(
    chunks.flatMap((c) => {
      const out = [];
      if (c.route) out.push(sourceFromRoute(c.route));
      if (c.api) {
        const m = String(c.api).match(/^(GET|POST|PUT|DELETE|PATCH)\s+(\S+)/i);
        if (m) out.push(sourceFromApi(m[1].toUpperCase(), m[2]));
      }
      return out;
    }),
  );

const extractSourcesFromContent = (content = '') => {
  const text = String(content);
  const sources = [];

  let match;
  const routeRe = new RegExp(ROUTE_RE.source, 'gi');
  while ((match = routeRe.exec(text)) !== null) {
    const route = match[1];
    if (route.length > 2 && !route.includes('..')) {
      sources.push(sourceFromRoute(route));
    }
  }

  const apiRe = new RegExp(API_RE.source, 'gi');
  while ((match = apiRe.exec(text)) !== null) {
    sources.push(sourceFromApi(match[1].toUpperCase(), match[2]));
  }

  if (/architecture|monolithe|prisma|groq/i.test(text)) {
    sources.push(sourceFromDoc());
  }

  return dedupeSources(sources);
};

const attachSources = (response = {}, meta = {}) => {
  const existing = Array.isArray(response.sources) ? response.sources : [];
  const fromContent = extractSourcesFromContent(response.content);
  const fromMeta = meta.extraSources || [];
  const rag = meta.ragChunks ? sourcesFromChunks(meta.ragChunks) : [];

  let sources = dedupeSources([...existing, ...rag, ...fromContent, ...fromMeta]);

  if (response.ragPowered) {
    sources = dedupeSources([
      { type: 'ai', label: 'Groq + RAG catalogue PetfoodTN', ref: 'groq-rag' },
      ...sources,
    ]);
  }

  return { ...response, sources };
};

module.exports = {
  attachSources,
  extractSourcesFromContent,
  sourcesFromChunks,
  sourceFromRoute,
  sourceFromApi,
  sourceFromDoc,
  dedupeSources,
};
