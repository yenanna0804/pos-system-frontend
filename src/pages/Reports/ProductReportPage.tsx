import { Fragment, useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import { useAuth } from '../../contexts/AuthContext';
import { categoryService, reportService } from '../../services/api';
import FilterResetButton from '../../components/FilterResetButton';
import { formatDateTimeVN, formatNumberVi, splitDateTimeParts, toDateFromParts, toDateTimeInputValue, toISOWithVNOffset } from '../../utils/formatters';
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

const fmt = formatNumberVi;
const splitParts = splitDateTimeParts;

type GroupedProduct = {
  productId: string;
  productName: string;
  unit: string | null;
  totalQuantity: number;
  netAmount: number;
};

type GroupedCategory = {
  categoryId: string;
  categoryName: string;
  totalQuantity: number;
  totalRevenue: number;
  products: GroupedProduct[];
};

export default function ProductReportPage() {
  const { branchId } = useAuth();
  const now = useMemo(() => new Date(), []);
  const isAfterNoon = now.getHours() >= 12;
  const initStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  if (!isAfterNoon) initStartDate.setDate(initStartDate.getDate() - 1);
  const initEndDate = new Date(initStartDate);
  initEndDate.setDate(initEndDate.getDate() + 1);
  const initStart = splitParts(toDateTimeInputValue(initStartDate));
  const initEnd = splitParts(toDateTimeInputValue(initEndDate));

  const [startDate, setStartDate] = useState(initStart.datePart);
  const [startTime, setStartTime] = useState(initStart.timePart);
  const [endDate, setEndDate] = useState(initEnd.datePart);
  const [endTime, setEndTime] = useState(initEnd.timePart);
  const [activeDateTimePicker, setActiveDateTimePicker] = useState<'start' | 'end' | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    categoryService.list().then((res) => {
      setCategories(Array.isArray(res.data) ? res.data : []);
    }).catch(() => setCategories([]));
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
    const resetStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    if (!isAfterNoon) resetStartDate.setDate(resetStartDate.getDate() - 1);
    const resetEndDate = new Date(resetStartDate);
    resetEndDate.setDate(resetEndDate.getDate() + 1);
    const s = splitParts(toDateTimeInputValue(resetStartDate));
    const e = splitParts(toDateTimeInputValue(resetEndDate));
    setStartDate(s.datePart); setStartTime(s.timePart);
    setEndDate(e.datePart); setEndTime(e.timePart);
    setCategoryFilter('');
  };

  const groupedRows = useMemo<GroupedCategory[]>(() => {
    const grouped = new Map<string, GroupedCategory>();
    for (const row of rows) {
      const key = row.categoryId || '__uncategorized__';
      const categoryName = row.categoryName || 'Chưa phân nhóm';
      if (!grouped.has(key)) {
        grouped.set(key, {
          categoryId: key,
          categoryName,
          totalQuantity: 0,
          totalRevenue: 0,
          products: [],
        });
      }
      const group = grouped.get(key)!;
      group.totalQuantity += Number(row.totalQuantity || 0);
      group.totalRevenue += Number(row.netAmount || 0);
      group.products.push({
        productId: row.productId,
        productName: row.productName,
        unit: row.unit,
        totalQuantity: Number(row.totalQuantity || 0),
        netAmount: Number(row.netAmount || 0),
      });
    }

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        products: [...group.products].sort((a, b) => a.productName.localeCompare(b.productName, 'vi')),
      }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'vi'));
  }, [rows]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    totalQuantity: acc.totalQuantity + Number(r.totalQuantity || 0),
    totalRevenue: acc.totalRevenue + Number(r.netAmount || 0),
  }), { totalQuantity: 0, totalRevenue: 0 }), [rows]);

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Bao cao hang hoa');
    sheet.addRow(['BÁO CÁO HÀNG HÓA']);
    sheet.addRow([`Từ: ${startDate} ${startTime}  Đến: ${endDate} ${endTime}`]);
    sheet.addRow([]);
    sheet.addRow(['Tên nhóm/món', 'ĐVT', 'SL', 'Doanh thu']);
    for (const group of groupedRows) {
      sheet.addRow([`Nhóm: ${group.categoryName}`, '', Math.trunc(group.totalQuantity), Math.trunc(group.totalRevenue)]);
      for (const product of group.products) {
        sheet.addRow([`  ${product.productName}`, product.unit || '-', Math.trunc(product.totalQuantity), Math.trunc(product.netAmount)]);
      }
    }
    sheet.addRow(['TỔNG CỘNG', '', Math.trunc(totals.totalQuantity), Math.trunc(totals.totalRevenue)]);
    sheet.getRow(1).font = { bold: true, size: 14 };
    sheet.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };

    for (let colIdx = 1; colIdx <= 4; colIdx += 1) {
      const col = sheet.getColumn(colIdx);
      let maxLength = 10;
      col.eachCell({ includeEmpty: true }, (cell) => {
        const raw = String(cell.value ?? '');
        const longestLine = raw.split('\n').reduce((m, part) => Math.max(m, part.length), 0);
        maxLength = Math.max(maxLength, longestLine + 2);
      });
      col.width = Math.min(maxLength, colIdx === 1 ? 46 : 24);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bao-cao-hang-hoa_${startDate}_${endDate}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="sales-report-page">
      <div className="sales-report-header">
        <h2>Báo cáo hàng hóa</h2>
        <div className="sales-report-header-actions">
          <button type="button" className="ghost-btn sales-export-btn" onClick={() => { void exportToExcel(); }} disabled={rows.length === 0} title="Xuất Excel">
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
              <th>Tên nhóm/món</th>
              <th>ĐVT</th>
              <th className="num-col">SL</th>
              <th className="num-col">Doanh thu</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="sales-report-empty">Chưa có dữ liệu</td></tr>
            ) : (
              <>
                <tr className="product-report-total-row">
                  <td colSpan={2}><strong>Tổng cộng ({rows.length} món)</strong></td>
                  <td className="num-col"><strong>{fmt(totals.totalQuantity)}</strong></td>
                  <td className="num-col"><strong>{fmt(totals.totalRevenue)}</strong></td>
                </tr>

                {groupedRows.map((group) => (
                  <Fragment key={`group-${group.categoryId}`}>
                    <tr className="sales-group-row">
                      <td><strong>{group.categoryName}</strong></td>
                      <td></td>
                      <td className="num-col"><strong>{fmt(group.totalQuantity)}</strong></td>
                      <td className="num-col"><strong>{fmt(group.totalRevenue)}</strong></td>
                    </tr>
                    {group.products.map((product) => (
                      <tr key={product.productId}>
                        <td style={{ paddingLeft: 28 }}>{product.productName}</td>
                        <td>{product.unit || '-'}</td>
                        <td className="num-col">{fmt(product.totalQuantity)}</td>
                        <td className="num-col">{fmt(product.netAmount)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
