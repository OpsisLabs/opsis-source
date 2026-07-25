-- Wallet sign-in: a user is identified by either an email or a wallet address,
-- so both credential columns become optional.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "User" ADD COLUMN "walletAddress" TEXT;
ALTER TABLE "User" ADD COLUMN "username" TEXT;

CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- An account must be reachable by one credential or the other.
ALTER TABLE "User" ADD CONSTRAINT "User_credential_present"
  CHECK ("email" IS NOT NULL OR "walletAddress" IS NOT NULL);
