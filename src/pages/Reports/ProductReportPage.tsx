import { Fragment, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { categoryService, reportService } from '../../services/api';
import FilterResetButton from '../../components/FilterResetButton';
import TooltipInfoButton from '../../components/TooltipInfoButton';
import { formatDateTimeVN, toISOWithVNOffset } from '../../utils/formatters';
import DateTimePicker from '../Orders/components/DateTimePicker';
import '../Orders/OrdersPage.css';
import './SalesEndOfDayPage.css';

type Category = { id: string; name: string };

type OrderDetail = {
  orderId: string;
  orderCode: string;
  createdAt: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type ProductRow = {
  productId: string;
  productName: string;
  unit: string | null;
  categoryId: string | null;
  categoryName: string;
  costPrice: number | null;
  totalQuantity: number;
  grossAmount: number;
  discountAmount: number;
  surchargeAmount: number;
  netAmount: number;
  grossProfit: number | null;
  orderDetails: OrderDetail[];
};

const fmt = (v: number) => Math.trunc(Number(v || 0)).toLocaleString('vi-VN');

const toDateTimeInputValue = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const splitParts = (v: string) => {
  const [datePart, timePart] = v.split('T');
  const [h = '00', m = '00'] = (timePart || '').split(':');
  return { datePart, timePart: `${h}:${m}` };
};

const toDateFromParts = (datePart: string, timePart: string) => {
  const parsed = new Date(`${datePart}T${timePart}:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

export default function ProductReportPage() {
  const { branchId } = useAuth();
  const now = useMemo(() => new Date(), []);
  const initStart = splitParts(toDateTimeInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0)));
  const initEnd = splitParts(toDateTimeInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59)));

  const [startDate, setStartDate] = useState(initStart.datePart);
  const [startTime, setStartTime] = useState(initStart.timePart);
  const [endDate, setEndDate] = useState(initEnd.datePart);
  const [endTime, setEndTime] = useState(initEnd.timePart);
  const [activeDateTimePicker, setActiveDateTimePicker] = useState<'start' | 'end' | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [openTooltip, setOpenTooltip] = useState<{ key: string; top: number; left: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    categoryService.list().then((res) => {
      setCategories(Array.isArray(res.data) ? res.data : []);
    }).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.col-th-tooltip-anchor')) setOpenTooltip(null);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, []);

  const loadReport = async () => {
    if (!branchId) { setRows([]); return; }
    setIsLoading(true);
    setError('');
    try {
      const res = await reportService.products({
        branchId,
        startDate: startDate && startTime ? toISOWithVNOffset(startDate, startTime) : undefined,
        endDate: endDate && endTime ? toISOWithVNOffset(endDate, endTime, true) : undefined,
        categoryId: categoryFilter || undefined,
      });
      const nextRows: ProductRow[] = Array.isArray(res.data?.rows) ? res.data.rows : [];
      setRows(nextRows);
      setExpandedIds([]);
    } catch {
      setError('Không tải được báo cáo hàng hóa');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReport().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, startDate, startTime, endDate, endTime, categoryFilter]);

  const resetFilters = () => {
    const s = splitParts(toDateTimeInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0)));
    const e = splitParts(toDateTimeInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59)));
    setStartDate(s.datePart); setStartTime(s.timePart);
    setEndDate(e.datePart); setEndTime(e.timePart);
    setCategoryFilter('');
  };

  const toggleExpand = (productId: string) =>
    setExpandedIds((prev) => prev.includes(productId) ? prev.filter((x) => x !== productId) : [...prev, productId]);

  const colTooltips: [string, string, string, string][] = [
    ['qty',    'SL bán',        'Số lượng bán',      'Tổng số lượng sản phẩm được bán trong kỳ báo cáo (tính trên các hóa đơn đã thanh toán).'],
    ['gross',  'DT gộp',        'Doanh thu gộp',     'Giá bán gốc × Số lượng, trước khi áp dụng bất kỳ giảm giá hay phí dịch vụ nào.'],
    ['disc',   'Giảm giá',      'Giảm giá',          'Tổng số tiền giảm giá đã áp dụng cho sản phẩm này trong các hóa đơn của kỳ báo cáo.'],
    ['surch',  'Phí dịch vụ',   'Phí dịch vụ',       'Tổng phí dịch vụ áp dụng riêng cho sản phẩm này trong các hóa đơn (ví dụ: phụ phí theo dòng món).'],
    ['net',    'DT thuần',      'Doanh thu thuần',   'DT gộp − Giảm giá + Phí dịch vụ. Đây là số tiền thực thu được từ sản phẩm này sau tất cả điều chỉnh.'],
    ['cost',   'Giá vốn',       'Giá vốn đơn vị',   'Giá nhập hàng (giá vốn) đã khai báo trong danh mục sản phẩm. Nếu chưa khai báo sẽ hiển thị "−".'],
    ['profit', 'LN gộp',        'Lợi nhuận gộp',    'DT thuần − (Giá vốn × Số lượng). Phản ánh lợi nhuận trước chi phí vận hành. Chỉ tính khi sản phẩm có giá vốn.'],
  ];

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    totalQuantity: acc.totalQuantity + r.totalQuantity,
    grossAmount: acc.grossAmount + r.grossAmount,
    discountAmount: acc.discountAmount + r.discountAmount,
    surchargeAmount: acc.surchargeAmount + r.surchargeAmount,
    netAmount: acc.netAmount + r.netAmount,
    grossProfit: acc.grossProfit != null && r.grossProfit != null ? acc.grossProfit + r.grossProfit : null,
  }), { totalQuantity: 0, grossAmount: 0, discountAmount: 0, surchargeAmount: 0, netAmount: 0, grossProfit: 0 as number | null }), [rows]);

  const exportToCsv = () => {
    const esc = (v: string) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
    const out: string[][] = [];
    out.push(['BÁO CÁO HÀNG HÓA']);
    out.push([`Từ: ${startDate} ${startTime}  Đến: ${endDate} ${endTime}`]);
    out.push([]);
    out.push(['Tên sản phẩm', 'Danh mục', 'ĐVT', 'SL bán', 'DT gộp', 'Giảm giá', 'Phí dịch vụ', 'DT thuần', 'Giá vốn', 'LN gộp']);
    for (const r of rows) {
      out.push([r.productName, r.categoryName, r.unit || '-', String(Math.trunc(r.totalQuantity)), String(Math.trunc(r.grossAmount)), String(Math.trunc(r.discountAmount)), String(Math.trunc(r.surchargeAmount)), String(Math.trunc(r.netAmount)), r.costPrice != null ? String(Math.trunc(r.costPrice)) : '-', r.grossProfit != null ? String(Math.trunc(r.grossProfit)) : '-']);
      for (const o of r.orderDetails) {
        out.push([`  ${o.orderCode}`, formatDateTimeVN(o.createdAt), '', String(Math.trunc(o.quantity)), '', '', '', String(Math.trunc(o.lineTotal)), '', '']);
      }
    }
    out.push(['TỔNG CỘNG', '', '', String(Math.trunc(totals.totalQuantity)), String(Math.trunc(totals.grossAmount)), String(Math.trunc(totals.discountAmount)), String(Math.trunc(totals.surchargeAmount)), String(Math.trunc(totals.netAmount)), '-', totals.grossProfit != null ? String(Math.trunc(totals.grossProfit)) : '-']);
    const csv = out.map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bao-cao-hang-hoa_${startDate}_${endDate}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="sales-report-page">
      <div className="sales-report-header">
        <h2>Báo cáo hàng hóa</h2>
        <div className="sales-report-header-actions">
          <button type="button" className="ghost-btn sales-export-btn" onClick={exportToCsv} disabled={rows.length === 0} title="Xuất Excel (CSV)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 15V3m0 12-4-4m4 4 4-4" />
              <path d="M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17" />
            </svg>
            Xuất Excel
          </button>
          <FilterResetButton className="sales-filter-reset-btn" onClick={resetFilters} />
        </div>
      </div>

      <div className="orders-filter-block sales-report-filters">
        <div className="orders-picker-filters orders-picker-filters-first-row">
          <label className="orders-filter-col-from-date">
            Từ ngày giờ
            <div className="sales-datetime-custom">
              <button type="button" className="sales-datetime-trigger" onClick={() => setActiveDateTimePicker('start')}>
                {formatDateTimeVN(toDateFromParts(startDate, startTime).toISOString())}
              </button>
            </div>
          </label>

          <label className="orders-filter-col-to-date">
            Đến ngày giờ
            <div className="sales-datetime-custom">
              <button type="button" className="sales-datetime-trigger" onClick={() => setActiveDateTimePicker('end')}>
                {formatDateTimeVN(toDateFromParts(endDate, endTime).toISOString())}
              </button>
            </div>
          </label>

          <label className="orders-filter-col-area">
            Danh mục
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Tất cả danh mục</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>

        {activeDateTimePicker === 'start' && (
          <DateTimePicker
            value={toDateFromParts(startDate, startTime)}
            onChange={(newDate) => {
              const next = splitParts(toDateTimeInputValue(newDate));
              setStartDate(next.datePart);
              setStartTime(next.timePart);
              setActiveDateTimePicker(null);
            }}
            onClose={() => setActiveDateTimePicker(null)}
          />
        )}

        {activeDateTimePicker === 'end' && (
          <DateTimePicker
            value={toDateFromParts(endDate, endTime)}
            onChange={(newDate) => {
              const next = splitParts(toDateTimeInputValue(newDate));
              setEndDate(next.datePart);
              setEndTime(next.timePart);
              setActiveDateTimePicker(null);
            }}
            onClose={() => setActiveDateTimePicker(null)}
          />
        )}
      </div>

      {error && <div className="sales-report-error">{error}</div>}
      {isLoading && <div className="sales-report-loading">Đang tải dữ liệu...</div>}

      <div className="sales-report-table-wrap">
        <table className="sales-report-table">
          <thead>
            <tr>
              <th>Tên sản phẩm</th>
              <th>Danh mục</th>
              <th>ĐVT</th>
              {(colTooltips).map(([key, label, title]) => (
                <th key={key} className="num-col">
                  <span className="col-th-wrap">
                    {label}
                    <span className="col-th-tooltip-anchor">
                      <TooltipInfoButton
                        label={title}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (openTooltip?.key === key) { setOpenTooltip(null); return; }
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setOpenTooltip({ key, top: rect.bottom + 8, left: Math.max(16, rect.right - 260) });
                        }}
                      />
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={10} className="sales-report-empty">Chưa có dữ liệu</td></tr>
            ) : (
              <>
                <tr className="product-report-total-row">
                  <td colSpan={3}><strong>Tổng cộng ({rows.length} sản phẩm)</strong></td>
                  <td className="num-col"><strong>{fmt(totals.totalQuantity)}</strong></td>
                  <td className="num-col"><strong>{fmt(totals.grossAmount)}</strong></td>
                  <td className="num-col"><strong>{fmt(totals.discountAmount)}</strong></td>
                  <td className="num-col"><strong>{fmt(totals.surchargeAmount)}</strong></td>
                  <td className="num-col"><strong>{fmt(totals.netAmount)}</strong></td>
                  <td className="num-col">-</td>
                  <td className="num-col"><strong>{totals.grossProfit != null ? fmt(totals.grossProfit) : '-'}</strong></td>
                </tr>

                {rows.map((r) => {
                  const expanded = expandedIds.includes(r.productId);
                  return (
                    <Fragment key={r.productId}>
                      <tr className="sales-group-row" onClick={() => toggleExpand(r.productId)}>
                        <td>
                          <button type="button" className="sales-expand-btn">
                            {expanded ? '▼' : '▶'} {r.productName} ({r.orderDetails.length} hóa đơn)
                          </button>
                        </td>
                        <td>{r.categoryName}</td>
                        <td>{r.unit || '-'}</td>
                        <td className="num-col">{fmt(r.totalQuantity)}</td>
                        <td className="num-col">{fmt(r.grossAmount)}</td>
                        <td className="num-col">{fmt(r.discountAmount)}</td>
                        <td className="num-col">{fmt(r.surchargeAmount)}</td>
                        <td className="num-col">{fmt(r.netAmount)}</td>
                        <td className="num-col">{r.costPrice != null ? fmt(r.costPrice) : '-'}</td>
                        <td className="num-col">{r.grossProfit != null ? fmt(r.grossProfit) : '-'}</td>
                      </tr>
                      {expanded && r.orderDetails.map((o) => (
                        <tr key={o.orderId} className="sales-detail-row">
                          <td style={{ paddingLeft: 28 }}>{o.orderCode}</td>
                          <td>{formatDateTimeVN(o.createdAt)}</td>
                          <td></td>
                          <td className="num-col">{fmt(o.quantity)}</td>
                          <td className="num-col">-</td>
                          <td className="num-col">-</td>
                          <td className="num-col">-</td>
                          <td className="num-col">{fmt(o.lineTotal)}</td>
                          <td className="num-col">{fmt(o.unitPrice)}</td>
                          <td className="num-col">-</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>

      {openTooltip && (() => {
        const tip = colTooltips.find(([k]) => k === openTooltip.key);
        if (!tip) return null;
        return (
          <div className="col-th-tooltip-popover" style={{ top: openTooltip.top, left: openTooltip.left }}>
            <strong>{tip[2]}</strong>
            {tip[3]}
          </div>
        );
      })()}
    </div>
  );
}
