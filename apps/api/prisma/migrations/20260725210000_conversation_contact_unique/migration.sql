-- One conversation per (clinic, WhatsApp contact): the inbound webhook upserts
-- on this key, so a CLOSED thread reopens instead of spawning a duplicate.
-- Rollback: DROP INDEX "Conversation_clinicId_waContactPhone_key";

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_clinicId_waContactPhone_key" ON "Conversation"("clinicId", "waContactPhone");
