const clone = (value) => JSON.parse(JSON.stringify(value));

const now = () => new Date().toISOString();
const createId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const demoUsers = [
  { _id: 'demo_admin', email: 'admin@petfood.tn', name: 'El JEzi Ghassen', role: 'admin', phone: '+216 70 100 100', address: 'Lac 2, Tunis', petType: 'dog', petAge: 3, preferences: ['premium'], favoriteCategories: ['nourriture', 'snack'], pets: [{ name: 'Tweety', type: 'bird', breed: 'Perroquet', birthDate: new Date('2024-01-01'), weight: 0.035, notes: 'Oiseau actif' }] },
  { _id: 'demo_client', email: 'client@petfood.tn', name: 'Client Test', role: 'client', phone: '+216 20 000 000', address: 'Ariana, Tunis', petType: 'cat', petAge: 2, preferences: ['bio'], favoriteCategories: ['nourriture', 'hygiène'], pets: [{ name: 'Rex', type: 'dog', breed: 'Labrador', birthDate: new Date('2023-04-01'), weight: 28.5, notes: 'Chien sportif' }, { name: 'Mimi', type: 'cat', breed: 'Persan', birthDate: new Date('2024-03-01'), weight: 4.2, notes: 'Chat calme' }] },
  { _id: 'demo_livreur', email: 'livreur@petfood.tn', name: 'Ahmed Ben Salah', role: 'livreur', phone: '+216 55 123 456', address: 'Centre-ville Tunis, Rue de Marseille', petType: 'dog', petAge: 4, preferences: ['sport'], favoriteCategories: [], pets: [{ name: 'Max', type: 'dog', breed: 'Berger Allemand', birthDate: new Date('2022-06-01'), weight: 35, notes: 'Chien de garde' }] },
];

const demoProducts = [
  {
    _id: 'prd_dog_1',
    name: 'Croquettes Premium Chien',
    price: 58,
    discount: 15,
    description: 'Recette riche en proteines pour chiens actifs et pelage brillant.',
    stock: 24,
    animalType: 'dog',
    category: 'nourriture',
    tags: ['premium', 'proteines'],
    popularity: 95,
    rating_avg: 4.7,
    rating_count: 42,
    imageUrl: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=900&q=80',
    icon: '🐶',
  },
  {
    _id: 'prd_cat_1',
    name: 'Patee Equilibre Chat',
    price: 24,
    discount: 10,
    description: 'Texture fondante pour chats adultes, digestion legere et gout saumon.',
    stock: 31,
    animalType: 'cat',
    category: 'nourriture',
    tags: ['bio', 'saumon'],
    popularity: 88,
    rating_avg: 4.5,
    rating_count: 35,
    imageUrl: 'https://images.unsplash.com/photo-1511044568932-338cba0ad803?auto=format&fit=crop&w=900&q=80',
    icon: '🐱',
  },
  {
    _id: 'prd_bird_1',
    name: 'Melange Vitalite Oiseaux',
    price: 19,
    discount: 5,
    description: 'Melange de graines premium pour oiseaux domestiques.',
    stock: 18,
    animalType: 'bird',
    category: 'nourriture',
    tags: ['graines', 'vitamines'],
    popularity: 65,
    rating_avg: 4.3,
    rating_count: 18,
    imageUrl: 'https://images.unsplash.com/photo-1444464666168-49d633b86797?auto=format&fit=crop&w=900&q=80',
    icon: '🐦',
  },
  {
    _id: 'prd_fish_1',
    name: 'Granules Aquarium Pro',
    price: 16,
    discount: 0,
    description: 'Granules digestes et faciles a doser pour poissons tropicaux.',
    stock: 42,
    animalType: 'fish',
    category: 'nourriture',
    tags: ['tropical', 'digestion'],
    popularity: 72,
    rating_avg: 4.4,
    rating_count: 22,
    imageUrl: 'https://images.unsplash.com/photo-1520301255226-bf5f144451c1?auto=format&fit=crop&w=900&q=80',
    icon: '🐠',
  },
  {
    _id: 'prd_dog_2',
    name: 'Snack Dentaire Naturel',
    price: 14,
    discount: 20,
    description: 'Snacks a macher pour hygiene dentaire et haleine fraiche.',
    stock: 53,
    animalType: 'dog',
    category: 'snack',
    tags: ['dentaire', 'naturel'],
    popularity: 90,
    rating_avg: 4.8,
    rating_count: 56,
    imageUrl: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=900&q=80',
    icon: '🦴',
  },
  {
    _id: 'prd_cat_2',
    name: 'Litiere Confort Chat',
    price: 27,
    discount: 12,
    description: 'Litiere absorbante sans poussiere pour usage quotidien.',
    stock: 27,
    animalType: 'cat',
    category: 'hygiène',
    tags: ['absorbant', 'sans-poussiere'],
    popularity: 85,
    rating_avg: 4.6,
    rating_count: 31,
    imageUrl: 'https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=900&q=80',
    icon: '🐾',
  },
];

const baseOrder = {
  _id: 'ord_demo_1',
  userId: demoUsers[1],
  items: [
    {
      productId: {
        _id: demoProducts[0]._id,
        name: demoProducts[0].name,
        price: demoProducts[0].price,
        discount: demoProducts[0].discount,
        imageUrl: demoProducts[0].imageUrl,
      },
      quantity: 1,
      price: 49.3,
    },
    {
      productId: {
        _id: demoProducts[4]._id,
        name: demoProducts[4].name,
        price: demoProducts[4].price,
        discount: demoProducts[4].discount,
        imageUrl: demoProducts[4].imageUrl,
      },
      quantity: 2,
      price: 11.2,
    },
  ],
  total: 71.7,
  status: 'pending',
  paymentMethod: 'cash',
  address: 'Ariana, Tunis',
  phone: '+216 20 000 000',
  deliveryLocation: null,
  createdAt: '2026-04-23T08:30:00.000Z',
};

// Generate extra demo orders for livreur data
const { generateOrders, generateMessages } = require('./demoData');
const extraOrders = generateOrders(28);

let store = {
  users: clone(demoUsers),
  products: clone(demoProducts),
  orders: [clone(baseOrder), ...extraOrders],
  invoices: [
    {
      _id: 'inv_demo_1',
      userId: clone(demoUsers[1]),
      orderId: clone(baseOrder),
      amount: baseOrder.total,
      status: 'unpaid',
      paymentMethod: 'cash',
      issuedAt: '2026-04-23T08:35:00.000Z',
      paidAt: null,
    },
    ...extraOrders.filter(o => o.status !== 'cancelled').map(o => ({
      _id: createId('inv'),
      userId: clone(demoUsers[1]),
      orderId: clone(o),
      amount: o.total,
      status: o.status === 'paid' || o.status === 'delivered' || o.status === 'shipped' ? 'paid' : 'unpaid',
      paymentMethod: o.paymentMethod,
      issuedAt: o.createdAt,
      paidAt: (o.status === 'paid' || o.status === 'delivered' || o.status === 'shipped') ? o.createdAt : null,
    })),
  ],
  reviews: [
    {
      _id: 'rev_demo_1',
      userId: clone(demoUsers[1]),
      productId: { _id: demoProducts[0]._id, name: demoProducts[0].name, imageUrl: demoProducts[0].imageUrl },
      rating: 5,
      comment: 'Produit tres apprecie par mon chien, livraison rapide et emballage propre.',
      emotion: 'happy',
      createdAt: '2026-04-22T15:10:00.000Z',
    },
  ],
  complaints: [
    {
      _id: 'cmp_demo_1',
      userId: clone(demoUsers[1]),
      subject: 'Delai de livraison',
      message: 'Je souhaite un suivi plus detaille pour ma prochaine livraison.',
      orderId: baseOrder._id,
      status: 'pending',
      response: '',
      createdAt: '2026-04-22T17:20:00.000Z',
    },
  ],
  messages: generateMessages(),
};

const getUserById = (id) => store.users.find((user) => user._id === id);

const getProducts = () => clone(store.products);
const getUsers = () => clone(store.users);

const createProduct = (payload) => {
  const product = {
    _id: createId('prd'),
    name: payload.name,
    price: Number(payload.price || 0),
    discount: Number(payload.discount || 0),
    description: payload.description || '',
    stock: Number(payload.stock || 0),
    animalType: payload.animalType || 'other',
    category: payload.category || 'nourriture',
    tags: payload.tags || [],
    popularity: Number(payload.popularity || 0),
    rating_avg: Number(payload.rating_avg || 0),
    rating_count: Number(payload.rating_count || 0),
    imageUrl: payload.imageUrl || payload.image || '',
    icon: payload.icon || '🐾',
  };
  store.products.unshift(product);
  return clone(product);
};

const updateProduct = (id, payload) => {
  const index = store.products.findIndex((product) => product._id === id);
  if (index === -1) return null;
  store.products[index] = {
    ...store.products[index],
    ...payload,
    price: Number(payload.price ?? store.products[index].price),
    discount: Number(payload.discount ?? store.products[index].discount),
    stock: Number(payload.stock ?? store.products[index].stock),
    imageUrl: payload.imageUrl || payload.image || store.products[index].imageUrl,
  };
  return clone(store.products[index]);
};

const deleteProduct = (id) => {
  const existing = store.products.find((product) => product._id === id);
  store.products = store.products.filter((product) => product._id !== id);
  return clone(existing);
};

const getOrders = (user) => {
  if (user.role === 'admin' || user.role === 'livreur') return clone(store.orders);
  return clone(store.orders.filter((order) => order.userId._id === user._id));
};

const createOrder = (user, payload) => {
  const items = (payload.items || []).map((item) => {
    const product = store.products.find((entry) => entry._id === item.productId || entry._id === item.productId?._id);
    const quantity = Number(item.quantity || 1);
    const finalPrice = Number(item.price ?? ((product?.price || 0) * (1 - (product?.discount || 0) / 100)).toFixed(2));
    return {
      productId: product
        ? { _id: product._id, name: product.name, price: product.price, discount: product.discount, imageUrl: product.imageUrl }
        : item.productId,
      quantity,
      price: finalPrice,
    };
  });

  const total = Number(items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
  const order = {
    _id: createId('ord'),
    userId: { _id: user._id, email: user.email, name: user.name, role: user.role },
    items,
    total,
    status: payload.status || 'pending',
    paymentMethod: payload.paymentMethod || 'cash',
    address: payload.address || '',
    phone: payload.phone || '',
    deliveryLocation: payload.location || payload.deliveryLocation || null,
    createdAt: now(),
  };
  store.orders.unshift(order);

  const invoice = {
    _id: createId('inv'),
    userId: { _id: user._id, email: user.email, name: user.name, role: user.role },
    orderId: clone(order),
    amount: total,
    status: 'unpaid',
    paymentMethod: order.paymentMethod,
    issuedAt: now(),
    paidAt: null,
  };
  store.invoices.unshift(invoice);

  return { order: clone(order), invoice: clone(invoice) };
};

const updateOrder = (id, payload) => {
  const index = store.orders.findIndex((order) => order._id === id);
  if (index === -1) return null;
  store.orders[index] = { ...store.orders[index], ...payload };
  const invoiceIndex = store.invoices.findIndex((invoice) => invoice.orderId._id === id);
  if (invoiceIndex !== -1) {
    store.invoices[invoiceIndex].orderId = clone(store.orders[index]);
  }
  return clone(store.orders[index]);
};

const deleteOrder = (id) => {
  const existing = store.orders.find((order) => order._id === id);
  store.orders = store.orders.filter((order) => order._id !== id);
  store.invoices = store.invoices.filter((invoice) => invoice.orderId._id !== id);
  return clone(existing);
};

const getInvoices = (user) => {
  if (user.role === 'admin') return clone(store.invoices);
  return clone(store.invoices.filter((invoice) => invoice.userId._id === user._id));
};

const payInvoice = (user, invoiceId, paymentMethod) => {
  const index = store.invoices.findIndex((invoice) => invoice._id === invoiceId);
  if (index === -1) return null;
  if (user.role !== 'admin' && store.invoices[index].userId._id !== user._id) return null;

  store.invoices[index].status = 'paid';
  store.invoices[index].paidAt = now();
  store.invoices[index].paymentMethod = paymentMethod || store.invoices[index].paymentMethod;
  updateOrder(store.invoices[index].orderId._id, { status: 'paid', paymentMethod: store.invoices[index].paymentMethod });
  store.invoices[index].orderId = clone(store.orders.find((order) => order._id === store.invoices[index].orderId._id));
  return clone(store.invoices[index]);
};

const getReviews = (user) => {
  if (user.role === 'admin') return clone(store.reviews);
  return clone(store.reviews.filter((review) => review.userId._id === user._id));
};

const createReview = (user, payload) => {
  const product = store.products.find((entry) => entry._id === payload.productId);
  const review = {
    _id: createId('rev'),
    userId: { _id: user._id, email: user.email, name: user.name, role: user.role },
    productId: product ? { _id: product._id, name: product.name, imageUrl: product.imageUrl } : { _id: payload.productId, name: payload.productName || 'Produit' },
    rating: Number(payload.rating || 5),
    comment: payload.comment,
    emotion: payload.emotion || 'neutral',
    createdAt: now(),
  };
  store.reviews.unshift(review);
  return clone(review);
};

const updateReview = (id, payload) => {
  const index = store.reviews.findIndex((review) => review._id === id);
  if (index === -1) return null;
  store.reviews[index] = {
    ...store.reviews[index],
    rating: Number(payload.rating ?? store.reviews[index].rating),
    comment: payload.comment ?? store.reviews[index].comment,
    emotion: payload.emotion ?? store.reviews[index].emotion,
  };
  return clone(store.reviews[index]);
};

const deleteReview = (id) => {
  const existing = store.reviews.find((review) => review._id === id);
  store.reviews = store.reviews.filter((review) => review._id !== id);
  return clone(existing);
};

const getComplaints = (user) => {
  if (user.role === 'admin') return clone(store.complaints);
  return clone(store.complaints.filter((complaint) => complaint.userId._id === user._id));
};

const createComplaint = (user, payload) => {
  const complaint = {
    _id: createId('cmp'),
    userId: { _id: user._id, email: user.email, name: user.name, role: user.role },
    subject: payload.subject,
    message: payload.message || payload.description || '',
    orderId: payload.orderId || '',
    status: 'pending',
    response: '',
    createdAt: now(),
  };
  store.complaints.unshift(complaint);
  return clone(complaint);
};

const updateComplaint = (id, payload) => {
  const index = store.complaints.findIndex((complaint) => complaint._id === id);
  if (index === -1) return null;
  store.complaints[index] = {
    ...store.complaints[index],
    response: payload.response ?? store.complaints[index].response,
    status: payload.status ?? store.complaints[index].status,
  };
  return clone(store.complaints[index]);
};

const deleteComplaint = (id) => {
  const existing = store.complaints.find((complaint) => complaint._id === id);
  store.complaints = store.complaints.filter((complaint) => complaint._id !== id);
  return clone(existing);
};

// Messages helpers for livreur chat
const getMessages = (user) => {
  if (!user) return clone(store.messages);
  return clone(store.messages.filter(
    (msg) => msg.sender.userId === user._id || msg.receiver.userId === user._id
  ));
};

const createMessage = (user, payload) => {
  const message = {
    _id: createId('msg'),
    sender: { type: user.role, userId: user._id },
    receiver: { type: payload.receiverType || 'admin', userId: payload.receiverId || 'demo_admin' },
    message: payload.message.trim(),
    createdAt: now(),
    isRead: false,
  };
  store.messages.push(message);
  return clone(message);
};

module.exports = {
  getUserById,
  getUsers,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getOrders,
  createOrder,
  updateOrder,
  deleteOrder,
  getInvoices,
  payInvoice,
  getReviews,
  createReview,
  updateReview,
  deleteReview,
  getComplaints,
  createComplaint,
  updateComplaint,
  deleteComplaint,
  getMessages,
  createMessage,
};

