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
  type?: 'SINGLE' | 'COMBO';
  price: number;
  stock?: number;
};

export type BillItem = {
  lineId: string;
  productId: string;
  productName: string;
  unit?: string;
  baseUnitPrice?: number;
  unitPrice: number;
  quantity: number;
  note: string;
};

export type DuplicateHandling = 'merge' | 'split';
