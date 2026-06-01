(async () => {
  const base = 'http://localhost:5002';
  const invoiceId = 'fcf6a7e7-711f-4578-9eed-8fd46699c2f5';
  try {
    const clientLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'client@petfood.tn', password: 'MonChat123!' })
    });
    const clientJson = await clientLogin.json();
    const clientToken = clientJson.token;

    const payResp = await fetch(`${base}/api/invoices/${invoiceId}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken}` },
      body: JSON.stringify({ method: 'cash' })
    });
    console.log('pay status', payResp.status);
    console.log(await payResp.text());

    const invs = await fetch(`${base}/api/invoices`, { headers: { Authorization: `Bearer ${clientToken}` } });
    console.log('invoices:', await invs.text());
  } catch (e) {
    console.error('error', e);
  }
})();
