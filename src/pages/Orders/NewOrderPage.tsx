import { useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import OrderBillsPanel from './components/OrderBillsPanel';
import OrdersProductPicker from './components/OrdersProductPicker';
import OrdersTablePicker from './components/OrdersTablePicker';
import type { BillItem, DuplicateHandling, SelectableTable } from './types';
import { printUsingConfiguredRoute } from '../../utils/printerRouting';
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
    billItemsPatch?: {
      addedItems: BillItem[];
      updatedItems: (Partial<BillItem> & { lineId: string })[];
      removedItemIds: string[];
      hasChanges: boolean;
    };
  }) => Promise<void>;
  onToggleTimeLineTimer?: (lineId: string, action: 'start' | 'stop') => Promise<{ usedMinutes: number; lineTotal: number; timerStatus: 'RUNNING' | 'STOPPED' }>;
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
};

export default function NewOrderPage({ onBack, onSaveOrder, mode = 'create', orderCode, orderId, initialData, defaultTab = 'table', onToggleTimeLineTimer, onStartTimeLineTimerForNewOrder }: Props) {
  const { branchId } = useAuth();
  const [activeTab, setActiveTab] = useState<'table' | 'product'>(defaultTab);
  const [selectedTable, setSelectedTable] = useState<SelectableTable | null>(initialData?.selectedTable || null);
  const [customerName, setCustomerName] = useState(initialData?.customerName || '');
  const [duplicateHandling, setDuplicateHandling] = useState<DuplicateHandling>('merge');
  const { billItems, setBillItems, addProductToBill, billItemsPatch } = useOrderEditor(initialData?.billItems || []);
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>(initialData?.discountMode || 'percent');
  const [discountValue, setDiscountValue] = useState(String(initialData?.discountValue ?? initialData?.discountAmount ?? 0));
  const [surchargeMode, setSurchargeMode] = useState<'percent' | 'amount'>(initialData?.surchargeMode || 'percent');
  const [surchargeValue, setSurchargeValue] = useState(String(initialData?.surchargeValue ?? initialData?.surchargeAmount ?? 0));
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const { timerLoadingLineIds, createToggleHandler } = useOrderTimer();

  const canOpenProductTab = Boolean(selectedTable);

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
      onStartTimeLineTimerForNewOrder,
      setBillItems,
    ],
  );

  const executeSaveOrder = async (paidAmount: number, paymentMethod: 'CASH' | 'BANKING') => {
    if (!selectedTable) return;
    if (billItems.length === 0) return;

    setIsSavingOrder(true);
    try {
      await onSaveOrder({
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
        paidAmount,
        paymentMethod,
      });
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleSaveOrder = async (paidAmount: number, paymentMethod: 'CASH' | 'BANKING') => {
    if (!selectedTable || billItems.length === 0) return;
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
    lines.push(`Mã hóa đơn: ${orderCode || 'Tạm thời (chưa lưu)'}`);
    lines.push(`Thời gian: ${new Date().toLocaleString('vi-VN')}`);
    lines.push(`Loại phiếu in: ${label}`);
    lines.push(`Khách hàng: ${customerName || '-'}`);
    lines.push(`Khu vực/Vị trí: ${location}`);
    lines.push('');
    lines.push('Danh sách món:');

    items.forEach((item, index) => {
      const lineTotal = item.lineTotal ?? Number(item.quantity || 0) * Number(item.unitPrice || 0);
      lines.push(`${index + 1}. ${item.productName}`);
      lines.push(`   SL: ${formatNumberVi(Number(item.quantity || 0))} | Đơn giá: ${formatNumberVi(Number(item.unitPrice || 0))} | Thành tiền: ${formatNumberVi(lineTotal)}`);
      if (item.note?.trim()) {
        lines.push(`   Ghi chú: ${item.note.trim()}`);
      }
    });

    lines.push('');
    const subtotalSelected = items.reduce((sum, item) => sum + (item.lineTotal ?? Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0);
    lines.push(`Tạm tính: ${formatNumberVi(subtotalSelected)}`);
    if (items.length === billItems.length) {
      lines.push(`Giảm giá: ${formatNumberVi(discountAmount)}`);
      lines.push(`Phụ phí: ${formatNumberVi(surchargeAmount)}`);
      lines.push(`Phải thanh toán: ${formatNumberVi(totalAmount)}`);
    }

    return lines.join('\n');
  };

  const onPrintInvoice = async () => {
    if (billItems.length === 0) return;
    const receiptData = buildReceipt80mmData(billItems, 'Hóa đơn');
    await printUsingConfiguredRoute('Hóa đơn tạm', buildPrintableContent(billItems, 'Hóa đơn'), { receipt80mmData: receiptData });
  };

  const onPrintOrder = async (selectedLineIds: string[]) => {
    const selectedItems = billItems.filter((item) => selectedLineIds.includes(item.lineId));
    const itemsToPrint = selectedItems.length > 0 ? selectedItems : billItems;
    if (itemsToPrint.length === 0) return;
    const receiptData = buildReceipt80mmData(itemsToPrint, 'Order');
    await printUsingConfiguredRoute('Order tạm', buildPrintableContent(itemsToPrint, 'Order'), { receipt80mmData: receiptData });
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
      title: label,
      orderCode: orderCode || 'TAM',
      datetime: new Date().toLocaleString('vi-VN'),
      customerName: customerName || '-',
      location,
      items: items.map((item) => ({
        name: item.productName,
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
      {showEditConfirm && (
        <div className="orders-confirm-overlay" onClick={() => setShowEditConfirm(false)}>
          <div className="orders-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Xác nhận sửa</h3>
            <p>
              Bạn có chắc chắn muốn sửa hóa đơn <strong>{orderCode || ''}</strong> không?
            </p>
            <p>Thao tác này không thể hoàn tác</p>
            <div className="orders-confirm-actions">
              <button type="button" className="orders-ghost-btn" onClick={() => setShowEditConfirm(false)}>
                Hủy
              </button>
              <button
                type="button"
                className="orders-primary-btn"
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

      <div className="orders-create-header">
        <button type="button" className="orders-ghost-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M13.5 8.5L10 12l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Quay lại danh sách
        </button>
        <h2>{mode === 'edit' ? `Sửa hóa đơn${orderCode ? ` - ${orderCode}` : ''}` : 'Thêm mới hóa đơn'}</h2>
      </div>

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

      {activeTab === 'table' && (
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
                : 'Vui lòng chọn 1 phòng hoặc 1 bàn để tiếp tục'}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'product' && (
        <div className="orders-product-layout">
          <div className="orders-product-left">
            <OrdersProductPicker branchId={branchId} onAddProduct={(product) => addProductToBill(product, duplicateHandling)} />
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
                prev.map((item) => (item.lineId === lineId ? { ...item, unitPrice: Math.max(0, Math.trunc(unitPrice)) } : item)),
              )
            }
            onToggleTimeLineTimer={onToggleTimer}
            timerLoadingLineIds={timerLoadingLineIds}
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
            disableSave={!selectedTable || billItems.length === 0 || isSavingOrder}
          />
        </div>
      )}
    </section>
  );
}
