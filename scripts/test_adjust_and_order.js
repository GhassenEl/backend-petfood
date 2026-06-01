(async () => {
  const base = 'http://localhost:5002';
  try {
    const adminLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@petfood.tn', password: 'PetfoodTN2024!' })
    });
    const adminJson = await adminLogin.json();
    const adminToken = adminJson.token;
    console.log('admin token present:', !!adminToken);

    let productsResp = await fetch(`${base}/api/products`);
    let products = await productsResp.json();
    let p = products.find(x => (x.stock || 0) > 0);
    if (!p) {
      const created = await fetch(`${base}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ name: 'Test Product', description: 'Test', price: 9.99, stock: 10, category: 'test' })
      });
      p = await created.json();
      console.log('created product id:', p.id || p._id);
    } else {
      console.log('found product', p.id || p._id, 'stock', p.stock);
    }

    const productId = p.id || p._id;
    const adjust = await fetch(`${base}/api/products/${productId}/stock/adjust`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ adjustment: 10, reason: 'test' })
    });
    console.log('adjust status', adjust.status);
    console.log(await adjust.text());

    const clientLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'client@petfood.tn', password: 'MonChat123!' })
    });
    const clientJson = await clientLogin.json();
    const clientToken = clientJson.token;
    console.log('client token present:', !!clientToken);

    const orderBody = {
      items: [{ productId: productId, quantity: 1, price: p.price || 9.99 }],
      total: p.price || 9.99,
      address: '123 Test St',
      phone: '00000000',
      paymentMethod: 'cash'
    };

    const orderResp = await fetch(`${base}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientToken}` },
      body: JSON.stringify(orderBody)
    });
    console.log('order status', orderResp.status);
    console.log(await orderResp.text());
  } catch (e) {
    console.error('script error', e);
  }
})();
