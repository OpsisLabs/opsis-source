ALTER TABLE "PublicSwapHistoryCoverage"
  ADD COLUMN "expectedEventCount" INTEGER,
  ADD COLUMN "contentDigest" TEXT,
  ADD COLUMN "canonicalStatus" "HistoryCanonicalStatus" NOT NULL DEFAULT 'UNKNOWN';
