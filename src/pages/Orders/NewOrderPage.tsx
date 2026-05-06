import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import OrderBillsPanel from './components/OrderBillsPanel';
import OrdersProductPicker from './components/OrdersProductPicker';
import OrdersTablePicker from './components/OrdersTablePicker';
import type { BillItem, DuplicateHandling, SelectableTable } from './types';
import { printUsingConfiguredRoute, resolveTemplateKeyForPrintFamily } from '../../utils/printerRouting';
import { formatDateTimeVN } from '../../utils/formatters';
import type { Receipt80mmData } from '../../utils/receipt80mmGenerator';
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
  };
  defaultTab?: 'table' | 'product';
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
    billItemsPatch?: {
      addedItems: BillItem[];
      updatedItems: (Partial<BillItem> & { lineId: string })[];
      removedItemIds: string[];
      hasChanges: boolean;
    };
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
};

export default function NewOrderPage({ onBack, onSaveOrder, mode = 'create', orderCode, orderId, initialData, defaultTab = 'table', onToggleTimeLineTimer, onUpdateTimeLineTimestamp, onBillItemsChange, onDraftChange }: Props) {
  const { branchId } = useAuth();
  const [activeTab, setActiveTab] = useState<'table' | 'product'>(defaultTab);
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

  const canOpenProductTab = true;

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

  const executeSaveOrder = async (paidAmount: number, paymentMethod: 'CASH' | 'BANKING') => {
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
      });
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleSaveOrder = async (paidAmount: number, paymentMethod: 'CASH' | 'BANKING') => {
    if (billItems.length === 0) return;
    if (!selectedTable && mode === 'create') {
      pendingPaidAmountRef.current = paidAmount;
      pendingPaymentMethodRef.current = paymentMethod;
      setShowTakeawayConfirm(true);
      return;
    }
    if (mode === 'edit') {
      pendingPaidAmountRef.current = paidAmount;
      pendingPaymentMethodRef.current = paymentMethod;
      setShowEditConfirm(true);
      return;
    }
    await executeSaveOrder(paidAmount, paymentMethod);
  };

  const pendingPaidAmountRef = useRef<number>(Math.max(0, Math.trunc(initialData?.paidAmount ?? totalAmount)));
  const pendingPaymentMethodRef = useRef<'CASH' | 'BANKING'>(initialData?.paymentMethod ?? 'CASH');

  const buildPrintableContent = (items: BillItem[], label: string) => {
    const formatNumberVi = (value: number) => Math.trunc(Number(value || 0)).toLocaleString('vi-VN');
    const location = selectedTable
      ? selectedTable.entityType === 'ROOM'
        ? `${selectedTable.areaName} / ${selectedTable.roomName || selectedTable.name}`
        : `${selectedTable.areaName}${selectedTable.roomName ? ` / ${selectedTable.roomName}` : ''} / ${selectedTable.name}`
      : '-';

    const lines: string[] = [];
    lines.push(`Thời gian: ${formatDateTimeVN(new Date().toISOString())}`);
    lines.push(`Mã HĐ: ${orderCode || 'Tạm thời (chưa lưu)'}`);
    lines.push(`Loại phiếu in: ${label}`);
    lines.push(`Khách hàng: ${customerName || '-'}`);
    lines.push(`Khu vực/Vị trí: ${location}`);
    lines.push('');
    lines.push('Danh sách món:');

    items.forEach((item, index) => {
      const lineTotal = item.lineTotal ?? Number(item.quantity || 0) * Number(item.unitPrice || 0);
      lines.push(`${index + 1}. ${item.productName}`);
      const quantityLabel = formatNumberVi(Number(item.quantity || 0));
      if (label === 'Order') {
        lines.push(`   SL: ${quantityLabel} | ĐVT: ${item.unit || '-'}`);
      } else {
        lines.push(`   SL: ${quantityLabel} | Đơn giá: ${formatNumberVi(Number(item.unitPrice || 0))} | Thành tiền: ${formatNumberVi(lineTotal)}`);
      }
      if (item.note?.trim()) {
        lines.push(`   Ghi chú: ${item.note.trim()}`);
      }
    });

    lines.push('');
    const subtotalSelected = items.reduce((sum, item) => sum + (item.lineTotal ?? Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0);
    lines.push(`Tạm tính: ${formatNumberVi(subtotalSelected)}`);
    if (items.length === billItems.length) {
      lines.push(`Giảm giá: ${formatNumberVi(discountAmount)}`);
      lines.push(`Phí dịch vụ: ${formatNumberVi(surchargeAmount)}`);
      lines.push(`Phải thanh toán: ${formatNumberVi(totalAmount)}`);
    }

    return lines.join('\n');
  };

  const onPrintInvoice = async () => {
    if (billItems.length === 0) return;
    const receiptData = buildReceipt80mmData(billItems, 'Hóa đơn');
    await printUsingConfiguredRoute('Hóa đơn tạm', buildPrintableContent(billItems, 'Hóa đơn'), {
      templateKey: resolveTemplateKeyForPrintFamily('invoice'),
      receipt80mmData: receiptData,
    });
  };

  const onPrintOrder = async (selectedLineIds: string[]) => {
    const selectedItems = billItems.filter((item) => selectedLineIds.includes(item.lineId));
    const itemsToPrint = selectedItems.length > 0 ? selectedItems : billItems;
    if (itemsToPrint.length === 0) return;
    const receiptData = buildReceipt80mmData(itemsToPrint, 'Order');
    await printUsingConfiguredRoute('Order tạm', buildPrintableContent(itemsToPrint, 'Order'), {
      templateKey: resolveTemplateKeyForPrintFamily('order_slip'),
      receipt80mmData: receiptData,
    });
  };

  const buildReceipt80mmData = (items: BillItem[], label: string): Receipt80mmData => {
    const location = selectedTable
      ? selectedTable.entityType === 'ROOM'
        ? `${selectedTable.areaName} / ${selectedTable.roomName || selectedTable.name}`
        : `${selectedTable.areaName}${selectedTable.roomName ? ` / ${selectedTable.roomName}` : ''} / ${selectedTable.name}`
      : '-';

    const subtotalSelected = items.reduce((sum, item) => sum + (item.lineTotal ?? Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0);
    const useFullTotals = items.length === billItems.length;

    return {
      title: label === 'Order' ? 'PHIẾU ORDER' : 'PHIẾU TẠM TÍNH',
      orderCode: orderCode || 'TAM',
      datetime: formatDateTimeVN(new Date().toISOString()),
      customerName: customerName || '-',
      location,
      items: items.map((item) => ({
        name: item.productName,
        unit: item.unit || '-',
        quantity: Math.max(0, Math.trunc(Number(item.quantity || 0))),
        unitPrice: Math.max(0, Math.trunc(Number(item.unitPrice || 0))),
        lineTotal: Math.max(0, Math.trunc(Number(item.lineTotal ?? Number(item.quantity || 0) * Number(item.unitPrice || 0)))),
        note: item.note || '',
      })),
      subtotal: Math.max(0, Math.trunc(subtotalSelected)),
      discount: useFullTotals ? Math.max(0, Math.trunc(discountAmount)) : 0,
      surcharge: useFullTotals ? Math.max(0, Math.trunc(surchargeAmount)) : 0,
      total: useFullTotals ? Math.max(0, Math.trunc(totalAmount)) : Math.max(0, Math.trunc(subtotalSelected)),
    };
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
                  await executeSaveOrder(pendingPaidAmountRef.current, pendingPaymentMethodRef.current);
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
                  await executeSaveOrder(pendingPaidAmountRef.current, pendingPaymentMethodRef.current);
                }}
              >
                Xác nhận sửa
              </button>
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
              onClick={() => {
                if (!canOpenProductTab) return;
                setActiveTab('product');
              }}
              disabled={!canOpenProductTab}
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
                return { ...item, quantity: item.quantity + 1 };
              }),
            )
          }
          onDecreaseQty={(lineId) =>
            setBillItems((prev) =>
              prev
                .map((item) => {
                  if (item.lineId !== lineId) return item;
                  if (item.pricingTypeSnapshot === 'TIME') return item;
                  return { ...item, quantity: Math.max(0, item.quantity - 1) };
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
                  return { ...item, quantity: Math.max(0, Math.round(quantity)) };
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
                  return { ...item, unitPrice: nextUnitPrice };
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
          onSaveOrder={handleSaveOrder}
          onPrintInvoice={() => onPrintInvoice().catch(() => undefined)}
          onPrintOrder={(selectedLineIds) => onPrintOrder(selectedLineIds).catch(() => undefined)}
          disableSave={billItems.length === 0 || isSavingOrder}
        />
      </div>
      </div>
    </section>
  );
}
