-- ivfflat is an approximate index that clusters based on data present at
-- CREATE INDEX time — with only a handful of rows (as note_embeddings will
-- have for a long time), it clusters so badly that similarity search
-- silently returns wrong/incomplete results (confirmed: a query that should
-- return 2 rows returned 1, with no error). HNSW doesn't have this
-- cold-start problem — it builds incrementally and pgvector recommends it
-- as the default choice regardless of table size.
DROP INDEX IF EXISTS idx_note_embeddings_vector;
CREATE INDEX idx_note_embeddings_vector ON note_embeddings USING hnsw (embedding vector_cosine_ops);
