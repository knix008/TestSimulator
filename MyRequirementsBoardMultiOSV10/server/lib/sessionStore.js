import session from 'express-session';

export class DbSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
  }

  get(sid, callback) {
    this.db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expired > ?')
      .get(sid, Date.now())
      .then((row) => {
        if (!row?.sess) return callback(null, null);
        try {
          callback(null, JSON.parse(row.sess));
        } catch (err) {
          callback(err);
        }
      })
      .catch((err) => callback(err));
  }

  set(sid, sess, callback) {
    const maxAge = sess.cookie?.maxAge ?? 7 * 24 * 60 * 60 * 1000;
    const expired = Date.now() + maxAge;
    const data = JSON.stringify(sess);

    this.db.prepare('SELECT sid FROM sessions WHERE sid = ?').get(sid)
      .then((existing) => {
        if (existing) {
          return this.db.prepare('UPDATE sessions SET sess = ?, expired = ? WHERE sid = ?').run(data, expired, sid);
        }
        return this.db.prepare('INSERT INTO sessions (sid, sess, expired) VALUES (?, ?, ?)').run(sid, data, expired);
      })
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  destroy(sid, callback) {
    this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid)
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  touch(sid, sess, callback) {
    this.set(sid, sess, callback);
  }
}
