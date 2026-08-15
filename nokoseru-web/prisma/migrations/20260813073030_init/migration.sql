-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "relation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "occasionHint" TEXT,
    "videoPath" TEXT,
    "audioPath" TEXT,
    "recordedAt" DATETIME,
    "durationSec" REAL,
    "status" TEXT NOT NULL DEFAULT 'uploading',
    "sourcePhotoId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Session_sourcePhotoId_fkey" FOREIGN KEY ("sourcePhotoId") REFERENCES "Photo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Utterance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "startSec" REAL NOT NULL,
    "endSec" REAL NOT NULL,
    "speaker" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "Utterance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startSec" REAL NOT NULL,
    "endSec" REAL NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "era" TEXT,
    "people" JSONB NOT NULL DEFAULT '[]',
    "theme" TEXT,
    "deliverTo" JSONB NOT NULL DEFAULT '[]',
    "occasion" TEXT,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Episode_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Coverage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "occasion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'empty',
    "suggestedQuestions" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Coverage_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "occasion" TEXT NOT NULL,
    "deliveredAt" DATETIME,
    "exportBundlePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Delivery_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" TEXT NOT NULL,
    "originalPath" TEXT NOT NULL,
    "colorizedPath" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Photo_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Coverage_personId_occasion_key" ON "Coverage"("personId", "occasion");
