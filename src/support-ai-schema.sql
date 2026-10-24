-- One durable, private support memory per registered identity and current server.
CREATE TABLE IF NOT EXISTS support_conversations (
 id SERIAL PRIMARY KEY,
 member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 discord_id TEXT NOT NULL,
 guild_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'ai' CHECK(status IN ('ai','human')),
 ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
 handoff_reason TEXT,
 processing_key TEXT,
 processing_until TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(member_id,discord_id,guild_id)
);
CREATE TABLE IF NOT EXISTS support_messages (
 id BIGSERIAL PRIMARY KEY,
 conversation_id INTEGER NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('user','assistant','staff','system')),
 content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 3000),
 author_name TEXT NOT NULL,
 external_id TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(conversation_id,external_id)
);
CREATE INDEX IF NOT EXISTS support_messages_recent ON support_messages(conversation_id,id DESC);
CREATE INDEX IF NOT EXISTS support_ticket ON support_conversations(ticket_id);
-- Persistent inference budget also covers Discord traffic and multiple workers.
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS inference_window_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS inference_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
