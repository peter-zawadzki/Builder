import { useRef, useState } from 'react';
import { Upload, Loader2, CheckCircle2 } from 'lucide-react';
import { useApi } from '../api/client';
import { fileToBase64 } from '../utils/mountainDocumentsDB';

// Shared upload form for the two entry points into ODIN's document
// knowledge base: regular users (ResourceCenter's FAQ tab, isAdmin=false —
// upload lands 'pending' until an admin approves it) and admins
// (KnowledgeBasePage's Documents tab, isAdmin=true — upload goes live
// immediately). The server (not this prop) is the actual authority on
// which status a given user's upload gets — `isAdmin` here only picks the
// right confirmation copy to show after the fact.
export function DocumentUploadForm({ isAdmin, onUploaded }: { isAdmin: boolean; onUploaded?: () => void }) {
  const api = useApi();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<'pending' | 'live' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    if (!file || !title.trim() || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await fileToBase64(file);
      const r = await api.uploadKnowledgeDocument({ title: title.trim(), dataUrl, fileName: file.name, mimeType: file.type });
      setResult(r.document.status);
      setTitle('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onUploaded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed — please try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.08)] p-4 space-y-3">
      <div>
        <p className="text-[13px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">Upload a document for ODIN</p>
        <p className="text-[11px] text-[#6a7282] mt-0.5">
          A meeting transcript, install-training notes, or a procedure write-up — .txt, .md, .pdf, or .docx.
          {isAdmin ? ' Uploads here go live immediately.' : ' An admin will review it before ODIN can use it.'}
        </p>
      </div>
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Title, e.g. 'Camera Install Training — Aug 2026'"
        className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-2 text-[13px] outline-none"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.pdf,.docx"
        onChange={e => setFile(e.target.files?.[0] ?? null)}
        className="w-full text-[12px] text-[#6a7282]"
      />
      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || !title.trim() || uploading}
        className="flex items-center gap-1.5 bg-[#1D2930] text-white rounded-[8px] px-3 py-2 text-[12px] font-['Inter:Medium',sans-serif] disabled:opacity-40"
      >
        {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        Upload
      </button>
      {result && (
        <p className="flex items-center gap-1.5 text-[12px] text-[#15803d]">
          <CheckCircle2 size={13} />
          {result === 'live'
            ? 'Uploaded and live — ODIN can use it now.'
            : 'Uploaded — an admin will review it before ODIN can use it.'}
        </p>
      )}
      {error && <p className="text-[12px] text-[#ff5c39]">{error}</p>}
    </div>
  );
}
