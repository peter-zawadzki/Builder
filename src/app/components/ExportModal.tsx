import { useState } from 'react';
import { X, FileText, Table2, Download, Loader2, CheckCircle2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { generatePDF, generateCSV } from '../utils/exportUtils';
import { toast } from 'sonner';

interface ExportModalProps {
  mountainId: string;
  onClose: () => void;
}

type ExportStatus = 'idle' | 'loading' | 'done';

export function ExportModal({ mountainId, onClose }: ExportModalProps) {
  const { getMountainById, getLocationsByMountainId, getAssetsByLocationId, getInspectionsByLocationId, getNotesByMountainId, itemPrices } = useData();
  const [pdfStatus, setPdfStatus] = useState<ExportStatus>('idle');
  const [csvStatus, setCsvStatus] = useState<ExportStatus>('idle');

  const mountain = getMountainById(mountainId);
  if (!mountain) return null;

  const locations = getLocationsByMountainId(mountainId);
  const allAssets = locations.flatMap(l => getAssetsByLocationId(l.id));
  const allInspections = locations.flatMap(l => getInspectionsByLocationId(l.id));
  const notes = getNotesByMountainId(mountainId);

  const handlePDF = async () => {
    if (pdfStatus === 'loading') return;
    setPdfStatus('loading');
    try {
      await generatePDF(mountain, locations, allAssets, notes, itemPrices, allInspections);
      setPdfStatus('done');
      toast.success('PDF exported successfully');
      setTimeout(() => setPdfStatus('idle'), 3000);
    } catch (err) {
      console.error('PDF export error:', err);
      toast.error('Failed to generate PDF');
      setPdfStatus('idle');
    }
  };

  const handleCSV = () => {
    if (csvStatus === 'loading') return;
    setCsvStatus('loading');
    try {
      generateCSV(mountain, locations, allAssets, itemPrices);
      setCsvStatus('done');
      toast.success('CSV exported successfully');
      setTimeout(() => setCsvStatus('idle'), 3000);
    } catch (err) {
      console.error('CSV export error:', err);
      toast.error('Failed to generate CSV');
      setCsvStatus('idle');
    }
  };

  const totalAssets = allAssets.filter(a => a.type !== 'Miscellaneous').length;
  const totalValue = allAssets
    .filter(a => a.type !== 'Miscellaneous')
    .reduce((sum, a) => {
      const model = a.customModel || a.model || '';
      const type = a.type;
      const price = (model && itemPrices[model] !== undefined)
        ? itemPrices[model]
        : (itemPrices[type] || 0);
      return sum + price;
    }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-white rounded-t-[16px] sm:rounded-[16px] px-4 pt-4 pb-8 shadow-xl">
        {/* Handle — mobile bottom-sheet affordance only, not shown when centered */}
        <div className="w-10 h-1 rounded-full bg-[#e0e0e0] mx-auto mb-4 sm:hidden" />

        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[18px]">Export Reports</h2>
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[13px] mt-0.5">{mountain.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-[8px] bg-[#f3f3f5] active:bg-[#e8e8ea]">
            <X size={18} className="text-[#6a7282]" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="bg-[#f9fafb] rounded-[8px] px-3 py-2.5 text-center">
            <p className="text-[20px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{locations.length}</p>
            <p className="text-[11px] text-[#6a7282] font-['Inter:Regular',sans-serif]">Locations</p>
          </div>
          <div className="bg-[#f9fafb] rounded-[8px] px-3 py-2.5 text-center">
            <p className="text-[20px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">{totalAssets}</p>
            <p className="text-[11px] text-[#6a7282] font-['Inter:Regular',sans-serif]">Assets</p>
          </div>
          <div className="bg-[#f9fafb] rounded-[8px] px-3 py-2.5 text-center">
            <p className="text-[16px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">
              {totalValue > 0 ? `$${(totalValue / 1000).toFixed(1)}k` : '—'}
            </p>
            <p className="text-[11px] text-[#6a7282] font-['Inter:Regular',sans-serif]">Est. Value</p>
          </div>
        </div>

        {/* PDF Export */}
        <button
          onClick={handlePDF}
          className="w-full flex items-center gap-4 bg-white border border-[rgba(0,0,0,0.1)] rounded-[12px] p-4 mb-3 active:bg-[#f9fafb] transition-colors"
        >
          <div className="w-11 h-11 rounded-[10px] bg-[#fff0ee] flex items-center justify-center shrink-0">
            {pdfStatus === 'loading' ? (
              <Loader2 size={22} className="text-[#ff5c39] animate-spin" />
            ) : pdfStatus === 'done' ? (
              <CheckCircle2 size={22} className="text-green-500" />
            ) : (
              <FileText size={22} className="text-[#ff5c39]" />
            )}
          </div>
          <div className="flex-1 text-left">
            <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[15px]">Full PDF Report</p>
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px]">
              Mountain info, map with pins, all locations & assets
            </p>
          </div>
          <Download size={18} className="text-[#6a7282] shrink-0" />
        </button>

        {/* CSV Export */}
        <button
          onClick={handleCSV}
          className="w-full flex items-center gap-4 bg-white border border-[rgba(0,0,0,0.1)] rounded-[12px] p-4 active:bg-[#f9fafb] transition-colors"
        >
          <div className="w-11 h-11 rounded-[10px] bg-[#eef3fb] flex items-center justify-center shrink-0">
            {csvStatus === 'loading' ? (
              <Loader2 size={22} className="text-[#307fe2] animate-spin" />
            ) : csvStatus === 'done' ? (
              <CheckCircle2 size={22} className="text-green-500" />
            ) : (
              <Table2 size={22} className="text-[#307fe2]" />
            )}
          </div>
          <div className="flex-1 text-left">
            <p className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] text-[15px]">CSV Asset Data</p>
            <p className="text-[#6a7282] font-['Inter:Regular',sans-serif] text-[12px]">
              All assets with totals by mountain, location & trail
            </p>
          </div>
          <Download size={18} className="text-[#6a7282] shrink-0" />
        </button>

        {totalValue === 0 && (
          <p className="text-center text-[12px] text-[#6a7282] font-['Inter:Regular',sans-serif] mt-3">
            Tip: Set item prices in Catalog to include value totals in reports.
          </p>
        )}
      </div>
    </div>
  );
}
