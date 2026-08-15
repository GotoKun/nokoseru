-- AlterTable
ALTER TABLE "Person" ADD COLUMN "hometown" TEXT;
ALTER TABLE "Person" ADD COLUMN "occupation" TEXT;
ALTER TABLE "Person" ADD COLUMN "hobbies" TEXT;
ALTER TABLE "Person" ADD COLUMN "notes" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "unlockAt" DATETIME;
