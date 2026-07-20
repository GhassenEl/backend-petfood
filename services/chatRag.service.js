const { completionWithSystem } = require('./groq.service');
const { getCatalogForRole } = require('../data/chatRagCatalog');
const { sourcesFromChunks } = require('../utils/chatSources.util');

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const scoreChunk = (message, chunk) => {
  const hay = normalize(message);
  if (!hay.trim()) return 0;
  let score = 0;
  const tokens = hay.split(/\s+/).filter((t) => t.length > 2);
  const blob = normalize(`${chunk.label} ${chunk.description} ${chunk.route} ${chunk.api || ''}`);

  tokens.forEach((tok) => {
    if (blob.includes(tok)) score += 2;
  });

  if (chunk.route && hay.includes(chunk.route.replace(/^\//, ''))) score += 5;
  if (chunk.api && hay.includes('api')) score += 1;

  return score;
};

const retrieveChunks = (message, role, limit = 5) => {
  const catalog = getCatalogForRole(role);
  return catalog
    .map((chunk) => ({ ...chunk, _score: scoreChunk(message, chunk) }))
    .filter((c) => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...rest }) => rest);
};

const LANG_INSTRUCTION = {
  fr: 'Réponds en français.',
  en: 'Reply in English.',
  ar: 'أجب بالعربية.',
};

const buildSystemPrompt = (role, language, chunks) => {
  const context = chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.label} — route \`${c.route}\`${c.api ? ` — API ${c.api}` : ''}\n${c.description}`,
    )
    .join('\n\n');

  return `Tu es l'assistant PetfoodTN pour le rôle "${role}".
${LANG_INSTRUCTION[language] || LANG_INSTRUCTION.fr}
Utilise UNIQUEMENT le contexte ci-dessous. Cite les routes pertinentes avec backticks.
Si l'information manque, dis-le honnêtement et propose une page du catalogue.
Ne invente pas d'URLs hors contexte.
Réponse concise (max 8 lignes), professionnelle et orientée action.

CONTEXTE RAG:
${context || '(aucun chunk — orienter vers /marketing ou /register)'}`;
};

const DEFAULT_QUICK = {
  client: ['Mes commandes', 'Boutique produits', 'Guide paiement'],
  admin: ['Commandes', 'Dashboard', 'Produits'],
  livreur: ['Commandes', 'Carte', 'Gains'],
  vet: ['Diagnostics IA', 'Agenda', 'Dossiers médicaux'],
  vendor: ['Mes commandes', 'Assistant ML', 'Mes produits'],
  moderator: ['Vendeurs en attente', 'Anti-fraude', 'Modération avis'],
  visitor: ['Catalogue produits', 'Inscription', 'Devenir vendeur'],
};

/**
 * Groq + RAG pour questions ouvertes non couvertes par les règles.
 */
async function tryOpenAnswer({ message, role = 'client', language = 'fr' }) {
  if (!message || !String(message).trim()) return null;
  if (!process.env.GROQ_API_KEY) return null;

  const chunks = retrieveChunks(message, role, 5);
  if (!chunks.length && String(message).trim().length < 12) return null;

  const catalog = chunks.length ? chunks : getCatalogForRole(role).slice(0, 4);
  const systemPrompt = buildSystemPrompt(role, language, catalog);
  const content = await completionWithSystem(systemPrompt, String(message).trim(), {
    temperature: 0.35,
    max_tokens: 700,
  });

  if (!content || content.length < 20) return null;

  return {
    content,
    quickReplies: DEFAULT_QUICK[role] || DEFAULT_QUICK.visitor,
    sources: sourcesFromChunks(catalog),
    ragPowered: true,
    ragChunks: catalog,
  };
}

module.exports = {
  retrieveChunks,
  tryOpenAnswer,
};
