import type { FastifyCorsOptions } from "@fastify/cors";
import type { Env } from "../config/env.js";

const OPEN_DATA_PREFIX = "/v1/public/open-data/";

/** Public Open Data is intentionally server-to-server/same-origin. Returning
 * origin:false also prevents @fastify/cors from answering its automatic
 * wildcard OPTIONS route for this prefix. */
export function corsOptionsForRequest(url: string, env: Env): FastifyCorsOptions {
  if (url.startsWith(OPEN_DATA_PREFIX)) {
    return { origin: false, credentials: false, preflight: false };
  }
  return {
    origin: env.NODE_ENV === "production" ? env.APP_ORIGIN : true,
    credentials: true,
  };
}
