import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { BillItem } from '../types';

type ToggleTimerResult = {
  usedMinutes: number;
  lineTotal: number;
  timerStatus: 'RUNNING' | 'STOPPED';
  startAt?: string | null;
  stopAt?: string | null;
};

export function useOrderTimer() {
  const [timerLoadingLineIds, setTimerLoadingLineIds] = useState<string[]>([]);
  const [timerErrorLineIds, setTimerErrorLineIds] = useState<string[]>([]);
  const [timerUnsyncedLineIds, setTimerUnsyncedLineIds] = useState<string[]>([]);

  const markLineUnsynced = (lineId: string) => {
    setTimerUnsyncedLineIds((prev) => (prev.includes(lineId) ? prev : [...prev, lineId]));
  };

  const markLineSynced = (lineId: string) => {
    setTimerUnsyncedLineIds((prev) => prev.filter((id) => id !== lineId));
  };

  const createToggleHandler = (params: {
    orderId?: string;
    onToggleTimeLineTimer?: (lineId: string, action: 'start' | 'stop') => Promise<ToggleTimerResult>;
    setBillItems: Dispatch<SetStateAction<BillItem[]>>;
  }) => {
    const {
      orderId,
      onToggleTimeLineTimer,
      setBillItems,
    } = params;

    if (orderId && onToggleTimeLineTimer) {
      return async (lineId: string, action: 'start' | 'stop') => {
        setTimerLoadingLineIds((prev) => [...prev, lineId]);
        setTimerErrorLineIds((prev) => prev.filter((id) => id !== lineId));
        try {
          const result = await onToggleTimeLineTimer(lineId, action);
          markLineSynced(lineId);
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
                    startAt: result?.startAt ?? item.startAt ?? null,
                    stopAt: result?.stopAt ?? item.stopAt ?? null,
                    activeSessionStartedAt: nextTimerStatus === 'RUNNING' ? (result?.startAt ?? item.startAt ?? null) : null,
                  }
                : item,
            ),
          );
        } catch (error) {
          setTimerErrorLineIds((prev) => (prev.includes(lineId) ? prev : [...prev, lineId]));
          throw error;
        } finally {
          setTimerLoadingLineIds((prev) => prev.filter((id) => id !== lineId));
        }
      };
    }

    return undefined;
  };

  return {
    timerLoadingLineIds,
    timerErrorLineIds,
    timerUnsyncedLineIds,
    markLineUnsynced,
    markLineSynced,
    createToggleHandler,
  };
}
