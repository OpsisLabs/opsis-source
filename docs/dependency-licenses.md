# Dependency and image policy

Reviewed: August 12, 2026

The production dependency inventory is enforced by `pnpm licenses:check`.
The script consumes `pnpm licenses list --prod --json` and fails when an
unreviewed license label appears. The reviewed labels are MIT, MIT-0,
Apache-2.0, BSD-3-Clause, ISC, BlueOak-1.0.0, plus GSAP's current Standard
no-charge license labels.

## Direct production families

| Package group | Recorded license |
| --- | --- |
| Fastify and official plugins | MIT |
| Prisma Client and engines | Apache-2.0 |
| React, React DOM, TanStack Query, React Router | MIT |
| Argon2, ioredis, jsonwebtoken, pino, viem, Zod | MIT |
| Nodemailer | MIT-0 |
| prom-client | Apache-2.0 |
| lucide-react | ISC |
| GSAP and `@gsap/react` | GSAP Standard/no-charge license |

GSAP is not described as an OSI permissive license. Its use needs to remain
inside the Standard-license terms and is part of the external commercial/legal
review before public launch. The app also honors reduced-motion preferences and
does not depend on animation for core task completion.

## Automated release controls

- `pnpm audit --prod --audit-level high` blocks known high-severity production
  dependency findings.
- Exact action revisions, frozen pnpm installs, and digest-pinned Node/Nginx base
  images reduce release drift.
- CI builds both production containers, fails on fixed HIGH/CRITICAL Trivy image
  findings, and retains CycloneDX SBOMs for 30 days.
- The production inventory and this policy must be reviewed whenever a direct
  dependency, image base, or license label changes.

The inventory is engineering evidence, not a legal opinion. Required copyright
and license notices must be preserved, and final commercial review remains the
operator's responsibility.
