import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { areaService, diningTableService, orderService, reportService, roomService } from '../../services/api';
import FilterResetButton from '../../components/FilterResetButton';
import TooltipInfoButton from '../../components/TooltipInfoButton';
import { formatDateTimeVN } from '../../utils/formatters';
import DateTimePicker from '../Orders/components/DateTimePicker';
import '../Orders/OrdersPage.css';
import './SalesEndOfDayPage.css';

type AreaOption = { id: string; name: string };
type RoomOption = { id: string; name: string; areaId: string };
type TableOption = { id: string; name: string; areaId: string; roomId?: string | null };

type ReportRow = {
  id: string;
  code: string;
  createdAt: string;
  receiverName: string | null;
  paymentAmount: number;
  debtAmount: number;
  revenueAmount: number;
  grossAmount: number;
  discountAmount: number;
  totalQuantity: number;
  serviceAmount: number;
  locationLabel: string;
  paymentMethod: 'CASH' | 'BANKING' | null;
};

type ReportGroup = {
  date: string;
  summary: {
    orderCount: number;
    paymentAmount: number;
    debtAmount: number;
    revenueAmount: number;
    grossAmount: number;
    discountAmount: number;
    totalQuantity: number;
    serviceAmount: number;
  };
  rows: ReportRow[];
};

type OrderDetailItem = {
  lineId?: string;
  productId?: string;
  productName: string;
  unit?: string;
  pricingTypeSnapshot?: 'FIXED' | 'TIME';
  timeRateMinutesSnapshot?: number;
  usedMinutes?: number;
  startAt?: string | null;
  stopAt?: string | null;
  quantity: number;
  baseUnitPrice?: number;
  unitPrice: number;
  lineTotal?: number;
  lineDiscountAmount?: number;
  lineSurchargeAmount?: number;
  note?: string;
};

type OrderDetail = {
  id: string;
  code: string;
  customerName?: string | null;
  locationLabel?: string;
  createdAt: string;
  orderState?: 'DRAFT' | 'PAID' | 'PARTIAL' | 'DELETED';
  totalAmount: number;
  finalAmount?: number;
  paidAmount: number;
  discountAmount?: number;
  surchargeAmount?: number;
  paymentMethod?: 'CASH' | 'BANKING' | null;
  items: OrderDetailItem[];
};

const toMoneyText = (value: number) => Math.trunc(Number(value || 0)).toLocaleString('vi-VN');
const paymentMethodLabel = (method: 'CASH' | 'BANKING' | null) => {
  if (method === 'CASH') return 'Tiền mặt';
  if (method === 'BANKING') return 'Chuyển khoản';
  return '-';
};

const formatUnitPriceDisplay = (price: number, pricingType?: 'FIXED' | 'TIME', rateMinutes?: number) => {
  const normalizedPrice = Math.max(0, Math.trunc(Number(price || 0))).toLocaleString('vi-VN');
  if (pricingType !== 'TIME') return normalizedPrice;
  const minutes = Math.max(1, Math.trunc(Number(rateMinutes || 0)));
  return `${normalizedPrice} / ${minutes} phút`;
};

const orderStateLabel: Record<'DRAFT' | 'PAID' | 'PARTIAL' | 'DELETED', string> = {
  DRAFT: 'Nháp',
  PAID: 'Đã thanh toán',
  DELETED: 'Đã xóa',
  PARTIAL: 'Chưa thanh toán',
};

const orderStateClass: Record<'DRAFT' | 'PAID' | 'PARTIAL' | 'DELETED', string> = {
  DRAFT: 'orders-status-tag is-draft',
  PAID: 'orders-status-tag is-paid',
  DELETED: 'orders-status-tag is-deleted',
  PARTIAL: 'orders-status-tag is-partial',
};

const toDisplayDate = (isoDate: string) => {
  const raw = String(isoDate || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return raw;
  const d = String(dt.getDate()).padStart(2, '0');
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const y = dt.getFullYear();
  return `${d}/${m}/${y}`;
};

const formatDateFromInput = (dateText: string) => {
  const raw = String(dateText || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
};

const formatDateTimeFromParts = (dateText: string, timeText: string) => {
  const d = formatDateFromInput(dateText);
  const t = String(timeText || '').slice(0, 5);
  return `${d} ${t}`.trim();
};

const toDateTimeInputValue = (value: Date) => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  const h = String(value.getHours()).padStart(2, '0');
  const min = String(value.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
};

const splitDateTimeParts = (value: string) => {
  const [datePart, timePart] = value.split('T');
  const [hourPart = '00', minutePart = '00'] = (timePart || '00:00').split(':');
  return { datePart, timePart: `${hourPart}:${minutePart}` };
};

const toDateFromParts = (datePart: string, timePart: string) => {
  const parsed = new Date(`${datePart}T${timePart}:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

export default function SalesEndOfDayPage() {
  const { branchId } = useAuth();
  const now = useMemo(() => new Date(), []);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>(['PAID', 'PARTIAL']);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);
  const initialStart = toDateTimeInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0));
  const initialEnd = toDateTimeInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59));
  const [startDate, setStartDate] = useState(splitDateTimeParts(initialStart).datePart);
  const [startTime, setStartTime] = useState(splitDateTimeParts(initialStart).timePart);
  const [endDate, setEndDate] = useState(splitDateTimeParts(initialEnd).datePart);
  const [endTime, setEndTime] = useState(splitDateTimeParts(initialEnd).timePart);
  const [areaFilter, setAreaFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'' | 'CASH' | 'BANKING'>('');
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [tables, setTables] = useState<TableOption[]>([]);
  const [groups, setGroups] = useState<ReportGroup[]>([]);
  const [expandedDates, setExpandedDates] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeDateTimePicker, setActiveDateTimePicker] = useState<'start' | 'end' | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailOrderCode, setDetailOrderCode] = useState('');
  const [detailOrder, setDetailOrder] = useState<OrderDetail | null>(null);
  const [detailBreakdownType, setDetailBreakdownType] = useState<'discount' | 'surcharge' | 'subtotal' | null>(null);
  const [openTooltip, setOpenTooltip] = useState<{ key: string; top: number; left: number } | null>(null);

  const loadReport = async () => {
    if (!branchId) {
      setGroups([]);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const response = await reportService.salesEndOfDay({
        branchId,
        search: debouncedSearch || undefined,
        orderStates: statusFilters.join(','),
        startDate: startDate && startTime ? `${startDate}T${startTime}:00` : undefined,
        endDate: endDate && endTime ? `${endDate}T${endTime}:59` : undefined,
        areaId: areaFilter || undefined,
        roomId: roomFilter || undefined,
        tableId: tableFilter || undefined,
        paymentMethod: paymentMethod || undefined,
      });

      const nextGroups: ReportGroup[] = Array.isArray(response.data?.groups) ? response.data.groups : [];
      setGroups(nextGroups);
      setExpandedDates([]);
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Không tải được báo cáo bán hàng');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReport().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, startDate, startTime, endDate, endTime, debouncedSearch, areaFilter, roomFilter, tableFilter, paymentMethod, statusFilters.join(',')]);

  useEffect(() => {
    const loadOptions = async () => {
      const [areaRes, roomRes, tableRes] = await Promise.all([
        areaService.list(branchId || undefined),
        roomService.list({ branchId: branchId || undefined }),
        diningTableService.options({ branchId: branchId || undefined }),
      ]);
      setAreas(Array.isArray(areaRes.data) ? areaRes.data : []);
      setRooms(Array.isArray(roomRes.data) ? roomRes.data : []);
      setTables(Array.isArray(tableRes.data) ? tableRes.data : []);
    };
    loadOptions().catch(() => undefined);
  }, [branchId]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false);
      }
      if (!(event.target as HTMLElement).closest('.col-th-tooltip-anchor')) {
        setOpenTooltip(null);
      }
    };
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, []);

  const resetFilters = () => {
    const nextStart = splitDateTimeParts(toDateTimeInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0)));
    const nextEnd = splitDateTimeParts(toDateTimeInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59)));
    setStartDate(nextStart.datePart);
    setStartTime(nextStart.timePart);
    setEndDate(nextEnd.datePart);
    setEndTime(nextEnd.timePart);
    setSearch('');
    setDebouncedSearch('');
    setStatusFilters(['PAID', 'PARTIAL']);
    setAreaFilter('');
    setRoomFilter('');
    setTableFilter('');
    setPaymentMethod('');
  };

  const toggleDateExpand = (dateKey: string) => {
    setExpandedDates((prev) => (prev.includes(dateKey) ? prev.filter((x) => x !== dateKey) : [...prev, dateKey]));
  };

  const colTooltips: [string, string, string, string][] = [
    ['qty',      'SLSP',           'Số lượng sản phẩm',  'Tổng số lượng món hàng trong tất cả hóa đơn của ngày (cộng dồn số lượng từng dòng món).'],
    ['paid',     'Đã thanh toán',  'Đã thanh toán',       'Số tiền khách hàng đã thực trả cho hóa đơn. Với hóa đơn chưa thanh toán đủ, đây là phần đã thu được.'],
    ['debt',     'Ghi nợ',         'Ghi nợ',              'Phần còn thiếu chưa thu được = Doanh thu − Đã thanh toán. Bằng 0 với hóa đơn đã thanh toán đủ.'],
    ['revenue',  'Doanh thu',      'Doanh thu',           'Số tiền khách cần thanh toán sau tất cả điều chỉnh = Tổng tiền hàng − Giảm giá + Phí dịch vụ.'],
    ['gross',    'Tổng tiền hàng', 'Tổng tiền hàng',      'Giá bán gốc × Số lượng của từng món, cộng lại — trước khi áp dụng bất kỳ giảm giá hay phụ phí nào.'],
    ['discount', 'Giảm giá HĐ',   'Giảm giá hóa đơn',   'Tổng giảm giá toàn hóa đơn + tổng giảm giá áp dụng riêng trên từng dòng món.'],
    ['service',  'Phí dịch vụ',   'Phí dịch vụ',         'Tổng phụ phí toàn hóa đơn + tổng phụ phí áp dụng riêng trên từng dòng món.'],
  ];

  const renderColHeader = (key: string, label: string, title: string) => (
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
  );

  const exportToCsv = () => {
    const escape = (value: string) => {
      const str = String(value ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows: string[][] = [];
    rows.push(['BÁO CÁO BÁN HÀNG']);
    rows.push([`Từ: ${formatDateTimeFromParts(startDate, startTime)}  Đến: ${formatDateTimeFromParts(endDate, endTime)}`]);
    rows.push([]);
    rows.push(['Mã hóa đơn', 'Thời gian', 'Người nhận đơn', 'Phương thức', 'SLSP', 'Đã thanh toán', 'Ghi nợ', 'Doanh thu', 'Tổng tiền hàng', 'Giảm giá HĐ', 'Phí dịch vụ', 'Phòng/Bàn']);

    for (const group of groups) {
      const s = group.summary;
      rows.push([
        `Tổng ngày ${toDisplayDate(group.date)} (${s.orderCount} hóa đơn)`,
        '', '', '',
        String(Math.trunc(s.totalQuantity)),
        String(Math.trunc(s.paymentAmount)),
        String(Math.trunc(s.debtAmount)),
        String(Math.trunc(s.revenueAmount)),
        String(Math.trunc(s.grossAmount)),
        String(Math.trunc(s.discountAmount)),
        String(Math.trunc(s.serviceAmount)),
        '',
      ]);
      for (const row of group.rows) {
        rows.push([
          row.code,
          formatDateTimeVN(row.createdAt),
          row.receiverName || '-',
          paymentMethodLabel(row.paymentMethod),
          String(Math.trunc(row.totalQuantity)),
          String(Math.trunc(row.paymentAmount)),
          String(Math.trunc(row.debtAmount)),
          String(Math.trunc(row.revenueAmount)),
          String(Math.trunc(row.grossAmount)),
          String(Math.trunc(row.discountAmount)),
          String(Math.trunc(row.serviceAmount)),
          row.locationLabel,
        ]);
      }
      rows.push([]);
    }

    const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bao-cao-ban-hang_${formatDateFromInput(startDate).replaceAll('/', '-')}_${formatDateFromInput(endDate).replaceAll('/', '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const openOrderDetail = async (orderId: string) => {
    setIsDetailOpen(true);
    setIsLoadingDetail(true);
    setDetailError('');
    setDetailOrder(null);
    const row = groups.flatMap((g) => g.rows).find((r) => r.id === orderId);
    setDetailOrderCode(row?.code || '');
    try {
      const response = await orderService.getById(orderId);
      setDetailOrder(response.data as OrderDetail);
    } catch (e) {
      setDetailError(typeof e === 'string' ? e : 'Không tải được chi tiết hóa đơn');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const closeOrderDetail = () => {
    setIsDetailOpen(false);
    setIsLoadingDetail(false);
    setDetailError('');
    setDetailBreakdownType(null);
    setDetailOrder(null);
  };

  const detailHeaderDiscount = Math.trunc(Number(detailOrder?.discountAmount || 0));
  const detailHeaderSurcharge = Math.trunc(Number(detailOrder?.surchargeAmount || 0));
  const detailLineDiscountTotal = detailOrder
    ? detailOrder.items.reduce((sum, item) => sum + Number(item.lineDiscountAmount || 0), 0)
    : 0;
  const detailLineSurchargeTotal = detailOrder
    ? detailOrder.items.reduce((sum, item) => sum + Number(item.lineSurchargeAmount || 0), 0)
    : 0;
  const detailBillDiscountTotal = Math.trunc(detailHeaderDiscount + detailLineDiscountTotal);
  const detailBillSurchargeTotal = Math.trunc(detailHeaderSurcharge + detailLineSurchargeTotal);

  return (
    <div className="sales-report-page">
      <div className="sales-report-header">
        <h2>Báo cáo bán hàng</h2>
        <div className="sales-report-header-actions">
          <button
            type="button"
            className="ghost-btn sales-export-btn"
            onClick={exportToCsv}
            disabled={groups.length === 0}
            title="Xuất báo cáo ra file Excel (CSV)"
          >
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
          <label className="orders-search-label orders-filter-col-search">
          Tìm kiếm
          <div className="orders-search-input-wrap">
            <input
              placeholder="Mã hóa đơn, khu vực, phòng, bàn, khách hàng, người tạo"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              className="orders-search-icon-btn"
              onClick={() => setDebouncedSearch(search.trim())}
              aria-label="Tìm kiếm"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </button>
          </div>
          </label>

          <label className="orders-filter-col-status">
          Trạng thái
          <div className="orders-multi-select" ref={statusDropdownRef}>
            <button type="button" className="orders-multi-select-trigger" onClick={() => setShowStatusDropdown((v) => !v)}>
              {statusFilters.length === 0 ? 'Chọn trạng thái' : `${statusFilters.length} trạng thái đã chọn`}
            </button>
            {showStatusDropdown && (
              <div className="orders-multi-select-menu">
                {[
                  { value: 'PAID', label: 'Đã thanh toán' },
                  { value: 'PARTIAL', label: 'Chưa thanh toán' },
                ].map((option) => (
                  <label key={option.value} className="orders-multi-select-option">
                    <input
                      type="checkbox"
                      checked={statusFilters.includes(option.value)}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...statusFilters, option.value]
                          : statusFilters.filter((value) => value !== option.value);
                        setStatusFilters(next.length > 0 ? next : ['PAID']);
                      }}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          </label>

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
        </div>

        {activeDateTimePicker === 'start' && (
          <DateTimePicker
            value={toDateFromParts(startDate, startTime)}
            onChange={(newDate) => {
              const next = splitDateTimeParts(toDateTimeInputValue(newDate));
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
              const next = splitDateTimeParts(toDateTimeInputValue(newDate));
              setEndDate(next.datePart);
              setEndTime(next.timePart);
              setActiveDateTimePicker(null);
            }}
            onClose={() => setActiveDateTimePicker(null)}
          />
        )}

        <div className="orders-picker-filters orders-picker-filters-second-row">
          <label className="orders-filter-col-area">
          Khu vực
          <select
            value={areaFilter}
            onChange={(event) => {
              setAreaFilter(event.target.value);
              setRoomFilter('');
              setTableFilter('');
            }}
          >
            <option value="">Tất cả khu vực</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </select>
          </label>

          <label className="orders-filter-col-room">
          Phòng
          <select
            value={roomFilter}
            onChange={(event) => {
              setRoomFilter(event.target.value);
              setTableFilter('');
            }}
          >
            <option value="">Tất cả phòng</option>
            {rooms
              .filter((room) => !areaFilter || room.areaId === areaFilter)
              .map((room) => (
                <option key={room.id} value={room.id}>{room.name}</option>
              ))}
          </select>
          </label>

          <label className="orders-filter-col-table">
          Bàn
          <select value={tableFilter} onChange={(event) => setTableFilter(event.target.value)}>
            <option value="">Tất cả bàn</option>
            {tables
              .filter((table) => (!areaFilter || table.areaId === areaFilter) && (!roomFilter || table.roomId === roomFilter))
              .map((table) => (
                <option key={table.id} value={table.id}>{table.name}</option>
              ))}
          </select>
          </label>

          <label className="orders-filter-col-payment-method">
          Thanh toán
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as '' | 'CASH' | 'BANKING')}>
            <option value="">Tất cả phương thức</option>
            <option value="CASH">Tiền mặt</option>
            <option value="BANKING">Chuyển khoản</option>
          </select>
          </label>
        </div>
      </div>

      {error && <div className="sales-report-error">{error}</div>}
      {isLoading && <div className="sales-report-loading">Đang tải dữ liệu...</div>}

      <div className="sales-report-table-wrap">
        <table className="sales-report-table">
          <thead>
            <tr>
              <th>Mã hóa đơn</th>
              <th>Thời gian</th>
              <th>Người nhận đơn</th>
              <th>Phương thức</th>
              {colTooltips.map(([key, label, title]) => (
                <th key={key} className="num-col">{renderColHeader(key, label, title)}</th>
              ))}
              <th>Phòng/Bàn</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={12} className="sales-report-empty">
                  Chưa có dữ liệu
                </td>
              </tr>
            ) : (
              groups.map((group) => {
                const expanded = expandedDates.includes(group.date);
                return (
                  <Fragment key={group.date}>
                    <tr className="sales-group-row" onClick={() => toggleDateExpand(group.date)}>
                      <td colSpan={3}>
                        <button type="button" className="sales-expand-btn">
                          {expanded ? '▼' : '▶'} {toDisplayDate(group.date)} ({group.summary.orderCount} hóa đơn)
                        </button>
                      </td>
                      <td>-</td>
                      <td className="num-col">{toMoneyText(group.summary.totalQuantity)}</td>
                      <td className="num-col">{toMoneyText(group.summary.paymentAmount)}</td>
                      <td className="num-col">{toMoneyText(group.summary.debtAmount)}</td>
                      <td className="num-col">{toMoneyText(group.summary.revenueAmount)}</td>
                      <td className="num-col">{toMoneyText(group.summary.grossAmount)}</td>
                      <td className="num-col">{toMoneyText(group.summary.discountAmount)}</td>
                      <td className="num-col">{toMoneyText(group.summary.serviceAmount)}</td>
                      <td>-</td>
                    </tr>
                    {expanded &&
                      group.rows.map((row) => (
                        <tr key={row.id} className="sales-detail-row">
                          <td>
                            <button type="button" className="orders-code-link" onClick={() => openOrderDetail(row.id)}>
                              {row.code}
                            </button>
                          </td>
                          <td>{formatDateTimeVN(row.createdAt)}</td>
                          <td>{row.receiverName || '-'}</td>
                          <td>{paymentMethodLabel(row.paymentMethod)}</td>
                          <td className="num-col">{toMoneyText(row.totalQuantity)}</td>
                          <td className="num-col">{toMoneyText(row.paymentAmount)}</td>
                          <td className="num-col">{toMoneyText(row.debtAmount)}</td>
                          <td className="num-col">{toMoneyText(row.revenueAmount)}</td>
                          <td className="num-col">{toMoneyText(row.grossAmount)}</td>
                          <td className="num-col">{toMoneyText(row.discountAmount)}</td>
                          <td className="num-col">{toMoneyText(row.serviceAmount)}</td>
                          <td>{row.locationLabel}</td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isDetailOpen && (
        <div className="orders-history-overlay" onClick={closeOrderDetail}>
          <div className="orders-history-modal orders-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="orders-history-header">
              <h3>Chi tiết hóa đơn</h3>
              <div className="orders-detail-header-actions">
                <button type="button" className="orders-icon-btn" onClick={closeOrderDetail} aria-label="Đóng">
                  x
                </button>
              </div>
            </div>
            <div className="orders-detail-code-row">
              <p className="orders-history-subtitle">Mã hóa đơn: {detailOrder?.code || detailOrderCode}</p>
              {detailOrder?.orderState && <span className={orderStateClass[detailOrder.orderState]}>{orderStateLabel[detailOrder.orderState]}</span>}
            </div>

            <div className="orders-history-list orders-detail-content">
              {isLoadingDetail ? (
                <div className="orders-empty-row">Đang tải chi tiết hóa đơn...</div>
              ) : detailError ? (
                <div className="orders-empty-row">{detailError}</div>
              ) : !detailOrder ? (
                <div className="orders-empty-row">Không có dữ liệu chi tiết</div>
              ) : (
                <>
                  <div className="orders-detail-grid">
                    <div>
                      <span className="orders-detail-label">Thời gian tạo</span>
                      <div>{formatDateTimeVN(detailOrder.createdAt)}</div>
                    </div>
                    <div>
                      <span className="orders-detail-label">Vị trí phục vụ</span>
                      <div>{detailOrder.locationLabel || '-'}</div>
                    </div>
                    <div>
                      <span className="orders-detail-label">Khách hàng</span>
                      <div>{detailOrder.customerName || '-'}</div>
                    </div>
                    <div>
                      <span className="orders-detail-label">Giảm giá</span>
                      <div className="orders-detail-amount-with-help">
                        <span>{detailBillDiscountTotal.toLocaleString('vi-VN')}</span>
                        <button type="button" className="orders-detail-help-btn" aria-label="Xem diễn giải giảm giá" onClick={() => setDetailBreakdownType('discount')}>?</button>
                      </div>
                    </div>
                    <div>
                      <span className="orders-detail-label">Phí dịch vụ</span>
                      <div className="orders-detail-amount-with-help">
                        <span>{detailBillSurchargeTotal.toLocaleString('vi-VN')}</span>
                        <button type="button" className="orders-detail-help-btn" aria-label="Xem diễn giải phí dịch vụ" onClick={() => setDetailBreakdownType('surcharge')}>?</button>
                      </div>
                    </div>
                    <div>
                      <span className="orders-detail-label">Tạm tính</span>
                      <div className="orders-detail-amount-with-help">
                        <span>{Math.trunc(Number(detailOrder.totalAmount || 0)).toLocaleString('vi-VN')}</span>
                        <button type="button" className="orders-detail-help-btn" aria-label="Xem diễn giải tạm tính" onClick={() => setDetailBreakdownType('subtotal')}>?</button>
                      </div>
                    </div>
                    <div>
                      <span className="orders-detail-label">Phải thanh toán</span>
                      <div>{Math.trunc(Number(detailOrder.finalAmount ?? (detailOrder.totalAmount || 0))).toLocaleString('vi-VN')}</div>
                    </div>
                    <div>
                      <span className="orders-detail-label">Khách thanh toán</span>
                      <div>{Math.trunc(Number(detailOrder.paidAmount || 0)).toLocaleString('vi-VN')}</div>
                    </div>
                    <div>
                      <span className="orders-detail-label">Phương thức thanh toán</span>
                      <div>{paymentMethodLabel(detailOrder.paymentMethod || null)}</div>
                    </div>
                  </div>

                  <table className="orders-history-table orders-detail-items-table">
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Tên món</th>
                      <th>Đơn vị</th>
                      <th>Bắt đầu</th>
                      <th>Kết thúc</th>
                      <th>Tổng TG (phút)</th>
                      <th className="num-col">Số lượng</th>
                      <th className="num-col">Đơn giá gốc</th>
                      <th className="num-col">Đơn giá bán</th>
                      <th className="num-col">Giảm giá</th>
                      <th className="num-col">Phí dịch vụ</th>
                      <th className="num-col">Thành tiền</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailOrder.items?.length ? (
                      detailOrder.items.map((item, idx) => (
                        <tr key={item.lineId || `${item.productId || 'item'}-${idx}`}>
                          <td>{idx + 1}</td>
                          <td>{item.productName || '-'}</td>
                          <td>{item.unit || '-'}</td>
                          <td>{item.startAt ? formatDateTimeVN(item.startAt) : '-'}</td>
                          <td>{item.stopAt ? formatDateTimeVN(item.stopAt) : '-'}</td>
                          <td className="num-col">{Math.max(0, Math.trunc(Number(item.usedMinutes || 0))).toLocaleString('vi-VN')}</td>
                          <td className="num-col">{Number(item.quantity || 0).toLocaleString('vi-VN')}</td>
                          <td className="num-col">{formatUnitPriceDisplay(Number(item.baseUnitPrice ?? item.unitPrice ?? 0), item.pricingTypeSnapshot, item.timeRateMinutesSnapshot)}</td>
                          <td className="num-col">{formatUnitPriceDisplay(Number(item.unitPrice || 0), item.pricingTypeSnapshot, item.timeRateMinutesSnapshot)}</td>
                          <td className="num-col">{Math.trunc(Number(item.lineDiscountAmount || 0)).toLocaleString('vi-VN')}</td>
                          <td className="num-col">{Math.trunc(Number(item.lineSurchargeAmount || 0)).toLocaleString('vi-VN')}</td>
                          <td className="num-col">{Math.trunc(Number(item.lineTotal ?? 0)).toLocaleString('vi-VN')}</td>
                          <td>{item.note || '-'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={13} className="orders-empty-row">Chưa có món trong hóa đơn</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                  {detailBreakdownType && (
                    <div className="orders-detail-breakdown-overlay" onClick={() => setDetailBreakdownType(null)}>
                      <div className="orders-detail-breakdown-popup" onClick={(event) => event.stopPropagation()}>
                        <div className="orders-detail-breakdown-header">
                          <strong>
                            {detailBreakdownType === 'discount'
                              ? 'Diễn giải giảm giá'
                              : detailBreakdownType === 'surcharge'
                                ? 'Diễn giải phí dịch vụ'
                                : 'Diễn giải tạm tính'}
                          </strong>
                          <button type="button" className="orders-icon-btn" onClick={() => setDetailBreakdownType(null)} aria-label="Đóng">x</button>
                        </div>
                        {detailBreakdownType === 'subtotal' ? (
                          <div className="orders-detail-breakdown-row is-total">
                            <span>Tạm tính là giá bán gốc trước mọi điều chỉnh</span>
                          </div>
                        ) : (
                          <>
                            <div className="orders-detail-breakdown-row">
                              <span>Tổng {detailBreakdownType === 'discount' ? 'giảm giá' : 'phí dịch vụ'} toàn hóa đơn</span>
                              <strong>{Math.trunc(detailBreakdownType === 'discount' ? detailHeaderDiscount : detailHeaderSurcharge).toLocaleString('vi-VN')}</strong>
                            </div>
                            <div className="orders-detail-breakdown-row">
                              <span>Tổng {detailBreakdownType === 'discount' ? 'giảm giá' : 'phí dịch vụ'} theo món</span>
                              <strong>{Math.trunc(detailBreakdownType === 'discount' ? detailLineDiscountTotal : detailLineSurchargeTotal).toLocaleString('vi-VN')}</strong>
                            </div>
                            <div className="orders-detail-breakdown-row is-total">
                              <span>Tổng cộng</span>
                              <strong>{Math.trunc(detailBreakdownType === 'discount' ? detailBillDiscountTotal : detailBillSurchargeTotal).toLocaleString('vi-VN')}</strong>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
