/**
 * Smoke test API remboursements (late_delivery + workflow vendeur).
 * Usage : node scripts/test-refunds-api.js
 * Prérequis : backend sur PORT 5000 (ou API_URL), seed exécuté.
 */
const API = process.env.API_URL || 'http://localhost:5000/api';

const post = async (path, body, token) => {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status} ${data.error || res.statusText}`);
  return data;
};

const get = async (path, token) => {
  const res = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status} ${data.error || res.statusText}`);
  return data;
};

const login = (email, password) => post('/auth/login', { email, password });

const run = async () => {
  console.log('🔐 Login client + admin…');
  const client = await login('client@petfood.tn', 'MonChat123!');
  const admin = await login('admin@petfood.tn', 'PetfoodTN2024!');
  const clientToken = client.token;
  const adminToken = admin.token;

  console.log('📋 Liste admin remboursements…');
  const adminList = await get('/admin/refunds', adminToken);
  console.log(`   ${adminList.refunds?.length ?? 0} demande(s)`);

  const latePending = adminList.refunds?.find(
    (r) => r.reasonCategory === 'late_delivery' && r.status === 'pending',
  );
  if (latePending) {
    console.log(`✅ Cas retard trouvé : ${latePending.id} (${latePending.delayDays} j)`);
    const approved = await post(
      `/ecosystem/vendor/refunds/${latePending.id}/approve`,
      { note: 'Test API — retard confirmé' },
      adminToken,
    );
    console.log(`   Approbation vendeur → status=${approved.status}, noReturn=${approved.noReturnRequired}`);
  } else {
    console.log('ℹ️  Aucun retard pending — création test…');
    const created = await post(
      '/refunds/request',
      {
        orderId: 'CMD-TEST-LATE',
        productName: 'Test croquettes',
        amount: 29,
        reason: 'Livraison 8 jours de retard',
        reasonCategory: 'late_delivery',
        delayDays: 8,
        clientName: 'Client Test',
        vendorName: 'Vendeur Test',
      },
      clientToken,
    );
    console.log(`   Créé ${created.id} status=${created.status}`);
    if (created.status === 'pending') {
      const approved = await post(
        `/ecosystem/vendor/refunds/${created.id}/approve`,
        { note: 'Test auto' },
        adminToken,
      );
      console.log(`   Approbation → status=${approved.status}`);
    }
  }

  const rejected = await post(
    '/refunds/request',
    {
      orderId: 'CMD-TEST-REJECT',
      reason: 'Retard 1 jour',
      reasonCategory: 'late_delivery',
      delayDays: 1,
      amount: 10,
    },
    clientToken,
  );
  console.log(
    rejected.status === 'rejected'
      ? '✅ Rejet auto retard < grace days OK'
      : `⚠️  Attendu rejected, reçu ${rejected.status}`,
  );

  console.log('✅ Test remboursements terminé');
};

run().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
