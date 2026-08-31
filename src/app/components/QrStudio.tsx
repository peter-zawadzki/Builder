import { useState, useRef, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, Download, X, Loader2 } from 'lucide-react';
import { useData } from '../context/DataContext';

const COLOR_PRESETS = [
  { name: 'Black', slug: 'black', hex: '#000000' },
  { name: 'White', slug: 'white', hex: '#ffffff' },
  { name: 'YULLR Orange', slug: 'yullr-orange', hex: '#ff5c39' },
  { name: 'YULLR Bright Blue', slug: 'yullr-bright-blue', hex: '#307fe2' },
  { name: 'YULLR Dark Blue', slug: 'yullr-dark-blue', hex: '#1e293d' },
];

const SIZES = [300, 500, 1000] as const;

function sanitize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildTrackingUrl(mountain: string, medium: string, campaign: string): string {
  const params: string[] = [];
  if (mountain) params.push(`utm_source=${mountain}`);
  if (medium) params.push(`utm_medium=${medium}`);
  if (campaign) params.push(`utm_campaign=${campaign}`);
  return params.length > 0 ? `https://yullr.com/?pricing&${params.join('&')}` : 'https://yullr.com/?pricing';
}

const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
};

export function QrStudioSection() {
  const { mountains } = useData();

  const [mountainQuery, setMountainQuery] = useState('');
  const [mountainOpen, setMountainOpen] = useState(false);
  const [selectedMountainName, setSelectedMountainName] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [medium, setMedium] = useState('');
  const [campaign, setCampaign] = useState('');
  const [colorSlug, setColorSlug] = useState('yullr-orange');
  const [size, setSize] = useState<number>(500);

  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<'png' | 'svg' | null>(null);
  const [preview, setPreview] = useState<{ type: 'png' | 'svg'; url: string; filename: string } | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setMountainOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Revoke the previous preview's blob URL whenever it's replaced or the component unmounts.
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview.url); };
  }, [preview]);

  const filteredMountains = useMemo(() => {
    const named = mountains.filter((m) => !!m.name);
    const q = mountainQuery.trim().toLowerCase();
    if (!q) return named.slice(0, 8);
    return named.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [mountains, mountainQuery]);

  const mountainSlug = sanitize(selectedMountainName);
  const mediumSlug = sanitize(medium);
  const campaignSlug = sanitize(campaign);
  const trackingUrl = buildTrackingUrl(mountainSlug, mediumSlug, campaignSlug);
  const color = COLOR_PRESETS.find((c) => c.slug === colorSlug) ?? COLOR_PRESETS[2];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(trackingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy the URL — copy it manually.');
    }
  };

  const filenameBase = `yullr-qr-${mountainSlug || 'mountain'}-${mediumSlug || 'medium'}-${campaignSlug || 'campaign'}-${color.slug}-${size}`;

  const generate = async (type: 'png' | 'svg') => {
    setError(null);
    setGenerating(type);
    try {
      const qrOpts = {
        errorCorrectionLevel: 'M' as const,
        margin: 2,
        width: size,
        color: { dark: `${color.hex}ff`, light: '#00000000' },
      };
      let blob: Blob;
      if (type === 'png') {
        const dataUrl = await QRCode.toDataURL(trackingUrl, qrOpts);
        blob = await (await fetch(dataUrl)).blob();
      } else {
        const svgString = await QRCode.toString(trackingUrl, { ...qrOpts, type: 'svg' });
        blob = new Blob([svgString], { type: 'image/svg+xml' });
      }
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { type, url: URL.createObjectURL(blob), filename: `${filenameBase}.${type}` };
      });
    } catch (err) {
      console.error('QR generation failed:', err);
      setError('Could not generate the QR code. Please try again.');
    } finally {
      setGenerating(null);
    }
  };

  const handleDownload = () => {
    if (!preview) return;
    const a = document.createElement('a');
    a.href = preview.url;
    a.download = preview.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px] mb-1">QR Studio</h2>
        <p className="text-[#6a7282] text-[13px]">Generate a branded, trackable QR code for a resort campaign.</p>
      </div>

      <div ref={wrapperRef} className="relative">
        <label className="block text-[#6a7282] text-[12px] font-['Inter:Medium',sans-serif] mb-1">Mountain</label>
        <div className="relative">
          <input
            type="text"
            value={selectedMountainName || mountainQuery}
            onChange={(e) => {
              setSelectedMountainName('');
              setMountainQuery(e.target.value);
              setMountainOpen(true);
            }}
            onFocus={() => setMountainOpen(true)}
            placeholder="Search mountains..."
            className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none pr-10"
          />
          {(selectedMountainName || mountainQuery) && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setSelectedMountainName(''); setMountainQuery(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 active:opacity-60"
            >
              <X size={15} className="text-[#6a7282]" />
            </button>
          )}
        </div>
        {mountainOpen && filteredMountains.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-[10px] border border-[rgba(0,0,0,0.12)] shadow-xl overflow-hidden max-h-64 overflow-y-auto">
            {filteredMountains.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSelectedMountainName(m.name);
                  setMountainQuery('');
                  setMountainOpen(false);
                }}
                className={`w-full text-left px-4 py-3 active:bg-[#f3f3f5] text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] ${i < filteredMountains.length - 1 ? 'border-b border-[rgba(0,0,0,0.06)]' : ''}`}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
        {mountainSlug && <p className="text-[#6a7282] text-[11px] mt-1">utm_source: {mountainSlug}</p>}
      </div>

      <div>
        <label className="block text-[#6a7282] text-[12px] font-['Inter:Medium',sans-serif] mb-1">Medium</label>
        <input
          type="text"
          value={medium}
          onChange={(e) => setMedium(e.target.value)}
          placeholder="e.g. email, livestream, social, print"
          className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none"
        />
        {mediumSlug && <p className="text-[#6a7282] text-[11px] mt-1">utm_medium: {mediumSlug}</p>}
      </div>

      <div>
        <label className="block text-[#6a7282] text-[12px] font-['Inter:Medium',sans-serif] mb-1">Campaign</label>
        <input
          type="text"
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          placeholder="e.g. earlybird2025"
          className="w-full bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[15px] outline-none"
        />
        {campaignSlug && <p className="text-[#6a7282] text-[11px] mt-1">utm_campaign: {campaignSlug}</p>}
      </div>

      <div>
        <label className="block text-[#6a7282] text-[12px] font-['Inter:Medium',sans-serif] mb-1">Tracking URL</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={trackingUrl}
            className="flex-1 bg-[#f3f3f5] rounded-[8px] px-3 py-3 text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[13px] outline-none"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 flex items-center gap-1.5 px-3 py-3 rounded-[8px] bg-[#1D2930] text-white text-[13px] font-['Inter:Medium',sans-serif] active:opacity-80"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied' : 'Copy URL'}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-[#6a7282] text-[12px] font-['Inter:Medium',sans-serif] mb-2">QR color</label>
        <div className="flex gap-3">
          {COLOR_PRESETS.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => setColorSlug(c.slug)}
              title={c.name}
              className={`w-9 h-9 rounded-full border-2 ${colorSlug === c.slug ? 'border-[#1D2930]' : 'border-[rgba(0,0,0,0.12)]'}`}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
        <p className="text-[#6a7282] text-[12px] mt-1.5">{color.name}</p>
      </div>

      <div>
        <label className="block text-[#6a7282] text-[12px] font-['Inter:Medium',sans-serif] mb-2">Export size</label>
        <div className="flex gap-2">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={`px-3 py-2 rounded-full text-[13px] font-['Inter:Medium',sans-serif] ${size === s ? 'bg-[#1D2930] text-white' : 'bg-[#f3f3f5] text-[#6a7282]'}`}
            >
              {s}×{s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => generate('png')}
            disabled={generating !== null}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#ff5c39] text-white text-[13px] font-['Inter:Medium',sans-serif] disabled:opacity-60"
          >
            {generating === 'png' && <Loader2 size={15} className="animate-spin" />}
            Generate PNG
          </button>
          <button
            type="button"
            onClick={() => generate('svg')}
            disabled={generating !== null}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#ff5c39] text-white text-[13px] font-['Inter:Medium',sans-serif] disabled:opacity-60"
          >
            {generating === 'svg' && <Loader2 size={15} className="animate-spin" />}
            Generate SVG
          </button>
        </div>
        {error && <p className="text-[#e11d48] text-[12px] mt-2">{error}</p>}
      </div>

      {preview && (
        <div>
          <label className="block text-[#6a7282] text-[12px] font-['Inter:Medium',sans-serif] mb-2">Preview</label>
          <div className="inline-block p-4 rounded-[10px] border border-[rgba(0,0,0,0.12)]" style={CHECKERBOARD_STYLE}>
            <img src={preview.url} alt="QR code preview" width={200} height={200} />
          </div>
          <div>
            <button
              type="button"
              onClick={handleDownload}
              className="mt-3 flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#1D2930] text-white text-[13px] font-['Inter:Medium',sans-serif] active:opacity-80"
            >
              <Download size={15} /> Download {preview.type.toUpperCase()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
