import { useState } from 'react';
import type { BillItem, DuplicateHandling, SelectableTable } from '../types';

type AdjustmentMode = 'percent' | 'amount';

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
  onSaveDraft: (paidAmount: number) => void;
  onPrintInvoice: () => void;
  disableSave: boolean;
};

const toAmountNumber = (value: string) => {
  const numeric = Number(value.replace(/\D/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
};

const toPercentNumber = (value: string) => {
  const numeric = Number(value.trim().replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatThousands = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('vi-VN');
};

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
  onSaveDraft,
  onPrintInvoice,
  disableSave,
}: Props) {
  const [editingNoteLineId, setEditingNoteLineId] = useState<string | null>(null);
  const [editingPriceLineId, setEditingPriceLineId] = useState<string | null>(null);
  const [editingQtyLineId, setEditingQtyLineId] = useState<string | null>(null);
  const [customerPaidInput, setCustomerPaidInput] = useState(String(Math.max(0, Math.round(initialPaidAmount ?? totalAmount))));
  const totalLimit = Math.max(0, Math.round(totalAmount));

  const subtotal = billItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discountRaw = discountMode === 'amount' ? toAmountNumber(discountValue) : toPercentNumber(discountValue);
  const surchargeRaw = surchargeMode === 'amount' ? toAmountNumber(surchargeValue) : toPercentNumber(surchargeValue);
  const discountAmount = discountMode === 'percent' ? Math.min(subtotal, (subtotal * Math.max(0, discountRaw)) / 100) : Math.max(0, discountRaw);
  const surchargeAmount = surchargeMode === 'percent' ? (subtotal * Math.max(0, surchargeRaw)) / 100 : Math.max(0, surchargeRaw);

  return (
    <aside className="orders-bills-panel">
      <div className="orders-bills-head">
        <div className="orders-table-pill">
          {selectedTable
            ? selectedTable.entityType === 'ROOM'
              ? `${selectedTable.areaName} / ${selectedTable.roomName || selectedTable.name}`
              : `${selectedTable.areaName}${selectedTable.roomName ? ` / ${selectedTable.roomName}` : ''} / ${selectedTable.name}`
            : 'Chưa chọn phòng/bàn'}
        </div>
        <input
          className="orders-customer-input"
          value={customerName}
          onChange={(event) => onCustomerNameChange(event.target.value)}
          placeholder="Nhập tên khách hàng"
        />
      </div>

      <div className="orders-adjustment-row">
        <div className="orders-adjustment-group">
          <div className="orders-adjustment-label">Giảm giá</div>
          <div className="orders-adjustment-mode-switch">
            <button
              type="button"
              className={`orders-adjustment-mode-btn ${discountMode === 'amount' ? 'active' : ''}`}
              onClick={() => onDiscountModeChange('amount')}
            >
              VND
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

        <div className="orders-adjustment-group">
          <div className="orders-adjustment-label">Phụ phí</div>
          <div className="orders-adjustment-mode-switch">
            <button
              type="button"
              className={`orders-adjustment-mode-btn ${surchargeMode === 'amount' ? 'active' : ''}`}
              onClick={() => onSurchargeModeChange('amount')}
            >
              VND
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

      <div className="orders-summary-box">
        <div className="orders-summary-meta">
          <span>Tạm tính: {subtotal.toLocaleString('vi-VN')}</span>
          <span>Giảm giá: {Math.round(discountAmount).toLocaleString('vi-VN')}</span>
          <span>Phụ phí: {Math.round(surchargeAmount).toLocaleString('vi-VN')}</span>
        </div>
        <strong>PHẢI THANH TOÁN: {Math.round(totalAmount).toLocaleString('vi-VN')}</strong>
      </div>

      <div className="orders-customer-paid-row">
        <div className="orders-customer-paid-main">
          <span>Tiền khách trả:</span>
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
          />
        </div>
        <div className="orders-customer-paid-quick">
          <button
            type="button"
            className="orders-customer-paid-suggest"
            onClick={() => setCustomerPaidInput(String(totalLimit))}
          >
            {totalLimit.toLocaleString('vi-VN')}
          </button>
        </div>
      </div>

      <div className="orders-bill-actions">
        <button type="button" className="orders-ghost-btn" disabled={billItems.length === 0} onClick={onPrintInvoice}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6 2h12a1 1 0 0 1 1 1v4H5V3a1 1 0 0 1 1-1Z" />
            <path d="M5 14h14v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7Zm3 1v5h8v-5H8Z" />
            <path d="M3 8h18a2 2 0 0 1 2 2v5h-4v-2H5v2H1v-5a2 2 0 0 1 2-2Zm16 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
          </svg>
          In hóa đơn
        </button>
        <button type="button" className="orders-primary-btn" onClick={() => onSaveDraft(Number(customerPaidInput) || 0)} disabled={disableSave}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="4" width="18" height="16" rx="4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 10h18" strokeLinecap="round" />
            <path d="M15.5 16.5h3" strokeLinecap="round" />
          </svg>
          Lưu
        </button>
      </div>

      <div className="orders-duplicate-rule">
        <span>Khi trùng món</span>
        <select value={duplicateHandling} onChange={(event) => onDuplicateHandlingChange(event.target.value as DuplicateHandling)}>
          <option value="merge">Gộp dòng</option>
          <option value="split">Tách dòng mới</option>
        </select>
      </div>

      <div className="orders-bill-lines">
        {billItems.length === 0 ? (
          <div className="orders-empty-row">Chưa có món trong hóa đơn</div>
        ) : (
          billItems.map((item, index) => (
            <div className="orders-bill-line" key={item.lineId}>
              <div className="orders-bill-line-main">
                <div>
                  <h4>
                    {index + 1}. {item.productName}
                  </h4>
                  <small>{item.unit ? `Đơn vị: ${item.unit}` : 'Đơn vị: -'}</small>
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

                {editingPriceLineId === item.lineId ? (
                  <input
                    autoFocus
                    className="orders-price-inline-input"
                    value={item.unitPrice.toLocaleString('vi-VN')}
                    inputMode="numeric"
                    onFocus={(event) => event.target.select()}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, '');
                      onUpdateUnitPrice(item.lineId, digits ? Number(digits) : 0);
                    }}
                    onBlur={() => setEditingPriceLineId(null)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === 'Escape') {
                        setEditingPriceLineId(null);
                      }
                    }}
                  />
                ) : (
                  <button type="button" className="orders-bill-price orders-price-trigger" onClick={() => setEditingPriceLineId(item.lineId)}>
                    {item.unitPrice.toLocaleString('vi-VN')}
                  </button>
                )}
                <div className="orders-bill-amount">{(item.unitPrice * item.quantity).toLocaleString('vi-VN')}</div>
                <button type="button" className="orders-remove-line-btn" onClick={() => onRemoveLine(item.lineId)}>
                  x
                </button>
              </div>

            </div>
          ))
        )}
      </div>
    </aside>
  );
}
