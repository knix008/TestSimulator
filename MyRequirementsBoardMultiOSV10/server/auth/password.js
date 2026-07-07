import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export function hashPassword(password) {
  return bcrypt.hashSync(password, ROUNDS);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}
