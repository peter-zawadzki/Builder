// Upload -> (role-conditional review) -> chunk+embed -> ODIN search pipeline
// for arbitrary reference documents (meeting transcripts, install-training
// PDFs/DOCX). Separate from routes/knowledgeBase.ts, which is an unrelated
// feature (promoting logged ODIN question gaps into faq_entries) — this is
// raw source documents feeding server/routes/faqAgent.ts's search_documents
// tool via document_chunks, not curated FAQ Q&A pairs.
import { Hono } from "hono";
import { requireAdmin, type HonoEnv } from "../auth";
import { query, queryOne } from "../db";
import { putObject, deleteObject, decodeDataUrl, extFromMime } from "../s3";
import { processDocumentAsync } from "../knowledge/processDocument";

export const knowledgeDocuments = new Hono<HonoEnv>();

const SUPPORTED_MIME_TYPES = [
  "text/plain",
  "text/markdown",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

knowledgeDocuments.post("/upload", async (c) => {
  const user = c.get("user");
  const { title, dataUrl, fileName, mimeType } = await c.req.json().catch(() => ({}));
  if (!title?.trim() || !dataUrl || !fileName) {
    return c.json({ error: "title, dataUrl, and fileName are required" }, 400);
  }
  const finalMime = mimeType || decodeDataUrl(dataUrl).mime;
  if (!SUPPORTED_MIME_TYPES.includes(finalMime)) {
    return c.json({ error: "Unsupported file type — upload a .txt, .md, .pdf, or .docx file" }, 400);
  }

  const { bytes } = decodeDataUrl(dataUrl);
  const docId = crypto.randomUUID();
  const key = `documents/knowledge/${docId}.${extFromMime(finalMime)}`;
  await putObject(key, bytes, finalMime);

  // Admin/super_admin uploads are trusted to go live immediately; a regular
  // user's upload waits for an admin to approve it (see /:id/approve below)
  // before it's ever chunked/embedded/searchable.
  const status = user.role === "user" ? "pending" : "live";
  const row = await queryOne<{ id: string; status: string }>(
    `INSERT INTO knowledge_documents (id, title, original_filename, mime_type, s3_key, file_size, uploaded_by, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, status`,
    [docId, title.trim(), fileName, finalMime, key, bytes.length, user.id, status]
  );

  if (row!.status === "live") processDocumentAsync(row!.id);
  return c.json({ success: true, document: { id: row!.id, status: row!.status } });
});

knowledgeDocuments.get("/pending", requireAdmin, async (c) => {
  const rows = await query<{
    id: string; title: string; original_filename: string; mime_type: string;
    created_at: string; uploader_name: string | null; uploader_email: string | null;
  }>(
    `SELECT kd.id, kd.title, kd.original_filename, kd.mime_type, kd.created_at,
            u.name AS uploader_name, u.email AS uploader_email
       FROM knowledge_documents kd LEFT JOIN users u ON u.id = kd.uploaded_by
      WHERE kd.status = 'pending' ORDER BY kd.created_at`
  );
  return c.json({
    documents: rows.map((r) => ({
      id: r.id, title: r.title, originalFilename: r.original_filename, mimeType: r.mime_type,
      status: "pending", uploadedByName: r.uploader_name, uploadedByEmail: r.uploader_email,
      chunkCount: 0, createdAt: r.created_at,
    })),
  });
});

knowledgeDocuments.get("/live", requireAdmin, async (c) => {
  const rows = await query<{
    id: string; title: string; original_filename: string; mime_type: string;
    created_at: string; uploader_name: string | null; uploader_email: string | null; chunk_count: string;
  }>(
    `SELECT kd.id, kd.title, kd.original_filename, kd.mime_type, kd.created_at,
            u.name AS uploader_name, u.email AS uploader_email,
            count(dc.id) AS chunk_count
       FROM knowledge_documents kd
       LEFT JOIN users u ON u.id = kd.uploaded_by
       LEFT JOIN document_chunks dc ON dc.document_id = kd.id
      WHERE kd.status = 'live'
      GROUP BY kd.id, u.name, u.email
      ORDER BY kd.created_at DESC`
  );
  return c.json({
    documents: rows.map((r) => ({
      id: r.id, title: r.title, originalFilename: r.original_filename, mimeType: r.mime_type,
      status: "live", uploadedByName: r.uploader_name, uploadedByEmail: r.uploader_email,
      chunkCount: Number(r.chunk_count), createdAt: r.created_at,
    })),
  });
});

knowledgeDocuments.post("/:id/approve", requireAdmin, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const row = await queryOne<{ id: string }>(
    `UPDATE knowledge_documents SET status='live', reviewed_by=$2, reviewed_at=now()
     WHERE id=$1 AND status='pending' RETURNING id`,
    [id, user.id]
  );
  if (!row) return c.json({ error: "Not found or not pending" }, 404);
  processDocumentAsync(id);
  return c.json({ ok: true });
});

knowledgeDocuments.post("/:id/reject", requireAdmin, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const row = await queryOne<{ s3_key: string }>(
    `UPDATE knowledge_documents SET status='rejected', reviewed_by=$2, reviewed_at=now()
     WHERE id=$1 AND status='pending' RETURNING s3_key`,
    [id, user.id]
  );
  if (!row) return c.json({ error: "Not found or not pending" }, 404);
  // A pending doc was never processed, so there are no document_chunks to
  // clean up here — just the S3 object, since a rejected doc never needs
  // re-download.
  await deleteObject(row.s3_key);
  return c.json({ ok: true });
});

knowledgeDocuments.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  // document_chunks cascades via its FK ON DELETE CASCADE.
  const row = await queryOne<{ s3_key: string }>(`DELETE FROM knowledge_documents WHERE id=$1 RETURNING s3_key`, [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  await deleteObject(row.s3_key);
  return c.json({ ok: true });
});
