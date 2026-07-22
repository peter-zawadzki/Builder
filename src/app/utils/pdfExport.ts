import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// Renders a document preview element (marked up with data-pdf-section on each
// section that's OK to start a new PDF page at) into a paginated jsPDF
// instance. Shared by the Proposal and Customer Agreement builders — both
// need "what you see on screen becomes the signed PDF that lands in
// Documents" and there's no reason to keep two copies of this algorithm.
export async function buildPdfFromElement(el: HTMLDivElement): Promise<jsPDF> {
  // Expand container to a fixed width + measure section positions.
  const origStyle = el.style.cssText;
  el.style.maxWidth = 'none';
  el.style.width = '860px';
  el.style.margin = '0';
  el.style.boxShadow = 'none';
  void el.offsetHeight; // force reflow

  const expandedWidth = el.offsetWidth;
  const containerTop = el.getBoundingClientRect().top;
  const sectionEls = Array.from(el.querySelectorAll('[data-pdf-section]')) as HTMLElement[];
  const sectionCssTops = sectionEls.map(s => s.getBoundingClientRect().top - containerTop);

  const fullCanvas = await html2canvas(el, {
    scale: 2,
    useCORS: false,
    allowTaint: false,
    backgroundColor: '#ffffff',
    logging: false,
    imageTimeout: 15000,
  });

  el.style.cssText = origStyle;

  const PDF_W_MM = 210;
  const PDF_H_MM = 297;
  const MARGIN_MM = 14;
  const CONTENT_W_MM = PDF_W_MM - MARGIN_MM * 2;
  const CONTENT_H_MM = PDF_H_MM - MARGIN_MM * 2;

  const cssToCanvas = fullCanvas.width / expandedWidth;
  const pxPerMM = fullCanvas.width / CONTENT_W_MM;
  const contentHeightPx = CONTENT_H_MM * pxPerMM;
  const sectionPxTops = sectionCssTops.map(t => t * cssToCanvas);

  const totalPx = fullCanvas.height;
  const pageStarts: number[] = [0];
  while (true) {
    const last = pageStarts[pageStarts.length - 1];
    const ideal = last + contentHeightPx;
    if (ideal >= totalPx) break;
    const minBreak = last + contentHeightPx * 0.25;
    let bestBreak = ideal;
    for (const st of sectionPxTops) {
      if (st >= minBreak && st <= ideal) bestBreak = st;
    }
    pageStarts.push(Math.round(bestBreak));
  }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  for (let p = 0; p < pageStarts.length; p++) {
    if (p > 0) pdf.addPage();
    const yStart = pageStarts[p];
    const yEnd = p + 1 < pageStarts.length ? pageStarts[p + 1] : totalPx;
    const sliceH = yEnd - yStart;

    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = fullCanvas.width;
    sliceCanvas.height = Math.ceil(sliceH);
    const ctx = sliceCanvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    ctx.drawImage(fullCanvas, 0, yStart, fullCanvas.width, sliceH, 0, 0, fullCanvas.width, sliceH);

    const sliceHeightMM = sliceH / pxPerMM;
    pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.93), 'JPEG', MARGIN_MM, MARGIN_MM, CONTENT_W_MM, sliceHeightMM);
  }

  return pdf;
}

// Saves a generated PDF into this mountain's Documents pane (IndexedDB —
// same store manual uploads use), replacing any earlier auto-save under the
// same fixed id so revisiting a signed document doesn't create duplicates.
export async function savePdfToDocuments(mountainId: string, docId: string, filename: string, pdf: jsPDF) {
  const mountainDocsDB = await import('./mountainDocumentsDB');
  const existing = await mountainDocsDB.getDocuments(mountainId);
  if (existing.some(d => d.id === docId)) return;
  const dataUrl = pdf.output('datauristring');
  const blob = await (await fetch(dataUrl)).blob();
  await mountainDocsDB.saveDocuments(mountainId, [
    ...existing,
    { id: docId, name: filename, type: 'application/pdf', size: blob.size, data: dataUrl, uploadedAt: new Date().toISOString() },
  ]);
}
