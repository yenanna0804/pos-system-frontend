const VN_OFFSET = '+07:00';

export const toISOWithVNOffset = (datePart: string, timePart: string, endOfMinute = false): string => {
  const seconds = endOfMinute ? '59' : '00';
  return `${datePart}T${timePart}:${seconds}${VN_OFFSET}`;
};

export const formatDateTimeVN = (iso: string | null | undefined): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
};

export const toMoney = (value: unknown): number => Math.max(0, Math.trunc(Number(value) || 0));

export const formatNumberVi = (value: number): string => Math.trunc(Number(value || 0)).toLocaleString('vi-VN');

export const formatThousands = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('vi-VN');
};

export const formatUnitPriceDisplay = (price: number, pricingType?: 'FIXED' | 'TIME', rateMinutes?: number): string => {
  const normalizedPrice = Math.max(0, Math.trunc(Number(price || 0))).toLocaleString('vi-VN');
  if (pricingType !== 'TIME') return normalizedPrice;
  const minutes = Math.max(1, Math.trunc(Number(rateMinutes || 0)));
  return `${normalizedPrice} / ${minutes} phút`;
};

export type OrderState = 'DRAFT' | 'PAID' | 'DELETED' | 'PARTIAL' | 'UNPAID';
export type PaymentMethod = 'CASH' | 'BANKING';

export const ORDER_STATE_LABEL: Record<OrderState, string> = {
  DRAFT: 'Nháp',
  PAID: 'Đã thanh toán',
  DELETED: 'Đã xóa',
  PARTIAL: 'Nợ',
  UNPAID: 'Chưa thanh toán',
};

export const ORDER_STATE_CLASS: Record<OrderState, string> = {
  DRAFT: 'orders-status-tag is-draft',
  PAID: 'orders-status-tag is-paid',
  DELETED: 'orders-status-tag is-deleted',
  PARTIAL: 'orders-status-tag is-partial',
  UNPAID: 'orders-status-tag is-unpaid',
};

export const paymentMethodLabel = (method?: PaymentMethod | null): string => {
  if (method === 'BANKING') return 'Chuyển khoản';
  if (method === 'CASH') return 'Tiền mặt';
  return '-';
};

export const toDateTimeInputValue = (value: Date): string => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  const h = String(value.getHours()).padStart(2, '0');
  const min = String(value.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
};

export const splitDateTimeParts = (value: string): { datePart: string; timePart: string } => {
  const [datePart, timePart] = value.split('T');
  const [hourPart = '00', minutePart = '00'] = (timePart || '00:00').split(':');
  return { datePart, timePart: `${hourPart}:${minutePart}` };
};

export const toDateFromParts = (datePart: string, timePart: string): Date => {
  const parsed = new Date(`${datePart}T${timePart}:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

export const API_ASSET_ORIGIN = import.meta.env.VITE_API_ASSET_ORIGIN || import.meta.env.VITE_API_PROXY_TARGET || '';

export const resolveImageUrl = (url?: string): string => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return API_ASSET_ORIGIN ? `${API_ASSET_ORIGIN}${url}` : url;
  return url;
};
