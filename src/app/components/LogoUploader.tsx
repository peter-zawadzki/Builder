import { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { compressImage } from '../utils/imageCompression';

// Small logo picker shared by Team/Organization/Mountain forms. Stores a
// compressed base64 data URL directly on the record (small enough that it
// doesn't need its own IndexedDB store like asset/inspection photos do).
export function LogoUploader({
  value, onChange, label = 'Logo',
}: {
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  label?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const compressed = await compressImage(dataUrl, 480, 0.9);
      onChange(compressed);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <label className="block text-[12px] font-['Inter:Medium',sans-serif] text-[#6a7282] mb-1.5 uppercase tracking-wide">{label}</label>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-[10px] bg-[#f3f3f5] border border-[rgba(0,0,0,0.08)] flex items-center justify-center overflow-hidden shrink-0">
          {value ? <img src={value} alt="Logo" className="w-full h-full object-contain" /> : <ImageIcon size={20} className="text-[#c0c4cc]" />}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 bg-[#f3f3f5] text-[#0a0a0a] rounded-[8px] px-3 py-2 text-[13px] font-['Inter:Medium',sans-serif] active:bg-[#e8e8ea] disabled:opacity-50"
          >
            <Upload size={14} /> {uploading ? 'Uploading…' : value ? 'Replace' : 'Upload'}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="flex items-center gap-1.5 bg-[#fff0ee] text-[#F95C39] rounded-[8px] px-3 py-2 text-[13px] font-['Inter:Medium',sans-serif] active:bg-[#ffe0da]"
            >
              <X size={14} /> Remove
            </button>
          )}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}
