import bcrypt from 'bcrypt';
import { config } from '../config.js';

export const hashPassword = (plain) => bcrypt.hash(plain, config.bcryptRounds);

// Compared against when the username does not exist, so response time
// does not reveal whether an account is real.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', config.bcryptRounds);

export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash ?? DUMMY_HASH);
