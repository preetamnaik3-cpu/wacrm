-- Meta may retry webhook deliveries; dedupe inbound rows by WhatsApp message_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_whatsapp_message_id_unique
  ON messages (message_id)
  WHERE message_id IS NOT NULL;
