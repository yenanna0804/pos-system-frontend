import { useEffect, useState } from 'react';
import type { BillItem, DuplicateHandling, SelectableTable } from '../types';
import { getLineAmount, toAmountNumber, toPercentNumber } from '../hooks/useOrderPricing';
import TimeLineControls from './TimeLineControls';
import DateTimePicker from './DateTimePicker';
import './OrdersBillPanel.css';

type AdjustmentMode = 'percent' | 'amount';
type PaymentMethod = 'CASH' | 'BANKING';
type PriceEditMode = 'amount' | 'percent';

type Props = {
  selectedTable: SelectableTable | null;
  customerName: string;
  onCustomerNameChange: (value: string) => void;
  duplicateHandling: DuplicateHandling;
  onDuplicateHandlingChange: (value: DuplicateHandling) => void;
  billItems: BillItem[];
  onIncreaseQty: (lineId: string) => void;
  onDecreaseQty: (lineId: string) => void;
  onSetQty: (lineId: string, quantity: number) => void;
  onRemoveLine: (lineId: string) => void;
  onUpdateNote: (lineId: string, note: string) => void;
  onUpdateUnitPrice: (lineId: string, unitPrice: number) => void;
  onToggleTimeLineTimer?: (lineId: string, action: 'start' | 'stop') => Promise<void>;
  onUpdateTimeLineTimestamp?: (lineId: string, field: 'startAt' | 'stopAt', isoValue: string) => Promise<void>;
  timerLoadingLineIds?: string[];
  timerErrorLineIds?: string[];
  timerUnsyncedLineIds?: string[];
  discountMode: AdjustmentMode;
  discountValue: string;
  onDiscountModeChange: (value: AdjustmentMode) => void;
  onDiscountValueChange: (value: string) => void;
  surchargeMode: AdjustmentMode;
  surchargeValue: string;
  onSurchargeModeChange: (value: AdjustmentMode) => void;
  onSurchargeValueChange: (value: string) => void;
  totalAmount: number;
  initialPaidAmount?: number;
  initialPaymentMethod?: PaymentMethod;
  onSaveOrder: (paidAmount: number, paymentMethod: PaymentMethod) => void;
  onPrintInvoice: () => void;
  onPrintOrder: (selectedLineIds: string[]) => void;
  disableSave: boolean;
};

const formatDateTimeDisplay = (iso: string) => {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
};

const formatThousands = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('vi-VN');
};

const toMoney = (value: unknown) => Math.max(0, Math.trunc(Number(value) || 0));

export default function OrderBillsPanel({
  selectedTable,
  customerName,
  onCustomerNameChange,
  duplicateHandling,
  onDuplicateHandlingChange,
  billItems,
  onIncreaseQty,
  onDecreaseQty,
  onSetQty,
  onRemoveLine,
  onUpdateNote,
  onUpdateUnitPrice,
  onToggleTimeLineTimer,
  onUpdateTimeLineTimestamp,
  timerLoadingLineIds = [],
  timerErrorLineIds = [],
  timerUnsyncedLineIds = [],
  discountMode,
  discountValue,
  onDiscountModeChange,
  onDiscountValueChange,
  surchargeMode,
  surchargeValue,
  onSurchargeModeChange,
  onSurchargeValueChange,
  totalAmount,
  initialPaidAmount,
  initialPaymentMethod,
  onSaveOrder,
  onPrintInvoice,
  onPrintOrder,
  disableSave,
}: Props) {
  const [editingNoteLineId, setEditingNoteLineId] = useState<string | null>(null);
  const [editingQtyLineId, setEditingQtyLineId] = useState<string | null>(null);
  const [editingPriceLineId, setEditingPriceLineId] = useState<string | null>(null);
  const [priceEditMode, setPriceEditMode] = useState<PriceEditMode>('amount');
  const [priceEditInput, setPriceEditInput] = useState('');
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [customerPaidInput, setCustomerPaidInput] = useState(String(Math.max(0, Math.trunc(initialPaidAmount ?? totalAmount))));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialPaymentMethod ?? 'CASH');
  const [autoFillPaid, setAutoFillPaid] = useState(false);
  const [editingTimeField, setEditingTimeField] = useState<{ lineId: string; field: 'startAt' | 'stopAt'; currentValue: Date } | null>(null);
  const [timeEditError, setTimeEditError] = useState<string | null>(null);
  const totalLimit = Math.max(0, Math.trunc(totalAmount));

  useEffect(() => {
    setSelectedLineIds((prev) => {
      const next = prev.filter((lineId) => billItems.some((item) => item.lineId === lineId));
      if (next.length === prev.length && next.every((lineId, index) => lineId === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [billItems]);

  useEffect(() => {
    if (!autoFillPaid) return;
    setCustomerPaidInput(String(totalLimit));
  }, [autoFillPaid, totalLimit]);

  useEffect(() => {
    setPaymentMethod(initialPaymentMethod ?? 'CASH');
  }, [initialPaymentMethod]);

  const subtotal = billItems.reduce((sum, item) => sum + getLineAmount(item), 0);
  const discountRaw = discountMode === 'amount' ? toAmountNumber(discountValue) : toPercentNumber(discountValue);
  const surchargeRaw = surchargeMode === 'amount' ? toAmountNumber(surchargeValue) : toPercentNumber(surchargeValue);
  const subtotalAmount = toMoney(subtotal);
  const discountAmount = discountMode === 'percent'
    ? toMoney(Math.min(subtotalAmount, (subtotalAmount * Math.max(0, discountRaw)) / 100))
    : Math.min(subtotalAmount, toMoney(discountRaw));
  const subtotalAfterDiscount = Math.max(0, subtotalAmount - discountAmount);
  const surchargeAmount = surchargeMode === 'percent'
    ? toMoney((subtotalAfterDiscount * Math.max(0, surchargeRaw)) / 100)
    : toMoney(surchargeRaw);
  const editingPriceItem = editingPriceLineId ? billItems.find((item) => item.lineId === editingPriceLineId) || null : null;
  const oldUnitPrice = Math.max(0, Math.trunc(Number(editingPriceItem?.baseUnitPrice ?? editingPriceItem?.unitPrice ?? 0)));
  const parsedAmountValue = Math.max(0, Math.trunc(Number(priceEditInput.replace(/\D/g, '')) || 0));
  const parsedPercentValue = Math.max(0, Number(priceEditInput.replace(',', '.')) || 0);
  const nextUnitPricePreview = priceEditMode === 'amount'
    ? Math.max(0, oldUnitPrice - parsedAmountValue)
    : Math.max(0, Math.floor(oldUnitPrice - ((oldUnitPrice * Math.min(100, parsedPercentValue)) / 100)));

  const openPriceEditor = (item: BillItem) => {
    setEditingPriceLineId(item.lineId);
    setPriceEditMode('amount');
    setPriceEditInput('0');
  };

  const closePriceEditor = () => {
    setEditingPriceLineId(null);
    setPriceEditMode('amount');
    setPriceEditInput('');
  };

  const savePriceEditor = () => {
    if (!editingPriceItem) return;
    onUpdateUnitPrice(editingPriceItem.lineId, nextUnitPricePreview);
    closePriceEditor();
  };

  return (
    <aside className="orders-bills-panel">
      {editingTimeField && onUpdateTimeLineTimestamp && (
        <DateTimePicker
          value={editingTimeField.currentValue}
          errorMessage={timeEditError}
          onChange={async (newDate) => {
            const item = billItems.find((b) => b.lineId === editingTimeField.lineId);
            if (!item) return;
            const newIso = newDate.toISOString();
            if (editingTimeField.field === 'stopAt' && item.startAt) {
              if (newDate.getTime() <= new Date(item.startAt).getTime()) {
                setTimeEditError('Giờ ra không được sớm hơn giờ vào');
                return;
              }
            }
            if (editingTimeField.field === 'startAt' && item.stopAt) {
              if (newDate.getTime() >= new Date(item.stopAt).getTime()) {
                setTimeEditError('Giờ ra không được sớm hơn giờ vào');
                return;
              }
            }
            setTimeEditError(null);
            await onUpdateTimeLineTimestamp(editingTimeField.lineId, editingTimeField.field, newIso);
            setEditingTimeField(null);
          }}
          onClose={() => {
            setTimeEditError(null);
            setEditingTimeField(null);
          }}
        />
      )}
      {editingPriceItem && (
        <div className="orders-price-modal-overlay" onClick={closePriceEditor}>
          <div className="orders-price-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="orders-price-modal-close" onClick={closePriceEditor} aria-label="Đóng popup chỉnh đơn giá">X</button>
            <h3>Chỉnh đơn giá</h3>
            <div className="orders-price-modal-product">{editingPriceItem.productName}</div>
            <div className="orders-price-modal-mode-switch">
              <button
                type="button"
                className={`orders-price-modal-mode-btn ${priceEditMode === 'amount' ? 'active' : ''}`}
                onClick={() => {
                  setPriceEditMode('amount');
                  setPriceEditInput('0');
                }}
              >
                đ
              </button>
              <button
                type="button"
                className={`orders-price-modal-mode-btn ${priceEditMode === 'percent' ? 'active' : ''}`}
                onClick={() => {
                  setPriceEditMode('percent');
                  setPriceEditInput('0');
                }}
              >
                %
              </button>
            </div>
            <input
              className="orders-price-modal-input"
              autoFocus
              value={priceEditMode === 'amount' ? formatThousands(priceEditInput) : priceEditInput}
              onFocus={(event) => event.target.select()}
              onChange={(event) => {
                if (priceEditMode === 'amount') {
                  setPriceEditInput(event.target.value.replace(/\D/g, ''));
                  return;
                }
                const sanitized = event.target.value.replace(/[^\d.,]/g, '').replace(',', '.');
                setPriceEditInput(sanitized);
              }}
              inputMode={priceEditMode === 'amount' ? 'numeric' : 'decimal'}
              placeholder={priceEditMode === 'amount' ? 'Nhập số tiền giảm' : 'Nhập % giảm'}
            />
            <div className="orders-price-modal-preview">
              <div>Giá mới: <strong>{Math.trunc(nextUnitPricePreview).toLocaleString('vi-VN')}</strong></div>
              <div>Giá cũ: <span>{Math.trunc(oldUnitPrice).toLocaleString('vi-VN')}</span></div>
            </div>
            <div className="orders-price-modal-actions">
              <button type="button" className="ghost-btn" onClick={closePriceEditor}>Hủy</button>
              <button type="button" className="primary-btn" onClick={savePriceEditor}>Lưu</button>
            </div>
          </div>
        </div>
      )}
      <div className="orders-bills-topbar">
        <div className="orders-table-pill">
          {selectedTable
            ? selectedTable.entityType === 'ROOM'
              ? `${selectedTable.areaName} / ${selectedTable.roomName || selectedTable.name}`
              : `${selectedTable.areaName}${selectedTable.roomName ? ` / ${selectedTable.roomName}` : ''} / ${selectedTable.name}`
            : 'Chưa chọn phòng/bàn'}
        </div>

        <div className="orders-bills-top-actions">
          <div className="orders-bill-actions">
            <button type="button" className="ghost-btn" disabled={billItems.length === 0} onClick={onPrintInvoice}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6 2h12a1 1 0 0 1 1 1v4H5V3a1 1 0 0 1 1-1Z" />
                <path d="M5 14h14v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7Zm3 1v5h8v-5H8Z" />
                <path d="M3 8h18a2 2 0 0 1 2 2v5h-4v-2H5v2H1v-5a2 2 0 0 1 2-2Zm16 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
              </svg>
              In HĐ
            </button>
            <button
              type="button"
              className="ghost-btn"
              disabled={billItems.length === 0}
              onClick={() => onPrintOrder(selectedLineIds)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6 2h12a1 1 0 0 1 1 1v4H5V3a1 1 0 0 1 1-1Z" />
                <path d="M5 14h14v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7Zm3 1v5h8v-5H8Z" />
                <path d="M3 8h18a2 2 0 0 1 2 2v5h-4v-2H5v2H1v-5a2 2 0 0 1 2-2Zm16 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
              </svg>
              In order
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={() => onSaveOrder(Number(customerPaidInput) || 0, paymentMethod)}
              disabled={disableSave}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="3" y="4" width="18" height="16" rx="4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 10h18" strokeLinecap="round" />
                <path d="M15.5 16.5h3" strokeLinecap="round" />
              </svg>
              Lưu
            </button>
          </div>
        </div>
      </div>

      <div className="orders-bills-card">
        <div className="orders-bills-head">
          <div className="orders-customer-row">
            <span className="orders-row-label">Tên khách hàng</span>
            <div className="orders-customer-main">
              <input
                className="orders-customer-input"
                value={customerName}
                onChange={(event) => onCustomerNameChange(event.target.value)}
                placeholder="Nhập tên khách hàng"
              />
            </div>
          </div>
        </div>

        <div className="orders-adjustment-row">
        <div className="orders-adjustment-group">
          <div className="orders-adjustment-label">Giảm giá</div>
          <div className="orders-adjustment-control">
            <div className="orders-adjustment-mode-switch">
              <button
                type="button"
                className={`orders-adjustment-mode-btn ${discountMode === 'amount' ? 'active' : ''}`}
                onClick={() => onDiscountModeChange('amount')}
              >
                đ
              </button>
              <button
                type="button"
                className={`orders-adjustment-mode-btn ${discountMode === 'percent' ? 'active' : ''}`}
                onClick={() => onDiscountModeChange('percent')}
              >
                %
              </button>
            </div>
            <input
              className="orders-adjustment-value-input"
              value={discountMode === 'amount' ? formatThousands(discountValue) : discountValue}
              onFocus={(event) => event.target.select()}
              onChange={(event) => {
                if (discountMode === 'amount') {
                  onDiscountValueChange(event.target.value.replace(/\D/g, ''));
                  return;
                }
                onDiscountValueChange(event.target.value);
              }}
              inputMode={discountMode === 'amount' ? 'numeric' : 'decimal'}
            />
          </div>
        </div>

        <div className="orders-adjustment-group">
          <div className="orders-adjustment-label">Phí dịch vụ</div>
          <div className="orders-adjustment-control">
            <div className="orders-adjustment-mode-switch">
              <button
                type="button"
                className={`orders-adjustment-mode-btn ${surchargeMode === 'amount' ? 'active' : ''}`}
                onClick={() => onSurchargeModeChange('amount')}
              >
                đ
              </button>
              <button
                type="button"
                className={`orders-adjustment-mode-btn ${surchargeMode === 'percent' ? 'active' : ''}`}
                onClick={() => onSurchargeModeChange('percent')}
              >
                %
              </button>
            </div>
            <input
              className="orders-adjustment-value-input"
              value={surchargeMode === 'amount' ? formatThousands(surchargeValue) : surchargeValue}
              onFocus={(event) => event.target.select()}
              onChange={(event) => {
                if (surchargeMode === 'amount') {
                  onSurchargeValueChange(event.target.value.replace(/\D/g, ''));
                  return;
                }
                onSurchargeValueChange(event.target.value);
              }}
              inputMode={surchargeMode === 'amount' ? 'numeric' : 'decimal'}
            />
          </div>
        </div>
        </div>

        <div className="orders-summary-box">
        <div className="orders-summary-meta">
          <span>Tạm tính: {Math.trunc(subtotal).toLocaleString('vi-VN')}</span>
          <span>Giảm giá: {Math.trunc(discountAmount).toLocaleString('vi-VN')}</span>
          <span>Phí dịch vụ: {Math.trunc(surchargeAmount).toLocaleString('vi-VN')}</span>
        </div>
        <strong>PHẢI THANH TOÁN: {Math.trunc(totalAmount).toLocaleString('vi-VN')}</strong>
        </div>

        <div className="orders-customer-paid-row">
          <span className="orders-row-label">Tiền khách trả</span>
          <div className="orders-customer-paid-main">
            <div className="orders-payment-methods" role="radiogroup" aria-label="Phương thức thanh toán">
              <label className="orders-payment-method-option">
                <input
                  type="radio"
                  name="orders-payment-method"
                  checked={paymentMethod === 'CASH'}
                  onChange={() => setPaymentMethod('CASH')}
                />
                <span>Tiền mặt</span>
              </label>
              <label className="orders-payment-method-option">
                <input
                  type="radio"
                  name="orders-payment-method"
                  checked={paymentMethod === 'BANKING'}
                  onChange={() => setPaymentMethod('BANKING')}
                />
                <span>Chuyển khoản</span>
              </label>
            </div>
            <input
              className="orders-customer-paid-input"
              value={formatThousands(customerPaidInput)}
              onFocus={(event) => event.target.select()}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '');
                const nextValue = digits ? Number(digits) : 0;
                setCustomerPaidInput(String(Math.min(totalLimit, Math.max(0, nextValue))));
              }}
              inputMode="numeric"
              placeholder="0"
              disabled={autoFillPaid}
            />
            <label className="orders-auto-fill-paid-option">
              <input
                type="checkbox"
                checked={autoFillPaid}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setAutoFillPaid(checked);
                  if (checked) {
                    setCustomerPaidInput(String(totalLimit));
                  }
                }}
              />
              <span>Tự động điền</span>
            </label>
          </div>
        </div>

        <div className="orders-bill-toolbar-row">
        <div className="orders-duplicate-rule">
          <span className="orders-row-label">Khi trùng món</span>
          <select value={duplicateHandling} onChange={(event) => onDuplicateHandlingChange(event.target.value as DuplicateHandling)}>
            <option value="merge">Gộp dòng</option>
            <option value="split">Tách dòng mới</option>
          </select>
        </div>
        </div>

        <div className={`orders-bill-lines ${billItems.length >= 4 ? 'orders-bill-lines-force-scroll' : ''}`}>
        {billItems.length === 0 ? (
          <div className="orders-empty-row">Chưa có món trong hóa đơn</div>
        ) : (
          billItems.map((item, index) => (
            (() => {
              return (
            <div className="orders-bill-line" key={item.lineId}>
              <div className="orders-bill-line-main">
                <label className="orders-line-check">
                  <input
                    type="checkbox"
                    checked={selectedLineIds.includes(item.lineId)}
                    onChange={(event) => {
                      setSelectedLineIds((prev) => {
                        if (event.target.checked) {
                          if (prev.includes(item.lineId)) return prev;
                          return [...prev, item.lineId];
                        }
                        return prev.filter((lineId) => lineId !== item.lineId);
                      });
                    }}
                    aria-label={`Chọn dòng món ${item.productName}`}
                  />
                </label>
                <div>
                  <h4>
                    {index + 1}. {item.productName}
                  </h4>
                  {item.pricingTypeSnapshot !== 'TIME' && <small>{item.unit ? `Đơn vị: ${item.unit}` : 'Đơn vị: -'}</small>}
                  {item.pricingTypeSnapshot === 'TIME' && (
                    <>
                      <small>
                        Block: {Math.max(1, Math.trunc(Number(item.timeRateMinutesSnapshot || 0)))} phút
                      </small>
                      <small>
                        Giờ vào:{' '}
                        <span
                          className="orders-time-value"
                          onClick={() => {
                            if (!item.startAt || !onUpdateTimeLineTimestamp) return;
                            setTimeEditError(null);
                            setEditingTimeField({ lineId: item.lineId, field: 'startAt', currentValue: new Date(item.startAt) });
                          }}
                        >
                          {item.startAt ? formatDateTimeDisplay(item.startAt) : '—'}
                        </span>
                      </small>
                      <small>
                        Giờ ra:{' '}
                        <span
                          className="orders-time-value"
                          onClick={() => {
                            if (!item.stopAt || !onUpdateTimeLineTimestamp) return;
                            setTimeEditError(null);
                            setEditingTimeField({ lineId: item.lineId, field: 'stopAt', currentValue: new Date(item.stopAt) });
                          }}
                        >
                          {item.stopAt ? formatDateTimeDisplay(item.stopAt) : '—'}
                        </span>
                      </small>
                    </>
                  )}
                  <button type="button" className="orders-note-trigger" onClick={() => setEditingNoteLineId(item.lineId)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <rect x="5" y="3" width="14" height="18" rx="2" />
                      <path d="M9 8h6M9 12h6M9 16h4" strokeLinecap="round" />
                    </svg>
                    <span>{item.note?.trim() ? item.note : 'Ghi chú/Món thêm'}</span>
                  </button>
                  {editingNoteLineId === item.lineId && (
                    <input
                      autoFocus
                      className="orders-note-inline-input"
                      value={item.note}
                      onChange={(event) => onUpdateNote(item.lineId, event.target.value)}
                      onBlur={() => setEditingNoteLineId(null)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === 'Escape') {
                          setEditingNoteLineId(null);
                        }
                      }}
                      placeholder="Nhập ghi chú/món thêm"
                    />
                  )}
                </div>

                {item.pricingTypeSnapshot !== 'TIME' && (
                  <div className="orders-bill-qty-wrap">
                    <button type="button" onClick={() => onDecreaseQty(item.lineId)}>
                      -
                    </button>
                    {editingQtyLineId === item.lineId ? (
                      <input
                        autoFocus
                        className="orders-qty-inline-input"
                        value={String(item.quantity)}
                        inputMode="numeric"
                        onFocus={(event) => event.target.select()}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, '');
                          onSetQty(item.lineId, digits ? Number(digits) : 0);
                        }}
                        onBlur={() => setEditingQtyLineId(null)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === 'Escape') {
                            setEditingQtyLineId(null);
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="orders-qty-trigger"
                        onClick={() => setEditingQtyLineId(item.lineId)}
                      >
                        {item.quantity}
                      </button>
                    )}
                    <button type="button" onClick={() => onIncreaseQty(item.lineId)}>
                      +
                    </button>
                  </div>
                )}

                {item.pricingTypeSnapshot === 'TIME' && (
                  <TimeLineControls
                    lineId={item.lineId}
                    startAt={item.startAt}
                    stopAt={item.stopAt}
                    isLoading={timerLoadingLineIds.includes(item.lineId)}
                    isUnsynced={timerUnsyncedLineIds.includes(item.lineId)}
                    hasError={timerErrorLineIds.includes(item.lineId)}
                    onToggleTimeLineTimer={onToggleTimeLineTimer}
                  />
                )}

                {(() => {
                  const basePrice = Math.max(0, Math.trunc(Number(item.baseUnitPrice ?? item.unitPrice ?? 0)));
                  const currentPrice = Math.max(0, Math.trunc(Number(item.unitPrice || 0)));
                  const showPriceDiff = basePrice !== currentPrice;
                  return (
                    <button
                      type="button"
                      className="orders-bill-price orders-price-trigger"
                      onClick={() => openPriceEditor(item)}
                    >
                      {showPriceDiff ? (
                        <span className="orders-price-stack">
                          <span className="orders-price-new">{currentPrice.toLocaleString('vi-VN')}</span>
                          <span className="orders-price-old">{basePrice.toLocaleString('vi-VN')}</span>
                        </span>
                      ) : (
                        currentPrice.toLocaleString('vi-VN')
                      )}
                    </button>
                  );
                })()}
                <div className="orders-bill-amount">{Math.trunc(getLineAmount(item)).toLocaleString('vi-VN')}</div>
                <button type="button" className="orders-remove-line-btn" onClick={() => onRemoveLine(item.lineId)}>
                  x
                </button>
              </div>

            </div>
              );
            })()
          ))
        )}
        </div>
      </div>
    </aside>
  );
}
