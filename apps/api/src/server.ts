import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { getPrisma } from "./db/prisma.js";

const env = loadEnv();
const prisma = env.DATABASE_URL ? getPrisma() : undefined;
const app = await buildApp(env, prisma);

try {
  // Railway private networking is dual-stack (and legacy environments are
  // IPv6-only), so bind to every IPv6 interface and accept IPv4-mapped traffic.
  await app.listen({ port: env.PORT, host: "::" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
