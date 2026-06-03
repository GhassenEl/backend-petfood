/**
 * Persistance Firestore des grandeurs IoT distributeur (section client).
 * No-op si Firebase Admin n'est pas configuré (.env).
 */

const COLLECTION = 'feeder_readings';

let db = null;
let enabled = false;
let initAttempted = false;

const initFirebase = () => {
  if (initAttempted) return enabled;
  initAttempted = true;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    return false;
  }

  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    }
    db = admin.firestore();
    enabled = true;
  } catch (err) {
    console.warn('[feederFirebase] Init impossible:', err.message);
    enabled = false;
  }

  return enabled;
};

const isEnabled = () => {
  if (!initAttempted) initFirebase();
  return enabled;
};

/** Grandeurs physiques normalisées pour Firestore */
const buildGrandeursPayload = ({
  feederId,
  ownerId,
  eventType = 'sensor',
  temperature,
  humidity,
  foodGrams,
  reservoirCm,
  animalPresent,
  isLowFood,
  status,
  portionGrams,
  message,
  source = 'esp32',
}) => {
  const now = new Date().toISOString();
  return {
    feederId: String(feederId),
    ownerId: ownerId ? String(ownerId) : null,
    eventType,
    source,
    recordedAt: now,
    grandeurs: {
      temperature_c: temperature != null ? Number(temperature) : null,
      humidity_pct: humidity != null ? Number(humidity) : null,
      food_grams: foodGrams != null ? Number(foodGrams) : null,
      reservoir_cm: reservoirCm != null ? Number(reservoirCm) : null,
      animal_present: animalPresent === true,
      low_food: isLowFood === true,
      status: status || null,
      portion_grams: portionGrams != null ? Number(portionGrams) : null,
    },
    message: message || null,
  };
};

/**
 * Enregistre un relevé + met à jour le document « latest » du distributeur.
 */
const saveFeederGrandeurs = async (input) => {
  if (!isEnabled()) return { ok: false, skipped: true, reason: 'firebase_not_configured' };

  const payload = buildGrandeursPayload(input);

  try {
    const feederRef = db.collection(COLLECTION).doc(payload.feederId);
    await feederRef.collection('history').add(payload);
    await feederRef.set(
      {
        ownerId: payload.ownerId,
        latest: payload,
        updatedAt: payload.recordedAt,
      },
      { merge: true }
    );
    return { ok: true, recordedAt: payload.recordedAt };
  } catch (err) {
    console.error('[feederFirebase] saveFeederGrandeurs:', err.message);
    return { ok: false, error: err.message };
  }
};

const getLatestGrandeurs = async (feederId) => {
  if (!isEnabled()) return null;
  try {
    const snap = await db.collection(COLLECTION).doc(String(feederId)).get();
    if (!snap.exists) return null;
    const data = snap.data();
    return data.latest || null;
  } catch (err) {
    console.error('[feederFirebase] getLatestGrandeurs:', err.message);
    return null;
  }
};

const getHistoryGrandeurs = async (feederId, limit = 30) => {
  if (!isEnabled()) return [];
  try {
    const snap = await db
      .collection(COLLECTION)
      .doc(String(feederId))
      .collection('history')
      .orderBy('recordedAt', 'desc')
      .limit(Math.min(limit, 100))
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('[feederFirebase] getHistoryGrandeurs:', err.message);
    return [];
  }
};

const getFirebaseStatus = () => ({
  enabled: isEnabled(),
  collection: COLLECTION,
  projectId: process.env.FIREBASE_PROJECT_ID || null,
});

module.exports = {
  saveFeederGrandeurs,
  getLatestGrandeurs,
  getHistoryGrandeurs,
  getFirebaseStatus,
  buildGrandeursPayload,
  isEnabled,
};
