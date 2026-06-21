/** Centralized, validated environment access. */

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 3000),
  publicOrigin: process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000',
  sessionSecret: required('SESSION_SECRET', 'dev-insecure-secret-change-me'),
  databaseUrl: required('DATABASE_URL', 'postgres://moji:moji@localhost:5432/moji'),
  /** apply migrations + seed on boot (set AUTO_MIGRATE=false to manage externally) */
  autoMigrate: process.env.AUTO_MIGRATE !== 'false',
  /** log incorrect guesses + the answer, to tune the matcher (set =false to silence) */
  logGuessMisses: process.env.LOG_GUESS_MISSES !== 'false',
};
