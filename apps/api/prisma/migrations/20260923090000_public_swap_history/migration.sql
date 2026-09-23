CREATE TYPE "HistoryCanonicalStatus" AS ENUM ('UNKNOWN', 'CANONICAL', 'ORPHANED');
CREATE TYPE "HistoryCoverageStatus" AS ENUM ('COMPLETE', 'EMPTY', 'PARTIAL', 'GAP', 'UNAVAILABLE');

CREATE TABLE "PublicSwapObservation" (
  "id" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "poolAddress" TEXT NOT NULL,
  "blockNumber" BIGINT NOT NULL,
  "blockHash" TEXT NOT NULL,
  "transactionHash" TEXT NOT NULL,
  "logIndex" INTEGER NOT NULL,
  "blockTimestamp" TIMESTAMP(3) NOT NULL,
  "amount0" DECIMAL(78,0) NOT NULL,
  "amount1" DECIMAL(78,0) NOT NULL,
  "sqrtPriceX96" DECIMAL(78,0) NOT NULL,
  "liquidity" DECIMAL(78,0) NOT NULL,
  "tick" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "canonicalStatus" "HistoryCanonicalStatus" NOT NULL DEFAULT 'UNKNOWN',
  "retentionExpiresAt" TIMESTAMP(3),
  CONSTRAINT "PublicSwapObservation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PublicSwapObservation_event_key" ON "PublicSwapObservation"("chainId", "poolAddress", "blockHash", "transactionHash", "logIndex");
CREATE INDEX "PublicSwapObservation_chainId_poolAddress_blockNumber_idx" ON "PublicSwapObservation"("chainId", "poolAddress", "blockNumber");
CREATE INDEX "PublicSwapObservation_canonicalStatus_blockNumber_idx" ON "PublicSwapObservation"("canonicalStatus", "blockNumber");
CREATE INDEX "PublicSwapObservation_retentionExpiresAt_idx" ON "PublicSwapObservation"("retentionExpiresAt");

CREATE TABLE "PublicSwapHistoryCoverage" (
  "id" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "poolAddress" TEXT NOT NULL,
  "fromBlock" BIGINT NOT NULL,
  "toBlock" BIGINT NOT NULL,
  "blockHash" TEXT,
  "source" TEXT NOT NULL,
  "status" "HistoryCoverageStatus" NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "detail" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retentionExpiresAt" TIMESTAMP(3),
  CONSTRAINT "PublicSwapHistoryCoverage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublicSwapHistoryCoverage_range_check" CHECK ("fromBlock" >= 0 AND "toBlock" >= "fromBlock")
);
CREATE UNIQUE INDEX "PublicSwapHistoryCoverage_range_key" ON "PublicSwapHistoryCoverage"("chainId", "poolAddress", "fromBlock", "toBlock", "source", "revision");
CREATE INDEX "PublicSwapHistoryCoverage_chainId_poolAddress_fromBlock_toB_idx" ON "PublicSwapHistoryCoverage"("chainId", "poolAddress", "fromBlock", "toBlock");
CREATE INDEX "PublicSwapHistoryCoverage_status_observedAt_idx" ON "PublicSwapHistoryCoverage"("status", "observedAt");
CREATE INDEX "PublicSwapHistoryCoverage_retentionExpiresAt_idx" ON "PublicSwapHistoryCoverage"("retentionExpiresAt");
