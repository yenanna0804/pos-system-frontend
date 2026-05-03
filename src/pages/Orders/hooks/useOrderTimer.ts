import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { BillItem, SelectableTable } from '../types';
import { toAmountNumber, toPercentNumber } from './useOrderPricing';

type ToggleTimerResult = { usedMinutes: number; lineTotal: number; timerStatus: 'RUNNING' | 'STOPPED' };

export function useOrderTimer() {
  const [timerLoadingLineIds, setTimerLoadingLineIds] = useState<string[]>([]);

  const createToggleHandler = (params: {
    orderId?: string;
    selectedTable: SelectableTable | null;
    customerName: string;
    billItems: BillItem[];
    totalAmount: number;
    discountAmount: number;
    discountMode: 'percent' | 'amount';
    discountValue: string;
    surchargeAmount: number;
    surchargeMode: 'percent' | 'amount';
    surchargeValue: string;
    onToggleTimeLineTimer?: (lineId: string, action: 'start' | 'stop') => Promise<ToggleTimerResult>;
    onStartTimeLineTimerForNewOrder?: (payload: {
      table: SelectableTable;
      customerName: string;
      billItems: BillItem[];
      totalAmount: number;
      discountAmount: number;
      discountMode: 'percent' | 'amount';
      discountValue: number;
      surchargeAmount: number;
      surchargeMode: 'percent' | 'amount';
      surchargeValue: number;
      paidAmount: number;
      paymentMethod: 'CASH' | 'BANKING';
      lineId: string;
    }) => Promise<void>;
    setBillItems: Dispatch<SetStateAction<BillItem[]>>;
  }) => {
    const {
      orderId,
      selectedTable,
      customerName,
      billItems,
      totalAmount,
      discountAmount,
      discountMode,
      discountValue,
      surchargeAmount,
      surchargeMode,
      surchargeValue,
      onToggleTimeLineTimer,
      onStartTimeLineTimerForNewOrder,
      setBillItems,
    } = params;

    if (orderId && onToggleTimeLineTimer) {
      return async (lineId: string, action: 'start' | 'stop') => {
        setTimerLoadingLineIds((prev) => [...prev, lineId]);
        try {
          const result = await onToggleTimeLineTimer(lineId, action);
          const nextTimerStatus = result?.timerStatus || (action === 'start' ? 'RUNNING' : 'STOPPED');
          setBillItems((prev) =>
            prev.map((item) =>
              item.lineId === lineId
                ? {
                    ...item,
                    usedMinutes: Number(result?.usedMinutes ?? item.usedMinutes ?? 0),
                    lineTotal: Number(result?.lineTotal ?? item.lineTotal ?? 0),
                    baseUnitPrice: item.timeRateAmountSnapshot || item.baseUnitPrice,
                    quantity: 1,
                    timerStatus: nextTimerStatus,
                  }
                : item,
            ),
          );
        } finally {
          setTimerLoadingLineIds((prev) => prev.filter((id) => id !== lineId));
        }
      };
    }

    if (onStartTimeLineTimerForNewOrder) {
      return async (lineId: string, action: 'start' | 'stop') => {
        if (action !== 'start' || !selectedTable) return;
        setTimerLoadingLineIds((prev) => [...prev, lineId]);
        try {
          await onStartTimeLineTimerForNewOrder({
            table: selectedTable,
            customerName,
            billItems,
            totalAmount,
            discountAmount,
            discountMode,
            discountValue: discountMode === 'amount' ? toAmountNumber(discountValue) : toPercentNumber(discountValue),
            surchargeAmount,
            surchargeMode,
            surchargeValue: surchargeMode === 'amount' ? toAmountNumber(surchargeValue) : toPercentNumber(surchargeValue),
            paidAmount: 0,
            paymentMethod: 'CASH',
            lineId,
          });
        } finally {
          setTimerLoadingLineIds((prev) => prev.filter((id) => id !== lineId));
        }
      };
    }

    return undefined;
  };

  return {
    timerLoadingLineIds,
    createToggleHandler,
  };
}
