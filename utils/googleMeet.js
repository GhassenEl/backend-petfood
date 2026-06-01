const generateGoogleMeetLink = () => {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const randomPart = (length) =>
    Array.from({ length }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  return `https://meet.google.com/${randomPart(3)}-${randomPart(4)}-${randomPart(3)}`;
};

module.exports = { generateGoogleMeetLink };
