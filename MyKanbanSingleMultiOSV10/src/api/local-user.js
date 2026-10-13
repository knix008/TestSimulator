const LOCAL_USERNAME = 'admin';

async function findLocalUser(db) {
  const named = await db('users').where({ username: LOCAL_USERNAME }).first();
  if (named && named.status !== 'inactive') return named;
  return db('users').where({ status: 'active' }).orderBy('id', 'asc').first();
}

async function attachLocalUser(req, res, next) {
  try {
    if (!req.session.userId) {
      const { getDb } = require('../db/connection');
      const user = await findLocalUser(getDb());
      if (user) {
        req.session.userId = user.id;
        req.session.role = user.role || 'admin';
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { attachLocalUser, findLocalUser, LOCAL_USERNAME };
