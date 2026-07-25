CREATE TABLE "UsageAggregate" (
    "userId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "eventType" "UsageEventType" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageAggregate_pkey" PRIMARY KEY ("userId", "month", "eventType")
);

CREATE INDEX "UsageAggregate_month_idx" ON "UsageAggregate"("month");

ALTER TABLE "UsageAggregate" ADD CONSTRAINT "UsageAggregate_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
