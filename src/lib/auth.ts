import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { oneTap } from 'better-auth/plugins';

import { createDb, type DbEnv } from './db/client';
import { baAccounts, baSessions, baVerifications, users } from './db/schema';
import { createPing } from './ping';

export type AuthEnv = DbEnv & {
  BETTER_AUTH_SECRET?: string;
  AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_BASE_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  NODE_ENV?: string;
  APP_HEALTH_INGEST_KEY?: string;
  APP_HEALTH_ENVIRONMENT?: string;
};

export function createAuth(env: AuthEnv) {
  const canUseLocalAuthSecret =
    env.NODE_ENV !== 'production' || process.env.npm_lifecycle_event === 'build';

  const authSecret =
    env.BETTER_AUTH_SECRET?.trim() ||
    env.AUTH_SECRET?.trim() ||
    (canUseLocalAuthSecret ? 'reader-local-development-secret-at-least-32-chars' : undefined);

  const googleClientId = env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const db = createDb(env);
  const ping = createPing({ key: env.APP_HEALTH_INGEST_KEY, environment: env.APP_HEALTH_ENVIRONMENT });

  return betterAuth({
    secret: authSecret,
    baseURL:
      env.BETTER_AUTH_URL?.trim() ||
      env.BETTER_AUTH_BASE_URL?.trim() ||
      'https://read.significanthobbies.com',
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: users,
        session: baSessions,
        account: baAccounts,
        verification: baVerifications,
      },
    }),
    socialProviders:
      googleClientId && googleClientSecret
        ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
        : {},
    plugins: [oneTap()],
    databaseHooks: {
      user: {
        create: {
          after: async (newUser) => {
            await ping('signup', {
              title: newUser.email,
              props: { id: newUser.id, name: newUser.name },
            });
          },
        },
      },
    },
    rateLimit: {
      enabled: false,
    },
  });
}
