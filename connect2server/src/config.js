import 'dotenv/config';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isNaN(n) ? fallback : n;
};

export const config = {
  env: env.NODE_ENV ?? 'development',
  isProd,
  port: int(env.PORT, 3000),
  db: {
    host: env.DB_HOST ?? 'localhost',
    port: int(env.DB_PORT, 3306),
    user: env.DB_USER ?? 'root',
    password: env.DB_PASSWORD ?? '',
    database: env.DB_NAME ?? 'usermgmt',
  },
  dbPoolMax: int(env.DB_POOL_MAX, 10),
  jwtSecret: env.JWT_SECRET ?? '',
  jwtExpiresIn: env.JWT_EXPIRES_IN ?? '1h',
  jwtIssuer: env.JWT_ISSUER ?? 'user-management',
  bcryptRounds: int(env.BCRYPT_ROUNDS, 12),
  maxFailedLogins: int(env.MAX_FAILED_LOGINS, 5),
  lockMinutes: int(env.LOCK_MINUTES, 15),
  loginRateLimitMax: int(env.LOGIN_RATE_LIMIT_MAX, 20),
  corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: env.TRUST_PROXY === 'true',
};

if (config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters (try: openssl rand -hex 48)');
}
if (isProd && config.bcryptRounds < 12) {
  throw new Error('BCRYPT_ROUNDS must be >= 12 in production');
}
