CREATE TABLE "GuestCheckoutChallenge" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "tokenHash" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuestCheckoutChallenge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuestCheckoutChallenge_tokenHash_key" ON "GuestCheckoutChallenge"("tokenHash");
CREATE INDEX "GuestCheckoutChallenge_email_createdAt_idx" ON "GuestCheckoutChallenge"("email", "createdAt");
CREATE INDEX "GuestCheckoutChallenge_userId_tokenExpiresAt_idx" ON "GuestCheckoutChallenge"("userId", "tokenExpiresAt");
ALTER TABLE "GuestCheckoutChallenge" ADD CONSTRAINT "GuestCheckoutChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
