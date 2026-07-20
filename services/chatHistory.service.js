/**
 * Historique chatbot — messages texte (NLP) + analyses d'images.
 */
const { prisma, isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const { analyzeTextFull } = require('./nlpTextAnalysis.service');
const imageAnalysis = require('./ecosystem/imageAnalysis.service');

const IMAGE_MARKER = '[petfood:image]';
const MAX_IMAGE_PREVIEW_LEN = 16000;

const parseJsonField = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const trimImagePreview = (value) => {
  if (!value) return null;
  const s = String(value);
  return s.length > MAX_IMAGE_PREVIEW_LEN ? s.slice(0, MAX_IMAGE_PREVIEW_LEN) : s;
};

const compactNlpPayload = (nlp) => {
  if (!nlp) return null;
  return {
    emotion: nlp.emotion,
    emotionLabel: nlp.emotionLabel,
    emotionEmoji: nlp.emotionEmoji,
    sentiment: nlp.sentiment?.label,
    modelId: nlp.sentiment?.modelId,
    modelLabel: nlp.sentiment?.modelLabel,
    confidence: nlp.confidence,
    keywords: {
      positive: (nlp.words?.keywords?.positive || []).slice(0, 4),
      negative: (nlp.words?.keywords?.negative || []).slice(0, 4),
    },
    topTerms: (nlp.words?.topTerms || []).slice(0, 5),
    entities: nlp.words?.entities || {},
    anomaly: nlp.anomaly?.detected
      ? {
          detected: true,
          type: nlp.anomaly.primary?.type,
          label: nlp.anomaly.primary?.label,
          severity: nlp.anomaly.primary?.severity,
          riskScore: nlp.anomaly.riskScore,
        }
      : { detected: false },
    insight: nlp.insight,
  };
};

const parseImageMeta = (content) => {
  const raw = String(content || '');
  if (!raw.startsWith(IMAGE_MARKER)) return null;
  try {
    return JSON.parse(raw.slice(IMAGE_MARKER.length));
  } catch {
    return { hint: raw.replace(IMAGE_MARKER, '').trim() };
  }
};

const isImageMessage = (content) =>
  String(content || '').startsWith(IMAGE_MARKER) || String(content || '').startsWith('📷');

const resolveNlpForRow = (row, messageType) => {
  if (row.role !== 'user' || messageType !== 'text') return null;
  const stored = parseJsonField(row.nlpJson);
  if (stored) return stored;
  return compactNlpPayload(analyzeTextFull(row.content || ''));
};

const mapChatRow = (row) => {
  const content = row.content || '';
  const messageType =
    row.messageType && row.messageType !== 'text'
      ? row.messageType
      : isImageMessage(content)
        ? 'image'
        : 'text';
  const storedMeta = parseJsonField(row.metadata) || {};
  const imageMeta =
    messageType === 'image'
      ? {
          ...parseImageMeta(content),
          ...storedMeta,
          preview: storedMeta.imagePreview || storedMeta.preview || parseImageMeta(content)?.preview || null,
        }
      : null;
  const nlp = resolveNlpForRow(row, messageType);

  return {
    id: row.id,
    role: row.role,
    content,
    messageType,
    imageMeta,
    imagePreview: imageMeta?.preview || imageMeta?.imagePreview || null,
    products: row.products || [],
    quickReplies: row.quickReplies || [],
    nlp,
    createdAt: row.createdAt,
  };
};

const demoSampleTimeline = (userId) => [
  {
    id: 'demo-1',
    role: 'user',
    content: 'Mon chat vomit depuis hier, quelle croquette hypoallergénique ?',
    messageType: 'text',
    nlp: compactNlpPayload(analyzeTextFull('Mon chat vomit depuis hier, quelle croquette hypoallergénique ?')),
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'demo-2',
    role: 'assistant',
    content: 'Je vous recommande une formule sans céréales, transition sur 7 jours. Consultez un vétérinaire si les vomissements persistent.',
    messageType: 'text',
    createdAt: new Date(Date.now() - 86400000 * 2 + 60000).toISOString(),
  },
  {
    id: 'demo-3',
    role: 'user',
    content: `${IMAGE_MARKER}${JSON.stringify({ hint: 'Chat roux adulte, pelage terne', petName: 'Mimi' })}`,
    messageType: 'image',
    imageMeta: { hint: 'Chat roux adulte, pelage terne', petName: 'Mimi' },
    imagePreview: null,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'demo-4',
    role: 'assistant',
    content: 'Analyse image — Race estimée: Chat. Pelage: surveiller. Corpulence normale. Consultez un vétérinaire si doute.',
    messageType: 'image',
    createdAt: new Date(Date.now() - 86400000 + 120000).toISOString(),
  },
];

const loadMessages = async (userId, limit = 120) => {
  try {
    const rows = await prisma.chatMessage.findMany({
      where: { userId: String(userId) },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows;
  } catch {
    return [];
  }
};

const getEnrichedHistory = async (userId, { limit = 120, role } = {}) => {
  const uid = String(userId);
  let rows = await loadMessages(uid, limit);

  if (!rows.length && isDemoMode()) {
    return {
      userId: uid,
      role: role || 'client',
      messages: demoSampleTimeline(uid),
      imageAnalyses: [],
      stats: { total: 4, textCount: 2, imageCount: 2 },
      demo: true,
    };
  }

  const messages = rows.map(mapChatRow);
  let imageAnalyses = [];
  try {
    const user = demoStore.getUserById?.(uid) || { id: uid };
    const pack = await imageAnalysis.history(user);
    imageAnalyses = pack.analyses || [];
  } catch {
    imageAnalyses = [];
  }

  const textCount = messages.filter((m) => m.messageType === 'text' && m.role === 'user').length;
  const imageCount = messages.filter((m) => m.messageType === 'image' && m.role === 'user').length;

  return {
    userId: uid,
    role: role || null,
    messages,
    imageAnalyses,
    stats: {
      total: messages.length,
      textCount,
      imageCount,
      imageAnalysisCount: imageAnalyses.length,
    },
    demo: false,
  };
};

const formatImageAnalysisReply = (results, petName) => {
  const r = results || {};
  const lines = [
    `📷 **Analyse image**${petName ? ` — ${petName}` : ''}`,
    r.breed?.label ? `• Race estimée : ${r.breed.label} (${Math.round((r.breed.confidence || 0) * 100)} %)` : null,
    r.ageEstimate?.label ? `• Âge : ${r.ageEstimate.label}` : null,
    r.overweight?.label ? `• Corpulence : ${r.overweight.label}` : null,
    r.coat?.notes ? `• Pelage : ${r.coat.notes}` : null,
    r.eyes?.notes ? `• Yeux : ${r.eyes.notes}` : null,
    r.skin?.notes ? `• Peau : ${r.skin.notes}` : null,
    r.disclaimer ? `\n_${r.disclaimer}_` : null,
  ].filter(Boolean);
  return lines.join('\n');
};

const saveChatPair = async (userId, userContent, assistantContent, assistantExtras = {}) => {
  if (isDemoMode()) return;
  const userMessageType =
    assistantExtras.userMessageType ||
    (isImageMessage(userContent) ? 'image' : 'text');
  const assistantMessageType =
    assistantExtras.assistantMessageType ||
    (isImageMessage(assistantContent) ? 'image' : 'text');
  try {
    await prisma.chatMessage.create({
      data: {
        userId: String(userId),
        role: 'user',
        content: userContent,
        messageType: userMessageType,
        nlpJson: assistantExtras.userNlp ? JSON.stringify(assistantExtras.userNlp) : null,
        metadata: assistantExtras.userMetadata ? JSON.stringify(assistantExtras.userMetadata) : null,
      },
    });
    await prisma.chatMessage.create({
      data: {
        userId: String(userId),
        role: 'assistant',
        content: assistantContent,
        messageType: assistantMessageType,
        products: assistantExtras.products || null,
        quickReplies: assistantExtras.quickReplies || null,
        metadata: assistantExtras.assistantMetadata
          ? JSON.stringify(assistantExtras.assistantMetadata)
          : null,
      },
    });
  } catch (err) {
    console.warn('[ChatHistory] save:', err.message);
  }
};

const analyzeAndSaveImage = async (user, { petName, imageHint, imageBase64, imagePreview }) => {
  const userId = String(user.id || user._id);
  const hint = String(imageHint || '').trim() || 'Photo animal uploadée';
  const analysis = await imageAnalysis.analyzeImage(user, {
    petName,
    imageHint: hint,
    imageBase64,
  });

  const preview = trimImagePreview(imagePreview || imageBase64);
  const userContent = `${IMAGE_MARKER}${JSON.stringify({
    hint,
    petName: petName || null,
  })}`;

  const assistantContent = formatImageAnalysisReply(analysis.results, petName);
  await saveChatPair(userId, userContent, assistantContent, {
    quickReplies: ['Contacter vétérinaire', 'Recommandations produits'],
    userMessageType: 'image',
    assistantMessageType: 'image',
    userMetadata: {
      hint,
      petName: petName || null,
      imagePreview: preview,
      analysisId: analysis.id || null,
    },
    assistantMetadata: {
      analysisId: analysis.id || null,
    },
  });

  return {
    ...analysis,
    message: assistantContent,
    nlp: null,
    messageType: 'image',
    imagePreview: preview,
  };
};

const getAdminOverview = async (targetUserId, limit = 50) => {
  if (!targetUserId) {
    let users = [];
    try {
      users = await prisma.user.findMany({
        where: { role: { in: ['client', 'vet', 'admin', 'livreur'] } },
        select: { id: true, name: true, email: true, role: true },
        take: 30,
        orderBy: { createdAt: 'desc' },
      });
    } catch {
      users = (demoStore.getUsers?.() || []).slice(0, 20);
    }
    return { users, pack: null };
  }
  const pack = await getEnrichedHistory(targetUserId, { limit });
  return { users: [], pack };
};

module.exports = {
  getEnrichedHistory,
  analyzeAndSaveImage,
  getAdminOverview,
  compactNlpPayload,
  resolveNlpForRow,
  trimImagePreview,
  IMAGE_MARKER,
};
