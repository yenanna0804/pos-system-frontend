import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import OrderBillsPanel from './components/OrderBillsPanel';
import OrdersProductPicker from './components/OrdersProductPicker';
import OrdersTablePicker from './components/OrdersTablePicker';
import type { BillItem, DuplicateHandling, SelectableTable } from './types';
import { formatNumberVi } from '../../utils/formatters';
import { useOrderEditor } from './hooks/useOrderEditor';
import { toAmountNumber, toPercentNumber, useOrderPricing } from './hooks/useOrderPricing';
import { useOrderTimer } from './hooks/useOrderTimer';

type Props = {
  onBack: () => void;
  mode?: 'create' | 'edit';
  orderCode?: string;
  orderId?: string;
  initialData?: {
    selectedTable: SelectableTable | null;
    customerName: string;
    billItems: BillItem[];
    billItemsPatch?: {
      addedItems: BillItem[];
      updatedItems: (Partial<BillItem> & { lineId: string })[];
      removedItemIds: string[];
      hasChanges: boolean;
    };
    discountAmount?: number;
    discountMode?: 'percent' | 'amount';
    discountValue?: number;
    surchargeAmount?: number;
    surchargeMode?: 'percent' | 'amount';
    surchargeValue?: number;
    paidAmount?: number;
    paymentMethod?: 'CASH' | 'BANKING';
    isDebtMarked?: boolean;
  };
  defaultTab?: 'table' | 'product';
  activeTab?: 'table' | 'product';
  onActiveTabChange?: (tab: 'table' | 'product') => void;
  onSaveOrder: (payload: {
    table: SelectableTable | null;
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
    isDebtMarked: boolean;
    billItemsPatch?: {
      addedItems: BillItem[];
      updatedItems: (Partial<BillItem> & { lineId: string })[];
      removedItemIds: string[];
      hasChanges: boolean;
    };
    saveBehavior?: 'exit' | 'stay';
  }) => Promise<void>;
  onToggleTimeLineTimer?: (lineId: string, action: 'start' | 'stop') => Promise<{ usedMinutes: number; lineTotal: number; timerStatus: 'RUNNING' | 'STOPPED'; startAt?: string | null; stopAt?: string | null }>;
  onUpdateTimeLineTimestamp?: (lineId: string, field: 'startAt' | 'stopAt', isoValue: string) => Promise<void>;
  onBillItemsChange?: (items: BillItem[]) => void;
  onDraftChange?: (draft: {
    activeTab: 'table' | 'product';
    selectedTable: SelectableTable | null;
    customerName: string;
    billItems: BillItem[];
    discountMode: 'percent' | 'amount';
    discountValue: string;
    surchargeMode: 'percent' | 'amount';
    surchargeValue: string;
    paidAmount?: number;
    paymentMethod?: 'CASH' | 'BANKING';
  }) => void;
  transferFilterRange?: {
    startIso?: string;
    endIso?: string;
  };
  onFetchTransferCandidateOrders?: (payload: { currentOrderId: string; startIso?: string; endIso?: string }) => Promise<Array<{ id: string; code: string; label: string }>>;
  onTransferOrderItems?: (payload: {
    sourceOrderId: string;
    targetOrderId: string;
    transferAll: boolean;
    transferItems: Array<{ lineId: string; quantity: number }>;
  }) => Promise<void>;
  onPrintSavedInvoice?: (payload: { orderId: string }) => Promise<void>;
  onPrintSavedOrderSlip?: (payload: { orderId: string; selectedLineIds: string[] }) => Promise<void>;
};

export default function NewOrderPage({ onBack, onSaveOrder, mode = 'create', orderCode, orderId, initialData, defaultTab = 'table', activeTab: controlledActiveTab, onActiveTabChange, onToggleTimeLineTimer, onUpdateTimeLineTimestamp, onBillItemsChange, onDraftChange, transferFilterRange, onFetchTransferCandidateOrders, onTransferOrderItems, onPrintSavedInvoice, onPrintSavedOrderSlip }: Props) {
  const { branchId, user } = useAuth();
  const [internalActiveTab, setInternalActiveTab] = useState<'table' | 'product'>(defaultTab);
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = (tab: 'table' | 'product') => {
    if (onActiveTabChange) onActiveTabChange(tab);
    if (controlledActiveTab == null) setInternalActiveTab(tab);
  };
  const [selectedTable, setSelectedTable] = useState<SelectableTable | null>(initialData?.selectedTable || null);
  const [customerName, setCustomerName] = useState(initialData?.customerName || '');
  const [duplicateHandling, setDuplicateHandling] = useState<DuplicateHandling>('merge');
  const editorResetKey = `${mode}:${orderId || 'create'}`;
  const { billItems, setBillItems, addProductToBill, billItemsPatch } = useOrderEditor(initialData?.billItems || [], editorResetKey);
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>(initialData?.discountMode || 'percent');
  const [discountValue, setDiscountValue] = useState(String(initialData?.discountValue ?? initialData?.discountAmount ?? 0));
  const [surchargeMode, setSurchargeMode] = useState<'percent' | 'amount'>(initialData?.surchargeMode || 'percent');
  const [surchargeValue, setSurchargeValue] = useState(String(initialData?.surchargeValue ?? initialData?.surchargeAmount ?? (mode === 'create' ? 5 : 0)));
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [showTakeawayConfirm, setShowTakeawayConfirm] = useState(false);
  const [showTransferSaveConfirm, setShowTransferSaveConfirm] = useState(false);
  const [showPrintSaveConfirm, setShowPrintSaveConfirm] = useState(false);
  const [pendingPrintAction, setPendingPrintAction] = useState<{ type: 'invoice' } | { type: 'order_slip'; selectedLineIds: string[] } | null>(null);
  const [printSavedSnapshot, setPrintSavedSnapshot] = useState<string | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferCandidates, setTransferCandidates] = useState<Array<{ id: string; code: string; label: string }>>([]);
  const [isLoadingTransferCandidates, setIsLoadingTransferCandidates] = useState(false);
  const [targetOrderId, setTargetOrderId] = useState('');
  const [transferMode, setTransferMode] = useState<'ALL' | 'PARTIAL'>('PARTIAL');
  const [transferQuantities, setTransferQuantities] = useState<Record<string, string>>({});
  const [isTransferringOrder, setIsTransferringOrder] = useState(false);
  const [paidAmountDraft, setPaidAmountDraft] = useState<number>(Math.max(0, Math.trunc(initialData?.paidAmount ?? totalAmount)));
  const [paymentMethodDraft, setPaymentMethodDraft] = useState<'CASH' | 'BANKING'>(initialData?.paymentMethod ?? 'CASH');
  const [isDebtMarkedDraft, setIsDebtMarkedDraft] = useState<boolean>(Boolean(initialData?.isDebtMarked));
  const { timerLoadingLineIds, timerErrorLineIds, timerUnsyncedLineIds, markLineUnsynced, markLineSynced, createToggleHandler } = useOrderTimer();

  useEffect(() => {
    if (mode !== 'edit') return;
    billItems.forEach((item) => {
      if (item.pricingTypeSnapshot !== 'TIME') return;
      if (item.orderItemId) {
        markLineSynced(item.lineId);
      } else {
        markLineUnsynced(item.lineId);
      }
    });
  }, [mode, billItems, markLineSynced, markLineUnsynced]);

  useEffect(() => {
    onBillItemsChange?.(billItems);
  }, [billItems, onBillItemsChange]);

  useEffect(() => {
    if (mode !== 'create') return;
    onDraftChange?.({
      activeTab,
      selectedTable,
      customerName,
      billItems,
      discountMode,
      discountValue,
      surchargeMode,
      surchargeValue,
      paidAmount: initialData?.paidAmount,
      paymentMethod: initialData?.paymentMethod,
    });
  }, [
    mode,
    onDraftChange,
    activeTab,
    selectedTable,
    customerName,
    billItems,
    discountMode,
    discountValue,
    surchargeMode,
    surchargeValue,
    initialData?.paidAmount,
    initialData?.paymentMethod,
  ]);


  const { totalAmount, discountAmount, surchargeAmount } = useOrderPricing({
    billItems,
    discountMode,
    discountValue,
    surchargeMode,
    surchargeValue,
  });

  const onToggleTimer = useMemo(
    () =>
      createToggleHandler({
        orderId,
        onToggleTimeLineTimer,
        setBillItems,
      }),
    [
      createToggleHandler,
      orderId,
      selectedTable,
      customerName,
      billItems,
      billItemsPatch,
      totalAmount,
      discountAmount,
      discountMode,
      discountValue,
      surchargeAmount,
      surchargeMode,
      surchargeValue,
      onToggleTimeLineTimer,
      setBillItems,
    ],
  );

  const updateTimestampRef = useRef(onUpdateTimeLineTimestamp);
  updateTimestampRef.current = onUpdateTimeLineTimestamp;

  const handleUpdateTimeLineTimestamp = useMemo(() => {
    if (!onUpdateTimeLineTimestamp) return undefined;
    return async (lineId: string, field: 'startAt' | 'stopAt', isoValue: string) => {
      setBillItems((prev) => prev.map((item) => {
        if (item.lineId !== lineId) return item;
        const nextItem: BillItem = { ...item, [field]: isoValue };
        if (nextItem.pricingTypeSnapshot !== 'TIME') return nextItem;

        const startIso = nextItem.startAt || null;
        const stopIso = nextItem.stopAt || null;
        const startMs = startIso ? Date.parse(startIso) : NaN;
        const stopMs = stopIso ? Date.parse(stopIso) : NaN;

        if (!Number.isFinite(startMs) || !Number.isFinite(stopMs) || stopMs <= startMs) {
          return nextItem;
        }

        const usedMinutes = Math.max(0, Math.ceil((stopMs - startMs) / 60000));
        const unitPrice = Math.max(0, Math.trunc(Number(nextItem.unitPrice || 0)));
        const rateMinutes = Math.max(1, Math.trunc(Number(nextItem.timeRateMinutesSnapshot || 1)));
        const lineTotal = Math.floor((unitPrice * usedMinutes) / rateMinutes);

        return {
          ...nextItem,
          usedMinutes,
          lineTotal,
        };
      }));
      await updateTimestampRef.current?.(lineId, field, isoValue);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setBillItems]);

  const executeSaveOrderWithBehavior = async (paidAmount: number, paymentMethod: 'CASH' | 'BANKING', isDebtMarked: boolean, saveBehavior: 'exit' | 'stay' = 'exit') => {
    if (billItems.length === 0) return;
    setIsSavingOrder(true);
    try {
      await onSaveOrder({
        table: selectedTable,
        customerName,
        billItems,
        billItemsPatch,
        totalAmount,
        discountAmount,
        discountMode,
        discountValue: discountMode === 'amount' ? toAmountNumber(discountValue) : toPercentNumber(discountValue),
        surchargeAmount,
        surchargeMode,
        surchargeValue: surchargeMode === 'amount' ? toAmountNumber(surchargeValue) : toPercentNumber(surchargeValue),
        paidAmount,
        paymentMethod,
        isDebtMarked,
        saveBehavior,
      });
    } finally {
      setIsSavingOrder(false);
    }
  };

  const hasUnsavedChangesRaw = mode === 'edit' && (
    Boolean(billItemsPatch?.hasChanges)
    || (customerName || '') !== (initialData?.customerName || '')
    || (selectedTable?.id || '') !== (initialData?.selectedTable?.id || '')
    || discountMode !== (initialData?.discountMode || 'percent')
    || surchargeMode !== (initialData?.surchargeMode || 'percent')
    || Number(discountValue || 0) !== Number(initialData?.discountValue ?? initialData?.discountAmount ?? 0)
    || Number(surchargeValue || 0) !== Number(initialData?.surchargeValue ?? initialData?.surchargeAmount ?? 0)
    || Math.max(0, Math.trunc(Number(paidAmountDraft || 0))) !== Math.max(0, Math.trunc(Number(initialData?.paidAmount ?? totalAmount)))
    || paymentMethodDraft !== (initialData?.paymentMethod ?? 'CASH')
    || isDebtMarkedDraft !== Boolean(initialData?.isDebtMarked)
  );
  const currentEditSnapshot = JSON.stringify({
    hasPatchChanges: Boolean(billItemsPatch?.hasChanges),
    billItems: billItems.map((item) => ({
      lineId: item.lineId,
      orderItemId: item.orderItemId || '',
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      lineTotal: Number(item.lineTotal || 0),
      lineDiscountAmount: Number(item.lineDiscountAmount || 0),
      lineSurchargeAmount: Number(item.lineSurchargeAmount || 0),
      note: item.note || '',
      startAt: item.startAt || '',
      stopAt: item.stopAt || '',
      usedMinutes: Number(item.usedMinutes || 0),
    })),
    customerName: customerName || '',
    selectedTableId: selectedTable?.id || '',
    discountMode,
    surchargeMode,
    discountValue: Number(discountValue || 0),
    surchargeValue: Number(surchargeValue || 0),
    paidAmount: paidAmountDraft,
    paymentMethod: paymentMethodDraft,
    isDebtMarked: isDebtMarkedDraft,
  });
  const hasUnsavedChanges = hasUnsavedChangesRaw && printSavedSnapshot !== currentEditSnapshot;

  const handleSaveOrder = async (paidAmount: number, paymentMethod: 'CASH' | 'BANKING', isDebtMarked: boolean) => {
    if (billItems.length === 0) return;
    if (!selectedTable && mode === 'create') {
      pendingPaidAmountRef.current = paidAmount;
      pendingPaymentMethodRef.current = paymentMethod;
      pendingIsDebtMarkedRef.current = isDebtMarked;
      setShowTakeawayConfirm(true);
      return;
    }
    if (mode === 'edit') {
      pendingPaidAmountRef.current = paidAmount;
      pendingPaymentMethodRef.current = paymentMethod;
      pendingIsDebtMarkedRef.current = isDebtMarked;
      setShowEditConfirm(true);
      return;
    }
    await executeSaveOrderWithBehavior(paidAmount, paymentMethod, isDebtMarked, 'exit');
  };

  const pendingPaidAmountRef = useRef<number>(Math.max(0, Math.trunc(initialData?.paidAmount ?? totalAmount)));
  const pendingPaymentMethodRef = useRef<'CASH' | 'BANKING'>(initialData?.paymentMethod ?? 'CASH');
  const pendingIsDebtMarkedRef = useRef<boolean>(Boolean(initialData?.isDebtMarked));

  const ensureSavedBeforePrint = async () => {
    if (mode !== 'edit' || !orderId) throw new Error('Vui lòng lưu hóa đơn trước khi in');
    if (!hasUnsavedChanges) return;
    throw new Error('Vui lòng lưu thay đổi trước khi in');
  };

  const runPrintAction = async (action: { type: 'invoice' } | { type: 'order_slip'; selectedLineIds: string[] }, skipUnsavedCheck = false) => {
    if (!skipUnsavedCheck) await ensureSavedBeforePrint();
    if (!orderId) throw new Error('Không thể in khi chưa lưu');
    if (action.type === 'invoice') {
      if (!onPrintSavedInvoice) throw new Error('Không thể in hóa đơn khi chưa lưu');
      await onPrintSavedInvoice({ orderId });
      return;
    }
    if (!onPrintSavedOrderSlip) throw new Error('Không thể in phiếu order khi chưa lưu');
    await onPrintSavedOrderSlip({ orderId, selectedLineIds: action.selectedLineIds });
  };

  const requestPrintAction = async (action: { type: 'invoice' } | { type: 'order_slip'; selectedLineIds: string[] }) => {
    if (mode !== 'edit' || !orderId) throw new Error('Vui lòng lưu hóa đơn trước khi in');
    if (hasUnsavedChanges) {
      setPendingPrintAction(action);
      setShowPrintSaveConfirm(true);
      return;
    }
    await runPrintAction(action);
  };

  const saveThenPrint = async () => {
    if (!pendingPrintAction) return;
    await executeSaveOrderWithBehavior(
      pendingPaidAmountRef.current,
      pendingPaymentMethodRef.current,
      pendingIsDebtMarkedRef.current,
      'stay',
    );
    setPrintSavedSnapshot(currentEditSnapshot);
    const action = pendingPrintAction;
    setPendingPrintAction(null);
    await runPrintAction(action, true);
  };

  const onPrintInvoice = async () => {
    if (billItems.length === 0) return;
    await requestPrintAction({ type: 'invoice' });
  };

  const onPrintOrder = async (selectedLineIds: string[]) => {
    if (billItems.length === 0) return;
    await requestPrintAction({ type: 'order_slip', selectedLineIds });
  };

  const openTransferModal = async (skipUnsavedCheck = false) => {
    if (mode !== 'edit' || !orderId || !onFetchTransferCandidateOrders) return;
    if (!skipUnsavedCheck && hasUnsavedChanges) {
      setShowTransferSaveConfirm(true);
      return;
    }
    setShowTransferModal(true);
    setTransferMode('PARTIAL');
    setTargetOrderId('');
    setTransferQuantities({});
    setIsLoadingTransferCandidates(true);
    try {
      const rows = await onFetchTransferCandidateOrders({
        currentOrderId: orderId,
        startIso: transferFilterRange?.startIso,
        endIso: transferFilterRange?.endIso,
      });
      setTransferCandidates(rows);
    } finally {
      setIsLoadingTransferCandidates(false);
    }
  };

  const saveThenOpenTransferModal = async () => {
    setShowTransferSaveConfirm(false);
    await executeSaveOrderWithBehavior(
      pendingPaidAmountRef.current,
      pendingPaymentMethodRef.current,
      pendingIsDebtMarkedRef.current,
      'stay',
    );
    await openTransferModal(true);
  };

  const partialTransferItems = billItems
    .map((item) => ({
      lineId: item.lineId,
      quantity: Math.max(0, Math.trunc(Number(transferQuantities[item.lineId] || 0))),
    }))
    .filter((item) => item.quantity > 0);
  const canConfirmTransfer = Boolean(targetOrderId) && (transferMode === 'ALL' || partialTransferItems.length > 0);

  const handleConfirmTransfer = async () => {
    if (!onTransferOrderItems || !orderId || !targetOrderId) return;
    if (transferMode === 'PARTIAL' && partialTransferItems.length === 0) return;
    setIsTransferringOrder(true);
    try {
      await onTransferOrderItems({
        sourceOrderId: orderId,
        targetOrderId,
        transferAll: transferMode === 'ALL',
        transferItems: transferMode === 'ALL' ? [] : partialTransferItems,
      });
      setShowTransferModal(false);
    } finally {
      setIsTransferringOrder(false);
    }
  };

  

  return (
    <section className="orders-create-page">
      {showTakeawayConfirm && (
        <div className="orders-confirm-overlay" onClick={() => setShowTakeawayConfirm(false)}>
          <div className="orders-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Xác nhận lưu hóa đơn</h3>
            <p>Bạn chưa chọn phòng/bàn, hệ thống sẽ tự lưu hóa đơn này là hóa đơn mang về (Mang về).</p>
            <div className="orders-confirm-actions">
              <button type="button" className="ghost-btn" onClick={() => setShowTakeawayConfirm(false)}>
                Hủy
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={async () => {
                  setShowTakeawayConfirm(false);
                  await executeSaveOrderWithBehavior(pendingPaidAmountRef.current, pendingPaymentMethodRef.current, pendingIsDebtMarkedRef.current, 'exit');
                }}
              >
                Đồng ý
              </button>
            </div>
          </div>
        </div>
      )}
      {showEditConfirm && (
        <div className="orders-confirm-overlay" onClick={() => setShowEditConfirm(false)}>
          <div className="orders-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Xác nhận sửa</h3>
            <p>
              Bạn có chắc chắn muốn sửa hóa đơn <strong>{orderCode || ''}</strong> không?
            </p>
            <p>Thao tác này không thể hoàn tác</p>
            <div className="orders-confirm-actions">
              <button type="button" className="ghost-btn" onClick={() => setShowEditConfirm(false)}>
                Hủy
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={async () => {
                  setShowEditConfirm(false);
                  await executeSaveOrderWithBehavior(pendingPaidAmountRef.current, pendingPaymentMethodRef.current, pendingIsDebtMarkedRef.current, 'exit');
                }}
              >
                Xác nhận sửa
              </button>
            </div>
          </div>
        </div>
      )}
      {showTransferSaveConfirm && (
        <div className="orders-confirm-overlay" onClick={() => setShowTransferSaveConfirm(false)}>
          <div className="orders-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Có thay đổi chưa lưu</h3>
            <p>Bạn cần lưu hóa đơn trước khi tách để đảm bảo dữ liệu chuyển món chính xác.</p>
            <div className="orders-confirm-actions">
              <button type="button" className="ghost-btn" onClick={() => setShowTransferSaveConfirm(false)}>
                Huỷ
              </button>
              <button type="button" className="primary-btn" onClick={() => saveThenOpenTransferModal().catch(() => undefined)}>
                Lưu rồi tách
              </button>
            </div>
          </div>
        </div>
      )}
      {showPrintSaveConfirm && (
        <div className="orders-confirm-overlay" onClick={() => { setShowPrintSaveConfirm(false); setPendingPrintAction(null); }}>
          <div className="orders-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Có thay đổi chưa lưu</h3>
            <p>Bạn cần lưu hóa đơn trước khi in để đảm bảo dữ liệu in đúng với dữ liệu đã lưu.</p>
            <div className="orders-confirm-actions">
              <button type="button" className="ghost-btn" onClick={() => { setShowPrintSaveConfirm(false); setPendingPrintAction(null); }}>
                Huỷ
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={async () => {
                  setShowPrintSaveConfirm(false);
                  await saveThenPrint().catch(() => undefined);
                }}
              >
                Lưu rồi in
              </button>
            </div>
          </div>
        </div>
      )}
      {showTransferModal && (
        <div className="orders-confirm-overlay" onClick={() => setShowTransferModal(false)}>
          <div className="orders-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Tách hóa đơn</h3>
            <p>Chọn hóa đơn đích trong cùng khung ngày lọc và chọn số lượng món cần chuyển.</p>
            <div style={{ display: 'grid', gap: 8 }}>
              <select
                className="orders-transfer-target-select"
                value={targetOrderId}
                onChange={(event) => setTargetOrderId(event.target.value)}
                disabled={isLoadingTransferCandidates || isTransferringOrder}
              >
                <option value="">Chọn hóa đơn đích</option>
                {transferCandidates.map((order) => (
                  <option key={order.id} value={order.id}>{order.code} - {order.label}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className={transferMode === 'PARTIAL' ? 'primary-btn' : 'ghost-btn'} onClick={() => setTransferMode('PARTIAL')}>Theo món</button>
                <button type="button" className={transferMode === 'ALL' ? 'primary-btn' : 'ghost-btn'} onClick={() => setTransferMode('ALL')}>Tất cả</button>
              </div>
              {transferMode === 'PARTIAL' && (
                <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid #ddd', borderRadius: 8, padding: 8 }}>
                  {billItems.map((item) => (
                    <div key={item.lineId} style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <div>{item.productName} (Tối đa: {formatNumberVi(item.quantity)})</div>
                      <div className="orders-bill-qty-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            const currentQty = Math.max(0, Math.trunc(Number(transferQuantities[item.lineId] || 0)));
                            const nextQty = Math.max(0, currentQty - 1);
                            setTransferQuantities((prev) => ({ ...prev, [item.lineId]: String(nextQty) }));
                          }}
                        >
                          -
                        </button>
                        <input
                          className="orders-qty-inline-input orders-transfer-qty-input"
                          inputMode="numeric"
                          value={transferQuantities[item.lineId] || '0'}
                          onFocus={(event) => event.target.select()}
                          onChange={(event) => {
                            const digits = event.target.value.replace(/\D/g, '');
                            const nextQty = Math.max(0, Math.min(item.quantity, Math.trunc(Number(digits || 0))));
                            setTransferQuantities((prev) => ({ ...prev, [item.lineId]: String(nextQty) }));
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const currentQty = Math.max(0, Math.trunc(Number(transferQuantities[item.lineId] || 0)));
                            const nextQty = Math.min(item.quantity, currentQty + 1);
                            setTransferQuantities((prev) => ({ ...prev, [item.lineId]: String(nextQty) }));
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="orders-confirm-actions">
              <button type="button" className="ghost-btn" onClick={() => setShowTransferModal(false)} disabled={isTransferringOrder}>Huỷ</button>
              <button type="button" className="primary-btn" onClick={() => handleConfirmTransfer().catch(() => undefined)} disabled={!canConfirmTransfer || isTransferringOrder}>Chuyển</button>
            </div>
          </div>
        </div>
      )}

      <div className="orders-create-shell">
        <div className="orders-create-topbar">
          <div className="orders-step-tabs">
            <button
              type="button"
              className={`orders-step-tab ${activeTab === 'table' ? 'active' : ''}`}
              onClick={() => setActiveTab('table')}
            >
              Chọn phòng/bàn
            </button>
            <button
              type="button"
              className={`orders-step-tab ${activeTab === 'product' ? 'active' : ''}`}
              onClick={() => setActiveTab('product')}
            >
              Chọn món
            </button>
          </div>

          <div className="orders-create-header">
            <h2>{mode === 'edit' ? `Sửa hóa đơn${orderCode ? ` - ${orderCode}` : ''}` : 'Thêm mới hóa đơn'}</h2>
             <button type="button" className="ghost-btn" onClick={onBack}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M13.5 8.5L10 12l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Quay lại danh sách
            </button>
          </div>
        </div>

      <div className="orders-product-layout">
        <div className="orders-product-left">
          {activeTab === 'table' ? (
            <div className="orders-tab-panel">
              <OrdersTablePicker
                branchId={branchId}
                selectedTableId={selectedTable?.id || ''}
                onSelectTable={(table) => {
                  setSelectedTable(table);
                  setActiveTab('product');
                }}
              />
              <div className="orders-table-confirm-bar">
                <div>
                  {selectedTable
                    ? selectedTable.entityType === 'ROOM'
                      ? `Đang chọn: ${selectedTable.areaName} / ${selectedTable.roomName || selectedTable.name}`
                      : `Đang chọn: ${selectedTable.areaName}${selectedTable.roomName ? ` / ${selectedTable.roomName}` : ''} / ${selectedTable.name}`
                    : 'Chưa chọn phòng/bàn. Khi lưu hệ thống sẽ tự gán (Mang về).'}
                </div>
              </div>
            </div>
          ) : (
            <OrdersProductPicker branchId={branchId} onAddProduct={(product) => addProductToBill(product, duplicateHandling)} />
          )}
        </div>
        <OrderBillsPanel
          selectedTable={selectedTable}
          customerName={customerName}
          onCustomerNameChange={setCustomerName}
          duplicateHandling={duplicateHandling}
          onDuplicateHandlingChange={setDuplicateHandling}
          billItems={billItems}
          onIncreaseQty={(lineId) =>
            setBillItems((prev) =>
              prev.map((item) => {
                if (item.lineId !== lineId) return item;
                if (item.pricingTypeSnapshot === 'TIME') return item;
                const nextQuantity = item.quantity + 1;
                const unitPrice = Math.max(0, Math.trunc(Number(item.unitPrice || 0)));
                return { ...item, quantity: nextQuantity, lineTotal: nextQuantity * unitPrice };
              }),
            )
          }
          onDecreaseQty={(lineId) =>
            setBillItems((prev) =>
              prev
                .map((item) => {
                  if (item.lineId !== lineId) return item;
                  if (item.pricingTypeSnapshot === 'TIME') return item;
                  const nextQuantity = Math.max(0, item.quantity - 1);
                  const unitPrice = Math.max(0, Math.trunc(Number(item.unitPrice || 0)));
                  return { ...item, quantity: nextQuantity, lineTotal: nextQuantity * unitPrice };
                })
                .filter((item) => item.quantity > 0),
            )
          }
          onSetQty={(lineId, quantity) =>
            setBillItems((prev) =>
              prev
                .map((item) => {
                  if (item.lineId !== lineId) return item;
                  if (item.pricingTypeSnapshot === 'TIME') return item;
                  const nextQuantity = Math.max(0, Math.round(quantity));
                  const unitPrice = Math.max(0, Math.trunc(Number(item.unitPrice || 0)));
                  return { ...item, quantity: nextQuantity, lineTotal: nextQuantity * unitPrice };
                })
                .filter((item) => item.quantity > 0),
            )
          }
          onRemoveLine={(lineId) => setBillItems((prev) => prev.filter((item) => item.lineId !== lineId))}
          onUpdateNote={(lineId, note) =>
            setBillItems((prev) => prev.map((item) => (item.lineId === lineId ? { ...item, note } : item)))
          }
          onUpdateUnitPrice={(lineId, unitPrice) =>
            setBillItems((prev) =>
              prev.map((item) => {
                if (item.lineId !== lineId) return item;
                const nextUnitPrice = Math.max(0, Math.trunc(unitPrice));
                if (item.pricingTypeSnapshot !== 'TIME') {
                  const nextQuantity = Math.max(0, Math.trunc(Number(item.quantity || 0)));
                  return { ...item, unitPrice: nextUnitPrice, lineTotal: nextUnitPrice * nextQuantity };
                }
                const usedMinutes = Math.max(0, Math.trunc(Number(item.usedMinutes || 0)));
                const rateMinutes = Math.max(1, Math.trunc(Number(item.timeRateMinutesSnapshot || 1)));
                const nextLineTotal = Math.floor((nextUnitPrice * usedMinutes) / rateMinutes);
                return { ...item, unitPrice: nextUnitPrice, lineTotal: nextLineTotal };
              }),
            )
          }
          onToggleTimeLineTimer={onToggleTimer}
          onUpdateTimeLineTimestamp={handleUpdateTimeLineTimestamp}
          timerLoadingLineIds={timerLoadingLineIds}
          timerErrorLineIds={timerErrorLineIds}
          timerUnsyncedLineIds={timerUnsyncedLineIds}
          discountMode={discountMode}
          discountValue={discountValue}
          onDiscountModeChange={setDiscountMode}
          onDiscountValueChange={setDiscountValue}
          surchargeMode={surchargeMode}
          surchargeValue={surchargeValue}
          onSurchargeModeChange={setSurchargeMode}
          onSurchargeValueChange={setSurchargeValue}
          totalAmount={totalAmount}
          initialPaidAmount={initialData?.paidAmount}
          initialPaymentMethod={initialData?.paymentMethod}
          initialIsDebtMarked={initialData?.isDebtMarked}
          onSaveOrder={handleSaveOrder}
          onPaymentDraftChange={({ paidAmount, paymentMethod, isDebtMarked }) => {
            pendingPaidAmountRef.current = paidAmount;
            pendingPaymentMethodRef.current = paymentMethod;
            pendingIsDebtMarkedRef.current = isDebtMarked;
            setPaidAmountDraft(paidAmount);
            setPaymentMethodDraft(paymentMethod);
            setIsDebtMarkedDraft(isDebtMarked);
          }}
          onPrintInvoice={() => onPrintInvoice().catch(() => undefined)}
          onPrintOrder={(selectedLineIds) => onPrintOrder(selectedLineIds).catch(() => undefined)}
          showTransferButton={mode === 'edit' && Boolean(onTransferOrderItems)}
          onOpenTransferModal={() => openTransferModal().catch(() => undefined)}
          disableSave={billItems.length === 0 || isSavingOrder}
        />
      </div>
      </div>
    </section>
  );
}
