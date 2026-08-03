-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "seed" BIGINT NOT NULL,
    "arenaId" INTEGER NOT NULL,
    "simVersion" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "wave" INTEGER NOT NULL,
    "steps" INTEGER NOT NULL,
    "replay" BYTEA,
    "replayHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Run_replayHash_key" ON "Run"("replayHash");

-- CreateIndex
CREATE INDEX "Run_score_createdAt_idx" ON "Run"("score" DESC, "createdAt");
