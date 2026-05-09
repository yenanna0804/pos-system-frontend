import type { Receipt80mmData } from '../../utils/receipt80mmGenerator';

type ReceiptSourceItem = {
  productName?: string;
  unit?: string;
  quantity?: number;
  baseUnitPrice?: number;
  unitPrice?: number;
  lineTotal?: number;
  lineDiscountAmount?: number;
  note?: string;
  pricingTypeSnapshot?: 'FIXED' | 'TIME';
  usedMinutes?: number;
  startAt?: string | null;
  stopAt?: string | null;
  comboItems?: {
    itemName?: string;
    itemUnit?: string;
    quantity?: number;
  }[];
};

type BuildReceipt80mmParams = {
  title: string;
  orderCode?: string;
  datetime?: string;
  customerName?: string | null;
  fullName?: string | null;
  location?: string;
  items: ReceiptSourceItem[];
  subtotal: number;
  discount: number;
  surcharge: number;
  total: number;
};

const toMinutesLabel = (minutesRaw: number) => {
  const minutes = Math.max(0, Math.trunc(Number(minutesRaw || 0)));
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours <= 0) return `${remainMinutes}'`;
  if (remainMinutes === 0) return `${hours}h`;
  return `${hours}h${remainMinutes}'`;
};

const toTimePart = (iso?: string | null) => {
  if (!iso) return '--:--';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '--:--';
  const hh = String(parsed.getHours()).padStart(2, '0');
  const mm = String(parsed.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const buildTimeUsageNote = (item: ReceiptSourceItem) => {
  const usedMinutes = Math.max(0, Math.trunc(Number(item.usedMinutes || 0)));
  const isTimeItem = item.pricingTypeSnapshot === 'TIME';
  const hasTimeEvidence = usedMinutes > 0 || Boolean(item.startAt) || Boolean(item.stopAt);
  if (!isTimeItem && !hasTimeEvidence) return '';
  const lines: string[] = [];
  lines.push(`Tổng thời gian: ${toMinutesLabel(usedMinutes)}`);
  if (item.startAt || item.stopAt) {
    lines.push(`${toTimePart(item.startAt)} -> ${toTimePart(item.stopAt)} (${toMinutesLabel(usedMinutes)})`);
  }
  return lines.join('\n');
};

const buildComboItemsNote = (item: ReceiptSourceItem) => {
  const comboItems = Array.isArray(item.comboItems) ? item.comboItems : [];
  if (comboItems.length === 0) return '';
  const details = comboItems
    .map((comboItem) => {
      const name = (comboItem.itemName || '').trim() || '-';
      const quantity = Math.max(0, Number(comboItem.quantity || 0));
      const unit = (comboItem.itemUnit || '').trim();
      return `${name}: ${quantity} ${unit}`.trim();
    })
    .filter(Boolean)
    .join(', ');
  return details ? `Combo bao gồm: (${details})` : '';
};

export const buildReceipt80mmData = (params: BuildReceipt80mmParams): Receipt80mmData => ({
  title: params.title,
  orderCode: params.orderCode,
  datetime: params.datetime,
  customerName: params.customerName || '-',
  fullName: params.fullName || '-',
  location: params.location || '-',
  items: params.items.map((item) => {
    const note = item.note?.trim();
    const timeUsageNote = buildTimeUsageNote(item);
    const baseUnitPrice = Math.max(0, Number(item.baseUnitPrice ?? item.unitPrice ?? 0));
    const unitPrice = Math.max(0, Number(item.unitPrice ?? 0));
    const discountPercent = baseUnitPrice > 0
      ? Math.max(0, (1 - unitPrice / baseUnitPrice) * 100)
      : 0;
    const comboItemsNote = buildComboItemsNote(item);
    return {
      note: [note ? `* ${note}` : '', timeUsageNote, comboItemsNote].filter(Boolean).join('\n').trim(),
      name: item.productName || '-',
      unit: item.unit || '-',
      quantity: Math.max(0, Math.trunc(Number(item.quantity || 0))),
      unitPrice: Math.max(0, Math.trunc(baseUnitPrice)),
      discount: discountPercent,
      lineTotal: Math.max(0, Math.trunc(Number(item.lineTotal ?? Number(item.quantity || 0) * Number(item.unitPrice || 0)))),
    };
  }),
  subtotal: Math.max(0, Math.trunc(Number(params.subtotal || 0))),
  discount: Math.max(0, Math.trunc(Number(params.discount || 0))),
  surcharge: Math.max(0, Math.trunc(Number(params.surcharge || 0))),
  total: Math.max(0, Math.trunc(Number(params.total || 0))),
});
