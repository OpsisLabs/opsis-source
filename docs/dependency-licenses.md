# Dependency License Inventory

Date: July 10, 2026

The production dependency tree was inventoried with:

```bash
pnpm licenses list --prod --json
```

## Direct Production Dependencies

| Package group | License |
| --- | --- |
| Fastify and official Fastify plugins | MIT |
| Prisma Client and engines | Apache-2.0 |
| React and React DOM | MIT |
| TanStack Query and React Router | MIT |
| Argon2, ioredis, jsonwebtoken, pino, viem, and Zod | MIT |
| Nodemailer | MIT-0 |
| prom-client | Apache-2.0 |
| lucide-react | ISC |

## Transitive License Families

The generated production inventory contains MIT, MIT-0, Apache-2.0, BSD-3-Clause, ISC, and BlueOak-1.0.0 packages. No GPL, AGPL, LGPL, SSPL, or other reciprocal/copy-left license was reported by pnpm.

The inventory must be regenerated after dependency changes. Production distribution should preserve required copyright and license notices, and final commercial review remains the operator's responsibility.
