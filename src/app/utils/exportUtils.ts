import type { Mountain, Location, Asset, MountainNote, Inspection } from '../context/DataContext';
import logoUrl from 'figma:asset/a398c9c1b81eb62ace77ff4fa0a3dd0b1e238b2f.png';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Sum all priced components for a Server asset (case + processor + GPU + RAM + etc.) */
function getServerPrice(asset: Asset, itemPrices: Record<string, number>): number {
  let total = 0;
  const caseKey = asset.formFactor || 'Tower';
  total += itemPrices[caseKey] ?? 0;
  if (asset.processorModel)  total += itemPrices[asset.processorModel]  ?? 0;
  if (asset.gpuModel)        total += itemPrices[asset.gpuModel]        ?? 0;
  if (asset.ram)             total += itemPrices[asset.ram]             ?? 0;
  if (asset.motherboard)     total += itemPrices[asset.motherboard]     ?? 0;
  if (asset.osDiskSize)      total += itemPrices[asset.osDiskSize]      ?? 0;
  if (asset.captureDiskSize) total += itemPrices[asset.captureDiskSize] ?? 0;
  if (asset.archiveDiskSize) total += itemPrices[asset.archiveDiskSize] ?? 0;
  return total;
}

export function getAssetPrice(asset: Asset, itemPrices: Record<string, number>): number {
  if (asset.type === 'Server') return getServerPrice(asset, itemPrices);
  const model = asset.customModel || asset.model || '';
  const mfg = asset.customManufacturer || asset.manufacturer || '';
  const type = asset.type;
  if (model && itemPrices[model] !== undefined) return itemPrices[model];
  if (mfg && model && itemPrices[`${mfg} ${model}`] !== undefined) return itemPrices[`${mfg} ${model}`];
  if (type && itemPrices[type] !== undefined) return itemPrices[type];
  return 0;
}

function formatCurrency(n: number): string {
  return n === 0 ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

export function generateCSV(
  mountain: Mountain,
  locations: Location[],
  assets: Asset[],
  itemPrices: Record<string, number>
) {
  const rows: string[][] = [];
  rows.push([
    'Mountain', 'Location', 'Trail', 'Asset Type', 'Manufacturer', 'Model',
    'Serial Number', 'IP Address', 'Notes', 'Unit Price', 'Total Value',
  ]);

  let mountainTotal = 0;
  const locationTotals: Record<string, number> = {};
  const trailTotals: Record<string, number> = {};

  for (const loc of locations) {
    const locAssets = assets.filter(a => a.locationId === loc.id && a.type !== 'Miscellaneous');
    for (const asset of locAssets) {
      const price = getAssetPrice(asset, itemPrices);
      mountainTotal += price;
      locationTotals[loc.id] = (locationTotals[loc.id] || 0) + price;
      const trail = loc.trailName || asset.trail || '';
      if (trail) trailTotals[trail] = (trailTotals[trail] || 0) + price;

      rows.push([
        mountain.name,
        loc.name,
        loc.trailName || asset.trail || '',
        asset.type,
        asset.customManufacturer || asset.manufacturer || '',
        asset.customModel || asset.model || '',
        asset.serialNumber || '',
        asset.ipAddress || '',
        asset.notes || '',
        price > 0 ? price.toFixed(2) : '',
        price > 0 ? price.toFixed(2) : '',
      ]);
    }
  }

  rows.push([]);
  rows.push(['--- SUMMARY ---']);
  rows.push([]);
  rows.push(['Mountain Total', '', '', '', '', '', '', '', '', '', `$${mountainTotal.toFixed(2)}`]);
  rows.push([]);
  rows.push(['Location Totals']);
  rows.push(['Location', 'Total Value']);
  for (const loc of locations) {
    rows.push([loc.name, `$${(locationTotals[loc.id] || 0).toFixed(2)}`]);
  }
  rows.push([]);
  if (Object.keys(trailTotals).length > 0) {
    rows.push(['Trail Totals']);
    rows.push(['Trail', 'Total Value']);
    for (const [trail, val] of Object.entries(trailTotals).sort()) {
      rows.push([trail, `$${val.toFixed(2)}`]);
    }
  }

  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = mountain.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  a.download = `${safeName}_assets_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Canvas map — fetches real OSM tiles ──────────────────────────────────────

/**
 * Renders location pins on top of real OpenStreetMap tiles.
 * Tiles are fetched via fetch() then converted to blob URLs so the canvas
 * never becomes "tainted" by cross-origin content.
 */
async function buildMapPng(locations: Location[]): Promise<string> {
  const W = 1040;
  const H = 440;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const locationsWithCoords = locations.filter(l => l.coordinates);

  // ── No-coords fallback ──
  if (locationsWithCoords.length === 0) {
    ctx.fillStyle = '#dce8f4';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#6a7282';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No GPS coordinates recorded', W / 2, H / 2);
    return canvas.toDataURL('image/png');
  }

  // ── Bounds & center ──
  const lats = locationsWithCoords.map(l => l.coordinates!.latitude);
  const lngs = locationsWithCoords.map(l => l.coordinates!.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // ── Pick zoom ──
  const span = Math.max(maxLat - minLat, maxLng - minLng);
  let zoom = 14;
  if (span === 0)       zoom = 15;
  else if (span < 0.005) zoom = 15;
  else if (span < 0.02)  zoom = 14;
  else if (span < 0.05)  zoom = 13;
  else if (span < 0.15)  zoom = 12;
  else if (span < 0.4)   zoom = 11;
  else if (span < 1.2)   zoom = 10;
  else if (span < 3)     zoom = 9;
  else                   zoom = 8;

  const TILE_SIZE = 256;
  const N = Math.pow(2, zoom);

  // Convert lat/lng → fractional tile coordinates
  function toWorld(lat: number, lng: number) {
    const x = (lng + 180) / 360 * N;
    const latRad = lat * Math.PI / 180;
    const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * N;
    return { x, y };
  }

  const centerWorld = toWorld(centerLat, centerLng);
  // Top-left of canvas in fractional tile coords
  const originX = centerWorld.x - W / 2 / TILE_SIZE;
  const originY = centerWorld.y - H / 2 / TILE_SIZE;

  const firstTX = Math.floor(originX);
  const firstTY = Math.floor(originY);
  const lastTX  = Math.floor(originX + W / TILE_SIZE);
  const lastTY  = Math.floor(originY + H / TILE_SIZE);

  // ── Fetch tiles via fetch() to avoid canvas CORS taint ──
  const tilePromises: Promise<void>[] = [];
  for (let tx = firstTX; tx <= lastTX; tx++) {
    for (let ty = firstTY; ty <= lastTY; ty++) {
      if (ty < 0 || ty >= N) continue;
      const wrappedTX = ((tx % N) + N) % N;
      const drawX = Math.round((tx - originX) * TILE_SIZE);
      const drawY = Math.round((ty - originY) * TILE_SIZE);

      const p = fetch(`https://tile.openstreetmap.org/${zoom}/${wrappedTX}/${ty}.png`, {
        headers: { 'User-Agent': 'BUILDER-ReportGenerator/1.0' },
      })
        .then(r => { if (!r.ok) throw new Error(`tile ${r.status}`); return r.blob(); })
        .then(blob => new Promise<void>(resolve => {
          const blobUrl = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => { ctx.drawImage(img, drawX, drawY, TILE_SIZE, TILE_SIZE); URL.revokeObjectURL(blobUrl); resolve(); };
          img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(); };
          img.src = blobUrl;
        }))
        .catch(() => Promise.resolve<void>());

      tilePromises.push(p);
    }
  }

  // Wait for all tiles with a 10-second overall timeout
  await Promise.race([
    Promise.all(tilePromises),
    new Promise<void>(resolve => setTimeout(resolve, 10000)),
  ]);

  // ── Draw pins on top ──
  const pinR = 18;
  locations.forEach((loc, idx) => {
    if (!loc.coordinates) return;
    const wp = toWorld(loc.coordinates.latitude, loc.coordinates.longitude);
    const x = Math.round((wp.x - originX) * TILE_SIZE);
    const y = Math.round((wp.y - originY) * TILE_SIZE);

    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = '#ff5c39';
    ctx.beginPath();
    ctx.arc(x, y, pinR, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, pinR * 0.52, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff5c39';
    ctx.font = `bold ${Math.round(pinR * 0.9)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(idx + 1), x, y + 1);
  });

  return canvas.toDataURL('image/png');
}

function buildLegend(locations: Location[]): string {
  return locations.map((loc, idx) => {
    const hasCoord = !!loc.coordinates;
    const color = hasCoord ? '#ff5c39' : '#6a7282';
    return `<div class="legend-item">
      <svg width="18" height="18" viewBox="0 0 18 18" style="flex-shrink:0;">
        <circle cx="9" cy="9" r="7" fill="${color}"/>
        <circle cx="9" cy="9" r="4.5" fill="white"/>
        <text x="9" y="12.5" text-anchor="middle" font-family="sans-serif" font-size="6" font-weight="bold" fill="${color}">${idx + 1}</text>
      </svg>
      <span>${esc(loc.name)}</span>
    </div>`;
  }).join('');
}

// ─── PDF (browser print-to-PDF) ───────────────────────────────────────────────

export async function generatePDF(
  mountain: Mountain,
  locations: Location[],
  assets: Asset[],
  notes: MountainNote[],
  itemPrices: Record<string, number>,
  inspections: Inspection[] = []
) {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const totalAssets = assets.filter(a => a.type !== 'Miscellaneous').length;
  const totalValue = assets.filter(a => a.type !== 'Miscellaneous').reduce((s, a) => s + getAssetPrice(a, itemPrices), 0);

  // Build map as PNG via Canvas with real OSM tiles
  const mapPngDataUri = await buildMapPng(locations);
  const legendHtml = buildLegend(locations);
  const allContacts = mountain.additionalContacts?.filter(c => c.name) || [];

  // Location detail sections
  const locationSections = locations.map((loc, idx) => {
    const locAssets = assets.filter(a => a.locationId === loc.id && a.type !== 'Miscellaneous');
    const locTotal = locAssets.reduce((s, a) => s + getAssetPrice(a, itemPrices), 0);
    const inspection = inspections
      .filter(i => i.locationId === loc.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    const assetRows = locAssets.map(a => {
      const price = getAssetPrice(a, itemPrices);
      return `<tr>
        <td>${esc(a.type)}</td>
        <td>${esc(a.customManufacturer || a.manufacturer || '—')}</td>
        <td>${esc(a.customModel || a.model || '—')}</td>
        <td>${esc(a.serialNumber || '—')}</td>
        <td>${esc(a.ipAddress || '—')}</td>
        <td class="right">${price > 0 ? formatCurrency(price) : '—'}</td>
      </tr>`;
    }).join('');

    const assetTable = locAssets.length > 0 ? `
      <h4>Installed Assets</h4>
      <table>
        <thead><tr><th>Type</th><th>Manufacturer</th><th>Model</th><th>Serial #</th><th>IP Address</th><th>Unit Value</th></tr></thead>
        <tbody>${assetRows}</tbody>
        ${locTotal > 0 ? `<tfoot><tr><td colspan="5" class="right bold">Location Total:</td><td class="right bold">${formatCurrency(locTotal)}</td></tr></tfoot>` : ''}
      </table>` : `<p class="muted">No installed assets</p>`;

    const inspRows = inspection?.items.map(item => {
      return `<tr>
        <td>${esc(item.type)}</td>
        <td class="center">${item.count}</td>
      </tr>`;
    }).join('') || '';

    const inspTable = inspection && inspection.items.length > 0 ? `
      <h4>Inspection Items</h4>
      <table>
        <thead><tr><th>Item</th><th>Qty</th></tr></thead>
        <tbody>${inspRows}</tbody>
      </table>
      ${inspection.notes ? `<p class="muted small">Notes: ${esc(inspection.notes)}</p>` : ''}` : '';

    const metaItems = [];
    if (loc.trailName) metaItems.push(`Trail: ${esc(loc.trailName)}`);
    if (loc.difficulty) metaItems.push(`Difficulty: ${loc.difficulty}/5`);
    if (loc.coordinates) metaItems.push(`GPS: ${loc.coordinates.latitude.toFixed(5)}, ${loc.coordinates.longitude.toFixed(5)}`);
    if (loc.notes) metaItems.push(`Notes: ${esc(loc.notes)}`);

    return `
      <div class="location-block">
        <div class="loc-header">
          <div class="loc-num">${idx + 1}</div>
          <div class="loc-title">
            <strong>${esc(loc.name)}</strong>
            ${metaItems.length ? `<span class="loc-meta">${metaItems.join(' &nbsp;·&nbsp; ')}</span>` : ''}
          </div>
        </div>
        ${assetTable}
        ${inspTable}
      </div>`;
  }).join('');

  // Contacts table
  const contactRows = allContacts.map(c => `<tr>
    <td>${esc(c.name)}</td>
    <td>${esc(c.title || '')}</td>
    <td>${esc(c.role || '')}</td>
    <td>${esc(c.email || '')}</td>
    <td>${esc(c.phone || '')}</td>
  </tr>`).join('');

  const contactsSection = allContacts.length > 0 ? `
    <div class="section">
      <div class="section-header">Contacts</div>
      <table>
        <thead><tr><th>Name</th><th>Title</th><th>Role</th><th>Email</th><th>Phone</th></tr></thead>
        <tbody>${contactRows}</tbody>
      </table>
    </div>` : '';

  // Notes section
  const notesSection = notes.length > 0 ? `
    <div class="section">
      <div class="section-header">Notes</div>
      ${notes.map(n => `
        <div class="note-item">
          <span class="note-date">${new Date(n.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <p>${esc(n.text)}</p>
        </div>`).join('')}
    </div>` : '';

  const infoRows = [
    ['Address', mountain.address],
    ['Phone', mountain.phone],
    ['Email', mountain.email],
    ['Website', mountain.website],
    ['IP Subnet', mountain.ipSubnet || ''],
    ['Parent Organization', mountain.parentOrganization || ''],
    ['Legal Entity', mountain.legalEntity || ''],
    ['Billing Address', mountain.billingAddress || ''],
  ].filter(([, v]) => v);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(mountain.name)} — BUILDER Report</title>
  <style>
    @media print { @page { margin: 14mm 12mm; } }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10pt; color: #0a0a0a; background: white; }

    /* ── Cover header ── */
    .cover-header {
      background: #0f1e37;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .cover-header .header-left { flex: 1; min-width: 0; }
    .cover-header .mountain-name {
      font-size: 20pt;
      font-weight: 700;
      color: white;
      letter-spacing: -0.5px;
      line-height: 1.15;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cover-header .sub { font-size: 8pt; color: #90b4e8; margin-top: 3px; }
    .cover-header .yullr-logo {
      height: 34px;
      width: auto;
      object-fit: contain;
      flex-shrink: 0;
      filter: brightness(0) invert(1);
      opacity: 0.92;
    }

    /* Info grid */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; margin-bottom: 12px; }
    .info-cell { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; }
    .info-cell:last-child, .info-cell:nth-last-child(2):nth-child(odd) { border-bottom: none; }
    .info-label { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; color: #6a7282; letter-spacing: 0.5px; margin-bottom: 2px; }
    .info-value { font-size: 9.5pt; color: #0a0a0a; }

    /* Sections */
    .section { margin-bottom: 16px; }
    .section-header { background: #307fe2; color: white; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 5px 10px; border-radius: 4px 4px 0 0; }

    /* Summary */
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
    .summary-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; text-align: center; }
    .summary-card .big { font-size: 18pt; font-weight: 700; color: #0a0a0a; line-height: 1; }
    .summary-card .label { font-size: 7pt; color: #6a7282; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.5px; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-top: 4px; }
    thead tr { background: #f3f3f5; }
    th { font-weight: 700; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.4px; padding: 5px 7px; text-align: left; color: #6a7282; border-bottom: 1px solid #e5e7eb; }
    td { padding: 5px 7px; border-bottom: 1px solid #f0f0f0; color: #0a0a0a; vertical-align: top; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    tfoot td { background: #f3f3f5; border-top: 1px solid #e5e7eb; font-weight: 600; }
    .right { text-align: right; }
    .center { text-align: center; }
    .bold { font-weight: 700; }

    /* Map */
    .map-container { margin-bottom: 8px; }
    .map-container img { width: 100%; height: auto; border-radius: 6px; display: block; }
    .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 8px; }
    .legend-item { display: flex; align-items: center; gap: 5px; font-size: 8pt; }

    /* Location blocks */
    .location-block { border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 12px; overflow: hidden; page-break-inside: avoid; }
    .loc-header { display: flex; align-items: flex-start; gap: 0; background: #1e3a5f; color: white; }
    .loc-num { background: #ff5c39; color: white; width: 34px; min-height: 34px; display: flex; align-items: center; justify-content: center; font-size: 13pt; font-weight: 700; flex-shrink: 0; }
    .loc-title { padding: 7px 10px; flex: 1; }
    .loc-title strong { font-size: 10.5pt; }
    .loc-meta { display: block; font-size: 7.5pt; color: #90b4e8; margin-top: 2px; }
    .location-block h4 { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; color: #6a7282; margin: 8px 10px 4px; font-weight: 700; }
    .location-block table, .location-block p.muted { margin: 4px 10px 8px; width: calc(100% - 20px); }

    /* Notes */
    .note-item { border-bottom: 1px solid #f0f0f0; padding: 8px 10px; }
    .note-item:last-child { border-bottom: none; }
    .note-date { font-size: 7pt; color: #6a7282; text-transform: uppercase; letter-spacing: 0.4px; }
    .note-item p { font-size: 9pt; margin-top: 3px; }

    .muted { color: #6a7282; font-size: 8.5pt; font-style: italic; }
    .small { font-size: 7.5pt; }
    .page-content { padding: 14px 16px; }

    .section { page-break-inside: avoid; }
    .print-btn { position: fixed; bottom: 20px; right: 20px; background: #307fe2; color: white; border: none; padding: 12px 22px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(48,127,226,0.4); z-index: 1000; }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>

<button class="print-btn" onclick="window.print()">⬇ Print / Save PDF</button>

<!-- ── Header: mountain name left, Yullr logo right ── -->
<div class="cover-header">
  <div class="header-left">
    <div class="mountain-name">${esc(mountain.name)}</div>
    <div class="sub">Installation Report &nbsp;·&nbsp; Generated: ${date}</div>
  </div>
  <img src="${logoUrl}" alt="Yullr" class="yullr-logo" />
</div>

<div class="page-content">

  <!-- Mountain Info -->
  <div class="section" style="margin-top:14px;">
    <div class="section-header">Mountain Information</div>
    <div class="info-grid" style="border-top:none; border-radius: 0 0 6px 6px;">
      ${infoRows.map(([l, v]) => `<div class="info-cell"><div class="info-label">${esc(l)}</div><div class="info-value">${esc(v)}</div></div>`).join('')}
    </div>
  </div>

  ${contactsSection}

  <!-- Summary -->
  <div class="section">
    <div class="section-header">Summary</div>
    <div class="summary-grid" style="margin-top:8px;">
      <div class="summary-card"><div class="big">${locations.length}</div><div class="label">Locations</div></div>
      <div class="summary-card"><div class="big">${totalAssets}</div><div class="label">Installed Assets</div></div>
      <div class="summary-card"><div class="big" style="font-size:${totalValue > 0 ? '13' : '18'}pt;">${totalValue > 0 ? formatCurrency(totalValue) : '—'}</div><div class="label">Est. Total Value</div></div>
    </div>
  </div>

  <!-- Map (Canvas-rendered PNG) -->
  <div class="section">
    <div class="section-header">Location Map</div>
    <div style="margin-top:8px;" class="map-container">
      <img src="${mapPngDataUri}" alt="Location map" />
    </div>
    <div class="legend">${legendHtml}</div>
  </div>

  <!-- Locations -->
  <div class="section">
    <div class="section-header" style="margin-bottom:8px;">Location Details</div>
    ${locationSections}
  </div>

  ${notesSection}

</div>

<script>
  // Leave print to user — click the floating button
</script>
</body>
</html>`;

  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert('Please allow popups for this site to generate the PDF report.');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
}