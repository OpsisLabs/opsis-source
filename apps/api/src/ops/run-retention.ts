import { loadEnv } from "../config/env.js";
import { getPrisma } from "../db/prisma.js";
import { runRetention } from "./retention.js";

const env = loadEnv();
if (!env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
const prisma = getPrisma();

try {
  const result = await runRetention(prisma, env);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await prisma.$disconnect();
}
