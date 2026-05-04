export type SelectableTable = {
  entityType: 'TABLE' | 'ROOM';
  id: string;
  name: string;
  areaId: string;
  areaName: string;
  roomId?: string | null;
  roomName?: string | null;
};

export type ProductOption = {
  id: string;
  sku?: string;
  name: string;
  unit?: string;
  categoryName?: string;
  type?: 'SINGLE' | 'COMBO' | 'TIME';
  price: number;
  timeRateAmount?: number;
  timeRateMinutes?: number;
  stock?: number;
};

export type BillItem = {
  lineId: string;
  orderItemId?: string;
  productId: string;
  productName: string;
  unit?: string;
  baseUnitPrice?: number;
  unitPrice: number;
  quantity: number;
  pricingTypeSnapshot?: 'FIXED' | 'TIME';
  timeRateAmountSnapshot?: number;
  timeRateMinutesSnapshot?: number;
  usedMinutes?: number;
  lineDiscountAmount?: number;
  lineSurchargeAmount?: number;
  lineTotal?: number;
  timerStatus?: 'RUNNING' | 'STOPPED';
  activeSessionStartedAt?: string | null;
  startAt?: string | null;
  stopAt?: string | null;
  note: string;
};

export type DuplicateHandling = 'merge' | 'split';
