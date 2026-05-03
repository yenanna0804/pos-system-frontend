import { useMemo } from 'react';
import type { BillItem } from '../types';
import { orderFeatureFlags } from '../orderFeatureFlags';

export type AdjustmentMode = 'percent' | 'amount';

export const toAmountNumber = (value: string) => {
  const numeric = Number(value.replace(/\D/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
};

export const toPercentNumber = (value: string) => {
  const numeric = Number(value.trim().replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : 0;
};

export const getLineAmount = (item: BillItem) => {
  if (item.lineTotal != null) {
    return Math.max(0, Math.trunc(Number(item.lineTotal) || 0));
  }

  if (item.pricingTypeSnapshot === 'TIME') {
    const usedMinutes = Math.max(0, Math.trunc(Number(item.usedMinutes || 0)));
    const rateMinutes = Math.max(1, Math.trunc(Number(item.timeRateMinutesSnapshot || 1)));
    const unitPrice = Math.max(0, Math.trunc(Number(item.unitPrice || 0)));
    const computedAmount = Math.floor((unitPrice * usedMinutes) / rateMinutes);

    if (orderFeatureFlags.telemetryTimeMismatch && item.lineTotal != null) {
      const sourceAmount = Math.max(0, Math.trunc(Number(item.lineTotal) || 0));
      if (Math.abs(sourceAmount - computedAmount) > 1) {
        console.warn('[orders][time-mismatch]', {
          lineId: item.lineId,
          sourceAmount,
          computedAmount,
          usedMinutes,
          rateMinutes,
          unitPrice,
        });
      }
    }

    return computedAmount;
  }
  return Math.max(0, Math.trunc(Number(item.unitPrice || 0))) * Math.max(0, Math.trunc(Number(item.quantity || 0)));
};

export function useOrderPricing(params: {
  billItems: BillItem[];
  discountMode: AdjustmentMode;
  discountValue: string;
  surchargeMode: AdjustmentMode;
  surchargeValue: string;
}) {
  const { billItems, discountMode, discountValue, surchargeMode, surchargeValue } = params;

  const subtotal = useMemo(() => billItems.reduce((sum, item) => sum + getLineAmount(item), 0), [billItems]);

  const discountAmount = useMemo(() => {
    const discountRaw = discountMode === 'amount' ? toAmountNumber(discountValue) : toPercentNumber(discountValue);
    return discountMode === 'percent'
      ? Math.min(subtotal, (subtotal * Math.max(0, discountRaw)) / 100)
      : Math.max(0, discountRaw);
  }, [discountMode, discountValue, subtotal]);

  const surchargeAmount = useMemo(() => {
    const surchargeRaw = surchargeMode === 'amount' ? toAmountNumber(surchargeValue) : toPercentNumber(surchargeValue);
    const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);
    return surchargeMode === 'percent'
      ? (subtotalAfterDiscount * Math.max(0, surchargeRaw)) / 100
      : Math.max(0, surchargeRaw);
  }, [surchargeMode, surchargeValue, subtotal, discountAmount]);

  const totalAmount = useMemo(() => Math.max(0, subtotal - discountAmount + surchargeAmount), [subtotal, discountAmount, surchargeAmount]);

  return {
    subtotal,
    discountAmount,
    surchargeAmount,
    totalAmount,
  };
}
