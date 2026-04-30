import { useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import OrderBillsPanel from './components/OrderBillsPanel';
import OrdersProductPicker from './components/OrdersProductPicker';
import OrdersTablePicker from './components/OrdersTablePicker';
import type { BillItem, DuplicateHandling, ProductOption, SelectableTable } from './types';

type Props = {
  onBack: () => void;
  mode?: 'create' | 'edit';
  orderCode?: string;
  initialData?: {
    selectedTable: SelectableTable | null;
    customerName: string;
    billItems: BillItem[];
    discountAmount?: number;
    discountMode?: 'percent' | 'amount';
    discountValue?: number;
    surchargeAmount?: number;
    surchargeMode?: 'percent' | 'amount';
    surchargeValue?: number;
    paidAmount?: number;
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
  }) => Promise<void>;
};

const generateLineId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

const toAmountNumber = (value: string) => {
  const numeric = Number(value.replace(/\D/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
};

const toPercentNumber = (value: string) => {
  const numeric = Number(value.trim().replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : 0;
};

export default function NewOrderPage({ onBack, onSaveOrder, mode = 'create', orderCode, initialData, defaultTab = 'table' }: Props) {
  const { branchId } = useAuth();
  const [activeTab, setActiveTab] = useState<'table' | 'product'>(defaultTab);
  const [selectedTable, setSelectedTable] = useState<SelectableTable | null>(initialData?.selectedTable || null);
  const [customerName, setCustomerName] = useState(initialData?.customerName || '');
  const [duplicateHandling, setDuplicateHandling] = useState<DuplicateHandling>('merge');
  const [billItems, setBillItems] = useState<BillItem[]>(initialData?.billItems || []);
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>(initialData?.discountMode || 'percent');
  const [discountValue, setDiscountValue] = useState(String(initialData?.discountValue ?? initialData?.discountAmount ?? 0));
  const [surchargeMode, setSurchargeMode] = useState<'percent' | 'amount'>(initialData?.surchargeMode || 'percent');
  const [surchargeValue, setSurchargeValue] = useState(String(initialData?.surchargeValue ?? initialData?.surchargeAmount ?? 0));
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [showEditConfirm, setShowEditConfirm] = useState(false);

  const canOpenProductTab = Boolean(selectedTable);

  const addProductToBill = (product: ProductOption) => {
    setBillItems((prev) => {
      if (duplicateHandling === 'merge') {
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
        unit: product.unit,
        baseUnitPrice: product.price,
        unitPrice: product.price,
        quantity: 1,
        note: '',
      };
      return [...prev, newLine];
    });
  };

  const subtotal = billItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const totalAmount = useMemo(() => {
    const discountRaw = discountMode === 'amount' ? toAmountNumber(discountValue) : toPercentNumber(discountValue);
    const surchargeRaw = surchargeMode === 'amount' ? toAmountNumber(surchargeValue) : toPercentNumber(surchargeValue);
    const discountAmount =
      discountMode === 'percent'
        ? Math.min(subtotal, (subtotal * Math.max(0, discountRaw)) / 100)
        : Math.max(0, discountRaw);
    const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);
    const surchargeAmount =
      surchargeMode === 'percent'
        ? (subtotalAfterDiscount * Math.max(0, surchargeRaw)) / 100
        : Math.max(0, surchargeRaw);

    return Math.max(0, subtotal - discountAmount + surchargeAmount);
  }, [discountMode, discountValue, subtotal, surchargeMode, surchargeValue]);

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

  const executeSaveOrder = async (paidAmount: number) => {
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
      });
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleSaveOrder = async (paidAmount: number) => {
    if (!selectedTable || billItems.length === 0) return;
    if (mode === 'edit') {
      pendingPaidAmountRef.current = paidAmount;
      setShowEditConfirm(true);
      return;
    }
    await executeSaveOrder(paidAmount);
  };

  const pendingPaidAmountRef = useRef<number>(Math.max(0, Math.trunc(initialData?.paidAmount ?? totalAmount)));

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
                  await executeSaveOrder(pendingPaidAmountRef.current);
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
            <OrdersProductPicker branchId={branchId} onAddProduct={addProductToBill} />
          </div>
          <OrderBillsPanel
            selectedTable={selectedTable}
            customerName={customerName}
            onCustomerNameChange={setCustomerName}
            duplicateHandling={duplicateHandling}
            onDuplicateHandlingChange={setDuplicateHandling}
            billItems={billItems}
            onIncreaseQty={(lineId) =>
              setBillItems((prev) => prev.map((item) => (item.lineId === lineId ? { ...item, quantity: item.quantity + 1 } : item)))
            }
            onDecreaseQty={(lineId) =>
              setBillItems((prev) =>
                prev
                  .map((item) => (item.lineId === lineId ? { ...item, quantity: Math.max(0, item.quantity - 1) } : item))
                  .filter((item) => item.quantity > 0),
              )
            }
            onSetQty={(lineId, quantity) =>
              setBillItems((prev) =>
                prev
                  .map((item) =>
                    item.lineId === lineId ? { ...item, quantity: Math.max(0, Math.round(quantity)) } : item,
                  )
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
            onSaveOrder={handleSaveOrder}
            onPrintInvoice={() => window.print()}
            disableSave={!selectedTable || billItems.length === 0 || isSavingOrder}
          />
        </div>
      )}
    </section>
  );
}
