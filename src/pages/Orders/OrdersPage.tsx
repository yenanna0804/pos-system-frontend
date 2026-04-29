import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { areaService, diningTableService, orderService, roomService } from '../../services/api';
import { DeleteActionIcon, EditActionIcon } from '../../components/ActionIcons';
import FilterResetButton from '../../components/FilterResetButton';
import NewOrderPage from './NewOrderPage';
import './OrdersPage.css';

type OrderRow = {
  id: string;
  code: string;
  tableName: string;
  customerName?: string;
  creatorName?: string;
  totalAmount: number;
  finalAmount?: number;
  paidAmount?: number;
  orderState: 'DRAFT' | 'PAID' | 'DELETED' | 'PARTIAL';
  createdAt: string;
};

type OrderState = OrderRow['orderState'];

type OrderRowApi = Omit<OrderRow, 'orderState'> & {
  orderState?: OrderState;
};

type OrderLogRow = {
  id: string;
  action: 'CREATE_DRAFT' | 'UPDATE_ORDER' | 'DELETE_ORDER' | 'PAY_PARTIAL' | 'PAY_FULL' | 'PRINT_ORDER' | string;
  detail?: string | null;
  createdByName?: string | null;
  createdAt: string;
};

type AreaOption = { id: string; name: string };
type RoomOption = { id: string; name: string; areaId: string };
type TableOption = { id: string; name: string; areaId: string; roomId?: string | null };

type OrderDetailItem = {
  lineId: string;
  productId: string;
  productName: string;
  unit?: string;
  baseUnitPrice?: number;
  unitPrice: number;
  quantity: number;
  note: string;
  lineDiscountAmount?: number;
  lineSurchargeAmount?: number;
};

type OrderDetail = {
  id: string;
  code: string;
  entityType: 'TABLE' | 'ROOM';
  tableId?: string | null;
  roomId?: string | null;
  areaName?: string | null;
  roomName?: string | null;
  tableName?: string | null;
  locationLabel?: string;
  customerName?: string | null;
  discountAmount?: number;
  surchargeAmount?: number;
  totalAmount: number;
  finalAmount?: number;
  paidAmount: number;
  orderState: OrderRow['orderState'];
  createdAt: string;
  items: OrderDetailItem[];
};

const orderStateLabel: Record<OrderRow['orderState'], string> = {
  DRAFT: 'Nháp',
  PAID: 'Đã thanh toán',
  DELETED: 'Đã xóa',
  PARTIAL: 'Chưa thanh toán',
};

const orderStateClass: Record<OrderRow['orderState'], string> = {
  DRAFT: 'orders-status-tag is-draft',
  PAID: 'orders-status-tag is-paid',
  DELETED: 'orders-status-tag is-deleted',
  PARTIAL: 'orders-status-tag is-partial',
};

export default function OrdersPage() {
  const { branchId } = useAuth();
  const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>(['PAID', 'PARTIAL']);
  const [areaFilter, setAreaFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [tables, setTables] = useState<TableOption[]>([]);
  const [toast, setToast] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [historyOrder, setHistoryOrder] = useState<OrderRow | null>(null);
  const [historyLogs, setHistoryLogs] = useState<OrderLogRow[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [isOrderDetailOpen, setIsOrderDetailOpen] = useState(false);
  const [isLoadingOrderDetail, setIsLoadingOrderDetail] = useState(false);
  const [orderDetailError, setOrderDetailError] = useState('');
  const [detailOrderCode, setDetailOrderCode] = useState('');
  const [detailOrder, setDetailOrder] = useState<OrderDetail | null>(null);
  const [detailBreakdownType, setDetailBreakdownType] = useState<'discount' | 'surcharge' | 'subtotal' | null>(null);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState<OrderRow | null>(null);
  const [editingOrder, setEditingOrder] = useState<null | {
    id: string;
    code: string;
    selectedTable: {
      entityType: 'TABLE' | 'ROOM';
      id: string;
      name: string;
      areaId: string;
      areaName: string;
      roomId?: string | null;
      roomName?: string | null;
    } | null;
    customerName: string;
    discountAmount?: number;
    surchargeAmount?: number;
    paidAmount?: number;
    billItems: {
      lineId: string;
      productId: string;
      productName: string;
      unit?: string;
      unitPrice: number;
      quantity: number;
      note: string;
    }[];
  }>(null);

  const historyPageSize = 5;

  const showToast = (type: 'error' | 'success', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2800);
  };

  const resetListFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setStatusFilters(['PAID', 'PARTIAL']);
    setAreaFilter('');
    setRoomFilter('');
    setTableFilter('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const loadDrafts = async () => {
    try {
      const response = await orderService.list({
        branchId: branchId || undefined,
        page,
        pageSize: 7,
        search: debouncedSearch || undefined,
        orderStates: statusFilters.join(','),
        areaId: areaFilter || undefined,
        roomId: roomFilter || undefined,
        tableId: tableFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate ? `${endDate}T23:59:59.999Z` : undefined,
      });
      const responseData = response.data;
      const rows = Array.isArray(responseData) ? responseData : Array.isArray(responseData?.items) ? responseData.items : [];
      setOrders((rows as OrderRowApi[]).map(mapOrderRow));
      setTotalPages(responseData?.pagination?.totalPages || 1);
      setTotalItems(responseData?.pagination?.total || rows.length);
    } catch (error) {
      showToast('error', typeof error === 'string' ? error : 'Không tải được danh sách hóa đơn');
    }
  };

  useEffect(() => {
    setPage(1);
  }, [branchId]);

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
    loadDrafts().catch((error) => showToast('error', typeof error === 'string' ? error : 'Không tải được danh sách hóa đơn'));
  }, [branchId, page, debouncedSearch, areaFilter, roomFilter, tableFilter, startDate, endDate, statusFilters.join(',')]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!statusDropdownRef.current) return;
      if (!statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const saveDraftOrder = async (payload: {
    table: { entityType: 'TABLE' | 'ROOM'; id: string; name: string; areaName: string; roomName?: string | null; roomId?: string | null };
    customerName: string;
    billItems: {
      lineId: string;
      productId: string;
      productName: string;
      unit?: string;
      baseUnitPrice?: number;
      unitPrice: number;
      quantity: number;
      note: string;
    }[];
    totalAmount: number;
    discountAmount: number;
    surchargeAmount: number;
    paidAmount: number;
  }) => {
    try {
      const createRes = await orderService.create({
        entityType: payload.table.entityType,
        tableId: payload.table.entityType === 'TABLE' ? payload.table.id : undefined,
        roomId: payload.table.entityType === 'ROOM' ? payload.table.id : payload.table.roomId || undefined,
        customerName: payload.customerName,
        totalAmount: payload.totalAmount,
        discountAmount: payload.discountAmount,
        surchargeAmount: payload.surchargeAmount,
        billItems: payload.billItems,
        branchId: branchId || undefined,
      });
      const createdOrderId = (createRes.data as { id?: string })?.id;
      if (createdOrderId) {
        await orderService.pay(createdOrderId, Math.min(payload.paidAmount, Math.round(payload.totalAmount)));
      }
      await loadDrafts();
      setView('list');
      showToast('success', 'Lưu hóa đơn thành công');
    } catch (error) {
      showToast('error', typeof error === 'string' ? error : 'Không lưu được hóa đơn');
    }
  };

  const openHistory = async (order: OrderRow) => {
    setHistoryOrder(order);
    setHistoryPage(1);
    setIsLoadingHistory(true);
    try {
      const response = await orderService.history(order.id);
      setHistoryLogs(Array.isArray(response.data) ? (response.data as OrderLogRow[]) : []);
    } catch (error) {
      setHistoryLogs([]);
      showToast('error', typeof error === 'string' ? error : 'Không tải được lịch sử thao tác');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const onEditOrder = async (order: OrderRow) => {
    if (order.orderState === 'DELETED') {
      showToast('error', 'Không thể sửa hóa đơn đã xóa');
      return;
    }
    try {
      const response = await orderService.getById(order.id);
      const data = response.data;
      const selectedTable = data?.entityType === 'ROOM'
        ? {
            entityType: 'ROOM' as const,
            id: data.roomId,
            name: data.roomName || 'Phòng',
            areaId: 'room-area',
            areaName: data.areaName || '-',
            roomId: data.roomId,
            roomName: data.roomName,
          }
        : {
            entityType: 'TABLE' as const,
            id: data.tableId,
            name: data.tableName || 'Bàn',
            areaId: 'table-area',
            areaName: data.areaName || '-',
            roomId: data.roomId,
            roomName: data.roomName,
          };

      setEditingOrder({
        id: data.id,
        code: data.code,
        selectedTable,
        customerName: data.customerName || '',
        discountAmount: Number(data.discountAmount || 0),
        surchargeAmount: Number(data.surchargeAmount || 0),
        paidAmount: Number(data.paidAmount || 0),
        billItems: Array.isArray(data.items) ? data.items : [],
      });
      setView('edit');
    } catch (error) {
      showToast('error', typeof error === 'string' ? error : 'Không thể cập nhật hóa đơn');
    }
  };

  const onPrintOrder = async (order: OrderRow) => {
    if (order.orderState === 'DELETED') {
      showToast('error', 'Không thể in hóa đơn đã xóa');
      return;
    }
    try {
      await orderService.print(order.id);
      window.print();
      showToast('success', 'Đã ghi nhận thao tác in hóa đơn');
    } catch (error) {
      showToast('error', typeof error === 'string' ? error : 'Không thể in hóa đơn');
    }
  };

  const onDeleteOrder = async (order: OrderRow) => {
    if (order.orderState === 'DELETED') {
      showToast('error', 'Hóa đơn đã ở trạng thái xóa');
      return;
    }
    setDeleteConfirmOrder(order);
  };

  const confirmSoftDeleteOrder = async () => {
    if (!deleteConfirmOrder) return;
    try {
      await orderService.remove(deleteConfirmOrder.id);
      await loadDrafts();
      showToast('success', 'Đã xóa hóa đơn');
    } catch (error) {
      showToast('error', typeof error === 'string' ? error : 'Không thể xóa hóa đơn');
    } finally {
      setDeleteConfirmOrder(null);
    }
  };

  const onPayOrder = async (order: OrderRow) => {
    if (order.orderState === 'DELETED') {
      showToast('error', 'Không thể thao tác với hóa đơn đã xóa');
      return;
    }
    await onEditOrder(order);
  };

  const closeHistory = () => {
    setHistoryOrder(null);
    setHistoryLogs([]);
    setHistoryPage(1);
  };

  const historyTotalPages = Math.max(1, Math.ceil(historyLogs.length / historyPageSize));
  const safeHistoryPage = Math.min(historyPage, historyTotalPages);
  const historyPageItems = historyLogs.slice((safeHistoryPage - 1) * historyPageSize, safeHistoryPage * historyPageSize);

  const actionLabel = (action: string) => {
    switch (action) {
      case 'CREATE_DRAFT':
        return 'Lưu nháp';
      case 'UPDATE_ORDER':
        return 'Cập nhật';
      case 'DELETE_ORDER':
        return 'Xóa';
      case 'PAY_PARTIAL':
        return 'Thanh toán 1 phần';
      case 'PAY_FULL':
        return 'Thanh toán';
      case 'PRINT_ORDER':
        return 'In hóa đơn';
      default:
        return action;
    }
  };

  const openOrderDetail = async (order: OrderRow) => {
    setIsOrderDetailOpen(true);
    setIsLoadingOrderDetail(true);
    setOrderDetailError('');
    setDetailOrder(null);
    setDetailOrderCode(order.code);
    try {
      const response = await orderService.getById(order.id);
      const detail = response.data as (OrderDetail & { orderState?: OrderState });
      setDetailOrder({
        ...detail,
        orderState: normalizeOrderState(detail),
      });
    } catch (error) {
      setOrderDetailError(typeof error === 'string' ? error : 'Không tải được chi tiết hóa đơn');
    } finally {
      setIsLoadingOrderDetail(false);
    }
  };

  const closeOrderDetail = () => {
    setIsOrderDetailOpen(false);
    setIsLoadingOrderDetail(false);
    setOrderDetailError('');
    setDetailOrderCode('');
    setDetailOrder(null);
    setDetailBreakdownType(null);
  };

  const detailHeaderDiscount = Number(detailOrder?.discountAmount || 0);
  const detailHeaderSurcharge = Number(detailOrder?.surchargeAmount || 0);
  const detailLineDiscountTotal = detailOrder
    ? detailOrder.items.reduce((sum, item) => sum + Number(item.lineDiscountAmount || 0), 0)
    : 0;
  const detailLineSurchargeTotal = detailOrder
    ? detailOrder.items.reduce((sum, item) => sum + Number(item.lineSurchargeAmount || 0), 0)
    : 0;
  const detailBillDiscountTotal = detailHeaderDiscount + detailLineDiscountTotal;
  const detailBillSurchargeTotal = detailHeaderSurcharge + detailLineSurchargeTotal;

  if (view === 'create') {
    return <NewOrderPage onBack={() => setView('list')} onSaveDraft={saveDraftOrder} />;
  }

  if (view === 'edit' && editingOrder) {
    return (
      <NewOrderPage
        mode="edit"
        defaultTab="product"
        orderCode={editingOrder.code}
        initialData={{
          selectedTable: editingOrder.selectedTable,
          customerName: editingOrder.customerName,
          discountAmount: editingOrder.discountAmount,
          surchargeAmount: editingOrder.surchargeAmount,
          paidAmount: editingOrder.paidAmount,
          billItems: editingOrder.billItems,
        }}
        onBack={() => {
          setView('list');
          setEditingOrder(null);
        }}
        onSaveDraft={async (payload) => {
          try {
            await orderService.update(editingOrder.id, {
              entityType: payload.table.entityType,
              tableId: payload.table.entityType === 'TABLE' ? payload.table.id : undefined,
              roomId: payload.table.entityType === 'ROOM' ? payload.table.id : payload.table.roomId || undefined,
              customerName: payload.customerName,
              totalAmount: payload.totalAmount,
              discountAmount: payload.discountAmount,
              surchargeAmount: payload.surchargeAmount,
              billItems: payload.billItems,
            });
            await orderService.pay(editingOrder.id, Math.min(payload.paidAmount, Math.round(payload.totalAmount)));
            await loadDrafts();
            setView('list');
            setEditingOrder(null);
            showToast('success', 'Cập nhật hóa đơn thành công');
          } catch (error) {
            showToast('error', typeof error === 'string' ? error : 'Không thể cập nhật hóa đơn');
          }
        }}
      />
    );
  }

  return (
    <section className="orders-page">
      {toast && (
        <div className="orders-toast-container" aria-live="polite" aria-atomic="true">
          <div className={`orders-toast orders-toast-${toast.type}`}>{toast.message}</div>
        </div>
      )}
      <div className="orders-toolbar">
        <h2>Danh sách hóa đơn</h2>
        <button className="orders-primary-btn" onClick={() => setView('create')}>
          Thêm mới hóa đơn
        </button>
      </div>

      <div className="orders-filter-block">
        <div className="orders-picker-filters orders-picker-filters-first-row">
          <label className="orders-search-label orders-filter-col-search">
            Tìm kiếm
            <div className="orders-search-input-wrap">
              <input
                placeholder="Mã hóa đơn, khu vực, phòng, bàn, khách hàng, người tạo"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
              />
              <button
                type="button"
                className="orders-search-icon-btn"
                onClick={() => {
                  setDebouncedSearch(search.trim());
                  setPage(1);
                }}
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
              <button
                type="button"
                className="orders-multi-select-trigger"
                onClick={() => setShowStatusDropdown((v) => !v)}
              >
                {statusFilters.length === 0
                  ? 'Chọn trạng thái'
                  : `${statusFilters.length} trạng thái đã chọn`}
              </button>
              {showStatusDropdown && (
                <div className="orders-multi-select-menu">
                  {[
                    { value: 'PAID', label: 'Đã thanh toán' },
                    { value: 'PARTIAL', label: 'Chưa trả hết' },
                    { value: 'DELETED', label: 'Đã xóa' },
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
                          setPage(1);
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
            Từ ngày
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPage(1);
              }}
            />
          </label>

          <label className="orders-filter-col-to-date">
            Đến ngày
            <input
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setPage(1);
              }}
            />
          </label>

        </div>

        <div className="orders-picker-filters orders-picker-filters-second-row">
          <label className="orders-filter-col-area">
            Khu vực
            <select
              value={areaFilter}
              onChange={(event) => {
                setAreaFilter(event.target.value);
                setRoomFilter('');
                setTableFilter('');
                setPage(1);
              }}
            >
              <option value="">Tất cả khu vực</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
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
                setPage(1);
              }}
            >
              <option value="">Tất cả phòng</option>
              {rooms
                .filter((room) => !areaFilter || room.areaId === areaFilter)
                .map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="orders-filter-col-table">
            Bàn
            <select
              value={tableFilter}
              onChange={(event) => {
                setTableFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả bàn</option>
              {tables
                .filter((table) => (!areaFilter || table.areaId === areaFilter) && (!roomFilter || table.roomId === roomFilter))
                .map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name}
                  </option>
              ))}
            </select>
          </label>

          <FilterResetButton className="orders-filter-reset-btn" onClick={resetListFilters} />

        </div>
      </div>

      <div className="orders-list-wrap">
        <table className="orders-list-table">
          <thead>
            <tr>
              <th className="orders-col-code">Mã hóa đơn</th>
              <th>Thời gian tạo</th>
              <th className="orders-col-room-table">Phòng/Bàn</th>
              <th className="num-col orders-col-amount">Phải thanh toán</th>
              <th className="num-col orders-col-paid">Khách thanh toán</th>
              <th>Khách hàng</th>
              <th className="orders-col-status">Trạng thái</th>
              <th>Người tạo</th>
              <th className="orders-col-actions">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={9} className="orders-empty-row">
                  Chưa có hóa đơn
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id}>
                  <td className="orders-col-code">
                    <button type="button" className="orders-code-link" onClick={() => openOrderDetail(order)}>
                      {order.code}
                    </button>
                  </td>
                  <td>{new Date(order.createdAt).toLocaleString('vi-VN')}</td>
                  <td className="orders-col-room-table">{order.tableName}</td>
                  <td className="num-col orders-col-amount">{Number(order.finalAmount ?? order.totalAmount).toLocaleString('vi-VN')}</td>
                  <td className="num-col orders-col-paid">{Number(order.paidAmount || 0).toLocaleString('vi-VN')}</td>
                  <td>{order.customerName || '-'}</td>
                  <td className="orders-col-status">
                    <span className={orderStateClass[order.orderState]}>{orderStateLabel[order.orderState]}</span>
                  </td>
                  <td>{order.creatorName || '-'}</td>
                  <td className="orders-col-actions">
                    <div className="orders-row-actions">
                      <button
                        type="button"
                        className="ghost-btn icon-action-btn"
                        title="Sửa"
                        aria-label="Sửa"
                        onClick={() => onEditOrder(order)}
                        disabled={order.orderState === 'DELETED'}
                      >
                        <EditActionIcon />
                      </button>
                      <button
                        type="button"
                        className="orders-icon-btn"
                        title="In"
                        aria-label="In"
                        onClick={() => onPrintOrder(order)}
                        disabled={order.orderState === 'DELETED'}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M6 2h12a1 1 0 0 1 1 1v4H5V3a1 1 0 0 1 1-1Z" />
                          <path d="M5 14h14v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7Zm3 1v5h8v-5H8Z" />
                          <path d="M3 8h18a2 2 0 0 1 2 2v5h-4v-2H5v2H1v-5a2 2 0 0 1 2-2Zm16 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="danger-btn icon-action-btn"
                        title="Xóa"
                        aria-label="Xóa"
                        onClick={() => onDeleteOrder(order)}
                        disabled={order.orderState === 'DELETED'}
                      >
                        <DeleteActionIcon />
                      </button>
                      <button
                        type="button"
                        className="orders-icon-btn"
                        title="Lịch sử thao tác"
                        aria-label="Lịch sử thao tác"
                        onClick={() => openHistory(order)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M3 12a9 9 0 1 0 3-6.7" strokeLinecap="round" />
                          <path d="M3 4v5h5" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="orders-text-action"
                        onClick={() => onPayOrder(order)}
                        disabled={
                          order.orderState === 'DELETED' ||
                          Number(order.paidAmount || 0) >= Number(order.finalAmount ?? (order.totalAmount || 0))
                        }
                      >
                        Thanh toán
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="orders-pagination-bar">
        <span>
          Trang {page}/{totalPages} - {totalItems} hóa đơn
        </span>
        <div className="orders-pagination-actions">
          <button className="orders-pagination-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Trước
          </button>
          {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNumber) => (
            <button
              key={pageNumber}
              className={`orders-pagination-btn ${pageNumber === page ? 'active' : ''}`}
              disabled={pageNumber === page}
              onClick={() => setPage(pageNumber)}
            >
              {pageNumber}
            </button>
          ))}
          <button
            className="orders-pagination-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Sau
          </button>
        </div>
      </div>

      {isOrderDetailOpen && (
        <div className="orders-history-overlay" onClick={closeOrderDetail}>
          <div className="orders-history-modal orders-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="orders-history-header">
              <h3>Chi tiết hóa đơn</h3>
              <button type="button" className="orders-icon-btn" onClick={closeOrderDetail} aria-label="Đóng">
                x
              </button>
            </div>
            <div className="orders-detail-code-row">
              <p className="orders-history-subtitle">Mã hóa đơn: {detailOrder?.code || detailOrderCode}</p>
              {detailOrder && <span className={orderStateClass[detailOrder.orderState]}>{orderStateLabel[detailOrder.orderState]}</span>}
            </div>

            <div className="orders-history-list orders-detail-content">
              {isLoadingOrderDetail ? (
                <div className="orders-empty-row">Đang tải chi tiết hóa đơn...</div>
              ) : orderDetailError ? (
                <div className="orders-empty-row">{orderDetailError}</div>
              ) : !detailOrder ? (
                <div className="orders-empty-row">Không có dữ liệu chi tiết</div>
              ) : (
                <>
                  <div className="orders-detail-grid">
                    <div>
                      <span className="orders-detail-label">Thời gian tạo</span>
                      <div>{new Date(detailOrder.createdAt).toLocaleString('vi-VN')}</div>
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
                        <button
                          type="button"
                          className="orders-detail-help-btn"
                          aria-label="Xem diễn giải giảm giá"
                          onClick={() => setDetailBreakdownType('discount')}
                        >
                          ?
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="orders-detail-label">Phụ phí</span>
                      <div className="orders-detail-amount-with-help">
                        <span>{detailBillSurchargeTotal.toLocaleString('vi-VN')}</span>
                        <button
                          type="button"
                          className="orders-detail-help-btn"
                          aria-label="Xem diễn giải phụ phí"
                          onClick={() => setDetailBreakdownType('surcharge')}
                        >
                          ?
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="orders-detail-label">Tạm tính</span>
                      <div className="orders-detail-amount-with-help">
                        <span>{Number(detailOrder.totalAmount || 0).toLocaleString('vi-VN')}</span>
                        <button
                          type="button"
                          className="orders-detail-help-btn"
                          aria-label="Xem diễn giải tạm tính"
                          onClick={() => setDetailBreakdownType('subtotal')}
                        >
                          ?
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="orders-detail-label">Phải thanh toán</span>
                      <div>{Number(detailOrder.finalAmount ?? (detailOrder.totalAmount || 0)).toLocaleString('vi-VN')}</div>
                    </div>
                    <div>
                      <span className="orders-detail-label">Khách thanh toán</span>
                      <div>{Number(detailOrder.paidAmount || 0).toLocaleString('vi-VN')}</div>
                    </div>
                  </div>

                  <table className="orders-history-table orders-detail-items-table">
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Tên món</th>
                        <th>Đơn vị</th>
                        <th className="num-col">Số lượng</th>
                        <th className="num-col">Giảm giá</th>
                        <th className="num-col">Phụ phí</th>
                        <th className="num-col">Đơn giá</th>
                        <th className="num-col">Thành tiền</th>
                        <th>Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailOrder.items.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="orders-empty-row">
                            Chưa có món trong hóa đơn
                          </td>
                        </tr>
                      ) : (
                        detailOrder.items.map((item, idx) => (
                          <tr key={item.lineId || `${item.productId}-${idx}`}>
                            <td>{idx + 1}</td>
                            <td>{item.productName || '-'}</td>
                            <td>{item.unit || '-'}</td>
                            <td className="num-col">{Number(item.quantity || 0).toLocaleString('vi-VN')}</td>
                            <td className="num-col">{Number(item.lineDiscountAmount || 0).toLocaleString('vi-VN')}</td>
                            <td className="num-col">{Number(item.lineSurchargeAmount || 0).toLocaleString('vi-VN')}</td>
                            <td className="num-col">{Number(item.unitPrice || 0).toLocaleString('vi-VN')}</td>
                            <td className="num-col">{(Number(item.quantity || 0) * Number(item.unitPrice || 0)).toLocaleString('vi-VN')}</td>
                            <td>{item.note || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </>
              )}
            </div>

            {detailBreakdownType && (
              <div className="orders-detail-breakdown-overlay" onClick={() => setDetailBreakdownType(null)}>
                <div className="orders-detail-breakdown-popup" onClick={(event) => event.stopPropagation()}>
                  <div className="orders-detail-breakdown-header">
                    <strong>
                      {detailBreakdownType === 'discount'
                        ? 'Diễn giải giảm giá'
                        : detailBreakdownType === 'surcharge'
                          ? 'Diễn giải phụ phí'
                          : 'Diễn giải tạm tính'}
                    </strong>
                    <button
                      type="button"
                      className="orders-icon-btn"
                      onClick={() => setDetailBreakdownType(null)}
                      aria-label="Đóng"
                    >
                      x
                    </button>
                  </div>
                  {detailBreakdownType === 'subtotal' ? (
                    <div className="orders-detail-breakdown-row is-total">
                      <span>Tạm tính là giá bán gốc trước mọi điều chỉnh</span>
                    </div>
                  ) : (
                    <>
                      <div className="orders-detail-breakdown-row">
                        <span>
                          Tổng {detailBreakdownType === 'discount' ? 'giảm giá' : 'phụ phí'} toàn hóa đơn
                        </span>
                        <strong>
                          {(detailBreakdownType === 'discount' ? detailHeaderDiscount : detailHeaderSurcharge).toLocaleString('vi-VN')}
                        </strong>
                      </div>
                      <div className="orders-detail-breakdown-row">
                        <span>
                          Tổng {detailBreakdownType === 'discount' ? 'giảm giá' : 'phụ phí'} sản phẩm
                        </span>
                        <strong>
                          {(detailBreakdownType === 'discount' ? detailLineDiscountTotal : detailLineSurchargeTotal).toLocaleString('vi-VN')}
                        </strong>
                      </div>
                      <div className="orders-detail-breakdown-row is-total">
                        <span>Tổng cộng</span>
                        <strong>
                          {(detailBreakdownType === 'discount' ? detailBillDiscountTotal : detailBillSurchargeTotal).toLocaleString('vi-VN')}
                        </strong>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {historyOrder && (
        <div className="orders-history-overlay" onClick={closeHistory}>
          <div className="orders-history-modal" onClick={(event) => event.stopPropagation()}>
            <div className="orders-history-header">
              <h3>Lịch sử thao tác hóa đơn</h3>
              <button type="button" className="orders-icon-btn" onClick={closeHistory} aria-label="Đóng">
                x
              </button>
            </div>
            <p className="orders-history-subtitle">Mã hóa đơn: {historyOrder.code}</p>

            <div className="orders-history-list">
              {isLoadingHistory ? (
                <div className="orders-empty-row">Đang tải lịch sử...</div>
              ) : historyLogs.length === 0 ? (
                <div className="orders-empty-row">Chưa có log thao tác</div>
              ) : (
                <>
                  <table className="orders-history-table">
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Thao tác</th>
                        <th>Thời gian</th>
                        <th>Người thực hiện</th>
                        <th>Trạng thái</th>
                        <th>Mô tả</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyPageItems.map((log, idx) => (
                        <tr key={log.id}>
                          <td>{(safeHistoryPage - 1) * historyPageSize + idx + 1}</td>
                          <td>{actionLabel(log.action)}</td>
                          <td>{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                          <td>{log.createdByName || '-'}</td>
                          <td>
                            <span className="orders-status-tag is-paid">Thành công</span>
                          </td>
                          <td>{log.detail || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="orders-pagination-bar">
                    <span>
                      Trang {safeHistoryPage}/{historyTotalPages} - {historyLogs.length} bản ghi
                    </span>
                    <div className="orders-pagination-actions">
                      <button
                        className="orders-pagination-btn"
                        disabled={safeHistoryPage <= 1}
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      >
                        Trước
                      </button>
                      {Array.from({ length: historyTotalPages }, (_, idx) => idx + 1).map((pageNumber) => (
                        <button
                          key={pageNumber}
                          className={`orders-pagination-btn ${pageNumber === safeHistoryPage ? 'active' : ''}`}
                          disabled={pageNumber === safeHistoryPage}
                          onClick={() => setHistoryPage(pageNumber)}
                        >
                          {pageNumber}
                        </button>
                      ))}
                      <button
                        className="orders-pagination-btn"
                        disabled={safeHistoryPage >= historyTotalPages}
                        onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                      >
                        Sau
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOrder && (
        <div className="orders-confirm-overlay" onClick={() => setDeleteConfirmOrder(null)}>
          <div className="orders-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Xác nhận xóa hóa đơn</h3>
            <p>
              Bạn có chắc chắn muốn xóa hóa đơn <strong>{deleteConfirmOrder.code}</strong> không?
            </p>
            <p>Hóa đơn sẽ chuyển sang trạng thái Đã xóa và có thể tra cứu lại lịch sử.</p>
            <div className="orders-confirm-actions">
              <button type="button" className="orders-ghost-btn" onClick={() => setDeleteConfirmOrder(null)}>
                Hủy
              </button>
              <button type="button" className="danger-btn" onClick={confirmSoftDeleteOrder}>
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
  const normalizeOrderState = (row: { orderState?: OrderState; paidAmount?: number; finalAmount?: number; totalAmount?: number }): OrderState => {
    const apiState = row.orderState;
    if (apiState) return apiState;
    const paidAmount = Number(row.paidAmount || 0);
    const payableAmount = Number(row.finalAmount ?? row.totalAmount ?? 0);
    if (paidAmount >= payableAmount && payableAmount > 0) return 'PAID';
    if (paidAmount < payableAmount) return 'PARTIAL';
    return 'DRAFT';
  };

  const mapOrderRow = (row: OrderRowApi): OrderRow => ({
    ...row,
    orderState: normalizeOrderState(row),
  });
