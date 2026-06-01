const isDemoUser = (user) => {
  const id = user?.id ?? user?._id;
  return typeof id === 'string' && id.startsWith('demo_');
};

const useDemoStore = (user) =>
  process.env.DEMO_MODE === 'true' || isDemoUser(user);

module.exports = { isDemoUser, useDemoStore };
