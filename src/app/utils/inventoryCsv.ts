// CSV export/import for the super-admin Inventory tab (src/app/components/InventoryTab.tsx)
// — lets an admin download the current inventory, bulk-edit it in a
// spreadsheet, and re-upload it (matching existing rows by `id`, creating
// new rows where `id` is blank) instead of editing items one at a time.
import Papa from 'papaparse';
import type { Asset, InventoryCategory, InventoryStatus } from '../context/DataContext';

export const INVENTORY_CSV_COLUMNS = [
  'id', 'yullrInventoryNumber', 'inventoryCategory', 'inventorySubcategory',
  'manufacturer', 'model', 'serialNumber', 'upc', 'vendor', 'cost',
  'assetClass', 'inventoryStatus', 'mountainDeployment', 'dateOfPurchase',
  'dateAddedToInventory', 'deployedDate', 'notes',
] as const;

const CATEGORY_TO_TYPE: Record<InventoryCategory, Asset['type']> = {
  'Server Hardware': 'Server',
  'Network Equipment': 'Network Gear',
  'Cameras': 'Camera',
  'Miscellaneous Items': 'Miscellaneous',
};

export function inventoryAssetsToCsv(assets: Asset[]): string {
  const rows = assets.map(a => ({
    id: a.id,
    yullrInventoryNumber: a.yullrInventoryNumber || '',
    inventoryCategory: a.inventoryCategory || '',
    inventorySubcategory: a.inventorySubcategory || '',
    manufacturer: a.customManufacturer || a.manufacturer || '',
    model: a.customModel || a.model || '',
    serialNumber: a.serialNumber || '',
    upc: a.upc || '',
    vendor: a.vendor || '',
    cost: a.cost != null ? String(a.cost) : '',
    assetClass: a.assetClass || 'Asset',
    inventoryStatus: a.inventoryStatus || '',
    mountainDeployment: a.mountainDeployment || 'Unassigned / Warehouse',
    dateOfPurchase: a.dateOfPurchase || '',
    dateAddedToInventory: a.dateAddedToInventory || '',
    deployedDate: a.deployedDate || '',
    notes: a.notes || '',
  }));
  return Papa.unparse(rows, { columns: INVENTORY_CSV_COLUMNS as unknown as string[] });
}

export interface ParsedInventoryRow {
  id: string; // blank = create new
  patch: Omit<Asset, 'id'>;
  rowNumber: number;
}

export interface InventoryCsvParseResult {
  rows: ParsedInventoryRow[];
  errors: string[];
}

export function parseInventoryCsv(
  csvText: string,
  validCategories: readonly InventoryCategory[],
  mountainNameToId: Map<string, string>,
): InventoryCsvParseResult {
  const { data, errors: parseErrors } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const errors: string[] = parseErrors.map(e => `Row ${e.row != null ? e.row + 2 : '?'}: ${e.message}`);
  const rows: ParsedInventoryRow[] = [];

  data.forEach((raw, i) => {
    const rowNumber = i + 2; // +1 for header row, +1 for 1-indexing
    const category = (raw.inventoryCategory || '').trim() as InventoryCategory;
    if (!category) {
      errors.push(`Row ${rowNumber}: missing inventoryCategory — skipped`);
      return;
    }
    if (!validCategories.includes(category)) {
      errors.push(`Row ${rowNumber}: unknown inventoryCategory "${category}" — skipped`);
      return;
    }

    const mountainDeployment = (raw.mountainDeployment || '').trim() || 'Unassigned / Warehouse';
    const mountainId = mountainNameToId.get(mountainDeployment);
    const manufacturer = (raw.manufacturer || '').trim() || undefined;
    const model = (raw.model || '').trim() || undefined;
    const costRaw = (raw.cost || '').trim();
    const cost = costRaw ? Number(costRaw) : undefined;
    if (costRaw && Number.isNaN(cost)) errors.push(`Row ${rowNumber}: invalid cost "${raw.cost}" — left blank`);

    const patch: Omit<Asset, 'id'> = {
      type: CATEGORY_TO_TYPE[category],
      yullrInventoryNumber: (raw.yullrInventoryNumber || '').trim() || undefined,
      inventoryCategory: category,
      inventorySubcategory: (raw.inventorySubcategory || '').trim() || undefined,
      manufacturer,
      customManufacturer: manufacturer,
      model,
      customModel: model,
      serialNumber: (raw.serialNumber || '').trim() || undefined,
      upc: (raw.upc || '').trim() || undefined,
      vendor: (raw.vendor || '').trim() || undefined,
      cost: costRaw && !Number.isNaN(cost) ? cost : undefined,
      assetClass: raw.assetClass === 'Expense' ? 'Expense' : 'Asset',
      inventoryStatus: ((raw.inventoryStatus || '').trim() || undefined) as InventoryStatus | undefined,
      mountainDeployment,
      mountainId,
      dateOfPurchase: (raw.dateOfPurchase || '').trim() || undefined,
      dateAddedToInventory: (raw.dateAddedToInventory || '').trim() || undefined,
      deployedDate: (raw.deployedDate || '').trim() || undefined,
      notes: (raw.notes || '').trim() || undefined,
    };

    rows.push({ id: (raw.id || '').trim(), patch, rowNumber });
  });

  return { rows, errors };
}

export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
