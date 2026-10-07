const { app, initializeApp } = require('../server/server');

module.exports = async function handler(req, res) {
  await initializeApp();
  return app(req, res);
};
