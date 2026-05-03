import { useEffect, useMemo, useRef, useState } from 'react';
import type { BillItem, DuplicateHandling, ProductOption } from '../types';

const generateLineId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

export function useOrderEditor(initialBillItems: BillItem[]) {
  const [billItems, setBillItems] = useState<BillItem[]>(initialBillItems);
  const initialItemsRef = useRef<BillItem[]>(initialBillItems);
  const initialItemsSignature = useMemo(
    () => JSON.stringify((initialBillItems || []).map((item) => ({
      lineId: item.lineId,
      productId: item.productId,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      usedMinutes: item.usedMinutes,
      lineDiscountAmount: item.lineDiscountAmount,
      lineSurchargeAmount: item.lineSurchargeAmount,
      timerStatus: item.timerStatus,
      activeSessionStartedAt: item.activeSessionStartedAt,
      startAt: item.startAt,
      stopAt: item.stopAt,
      note: item.note,
    }))),
    [initialBillItems],
  );

  useEffect(() => {
    setBillItems(initialBillItems);
    initialItemsRef.current = initialBillItems;
  }, [initialItemsSignature]);

  const addProductToBill = (product: ProductOption, duplicateHandling: DuplicateHandling) => {
    setBillItems((prev) => {
      if (product.type !== 'TIME' && duplicateHandling === 'merge') {
        const mergeIndex = prev.findIndex(
          (line) => line.productId === product.id && line.unitPrice === product.price && line.note.trim() === '',
        );

        if (mergeIndex >= 0) {
          const next = [...prev];
          next[mergeIndex] = {
            ...next[mergeIndex],
            quantity: next[mergeIndex].quantity + 1,
          };
          return next;
        }
      }

      const newLine: BillItem = {
        lineId: generateLineId(),
        productId: product.id,
        productName: product.name,
        unit: product.type === 'TIME' ? undefined : product.unit,
        baseUnitPrice: product.type === 'TIME' ? Math.trunc(Number(product.timeRateAmount || product.price || 0)) : product.price,
        unitPrice: product.type === 'TIME' ? Math.trunc(Number(product.timeRateAmount || product.price || 0)) : product.price,
        quantity: 1,
        pricingTypeSnapshot: product.type === 'TIME' ? 'TIME' : 'FIXED',
        timeRateAmountSnapshot: product.type === 'TIME' ? Math.trunc(Number(product.timeRateAmount || product.price || 0)) : undefined,
        timeRateMinutesSnapshot: product.type === 'TIME' ? Math.max(1, Math.trunc(Number(product.timeRateMinutes || 1))) : undefined,
        usedMinutes: product.type === 'TIME' ? 0 : undefined,
        lineTotal: product.type === 'TIME' ? 0 : undefined,
        timerStatus: product.type === 'TIME' ? undefined : undefined,
        note: '',
      };
      return [...prev, newLine];
    });
  };

  const billItemsPatch = useMemo(() => {
    const initialById = new Map(initialItemsRef.current.map((item) => [item.lineId, item]));
    const currentById = new Map(billItems.map((item) => [item.lineId, item]));

    const addedItems = billItems.filter((item) => !initialById.has(item.lineId));
    const removedItemIds = initialItemsRef.current.filter((item) => !currentById.has(item.lineId)).map((item) => item.lineId);
    const updatedItems = billItems
      .filter((item) => initialById.has(item.lineId))
      .map((item) => {
        const initialItem = initialById.get(item.lineId)!;
        const changed: Partial<BillItem> & { lineId: string } = { lineId: item.lineId };
        if (item.productId !== initialItem.productId) changed.productId = item.productId;
        if (item.productName !== initialItem.productName) changed.productName = item.productName;
        if ((item.unit || '') !== (initialItem.unit || '')) changed.unit = item.unit;
        if (Number(item.baseUnitPrice || 0) !== Number(initialItem.baseUnitPrice || 0)) changed.baseUnitPrice = item.baseUnitPrice;
        if (Number(item.unitPrice || 0) !== Number(initialItem.unitPrice || 0)) changed.unitPrice = item.unitPrice;
        if (Number(item.quantity || 0) !== Number(initialItem.quantity || 0)) changed.quantity = item.quantity;
        if ((item.note || '') !== (initialItem.note || '')) changed.note = item.note;
        if ((item.pricingTypeSnapshot || 'FIXED') !== (initialItem.pricingTypeSnapshot || 'FIXED')) changed.pricingTypeSnapshot = item.pricingTypeSnapshot;
        if (Number(item.usedMinutes || 0) !== Number(initialItem.usedMinutes || 0)) changed.usedMinutes = item.usedMinutes;
        if (Number(item.lineDiscountAmount || 0) !== Number(initialItem.lineDiscountAmount || 0)) changed.lineDiscountAmount = item.lineDiscountAmount;
        if (Number(item.lineSurchargeAmount || 0) !== Number(initialItem.lineSurchargeAmount || 0)) changed.lineSurchargeAmount = item.lineSurchargeAmount;
        if ((item.startAt || null) !== (initialItem.startAt || null)) changed.startAt = item.startAt || null;
        if ((item.stopAt || null) !== (initialItem.stopAt || null)) changed.stopAt = item.stopAt || null;
        return changed;
      })
      .filter((item) => Object.keys(item).length > 1);

    return {
      addedItems,
      updatedItems,
      removedItemIds,
      hasChanges: addedItems.length > 0 || updatedItems.length > 0 || removedItemIds.length > 0,
    };
  }, [billItems]);

  return {
    billItems,
    setBillItems,
    addProductToBill,
    billItemsPatch,
  };
}
