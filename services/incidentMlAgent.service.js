const { prisma, isDemoMode } = require('../prismaClient');
const { completionWithSystem } = require('./groq.service');
const { analyzeOwnerEmotionText } = require('./ownerEmotionAnalysis.service');
const { predictIncidentPriority, mergeMlIncident } = require('../ml/incidentPriorityModel');

const INCIDENT_SYSTEM = `Tu es l'agent de résolution d'incidents PetfoodTN (Tunisie).
Analyse la réclamation client et propose une résolution professionnelle en français.
Réponds UNIQUEMENT en JSON valide :
{
  "category": "delivery|product|service_grooming|service_vet|payment|account|quality|other",
  "priority": "low|medium|high|urgent",
  "proposedResponse": "message client prêt à envoyer (2-4 phrases, empathique)",
  "resolutionPlan": ["action 1", "action 2"],
  "internalNotes": "note courte pour l'admin",
  "confidence": 0.0-1.0,
  "autoResolvable": true|false
}
Règles : ne promets pas de remboursement sans validation admin ; propose escalade si fraude ou danger animal.`;

const CATEGORIES = [
  { id: 'delivery', label: 'Livraison' },
  { id: 'product', label: 'Produit / commande' },
  { id: 'service_grooming', label: 'Toilettage' },
  { id: 'service_vet', label: 'Vétérinaire' },
  { id: 'payment', label: 'Paiement' },
  { id: 'account', label: 'Compte' },
  { id: 'quality', label: 'Qualité service' },
  { id: 'other', label: 'Autre' },
];

const classifyByKeywords = (subject, message) => {
  const t = `${subject} ${message}`.toLowerCase();
  if (/livraison|livreur|colis|retard|perdu/.test(t)) return 'delivery';
  if (/toilettage|coupe|bain|griffe/.test(t)) return 'service_grooming';
  if (/vétérinaire|vet|consultation|vaccin|clinique/.test(t)) return 'service_vet';
  if (/payer|paiement|facture|rembours|wallet|carte/.test(t)) return 'payment';
  if (/compte|connexion|mot de passe|profil/.test(t)) return 'account';
  if (/produit|croquette|commande|article|défectueux/.test(t)) return 'product';
  if (/dressage|pension|service/.test(t)) return 'quality';
  return 'other';
};

const priorityFromText = (subject, message, emotion) => {
  const t = `${subject} ${message}`.toLowerCase();
  if (/urgent|immédiat|danger|scandale|inadmissible/.test(t)) return 'urgent';
  if (emotion === 'frustrated' || /frustr|énerv|colère/.test(t)) return 'high';
  if (emotion === 'disappointed' || /déçu|retard|mauvais/.test(t)) return 'medium';
  return 'low';
};

const ruleBasedResolution = (complaint, context) => {
  const category = classifyByKeywords(complaint.subject, complaint.message);
  const emotion = context.emotionAnalysis?.emotion || 'neutral';
  const priority = priorityFromText(complaint.subject, complaint.message, emotion);
  const userName = context.user?.name || 'Client';

  const templates = {
    delivery: `Bonjour ${userName}, nous comprenons votre préoccupation concernant la livraison. Notre équipe vérifie le statut de votre commande${complaint.orderId ? ` #${String(complaint.orderId).slice(-6)}` : ''} et vous recontacte sous 24 h avec une solution (nouvelle livraison ou geste commercial selon validation).`,
    product: `Bonjour ${userName}, nous examinons votre signalement produit. Merci de conserver l'article et les preuves d'achat ; un conseiller validera l'échange ou le remboursement après contrôle qualité.`,
    payment: `Bonjour ${userName}, notre service facturation analyse votre demande de paiement. Nous vous confirmons les prochaines étapes par e-mail sous 48 h ouvrées.`,
    service_grooming: `Bonjour ${userName}, nous prenons en charge votre retour sur le service toilettage. Un responsable cabinet vous proposera un nouveau créneau ou un geste commercial adapté.`,
    service_vet: `Bonjour ${userName}, votre retour concernant le suivi vétérinaire est transmis au cabinet partenaire. Un praticien ou notre support vous recontacte rapidement.`,
    account: `Bonjour ${userName}, nous traitons votre demande liée au compte. Vérifiez vos spams ; si le problème persiste, nous réinitialiserons l'accès après vérification d'identité.`,
    quality: `Bonjour ${userName}, nous analysons votre insatisfaction sur nos services. Votre dossier est priorisé pour une réponse personnalisée.`,
    other: `Bonjour ${userName}, nous avons bien reçu votre message. Un administrateur PetfoodTN valide la réponse définitive avant envoi officiel.`,
  };

  return {
    category,
    priority,
    proposedResponse: templates[category] || templates.other,
    resolutionPlan: [
      'Vérifier le dossier client et commandes associées',
      'Notifier l\'admin pour validation de la réponse',
      priority === 'urgent' ? 'Traiter sous 4 h ouvrées' : 'Traiter sous 48 h',
    ],
    internalNotes: `Classification automatique : ${category}, priorité ${priority}, émotion ${emotion}.`,
    confidence: 0.65,
    autoResolvable: priority === 'low' && emotion !== 'frustrated',
    groqPowered: false,
  };
};

const parseGroqIncident = (raw) => {
  try {
    const json = JSON.parse(String(raw).replace(/```json|```/g, '').trim());
    return {
      category: json.category || 'other',
      priority: json.priority || 'medium',
      proposedResponse: json.proposedResponse || '',
      resolutionPlan: Array.isArray(json.resolutionPlan) ? json.resolutionPlan : [],
      internalNotes: json.internalNotes || '',
      confidence: Number(json.confidence) || 0.8,
      autoResolvable: Boolean(json.autoResolvable),
      groqPowered: true,
    };
  } catch {
    return null;
  }
};

const loadComplaintContext = async (complaint) => {
  const userId = complaint.userId;
  let user = null;
  let order = null;
  let priorCount = 0;

  if (userId) {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, region: true },
    });
    priorCount = await prisma.complaint.count({
      where: { userId, id: { not: complaint.id } },
    });
  }

  if (complaint.orderId) {
    order = await prisma.order.findUnique({
      where: { id: complaint.orderId },
      select: { id: true, status: true, total: true, region: true, createdAt: true },
    });
  }

  const emotionAnalysis = await analyzeOwnerEmotionText({
    text: `${complaint.subject}\n${complaint.message}`,
    serviceType: classifyByKeywords(complaint.subject, complaint.message) === 'delivery' ? 'delivery' : 'products',
  }).catch(() => null);

  return { user, order, priorCount, emotionAnalysis };
};

const analyzeIncident = async (complaint, context) => {
  const base = ruleBasedResolution(complaint, context);
  const groqPayload = {
    subject: complaint.subject,
    message: complaint.message,
    order: context.order,
    user: context.user,
    priorComplaints: context.priorCount,
    emotion: context.emotionAnalysis,
  };

  const raw = await completionWithSystem(
    INCIDENT_SYSTEM,
    JSON.stringify(groqPayload, null, 2).slice(0, 4000),
    { max_tokens: 600, temperature: 0.25 }
  );

  const groq = raw ? parseGroqIncident(raw) : null;
  let merged = base;
  if (groq && groq.proposedResponse) {
    merged = { ...base, ...groq, confidence: Math.max(base.confidence, groq.confidence), groqPowered: true };
  }

  const ml = predictIncidentPriority({
    subject: complaint.subject,
    message: complaint.message,
    priorCount: context.priorCount,
    emotion: context.emotionAnalysis?.emotion || 'neutral',
    orderTotal: Number(context.order?.total || 0),
  });
  return mergeMlIncident(merged, ml);
};

const applyAiProposal = async (complaintId, analysis) => {
  const planJson = JSON.stringify({
    steps: analysis.resolutionPlan || [],
    internalNotes: analysis.internalNotes || '',
    autoResolvable: analysis.autoResolvable,
  });

  return prisma.complaint.update({
    where: { id: complaintId },
    data: {
      status: 'ai_proposed',
      aiCategory: analysis.category,
      aiPriority: analysis.priority,
      aiProposedResponse: analysis.proposedResponse,
      aiResolutionPlan: planJson,
      aiConfidence: analysis.confidence,
      aiProcessedAt: new Date(),
      response: analysis.proposedResponse,
      adminValidated: false,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
};

const processComplaintById = async (complaintId) => {
  const complaint = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!complaint) {
    const err = new Error('Réclamation introuvable');
    err.status = 404;
    throw err;
  }
  if (['resolved', 'rejected', 'ai_proposed'].includes(complaint.status) && complaint.aiProcessedAt) {
    return complaint;
  }

  const context = await loadComplaintContext(complaint);
  const analysis = await analyzeIncident(complaint, context);
  const updated = await applyAiProposal(complaintId, analysis);

  try {
    const { emitToRole } = require('../utils/notificationHub');
    emitToRole('admin', {
      id: `incident-ai-${complaintId}`,
      type: 'incident_ai_proposed',
      title: `IA — incident à valider : ${complaint.subject}`,
      description: `${analysis.priority} · ${analysis.category}`,
      link: '/admin/incidents-ml',
      read: false,
      createdAt: new Date(),
    });
  } catch {
    /* optional */
  }

  return {
    complaint: updated,
    analysis: {
      ...analysis,
      complaintId,
      status: 'ai_proposed',
      awaitingAdminValidation: true,
    },
  };
};

const processAllPendingIncidents = async (limit = 20) => {
  const pending = await prisma.complaint.findMany({
    where: { status: { in: ['pending', 'in_progress'] } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  const results = [];
  for (const c of pending) {
    try {
      const r = await processComplaintById(c.id);
      results.push({ id: c.id, ok: true, ...r.analysis });
    } catch (err) {
      results.push({ id: c.id, ok: false, error: err.message });
    }
  }
  return { processed: results.length, results };
};

const getAdminValidationQueue = async () => {
  const queue = await prisma.complaint.findMany({
    where: { status: 'ai_proposed', adminValidated: false },
    orderBy: [{ aiPriority: 'desc' }, { createdAt: 'asc' }],
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
  });

  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  queue.sort(
    (a, b) =>
      (priorityOrder[a.aiPriority] ?? 9) - (priorityOrder[b.aiPriority] ?? 9) ||
      new Date(a.createdAt) - new Date(b.createdAt)
  );

  return {
    role: 'admin',
    agent: 'incident_ml_agent',
    queue,
    stats: {
      awaitingValidation: queue.length,
      urgent: queue.filter((c) => c.aiPriority === 'urgent').length,
      high: queue.filter((c) => c.aiPriority === 'high').length,
    },
    categories: CATEGORIES,
  };
};

const validateIncident = async (complaintId, adminUserId, payload) => {
  const { approved, response, rejectReason } = payload || {};
  const complaint = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!complaint) {
    const err = new Error('Réclamation introuvable');
    err.status = 404;
    throw err;
  }
  if (complaint.status !== 'ai_proposed') {
    const err = new Error('Cet incident n\'est pas en attente de validation IA');
    err.status = 400;
    throw err;
  }

  if (approved) {
    const finalResponse = (response || complaint.aiProposedResponse || '').trim();
    return prisma.complaint.update({
      where: { id: complaintId },
      data: {
        status: 'resolved',
        response: finalResponse,
        adminValidated: true,
        validatedBy: adminUserId,
        validatedAt: new Date(),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  return prisma.complaint.update({
    where: { id: complaintId },
    data: {
      status: 'in_progress',
      adminValidated: false,
      response: rejectReason
        ? `[IA rejetée] ${rejectReason}`
        : complaint.response,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
};

const getIncidentAgentPack = async () => {
  const [awaiting, pending, resolvedToday] = await Promise.all([
    prisma.complaint.count({ where: { status: 'ai_proposed', adminValidated: false } }),
    prisma.complaint.count({ where: { status: { in: ['pending', 'in_progress'] } } }),
    prisma.complaint.count({
      where: {
        status: 'resolved',
        adminValidated: true,
        validatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const queue = await getAdminValidationQueue();

  return {
    ...queue,
    models: ['incident_logistic_v1', 'groq', 'emotion_rules'],
    mlPowered: true,
    summary: `${awaiting} incident(s) proposé(s) par l'IA en attente de votre validation. ${pending} encore non traité(s) par l'agent.`,
    tip: 'Validez ou rejetez chaque proposition avant envoi officiel au client.',
    platformStats: {
      awaitingValidation: awaiting,
      pendingForAgent: pending,
      validatedLast24h: resolvedToday,
    },
  };
};

module.exports = {
  processComplaintById,
  processAllPendingIncidents,
  getAdminValidationQueue,
  validateIncident,
  getIncidentAgentPack,
  analyzeIncident,
  CATEGORIES,
};
