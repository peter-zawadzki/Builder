import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useData } from '../context/DataContext';
import { ArrowLeft, Printer } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import imgImageYullrLogo from "figma:asset/a398c9c1b81eb62ace77ff4fa0a3dd0b1e238b2f.png";

export function InvoiceViewer() {
  const { mountainId } = useParams<{ mountainId: string }>();
  const navigate = useNavigate();
  const { getMountainById } = useData();
  const printRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const mountain = mountainId ? getMountainById(mountainId) : null;
  const invoice = mountain?.invoice;

  if (!mountain || !invoice) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-[#6a7282] font-['Inter:Regular',sans-serif]">
            {!mountain ? 'Mountain not found' : 'No invoice generated yet'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 text-[#307fe2] font-['Inter:Medium',sans-serif]"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const handlePrint = async () => {
    if (!printRef.current) return;
    setIsPrinting(true);
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'letter');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${invoice.invoiceNumber}.pdf`);
    } catch (err) {
      console.error('Print error:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${m}/${d}/${y}`;
  };

  const formatMoney = (n: number) => {
    return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,0,0.1)] px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/mountains/${mountainId}`)} className="p-1 active:opacity-60">
            <ArrowLeft size={24} className="text-[#0a0a0a]" />
          </button>
          <h1 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[20px] flex-1">
            Invoice {invoice.invoiceNumber}
          </h1>
          <button
            onClick={handlePrint}
            disabled={isPrinting}
            className="p-2 bg-[#ff5c39] rounded-[8px] active:opacity-80 disabled:opacity-50"
            title="Download PDF"
          >
            <Printer size={20} className="text-white" />
          </button>
        </div>
      </div>

      {/* Invoice Content */}
      <div className="p-4">
        <div ref={printRef} className="bg-white rounded-[10px] border border-[rgba(0,0,0,0.1)] p-8 max-w-4xl mx-auto">
          {/* Header with logo */}
          <div className="flex items-start justify-between mb-8">
            <img src={imgImageYullrLogo} alt="Yullr" className="h-20" />
            <div className="text-right">
              <h1 className="text-[#ff5c39] font-['Inter:Bold',sans-serif] font-bold text-[32px]">INVOICE</h1>
              <p className="text-[#ff5c39] font-['Inter:Medium',sans-serif] font-medium text-[18px]">
                {invoice.invoiceNumber}
              </p>
              <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px]">
                {formatDate(invoice.date)}
              </p>
            </div>
          </div>

          {/* Bill To / Payable To */}
          <div className="flex justify-between mb-8">
            <div>
              <h3 className="text-[#0a0a0a] font-['Inter:Bold',sans-serif] font-bold text-[16px] mb-2">
                Bill To:
              </h3>
              <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px]">
                {mountain.legalEntity || mountain.name}
              </p>
              <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px]">
                {mountain.address}
              </p>
            </div>
            <div className="text-right">
              <h3 className="text-[#0a0a0a] font-['Inter:Bold',sans-serif] font-bold text-[16px] mb-2">
                Payable To:
              </h3>
              <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px]">
                YULLR, Inc.
              </p>
              <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px]">
                PO Box 612
              </p>
              <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px]">
                Jackson, NH 03846
              </p>
            </div>
          </div>

          {/* Project Title */}
          <div className="mb-6">
            <h2 className="text-[#ff5c39] font-['Inter:Bold',sans-serif] font-bold text-[20px] mb-1">
              Project Title
            </h2>
            <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[16px]">
              {mountain.name}
            </p>
          </div>

          {/* Line Items Table */}
          <table className="w-full mb-6">
            <thead>
              <tr className="bg-[#ff5c39]">
                <th className="text-left text-white font-['Inter:Bold',sans-serif] font-bold text-[14px] px-4 py-3">
                  Description
                </th>
                <th className="text-right text-white font-['Inter:Bold',sans-serif] font-bold text-[14px] px-4 py-3">
                  Unit Price
                </th>
                <th className="text-right text-white font-['Inter:Bold',sans-serif] font-bold text-[14px] px-4 py-3">
                  Quantity
                </th>
                <th className="text-right text-white font-['Inter:Bold',sans-serif] font-bold text-[14px] px-4 py-3">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((item, idx) => (
                <tr key={idx} className="border-b border-[rgba(0,0,0,0.1)]">
                  <td className="text-left text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] px-4 py-3">
                    {item.description}
                  </td>
                  <td className="text-right text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] px-4 py-3">
                    {formatMoney(item.unitPrice)}
                  </td>
                  <td className="text-right text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] px-4 py-3">
                    {item.quantity}
                  </td>
                  <td className="text-right text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] px-4 py-3">
                    {formatMoney(item.total)}
                  </td>
                </tr>
              ))}
              <tr className="border-b border-[rgba(0,0,0,0.1)]">
                <td colSpan={3} className="text-right text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] px-4 py-3">
                  Subtotal
                </td>
                <td className="text-right text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] px-4 py-3">
                  {formatMoney(invoice.subtotal)}
                </td>
              </tr>
              <tr className="border-b border-[rgba(0,0,0,0.1)]">
                <td colSpan={3} className="text-right text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] px-4 py-3">
                  Invoice 1
                </td>
                <td className="text-right text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] px-4 py-3">
                  {invoice.invoiceNumber1Percent}%
                </td>
              </tr>
              <tr className="border-b-2 border-[#0a0a0a]">
                <td colSpan={3} className="text-right text-[#0a0a0a] font-['Inter:Bold',sans-serif] font-bold text-[16px] px-4 py-3">
                  Balance Due
                </td>
                <td className="text-right text-[#0a0a0a] font-['Inter:Bold',sans-serif] font-bold text-[16px] px-4 py-3">
                  {formatMoney(invoice.balanceDue)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Payment Terms */}
          <div className="mt-8">
            <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] mb-2">
              <strong>Payment Terms:</strong> Payment is due within 30 days from the date of this invoice.
            </p>
            <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] mb-2">
              Please make checks payable to <strong>YULLR, Inc.</strong> or remit payment via ACH transfer to:
            </p>
            <ul className="list-disc list-inside text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] ml-4">
              <li><strong>Account Number:</strong> 709121316</li>
              <li><strong>Bank:</strong> JPMorgan Chase</li>
              <li><strong>Routing Number:</strong> 021000021</li>
            </ul>
            <p className="text-[#0a0a0a] font-['Inter:Regular',sans-serif] text-[14px] mt-4">
              Thank you for your prompt payment and partnership!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
