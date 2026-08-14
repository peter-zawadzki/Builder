CREATE EXTENSION IF NOT EXISTS vector;

-- One row per uploaded source document (meeting transcript, install-training
-- PDF/DOCX, etc). Admin/super_admin uploads go straight to 'live'; regular
-- users' uploads start 'pending' and are NOT searchable by ODIN until an
-- admin approves them (server/routes/knowledgeDocuments.ts). Distinct from
-- the unrelated FAQ-gap-promotion "knowledge base" in knowledgeBase.ts /
-- faq_entries / odin_interactions (migration 0022) — this is raw source
-- documents, not curated FAQ Q&A pairs.
CREATE TABLE knowledge_documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  original_filename text NOT NULL,
  mime_type         text NOT NULL,
  s3_key            text NOT NULL,
  file_size         bigint,
  uploaded_by       uuid NOT NULL REFERENCES users(id),
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'live', 'rejected')),
  reviewed_by       uuid REFERENCES users(id),
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_knowledge_documents_status ON knowledge_documents (status);

-- Chunks of a document's extracted text, embedded individually so
-- search_documents (faqAgent.ts) can return the specific passage that
-- answers a question rather than a whole transcript. content_hash kept for
-- parity with note_embeddings/embedNote.ts, though v1's reprocessing just
-- deletes and reinserts all of a document's chunks rather than diffing.
CREATE TABLE document_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index   integer NOT NULL,
  content       text NOT NULL,
  content_hash  text NOT NULL,
  embedding     vector(1024) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
-- HNSW directly, not ivfflat — see 0028_note_embeddings_hnsw.sql: ivfflat
-- clusters on whatever data exists at CREATE INDEX time and silently gives
-- wrong/incomplete results on small tables; HNSW builds incrementally with
-- no cold-start problem.
CREATE INDEX idx_document_chunks_vector ON document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_document_chunks_document ON document_chunks (document_id);
