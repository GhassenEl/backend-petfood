/**
 * Test API sécurité — scan anti-menaces & journal
 * Usage: node scripts/test-security-api.js
 */

const BASE = process.env.API_BASE || 'http://127.0.0.1:5002/api';

const ok = (label) => console.log(`✅ ${label}`);
const fail = (label, err) => {
  console.error(`❌ ${label}`, err?.message || err);
  process.exitCode = 1;
};

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function main() {
  const status = await request('/security/status');
  if (status.status !== 200 || !status.data?.engine) {
    return fail('GET /security/status', status.data);
  }
  ok(`status — ${status.data.engine} (${status.data.signatureCount} signatures)`);

  const clean = await request('/security/scan', {
    method: 'POST',
    body: JSON.stringify({ text: 'Bonjour, je cherche des croquettes pour chat.' }),
  });
  if (clean.status !== 200 || !clean.data?.safe) {
    return fail('POST /security/scan (clean)', clean.data);
  }
  ok('scan texte propre');

  const eicar = await request('/security/scan', {
    method: 'POST',
    body: JSON.stringify({
      text: 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
    }),
  });
  if (eicar.status !== 200 || eicar.data?.safe !== false) {
    return fail('POST /security/scan (EICAR)', eicar.data);
  }
  ok(`scan EICAR — ${eicar.data.threats?.length || 0} menace(s)`);

  const xss = await request('/security/scan', {
    method: 'POST',
    body: JSON.stringify({ text: '<script>alert(1)</script>' }),
  });
  if (xss.status !== 200 || xss.data?.safe !== false) {
    return fail('POST /security/scan (XSS)', xss.data);
  }
  ok('scan XSS script');

  const blockedChat = await request('/chat/public', {
    method: 'POST',
    body: JSON.stringify({ message: '<script>steal()</script>', role: 'visitor' }),
  });
  if (blockedChat.status !== 422) {
    return fail('POST /chat/public bloqué', blockedChat);
  }
  ok('chat public bloque contenu dangereux (422)');

  console.log('\nTests sécurité terminés.');
}

main().catch((e) => fail('fatal', e));
