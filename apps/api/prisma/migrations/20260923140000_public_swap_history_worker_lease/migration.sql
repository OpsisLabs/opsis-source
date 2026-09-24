CREATE TABLE "PublicSwapHistoryWorkerLease" (
  "id" TEXT NOT NULL,
  "ownerToken" TEXT,
  "expiresAt" TIMESTAMPTZ(3),
  CONSTRAINT "PublicSwapHistoryWorkerLease_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublicSwapHistoryWorkerLease_owner_expiry_check"
    CHECK (("ownerToken" IS NULL) = ("expiresAt" IS NULL))
);

INSERT INTO "PublicSwapHistoryWorkerLease" ("id", "ownerToken", "expiresAt")
VALUES ('public-swap-capture-worker:4663', NULL, NULL);
