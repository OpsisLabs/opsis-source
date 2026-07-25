import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { getPrisma } from "./db/prisma.js";

const env = loadEnv();
const prisma = env.DATABASE_URL ? getPrisma() : undefined;
const app = await buildApp(env, prisma);

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
