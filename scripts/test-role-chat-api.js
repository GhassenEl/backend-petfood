/**
 * Test chatbot NLP public + rôles + recommandations avis
 * Usage: node scripts/test-role-chat-api.js
 */
const http = require('http');

const BASE = process.env.API_BASE || 'http://127.0.0.1:5002';

const request = (method, path, token, body) =>
  new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let json;
          try { json = JSON.parse(data); } catch { json = data; }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

const login = async (email, password) => {
  const { status, json } = await request('POST', '/api/auth/login', null, { email, password });
  if (status !== 200 || !json.token) throw new Error(`Login ${email} failed: ${status}`);
  return json.token;
};

(async () => {
  let ok = 0;
  const tests = [];

  const pub = await request('POST', '/api/chat/public', null, {
    message: 'Recommandations croquettes chat bien notées',
    role: 'visitor',
  });
  tests.push(['POST /chat/public (visiteur)', pub.status === 200 && pub.json?.message]);
  if (pub.status === 200) ok += 1;

  const reco = await request('GET', '/api/ai/recommendations/public?q=croquettes%20chat&limit=5', null);
  tests.push(['GET /ai/recommendations/public', reco.status === 200 && Array.isArray(reco.json?.recommendations)]);
  if (reco.status === 200) ok += 1;

  const modToken = await login('moderator@petfood.tn', 'Moderator2024!');
  const modChat = await request('POST', '/api/chat/message', modToken, {
    message: 'Comment gérer les vendeurs en attente ?',
    context: { role: 'moderator' },
  });
  tests.push(['POST /chat/message (modérateur)', modChat.status === 200 && modChat.json?.message]);
  if (modChat.status === 200) ok += 1;

  const venToken = await login('vendor@petfood.tn', 'Vendor2024!');
  const venChat = await request('POST', '/api/chat/message', venToken, {
    message: 'Quels produits sont les mieux notés ?',
    context: { role: 'vendor' },
  });
  tests.push(['POST /chat/message (vendeur)', venChat.status === 200 && venChat.json?.message]);
  if (venChat.status === 200) ok += 1;

  for (const [label, pass] of tests) {
    console.log(`${pass ? '✅' : '❌'} ${label}`);
  }
  console.log(`\n${ok}/${tests.length} tests chat NLP OK`);
  process.exit(ok === tests.length ? 0 : 1);
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
