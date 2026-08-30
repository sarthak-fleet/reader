export type WorkerEnv = {
  DB: D1Database;
  BETTER_AUTH_SECRET?: string;
  AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_BASE_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH0_ISSUER?: string;
  AUTH0_MCP_AUDIENCE?: string;
  AI_API_KEY?: string;
  AI_BASE_URL?: string;
  AI?: Ai;
  LOCAL_AI_URL?: string;
  CLI_BRIDGE_URL?: string;
  NODE_ENV?: string;
  PDFS_BUCKET: R2Bucket;
  ASSETS: Fetcher;
};
