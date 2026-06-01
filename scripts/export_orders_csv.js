(async () => {
  const fs = require('fs');
  const path = require('path');
  const base = 'http://localhost:5002';
  const args = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
  const statusFilter = args.status;
  const userFilter = args.user;
  const dateFromArg = args.dateFrom;
  const dateToArg = args.dateTo;
  const outFile = args.out || path.join(__dirname, 'orders_export.csv');

  try {
    const adminLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@petfood.tn', password: 'PetfoodTN2024!' })
    });
    const adminJson = await adminLogin.json();
    const adminToken = adminJson.token;

    const resp = await fetch(`${base}/api/orders`, { headers: { Authorization: `Bearer ${adminToken}` } });
    let orders = await resp.json();
    if (!Array.isArray(orders)) {
      console.error('Unexpected response:', orders);
      process.exit(1);
    }

    if (statusFilter) orders = orders.filter(o => String(o.status).toLowerCase() === String(statusFilter).toLowerCase());
    if (userFilter) orders = orders.filter(o => String(o.userId) === String(userFilter));

    let fromDate = null; let toDate = null;
    if (dateFromArg) { const d = new Date(dateFromArg); if (!isNaN(d)) fromDate = d; }
    if (dateToArg) { const d = new Date(dateToArg); if (!isNaN(d)) { if (/^\d{4}-\d{2}-\d{2}$/.test(dateToArg)) d.setHours(23,59,59,999); toDate = d; } }
    if (fromDate || toDate) orders = orders.filter(o => { const created = new Date(o.createdAt); if (fromDate && created < fromDate) return false; if (toDate && created > toDate) return false; return true; });

    // CSV headers
    const headers = ['id','userId','total','status','paymentMethod','address','phone','createdAt','itemsCount','items'];
    const rows = [headers.join(',')];

    for (const o of orders) {
      const itemsCount = Array.isArray(o.items) ? o.items.length : 0;
      // items as compact string productId|qty|price;...
      const itemsStr = (o.items || []).map(it => `${(it.productId||'')}:${it.quantity||0}:${it.price||0}`).join(';');
      // escape quotes
      const address = (o.address || '').replace(/"/g, '""');
      const row = [o.id, o.userId, o.total, o.status, o.paymentMethod, `"${address}"`, o.phone, o.createdAt, itemsCount, `"${itemsStr}"`];
      rows.push(row.join(','));
    }

    fs.writeFileSync(outFile, rows.join('\n'), 'utf8');
    console.log('Wrote', orders.length, 'orders to', outFile);
  } catch (e) {
    console.error('error', e);
    process.exit(1);
  }
})();
