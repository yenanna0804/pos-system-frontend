import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { areaService, diningTableService, orderService, roomService } from '../../services/api';
import { DeleteActionIcon, EditActionIcon } from '../../components/ActionIcons';
import FilterResetButton from '../../components/FilterResetButton';
import { printUsingConfiguredRoute, resolveTemplateKeyForPrintFamily } from '../../utils/printerRouting';
import { formatDateTimeVN } from '../../utils/formatters';
import type { Receipt80mmData } from '../../utils/receipt80mmGenerator';
import NewOrderPage from './NewOrderPage';
import { orderFeatureFlags } from './orderFeatureFlags';
import type { BillItem } from './types';
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
  paymentMethod?: 'CASH' | 'BANKING' | null;
  orderState: 'DRAFT' | 'PAID' | 'DELETED' | 'PARTIAL';
  createdAt: string;
};

type OrderState = OrderRow['orderState'];

type OrderRowApi = Omit<OrderRow, 'orderState'> & {
  orderState?: OrderState;
};

type OrderLogRow = {
  id: string;
  action: 'CREATE_ORDER' | 'UPDATE_ORDER' | 'DELETE_ORDER' | 'PAY_PARTIAL' | 'PAY_FULL' | 'PRINT_ORDER' | string;
  detail?: string | null;
  snapshot?: unknown;
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
  pricingTypeSnapshot?: 'FIXED' | 'TIME';
  unit?: string;
  baseUnitPrice?: number;
  unitPrice: number;
  quantity: number;
  timeRateAmountSnapshot?: number;
  timeRateMinutesSnapshot?: number;
  usedMinutes?: number;
  lineTotal?: number;
  timerStatus?: 'RUNNING' | 'STOPPED';
  activeSessionStartedAt?: string | null;
  startAt?: string | null;
  stopAt?: string | null;
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
  discountMode?: 'percent' | 'amount';
  discountValue?: number;
  surchargeAmount?: number;
  surchargeMode?: 'percent' | 'amount';
  surchargeValue?: number;
  totalAmount: number;
  finalAmount?: number;
  paidAmount: number;
  paymentMethod?: 'CASH' | 'BANKING' | null;
  orderState: OrderRow['orderState'];
  createdAt: string;
  updatedAt?: string;
  items: OrderDetailItem[];
};

type EditingOrderState = {
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
  discountMode?: 'percent' | 'amount';
  discountValue?: number;
  surchargeAmount?: number;
  surchargeMode?: 'percent' | 'amount';
  surchargeValue?: number;
  paidAmount?: number;
  paymentMethod?: 'CASH' | 'BANKING';
  updatedAt?: string;
  billItems: {
    lineId: string;
    orderItemId?: string;
    productId: string;
    productName: string;
    pricingTypeSnapshot?: 'FIXED' | 'TIME';
    unit?: string;
    unitPrice: number;
    quantity: number;
    timeRateAmountSnapshot?: number;
    timeRateMinutesSnapshot?: number;
    usedMinutes?: number;
    lineDiscountAmount?: number;
    lineSurchargeAmount?: number;
    lineTotal?: number;
    timerStatus?: 'RUNNING' | 'STOPPED';
    activeSessionStartedAt?: string | null;
    startAt?: string | null;
    stopAt?: string | null;
    note: string;
  }[];
};

type CreateOrderDraft = {
  activeTab: 'table' | 'product';
  selectedTable: EditingOrderState['selectedTable'];
  customerName: string;
  billItems: BillItem[];
  discountMode: 'percent' | 'amount';
  discountValue: string;
  surchargeMode: 'percent' | 'amount';
  surchargeValue: string;
  paidAmount?: number;
  paymentMethod?: 'CASH' | 'BANKING';
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

const paymentMethodLabel = (method?: 'CASH' | 'BANKING' | null) => {
  if (method === 'BANKING') return 'Chuyển khoản';
  if (method === 'CASH') return 'Tiền mặt';
  return '-';
};

const formatNumberVi = (value: number) => Math.trunc(Number(value || 0)).toLocaleString('vi-VN');
const formatUnitPriceDisplay = (price: number, pricingType?: 'FIXED' | 'TIME', rateMinutes?: number) => {
  const normalizedPrice = Math.max(0, Math.trunc(Number(price || 0))).toLocaleString('vi-VN');
  if (pricingType !== 'TIME') return normalizedPrice;
  const minutes = Math.max(1, Math.trunc(Number(rateMinutes || 0)));
  return `${normalizedPrice} / ${minutes} phút`;
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

const buildOrderA4Content = (order: OrderDetail) => {
  const lines: string[] = [];
  lines.push(`Mã hóa đơn: ${order.code}`);
  lines.push(`Thời gian: ${formatDateTimeVN(order.createdAt)}`);
  lines.push(`Khách hàng: ${order.customerName || '-'}`);
  lines.push(`Khu vực/Vị trí: ${order.locationLabel || '-'}`);
  lines.push('');
  lines.push('Danh sách món:');

  order.items.forEach((item, index) => {
    const lineTotal = item.lineTotal ?? Number(item.quantity || 0) * Number(item.unitPrice || 0);
    lines.push(`${index + 1}. ${item.productName}`);
    lines.push(`   SL: ${formatNumberVi(Number(item.quantity || 0))} | Đơn giá: ${formatNumberVi(Number(item.unitPrice || 0))} | Thành tiền: ${formatNumberVi(lineTotal)}`);
    if (item.note?.trim()) {
      lines.push(`   Ghi chú: ${item.note.trim()}`);
    }
  });

  const discountTotal = Number(order.discountAmount || 0) + order.items.reduce((sum, item) => sum + Number(item.lineDiscountAmount || 0), 0);
  const surchargeTotal = Number(order.surchargeAmount || 0) + order.items.reduce((sum, item) => sum + Number(item.lineSurchargeAmount || 0), 0);

  lines.push('');
  lines.push(`Tạm tính: ${formatNumberVi(Number(order.totalAmount || 0))}`);
  lines.push(`Giảm giá: ${formatNumberVi(discountTotal)}`);
  lines.push(`Phí dịch vụ: ${formatNumberVi(surchargeTotal)}`);
  lines.push(`Phải thanh toán: ${formatNumberVi(Number(order.finalAmount ?? order.totalAmount ?? 0))}`);
  lines.push(`Đã thanh toán: ${formatNumberVi(Number(order.paidAmount || 0))}`);
  lines.push(`Trạng thái: ${orderStateLabel[order.orderState] || order.orderState}`);
  lines.push(`Hình thức thanh toán: ${paymentMethodLabel(order.paymentMethod)}`);
  return lines.join('\n');
};

const buildOrder80mmData = (order: OrderDetail): Receipt80mmData => {
  const discountTotal = Number(order.discountAmount || 0) + order.items.reduce((sum, item) => sum + Number(item.lineDiscountAmount || 0), 0);
  const surchargeTotal = Number(order.surchargeAmount || 0) + order.items.reduce((sum, item) => sum + Number(item.lineSurchargeAmount || 0), 0);

  return {
    title: 'Hoa don',
    orderCode: order.code,
    datetime: formatDateTimeVN(order.createdAt),
    customerName: order.customerName || '-',
    location: order.locationLabel || '-',
    items: order.items.map((item) => ({
      name: item.productName || '-',
      quantity: Math.max(0, Math.trunc(Number(item.quantity || 0))),
      unitPrice: Math.max(0, Math.trunc(Number(item.unitPrice || 0))),
      lineTotal: Math.max(0, Math.trunc(Number(item.lineTotal ?? Number(item.quantity || 0) * Number(item.unitPrice || 0)))),
      note: item.note || '',
    })),
    subtotal: Math.max(0, Math.trunc(Number(order.totalAmount || 0))),
    discount: Math.max(0, Math.trunc(discountTotal)),
    surcharge: Math.max(0, Math.trunc(surchargeTotal)),
    total: Math.max(0, Math.trunc(Number(order.finalAmount ?? order.totalAmount ?? 0))),
  };
};

const buildOrderSlip80mmData = (order: OrderDetail): Receipt80mmData => ({
  ...buildOrder80mmData(order),
  title: 'PHIẾU ORDER',
});

const buildOrderSlipA4Content = (order: OrderDetail) => {
  const lines: string[] = [];
  lines.push('PHIẾU ORDER');
  lines.push('');
  lines.push(`Mã đơn: ${order.code}`);
  lines.push(`Thời gian: ${formatDateTimeVN(order.createdAt)}`);
  lines.push(`Vị trí: ${order.locationLabel || '-'}`);
  lines.push('');
  lines.push('Danh sách món:');
  order.items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.productName}`);
    lines.push(`   SL: ${Math.trunc(Number(item.quantity || 0))}`);
    if (item.note?.trim()) {
      lines.push(`   Ghi chú: ${item.note.trim()}`);
    }
  });
  lines.push('');
  lines.push('Vui lòng kiểm tra kỹ trước khi chế biến.');
  return lines.join('\n');
};

const normalizeOrderState = (row: { orderState?: OrderState; paidAmount?: number; finalAmount?: number; totalAmount?: number }): OrderState => {
  const apiState = row.orderState;
  if (apiState) return apiState;
  const paidAmount = Math.trunc(Number(row.paidAmount || 0));
  const payableAmount = Math.trunc(Number(row.finalAmount ?? row.totalAmount ?? 0));
  if (paidAmount >= payableAmount && payableAmount > 0) return 'PAID';
  if (paidAmount < payableAmount) return 'PARTIAL';
  return 'PARTIAL';
};

const mapOrderRow = (row: OrderRowApi): OrderRow => ({
  ...row,
  orderState: normalizeOrderState(row),
});

const mapOrderDetailToEditingState = (data: OrderDetail): EditingOrderState => {
  const selectedTable = data?.entityType === 'ROOM'
    ? {
        entityType: 'ROOM' as const,
        id: data.roomId || '',
        name: data.roomName || 'Phòng',
        areaId: 'room-area',
        areaName: data.areaName || '-',
        roomId: data.roomId,
        roomName: data.roomName,
      }
    : {
        entityType: 'TABLE' as const,
        id: data.tableId || '',
        name: data.tableName || 'Bàn',
        areaId: 'table-area',
        areaName: data.areaName || '-',
        roomId: data.roomId,
        roomName: data.roomName,
      };

  return {
    id: data.id,
    code: data.code,
    selectedTable,
    customerName: data.customerName || '',
    discountAmount: Number(data.discountAmount || 0),
    discountMode: data.discountMode || 'amount',
    discountValue: Number(data.discountValue ?? data.discountAmount ?? 0),
    surchargeAmount: Number(data.surchargeAmount || 0),
    surchargeMode: data.surchargeMode || 'amount',
    surchargeValue: Number(data.surchargeValue ?? data.surchargeAmount ?? 0),
    paidAmount: Math.trunc(Number(data.paidAmount || 0)),
    paymentMethod: data.paymentMethod === 'BANKING' ? 'BANKING' : 'CASH',
    updatedAt: data.updatedAt,
    billItems: Array.isArray(data.items)
      ? data.items.map((item) => ({
          ...item,
          orderItemId: item.lineId,
          lineTotal: Math.max(0, Math.trunc(Number(item.lineTotal ?? 0))),
        }))
      : [],
  };
};

export default function OrdersPage() {
  const { branchId } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const editRouteMatch = useMatch('/orders/:id/edit');
  const editingOrderIdFromRoute = editRouteMatch?.params?.id || null;
  const isCreateRoute = location.pathname === '/orders/new';
  const isEditRoute = Boolean(editingOrderIdFromRoute);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>(['DRAFT', 'PAID', 'PARTIAL']);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<'' | 'CASH' | 'BANKING'>('');
  const [areaFilter, setAreaFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const initialStart = toDateTimeInputValue(new Date(new Date().setHours(0, 0, 0, 0)));
  const initialEnd = toDateTimeInputValue(new Date(new Date().setHours(23, 59, 0, 0)));
  const [startDate, setStartDate] = useState(splitDateTimeParts(initialStart).datePart);
  const [startTime, setStartTime] = useState(splitDateTimeParts(initialStart).timePart);
  const [endDate, setEndDate] = useState(splitDateTimeParts(initialEnd).datePart);
  const [endTime, setEndTime] = useState(splitDateTimeParts(initialEnd).timePart);
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
  const [activeTimePicker, setActiveTimePicker] = useState<'start' | 'end' | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState<OrderRow | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isSelectingAllOrders, setIsSelectingAllOrders] = useState(false);
  const [editingOrder, setEditingOrder] = useState<EditingOrderState | null>(null);
  const [editingDraftBillItems, setEditingDraftBillItems] = useState<EditingOrderState['billItems']>([]);
  const [createDraft, setCreateDraft] = useState<CreateOrderDraft | null>(null);
  const [createDraftOrderId, setCreateDraftOrderId] = useState<string | null>(null);
  const draftAutosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDraftAutosaveRequestRef = useRef(0);
  const isCreatingDraftRef = useRef(false);

  const historyPageSize = 5;

  const clearDraftAutosaveTimeout = () => {
    if (draftAutosaveTimeoutRef.current) {
      clearTimeout(draftAutosaveTimeoutRef.current);
      draftAutosaveTimeoutRef.current = null;
    }
  };

  const showToast = (type: 'error' | 'success', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2800);
  };

  const resetListFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setStatusFilters(['DRAFT', 'PAID', 'PARTIAL']);
    setPaymentMethodFilter('');
    setAreaFilter('');
    setRoomFilter('');
    setTableFilter('');
    const resetStart = splitDateTimeParts(toDateTimeInputValue(new Date(new Date().setHours(0, 0, 0, 0))));
    const resetEnd = splitDateTimeParts(toDateTimeInputValue(new Date(new Date().setHours(23, 59, 0, 0))));
    setStartDate(resetStart.datePart);
    setStartTime(resetStart.timePart);
    setEndDate(resetEnd.datePart);
    setEndTime(resetEnd.timePart);
    setPage(1);
  };

  const selectableOrderIds = orders.map((order) => order.id);
  const allSelectableChecked = selectableOrderIds.length > 0 && selectableOrderIds.every((id) => selectedOrderIds.includes(id));

  const buildListParams = (nextPage: number, nextPageSize: number) => ({
    branchId: branchId || undefined,
    page: nextPage,
    pageSize: nextPageSize,
    search: debouncedSearch || undefined,
    orderStates: statusFilters.join(','),
    paymentMethod: paymentMethodFilter || undefined,
    areaId: areaFilter || undefined,
    roomId: roomFilter || undefined,
    tableId: tableFilter || undefined,
    startDate: startDate && startTime ? `${startDate}T${startTime}:00` : undefined,
    endDate: endDate && endTime ? `${endDate}T${endTime}:59` : undefined,
  });

  const loadOrders = async () => {
    try {
      const response = await orderService.list(buildListParams(page, 7));
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
    const loadCreateDraftFromServer = async () => {
      if (!branchId) return;
      try {
        const listResponse = await orderService.list({
          branchId,
          page: 1,
          pageSize: 1,
          orderStates: 'DRAFT',
        });
        const rows = Array.isArray(listResponse.data)
          ? listResponse.data
          : Array.isArray(listResponse.data?.items)
            ? listResponse.data.items
            : [];
        if (rows.length === 0) return;
        const draftId = rows[0]?.id;
        if (!draftId) return;
        const detailResponse = await orderService.getById(draftId);
        const editingState = mapOrderDetailToEditingState(detailResponse.data as OrderDetail);
        setCreateDraft({
          activeTab: 'product',
          selectedTable: editingState.selectedTable,
          customerName: editingState.customerName,
          billItems: editingState.billItems as BillItem[],
          discountMode: editingState.discountMode || 'amount',
          discountValue: String(editingState.discountValue ?? editingState.discountAmount ?? 0),
          surchargeMode: editingState.surchargeMode || 'amount',
          surchargeValue: String(editingState.surchargeValue ?? editingState.surchargeAmount ?? 0),
          paidAmount: editingState.paidAmount,
          paymentMethod: editingState.paymentMethod,
        });
        setCreateDraftOrderId(editingState.id);
      } catch {
        setCreateDraft(null);
        setCreateDraftOrderId(null);
      }
    };
    loadCreateDraftFromServer().catch(() => undefined);
  }, [branchId]);

  useEffect(() => {
    return () => {
      clearDraftAutosaveTimeout();
    };
  }, []);

  useEffect(() => {
    if (!isCreateRoute) {
      clearDraftAutosaveTimeout();
    }
  }, [isCreateRoute]);

  useEffect(() => {
    const loadEditingOrderFromRoute = async () => {
      if (!isEditRoute || !editingOrderIdFromRoute) {
        setEditingOrder(null);
        setEditingDraftBillItems([]);
        return;
      }
      try {
        const response = await orderService.getById(editingOrderIdFromRoute);
        const nextEditing = mapOrderDetailToEditingState(response.data as OrderDetail);
        setEditingOrder(nextEditing);
        setEditingDraftBillItems(nextEditing.billItems);
      } catch (error) {
        setEditingOrder(null);
        setEditingDraftBillItems([]);
        showToast('error', typeof error === 'string' ? error : 'Không thể cập nhật hóa đơn');
        navigate('/orders');
      }
    };
    loadEditingOrderFromRoute().catch(() => undefined);
  }, [isEditRoute, editingOrderIdFromRoute, navigate]);


  const buildCreateOrderPayload = useCallback((payload: {
    table: { entityType: 'TABLE' | 'ROOM'; id: string; name: string; areaName: string; roomName?: string | null; roomId?: string | null } | null;
    customerName: string;
    billItems: {
      lineId: string;
      productId: string;
      productName: string;
      unit?: string;
      baseUnitPrice?: number;
      unitPrice: number;
      quantity: number;
      pricingTypeSnapshot?: 'FIXED' | 'TIME';
      timeRateAmountSnapshot?: number;
      timeRateMinutesSnapshot?: number;
      usedMinutes?: number;
      lineDiscountAmount?: number;
      lineSurchargeAmount?: number;
      note: string;
    }[];
    totalAmount: number;
    discountAmount: number;
    discountMode: 'percent' | 'amount';
    discountValue: number;
    surchargeAmount: number;
    surchargeMode: 'percent' | 'amount';
    surchargeValue: number;
    paidAmount: number;
    paymentMethod: 'CASH' | 'BANKING';
    orderState?: 'DRAFT' | 'PAID' | 'PARTIAL';
  }) => {
    const entityType = payload.table?.entityType;
    return {
      entityType,
      tableId: entityType === 'TABLE' ? payload.table?.id : undefined,
      roomId: entityType === 'ROOM' ? payload.table?.id : payload.table?.roomId || undefined,
      customerName: payload.customerName,
      totalAmount: payload.totalAmount,
      discountAmount: payload.discountAmount,
      discountMode: payload.discountMode,
      discountValue: payload.discountValue,
      surchargeAmount: payload.surchargeAmount,
      surchargeMode: payload.surchargeMode,
      surchargeValue: payload.surchargeValue,
      paidAmount: Math.max(0, Math.trunc(payload.paidAmount || 0)),
      paymentMethod: payload.paymentMethod,
      billItems: payload.billItems,
      orderState: payload.orderState,
      branchId: branchId || undefined,
    };
  }, [branchId]);

  useEffect(() => {
    loadOrders().catch((error) => showToast('error', typeof error === 'string' ? error : 'Không tải được danh sách hóa đơn'));
  }, [branchId, page, debouncedSearch, areaFilter, roomFilter, tableFilter, startDate, startTime, endDate, endTime, statusFilters.join(','), paymentMethodFilter]);

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
      if (!(event.target as HTMLElement).closest('.orders-time-picker')) {
        setActiveTimePicker(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minuteOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  const setTimeToNow = (target: 'start' | 'end') => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    if (target === 'start') {
      setStartTime(`${hh}:${mm}`);
      return;
    }
    setEndTime(`${hh}:${mm}`);
  };

  const saveOrder = async (payload: {
    table: { entityType: 'TABLE' | 'ROOM'; id: string; name: string; areaName: string; roomName?: string | null; roomId?: string | null } | null;
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
    billItemsPatch?: {
      addedItems: {
        lineId: string;
        productId: string;
        productName: string;
        unit?: string;
        baseUnitPrice?: number;
        unitPrice: number;
        quantity: number;
        pricingTypeSnapshot?: 'FIXED' | 'TIME';
        timeRateAmountSnapshot?: number;
        timeRateMinutesSnapshot?: number;
        usedMinutes?: number;
        lineDiscountAmount?: number;
        lineSurchargeAmount?: number;
        note: string;
      }[];
      updatedItems: ({
        lineId: string;
      } & Partial<{
        productId: string;
        productName: string;
        unit?: string;
        baseUnitPrice?: number;
        unitPrice: number;
        quantity: number;
        pricingTypeSnapshot?: 'FIXED' | 'TIME';
        usedMinutes?: number;
        lineDiscountAmount?: number;
        lineSurchargeAmount?: number;
        note: string;
      }>)[];
      removedItemIds: string[];
      hasChanges: boolean;
    };
    totalAmount: number;
    discountAmount: number;
    discountMode: 'percent' | 'amount';
    discountValue: number;
    surchargeAmount: number;
    surchargeMode: 'percent' | 'amount';
    surchargeValue: number;
    paidAmount: number;
    paymentMethod: 'CASH' | 'BANKING';
  }) => {
    try {
      const savePayload = buildCreateOrderPayload(payload);
      let finalOrderId = createDraftOrderId;
      if (createDraftOrderId) {
        await orderService.update(createDraftOrderId, savePayload);
      } else {
        const createdDraft = await orderService.create({
          ...savePayload,
          orderState: 'DRAFT',
        });
        finalOrderId = createdDraft.data?.id || null;
        if (!finalOrderId) throw new Error('Không nhận được mã hóa đơn nháp');
        await orderService.update(finalOrderId, savePayload);
      }
      await loadOrders();
      setCreateDraft(null);
      setCreateDraftOrderId(null);
      navigate('/orders');
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
    navigate(`/orders/${order.id}/edit`);
  };

  const onPrintOrder = async (order: OrderRow) => {
    if (order.orderState === 'DELETED') {
      showToast('error', 'Không thể in hóa đơn đã xóa');
      return;
    }
    try {
      const detailRes = await orderService.getById(order.id);
      const detail = detailRes.data as OrderDetail;
      await printUsingConfiguredRoute(`Hóa đơn ${detail.code}`, buildOrderA4Content(detail), {
        templateKey: resolveTemplateKeyForPrintFamily('invoice'),
        receipt80mmData: buildOrder80mmData(detail),
      });
      showToast('success', 'Đã gửi lệnh in hóa đơn');
    } catch (error) {
      showToast('error', typeof error === 'string' ? error : 'Không thể in hóa đơn');
    }
  };

  const onPrintOrderSlip = async (order: OrderRow) => {
    if (order.orderState === 'DELETED') {
      showToast('error', 'Không thể in phiếu order đã xóa');
      return;
    }
    try {
      const detailRes = await orderService.getById(order.id);
      const detail = detailRes.data as OrderDetail;
      await printUsingConfiguredRoute(`Phiếu order ${detail.code}`, buildOrderSlipA4Content(detail), {
        templateKey: resolveTemplateKeyForPrintFamily('order_slip'),
        receipt80mmData: buildOrderSlip80mmData(detail),
      });
      showToast('success', 'Đã gửi lệnh in phiếu order');
    } catch (error) {
      showToast('error', typeof error === 'string' ? error : 'Không thể in phiếu order');
    }
  };

  const onDeleteOrder = async (order: OrderRow) => {
    if (order.orderState === 'DELETED') {
      showToast('error', 'Hóa đơn đã ở trạng thái xóa');
      return;
    }
    setDeleteConfirmOrder(order);
  };

  const confirmHardDeleteOrder = async () => {
    if (!deleteConfirmOrder) return;
    try {
      await orderService.hardRemove(deleteConfirmOrder.id);
      await loadOrders();
      showToast('success', 'Đã xóa vĩnh viễn hóa đơn');
    } catch (error) {
      showToast('error', typeof error === 'string' ? error : 'Không thể xóa vĩnh viễn hóa đơn');
    } finally {
      setDeleteConfirmOrder(null);
    }
  };

  const confirmBulkHardDeleteOrders = async () => {
    if (selectedOrderIds.length === 0) return;
    try {
      await Promise.all(selectedOrderIds.map((id) => orderService.hardRemove(id)));
      await loadOrders();
      setSelectedOrderIds([]);
      showToast('success', `Đã xóa vĩnh viễn ${selectedOrderIds.length} hóa đơn`);
    } catch (error) {
      showToast('error', typeof error === 'string' ? error : 'Không thể xóa vĩnh viễn hóa đơn đã chọn');
    } finally {
      setShowBulkDeleteConfirm(false);
    }
  };

  const toggleSelectAllOrders = async (checked: boolean) => {
    if (!checked) {
      setSelectedOrderIds([]);
      return;
    }
    setIsSelectingAllOrders(true);
    try {
      const pageSize = 50;
      let nextPage = 1;
      let nextTotalPages = 1;
      const collected = new Set<string>();
      do {
        const response = await orderService.list(buildListParams(nextPage, pageSize));
        const responseData = response.data;
        const rows = Array.isArray(responseData)
          ? responseData
          : Array.isArray(responseData?.items)
            ? responseData.items
            : [];
        rows.forEach((row: OrderRowApi) => {
          collected.add(row.id);
        });
        nextTotalPages = Number(responseData?.pagination?.totalPages || 1);
        nextPage += 1;
      } while (nextPage <= nextTotalPages);
      setSelectedOrderIds(Array.from(collected));
      showToast('success', `Đã chọn tất cả ${collected.size} hóa đơn theo bộ lọc`);
    } catch (error) {
      showToast('error', typeof error === 'string' ? error : 'Không thể chọn tất cả hóa đơn');
    } finally {
      setIsSelectingAllOrders(false);
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
      case 'CREATE_ORDER':
        return 'Tạo hóa đơn';
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

  const formatLogValue = (value: unknown) => {
    if (value == null || value === '') return '-';
    if (typeof value === 'number') return Math.trunc(value).toLocaleString('vi-VN');
    if (typeof value === 'boolean') return value ? 'Có' : 'Không';
    return String(value);
  };

  const toHistoryFieldLabel = (key: string) => {
    const labels: Record<string, string> = {
      customerName: 'Khách hàng',
      totalAmount: 'Tạm tính',
      finalAmount: 'Phải thanh toán',
      paidAmount: 'Khách thanh toán',
      paymentMethod: 'Phương thức thanh toán',
      orderState: 'Trạng thái',
      productName: 'Tên món',
      quantity: 'Số lượng',
      unitPrice: 'Đơn giá bán',
      lineTotal: 'Thành tiền',
      note: 'Ghi chú',
    };
    return labels[key] || key;
  };

  const toDisplayValue = (key: string, value: unknown) => {
    if (key === 'paymentMethod') {
      return paymentMethodLabel(String(value) as 'CASH' | 'BANKING');
    }
    if (key === 'orderState') {
      return orderStateLabel[String(value) as OrderRow['orderState']] || String(value);
    }
    if (key === 'totalAmount' || key === 'finalAmount' || key === 'paidAmount' || key === 'unitPrice' || key === 'lineTotal') {
      return Math.trunc(Number(value || 0)).toLocaleString('vi-VN');
    }
    return formatLogValue(value);
  };

  const buildLogDetails = (log: OrderLogRow) => {
    const lines: string[] = [];
    const snapshot = (log.snapshot || {}) as Record<string, unknown>;

    if (log.action === 'CREATE_ORDER') {
      const createdOrder = (snapshot.order || {}) as Record<string, unknown>;
      const createdItems = Array.isArray(snapshot.items) ? (snapshot.items as Array<Record<string, unknown>>) : [];
      const createFields = ['customerName', 'totalAmount', 'finalAmount', 'paidAmount', 'paymentMethod', 'orderState'];
      createFields.forEach((key) => {
        if (key in createdOrder) {
          lines.push(`${toHistoryFieldLabel(key)}: ${toDisplayValue(key, createdOrder[key])}`);
        }
      });
      if (createdItems.length > 0) {
        const itemNames = createdItems.map((item) => formatLogValue(item.productName)).filter((name) => name !== '-');
        lines.push(`Món đã thêm: ${itemNames.length > 0 ? itemNames.join(', ') : `${createdItems.length} món`}`);
      }
      if (lines.length === 0 && log.detail) {
        lines.push(log.detail);
      }
      return lines;
    }

    if (log.action === 'UPDATE_ORDER') {
      const changes = (snapshot.changes || {}) as {
        order?: Record<string, { from: unknown; to: unknown }>;
        items?: {
          added?: Array<Record<string, unknown>>;
          removed?: Array<Record<string, unknown>>;
          updated?: Array<{ productName?: string; fields?: Record<string, { from: unknown; to: unknown }> }>;
        };
      };
      const orderChanges = (changes.order || snapshot.order || {}) as Record<string, { from: unknown; to: unknown }>;
      const itemChanges = (changes.items || snapshot.items || undefined) as {
        added?: Array<Record<string, unknown>>;
        removed?: Array<Record<string, unknown>>;
        updated?: Array<{ productName?: string; fields?: Record<string, { from: unknown; to: unknown }> }>;
      } | undefined;
      const showOrderFields = new Set(['customerName', 'totalAmount', 'finalAmount', 'paidAmount', 'paymentMethod', 'orderState']);
      Object.entries(orderChanges).forEach(([key, change]) => {
        if (!showOrderFields.has(key)) return;
        const normalizedChange = change as { from: unknown; to: unknown };
        lines.push(`${toHistoryFieldLabel(key)}: ${toDisplayValue(key, normalizedChange.from)} → ${toDisplayValue(key, normalizedChange.to)}`);
      });
      if (itemChanges?.added?.length) {
        const names = itemChanges.added.map((item) => formatLogValue(item.productName)).filter((name) => name !== '-');
        lines.push(`Món thêm: ${names.length > 0 ? names.join(', ') : `${itemChanges.added.length} món`}`);
      }
      if (itemChanges?.removed?.length) {
        const names = itemChanges.removed.map((item) => formatLogValue(item.productName)).filter((name) => name !== '-');
        lines.push(`Món xóa: ${names.length > 0 ? names.join(', ') : `${itemChanges.removed.length} món`}`);
      }
      if (itemChanges?.updated?.length) {
        const itemFieldAllow = new Set(['quantity', 'unitPrice', 'lineTotal', 'note']);
        itemChanges.updated.forEach((item, idx) => {
          const itemName = item.productName || `#${idx + 1}`;
          Object.entries(item.fields || {}).forEach(([key, change]) => {
            if (!itemFieldAllow.has(key)) return;
            lines.push(`Món ${itemName} - ${toHistoryFieldLabel(key)}: ${toDisplayValue(key, change.from)} → ${toDisplayValue(key, change.to)}`);
          });
        });
      }
      if (lines.length === 0 && log.detail) {
        lines.push(log.detail);
      }
      return lines;
    }

    if (log.detail) lines.push(log.detail);
    return lines;
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

  const onPrintOrderDetail = async () => {
    if (!detailOrder) return;
    if (detailOrder.orderState === 'DELETED') {
      showToast('error', 'Không thể in hóa đơn đã xóa');
      return;
    }
    try {
      await printUsingConfiguredRoute(`Hóa đơn ${detailOrder.code}`, buildOrderA4Content(detailOrder), {
        templateKey: resolveTemplateKeyForPrintFamily('invoice'),
        receipt80mmData: buildOrder80mmData(detailOrder),
      });
      showToast('success', 'Đã gửi lệnh in hóa đơn');
    } catch (error) {
      showToast('error', typeof error === 'string' ? error : 'Không thể in hóa đơn');
    }
  };

  const onPrintOrderSlipDetail = async () => {
    if (!detailOrder) return;
    if (detailOrder.orderState === 'DELETED') {
      showToast('error', 'Không thể in phiếu order đã xóa');
      return;
    }
    try {
      await printUsingConfiguredRoute(`Phiếu order ${detailOrder.code}`, buildOrderSlipA4Content(detailOrder), {
        templateKey: resolveTemplateKeyForPrintFamily('order_slip'),
        receipt80mmData: buildOrderSlip80mmData(detailOrder),
      });
      showToast('success', 'Đã gửi lệnh in phiếu order');
    } catch (error) {
      showToast('error', typeof error === 'string' ? error : 'Không thể in phiếu order');
    }
  };

  const detailHeaderDiscount = Math.trunc(Number(detailOrder?.discountAmount || 0));
  const detailHeaderSurcharge = Math.trunc(Number(detailOrder?.surchargeAmount || 0));
  const detailLineDiscountTotal = detailOrder
    ? detailOrder.items.reduce((sum, item) => sum + Number(item.lineDiscountAmount || 0), 0)
    : 0;
  const detailLineSurchargeTotal = detailOrder
    ? detailOrder.items.reduce((sum, item) => sum + Number(item.lineSurchargeAmount || 0), 0)
    : 0;
  const detailBillDiscountTotal = detailHeaderDiscount + detailLineDiscountTotal;
  const detailBillSurchargeTotal = detailHeaderSurcharge + detailLineSurchargeTotal;

  const createInitialData = useMemo(() => (createDraft ? {
    selectedTable: createDraft.selectedTable,
    customerName: createDraft.customerName,
    billItems: createDraft.billItems,
    discountMode: createDraft.discountMode,
    discountValue: Number(createDraft.discountValue || 0),
    surchargeMode: createDraft.surchargeMode,
    surchargeValue: Number(createDraft.surchargeValue || 0),
    paidAmount: createDraft.paidAmount,
    paymentMethod: createDraft.paymentMethod,
  } : undefined), [createDraft]);

  const handleCreateDraftChange = useCallback((draft: {
    activeTab: 'table' | 'product';
    selectedTable: EditingOrderState['selectedTable'];
    customerName: string;
    billItems: BillItem[];
    discountMode: 'percent' | 'amount';
    discountValue: string;
    surchargeMode: 'percent' | 'amount';
    surchargeValue: string;
    paidAmount?: number;
    paymentMethod?: 'CASH' | 'BANKING';
  }) => {
    if (!isCreateRoute || location.pathname !== '/orders/new') return;
    const normalized: CreateOrderDraft = {
      ...draft,
      selectedTable: draft.selectedTable,
      billItems: draft.billItems,
    };
    setCreateDraft((prev) => {
      const sameAsCurrent = prev
        && prev.activeTab === normalized.activeTab
        && prev.selectedTable?.id === normalized.selectedTable?.id
        && prev.customerName === normalized.customerName
        && prev.discountMode === normalized.discountMode
        && prev.discountValue === normalized.discountValue
        && prev.surchargeMode === normalized.surchargeMode
        && prev.surchargeValue === normalized.surchargeValue
        && Number(prev.paidAmount || 0) === Number(normalized.paidAmount || 0)
        && (prev.paymentMethod || 'CASH') === (normalized.paymentMethod || 'CASH')
        && prev.billItems === normalized.billItems;
      if (sameAsCurrent) return prev;
      return normalized;
    });

    const autosavePayload = buildCreateOrderPayload({
      table: normalized.selectedTable,
      customerName: normalized.customerName,
      billItems: normalized.billItems,
      totalAmount: Math.max(0, normalized.billItems.reduce((sum, item) => sum + Number(item.lineTotal ?? Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0)),
      discountAmount: 0,
      discountMode: normalized.discountMode,
      discountValue: Number(normalized.discountValue || 0),
      surchargeAmount: 0,
      surchargeMode: normalized.surchargeMode,
      surchargeValue: Number(normalized.surchargeValue || 0),
      paidAmount: Math.max(0, Math.trunc(Number(normalized.paidAmount || 0))),
      paymentMethod: normalized.paymentMethod === 'BANKING' ? 'BANKING' : 'CASH',
      orderState: 'DRAFT',
    });
    const autosaveOrderId = createDraftOrderId;
    if (!autosaveOrderId) return;

    clearDraftAutosaveTimeout();
    draftAutosaveTimeoutRef.current = setTimeout(async () => {
      const reqId = latestDraftAutosaveRequestRef.current + 1;
      latestDraftAutosaveRequestRef.current = reqId;
      try {
        const latestDetailResponse = await orderService.getById(autosaveOrderId);
        const latestOrderState = String((latestDetailResponse.data as { orderState?: string })?.orderState || '').toUpperCase();
        if (latestOrderState !== 'DRAFT') {
          return;
        }
        await orderService.update(autosaveOrderId, autosavePayload);
      } catch (error: unknown) {
        const message = typeof error === 'string' ? error : 'Không tự lưu được hóa đơn nháp';
        showToast('error', message);
      }
    }, 500);
  }, [isCreateRoute, location.pathname, createDraftOrderId, buildCreateOrderPayload]);

  if (isCreateRoute) {
    return (
      <>
        {toast && (
          <div className="orders-toast-container" aria-live="polite" aria-atomic="true">
            <div className={`orders-toast orders-toast-${toast.type}`}>{toast.message}</div>
          </div>
        )}
        <NewOrderPage
          key="order-create"
          orderId={createDraftOrderId || undefined}
          defaultTab={createDraft?.activeTab || 'table'}
          initialData={createInitialData}
          onDraftChange={handleCreateDraftChange}
          onBack={async () => {
            clearDraftAutosaveTimeout();
            navigate('/orders');
            loadOrders().catch(() => undefined);
          }}
          onSaveOrder={saveOrder}
          onToggleTimeLineTimer={async (lineId, action) => {
            if (!createDraftOrderId || !createDraft) throw new Error('Chưa có hóa đơn nháp');
            const nowIso = new Date().toISOString();
            const line = createDraft.billItems.find((item) => item.lineId === lineId);
            if (!line) throw new Error('Không tìm thấy dòng món');

            const nextStartAt = action === 'start' ? nowIso : line.startAt || null;
            const nextStopAt = action === 'stop' ? nowIso : null;
            const nextItems = createDraft.billItems.map((item) => (
              item.lineId === lineId
                ? {
                  ...item,
                  startAt: nextStartAt,
                  stopAt: nextStopAt,
                  timerStatus: (action === 'start' ? 'RUNNING' : 'STOPPED') as 'RUNNING' | 'STOPPED',
                  activeSessionStartedAt: action === 'start' ? nextStartAt : null,
                }
                : item
            ));

            await orderService.update(
              createDraftOrderId,
              buildCreateOrderPayload({
                table: createDraft.selectedTable,
                customerName: createDraft.customerName,
                billItems: nextItems,
                totalAmount: Math.max(0, nextItems.reduce((sum, item) => sum + Number(item.lineTotal ?? Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0)),
                discountAmount: 0,
                discountMode: createDraft.discountMode,
                discountValue: Number(createDraft.discountValue || 0),
                surchargeAmount: 0,
                surchargeMode: createDraft.surchargeMode,
                surchargeValue: Number(createDraft.surchargeValue || 0),
                paidAmount: Math.max(0, Math.trunc(Number(createDraft.paidAmount || 0))),
                paymentMethod: createDraft.paymentMethod === 'BANKING' ? 'BANKING' : 'CASH',
                orderState: 'DRAFT',
              }),
            );
            const latestDetailResponse = await orderService.getById(createDraftOrderId);
            const latestDraftState = mapOrderDetailToEditingState(latestDetailResponse.data as OrderDetail);
            setCreateDraft((prev) => (prev ? {
              ...prev,
              selectedTable: latestDraftState.selectedTable,
              customerName: latestDraftState.customerName,
              billItems: latestDraftState.billItems as BillItem[],
            } : prev));
            const nextLine = latestDraftState.billItems.find((item) => item.lineId === lineId);

            return {
              usedMinutes: Math.max(0, Math.trunc(Number(nextLine?.usedMinutes || 0))),
              lineTotal: Math.max(0, Math.trunc(Number(nextLine?.lineTotal || 0))),
              timerStatus: nextLine?.timerStatus === 'RUNNING' ? 'RUNNING' : 'STOPPED',
              startAt: nextLine?.startAt || null,
              stopAt: nextLine?.stopAt || null,
            };
          }}
        />
      </>
    );
  }

  if (isEditRoute && !editingOrder) {
    return (
      <section className="orders-page">
        {toast && (
          <div className="orders-toast-container" aria-live="polite" aria-atomic="true">
            <div className={`orders-toast orders-toast-${toast.type}`}>{toast.message}</div>
          </div>
        )}
        <div className="orders-empty-row">Đang tải hóa đơn...</div>
      </section>
    );
  }

  if (isEditRoute && editingOrder) {
    return (
      <>
        {toast && (
          <div className="orders-toast-container" aria-live="polite" aria-atomic="true">
            <div className={`orders-toast orders-toast-${toast.type}`}>{toast.message}</div>
          </div>
        )}
        <NewOrderPage
          key={`order-edit-${editingOrder.id}`}
          mode="edit"
          orderId={editingOrder.id}
          defaultTab="product"
          orderCode={editingOrder.code}
          initialData={{
            selectedTable: editingOrder.selectedTable,
            customerName: editingOrder.customerName,
            discountAmount: editingOrder.discountAmount,
            discountMode: editingOrder.discountMode,
            discountValue: editingOrder.discountValue,
            surchargeAmount: editingOrder.surchargeAmount,
            surchargeMode: editingOrder.surchargeMode,
            surchargeValue: editingOrder.surchargeValue,
            paidAmount: editingOrder.paidAmount,
            paymentMethod: editingOrder.paymentMethod,
            billItems: editingOrder.billItems,
          }}
          onBack={() => {
            navigate('/orders');
            setEditingOrder(null);
            setEditingDraftBillItems([]);
          }}
          onBillItemsChange={(items) => setEditingDraftBillItems(items as EditingOrderState['billItems'])}
          onSaveOrder={async (payload) => {
          try {
            const entityType = payload.table?.entityType;
            const updatePayload = {
              entityType,
              tableId: entityType === 'TABLE' ? payload.table?.id : undefined,
              roomId: entityType === 'ROOM' ? payload.table?.id : payload.table?.roomId || undefined,
              customerName: payload.customerName,
              billItems: payload.billItems,
              totalAmount: payload.totalAmount,
              discountAmount: payload.discountAmount,
              discountMode: payload.discountMode,
              discountValue: payload.discountValue,
              surchargeAmount: payload.surchargeAmount,
              surchargeMode: payload.surchargeMode,
              surchargeValue: payload.surchargeValue,
              paidAmount: Math.min(Math.trunc(payload.paidAmount), Math.max(0, Math.trunc(payload.totalAmount))),
              paymentMethod: payload.paymentMethod,
              ...(orderFeatureFlags.orderPatchUpdate && payload.billItemsPatch?.hasChanges
                ? {
                  billItemsPatch: {
                    addedItems: payload.billItemsPatch?.addedItems || [],
                    updatedItems: payload.billItemsPatch?.updatedItems || [],
                    removedItemIds: payload.billItemsPatch?.removedItemIds || [],
                  },
                }
                : {}),
            };
            await orderService.update(editingOrder.id, updatePayload);
            await loadOrders();
            navigate('/orders');
            setEditingOrder(null);
            setEditingDraftBillItems([]);
            showToast('success', 'Cập nhật hóa đơn thành công');
          } catch (error) {
            const message = typeof error === 'string' ? error : 'Không thể cập nhật hóa đơn';
            if (String(message).includes('IMMUTABLE_TIME_SNAPSHOT')) {
              showToast('error', 'Không thể sửa mức giá/phút snapshot của dòng dịch vụ thời gian đã tạo');
              return;
            }
            showToast('error', message);
          }
          }}
          onToggleTimeLineTimer={async (lineId, action) => {
            const sourceItems = editingDraftBillItems.length > 0 ? editingDraftBillItems : editingOrder.billItems;
            const line = sourceItems.find((item) => item.lineId === lineId);
            if (!line) throw new Error('Không tìm thấy dòng món trong hóa đơn');
            const nowIso = new Date().toISOString();
            const nextStartAt = action === 'start' ? nowIso : line.startAt || null;
            const nextStopAt = action === 'stop' ? nowIso : null;
            const nextItems = sourceItems.map((item) => (
              item.lineId === lineId
                ? {
                  ...item,
                  startAt: nextStartAt,
                  stopAt: nextStopAt,
                  timerStatus: (action === 'start' ? 'RUNNING' : 'STOPPED') as 'RUNNING' | 'STOPPED',
                  activeSessionStartedAt: action === 'start' ? nextStartAt : null,
                }
                : item
            ));

            const entityType = editingOrder.selectedTable?.entityType;
            await orderService.update(editingOrder.id, {
              entityType,
              tableId: entityType === 'TABLE' ? editingOrder.selectedTable?.id : undefined,
              roomId: entityType === 'ROOM' ? editingOrder.selectedTable?.id : editingOrder.selectedTable?.roomId || undefined,
              customerName: editingOrder.customerName,
              billItems: nextItems,
              totalAmount: Math.max(0, nextItems.reduce((sum, item) => sum + Number(item.lineTotal ?? Number(item.quantity || 0) * Number(item.unitPrice || 0)), 0)),
              discountAmount: editingOrder.discountAmount ?? 0,
              discountMode: editingOrder.discountMode || 'amount',
              discountValue: Number(editingOrder.discountValue ?? editingOrder.discountAmount ?? 0),
              surchargeAmount: editingOrder.surchargeAmount ?? 0,
              surchargeMode: editingOrder.surchargeMode || 'amount',
              surchargeValue: Number(editingOrder.surchargeValue ?? editingOrder.surchargeAmount ?? 0),
              paidAmount: Math.max(0, Math.trunc(Number(editingOrder.paidAmount || 0))),
              paymentMethod: editingOrder.paymentMethod === 'BANKING' ? 'BANKING' : 'CASH',
            });

            const latestDetailResponse = await orderService.getById(editingOrder.id);
            const latestEditingState = mapOrderDetailToEditingState(latestDetailResponse.data as OrderDetail);
            setEditingOrder(latestEditingState);
            setEditingDraftBillItems(latestEditingState.billItems);
            await loadOrders();

            const nextLine = latestEditingState.billItems.find((item) => item.lineId === lineId);
            return {
              usedMinutes: Math.max(0, Math.trunc(Number(nextLine?.usedMinutes || 0))),
              lineTotal: Math.max(0, Math.trunc(Number(nextLine?.lineTotal || 0))),
              timerStatus: nextLine?.timerStatus === 'RUNNING' ? 'RUNNING' : 'STOPPED',
              startAt: nextLine?.startAt || null,
              stopAt: nextLine?.stopAt || null,
            };
          }}
        />
      </>
    );
  }

  const handleCreateNewOrder = async () => {
    if (!branchId) {
      showToast('error', 'Vui lòng chọn chi nhánh trước khi tạo hóa đơn');
      return;
    }
    if (isCreatingDraftRef.current) return;
    isCreatingDraftRef.current = true;
    try {
      const created = await orderService.create({
        customerName: '',
        totalAmount: 0,
        discountAmount: 0,
        discountMode: 'amount',
        discountValue: 0,
        surchargeAmount: 0,
        surchargeMode: 'percent',
        surchargeValue: 5,
        paidAmount: 0,
        paymentMethod: 'CASH',
        orderState: 'DRAFT',
        billItems: [],
        branchId,
      });
      const newDraftId = created.data?.id;
      if (!newDraftId) throw new Error('Không nhận được mã hóa đơn nháp');
      setCreateDraft({
        activeTab: 'table',
        selectedTable: null,
        customerName: '',
        billItems: [],
        discountMode: 'amount',
        discountValue: '0',
        surchargeMode: 'percent',
        surchargeValue: '5',
        paidAmount: 0,
        paymentMethod: 'CASH',
      });
      setCreateDraftOrderId(newDraftId);
      await loadOrders();
      navigate('/orders/new');
    } catch (error: unknown) {
      const message = typeof error === 'string' ? error : 'Không tạo được hóa đơn nháp';
      showToast('error', message);
    } finally {
      isCreatingDraftRef.current = false;
    }
  };

  return (
    <section className="orders-page">
      {toast && (
        <div className="orders-toast-container" aria-live="polite" aria-atomic="true">
          <div className={`orders-toast orders-toast-${toast.type}`}>{toast.message}</div>
        </div>
      )}
      <div className="orders-toolbar">
        <h2>Danh sách hóa đơn</h2>
        <div className="orders-toolbar-actions">
          <button className="primary-btn" onClick={handleCreateNewOrder}>
            Thêm mới hóa đơn
          </button>
          <div className="orders-toolbar-secondary-actions">
            {selectedOrderIds.length > 0 && (
              <button type="button" className="danger-btn orders-toolbar-bulk-delete-btn" onClick={() => setShowBulkDeleteConfirm(true)}>
                Xóa ({selectedOrderIds.length})
              </button>
            )}
            <FilterResetButton className="orders-toolbar-reset-btn" onClick={resetListFilters} />
          </div>
        </div>
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
                    { value: 'DRAFT', label: 'Nháp' },
                    { value: 'PAID', label: 'Đã thanh toán' },
                    { value: 'PARTIAL', label: 'Chưa thanh toán' },
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
            Từ ngày giờ
            <div className="orders-datetime-custom">
              <input
                type="date"
                lang="vi-VN"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setPage(1);
                }}
              />
              <div className="orders-time-picker">
                <button
                  type="button"
                  className="orders-time-trigger"
                  onClick={() => setActiveTimePicker(activeTimePicker === 'start' ? null : 'start')}
                >
                  {startTime}
                </button>
                {activeTimePicker === 'start' && (
                  <div className="orders-time-popover">
                    <div className="orders-time-columns">
                      <select
                        className="orders-time-column"
                        value={startTime.split(':')[0] || '00'}
                        size={7}
                        onChange={(e) => setStartTime(`${e.target.value}:${startTime.split(':')[1] || '00'}`)}
                      >
                        {hourOptions.map((hour) => (
                          <option key={hour} value={hour}>{hour}</option>
                        ))}
                      </select>
                      <select
                        className="orders-time-column"
                        value={startTime.split(':')[1] || '00'}
                        size={7}
                        onChange={(e) => setStartTime(`${startTime.split(':')[0] || '00'}:${e.target.value}`)}
                      >
                        {minuteOptions.map((minute) => (
                          <option key={minute} value={minute}>{minute}</option>
                        ))}
                      </select>
                    </div>
                    <div className="orders-time-actions">
                      <button type="button" onClick={() => setTimeToNow('start')}>Now</button>
                      <button type="button" className="is-primary" onClick={() => setActiveTimePicker(null)}>OK</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </label>

          <label className="orders-filter-col-to-date">
            Đến ngày giờ
            <div className="orders-datetime-custom">
              <input
                type="date"
                lang="vi-VN"
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setPage(1);
                }}
              />
              <div className="orders-time-picker">
                <button
                  type="button"
                  className="orders-time-trigger"
                  onClick={() => setActiveTimePicker(activeTimePicker === 'end' ? null : 'end')}
                >
                  {endTime}
                </button>
                {activeTimePicker === 'end' && (
                  <div className="orders-time-popover">
                    <div className="orders-time-columns">
                      <select
                        className="orders-time-column"
                        value={endTime.split(':')[0] || '00'}
                        size={7}
                        onChange={(e) => setEndTime(`${e.target.value}:${endTime.split(':')[1] || '00'}`)}
                      >
                        {hourOptions.map((hour) => (
                          <option key={hour} value={hour}>{hour}</option>
                        ))}
                      </select>
                      <select
                        className="orders-time-column"
                        value={endTime.split(':')[1] || '00'}
                        size={7}
                        onChange={(e) => setEndTime(`${endTime.split(':')[0] || '00'}:${e.target.value}`)}
                      >
                        {minuteOptions.map((minute) => (
                          <option key={minute} value={minute}>{minute}</option>
                        ))}
                      </select>
                    </div>
                    <div className="orders-time-actions">
                      <button type="button" onClick={() => setTimeToNow('end')}>Now</button>
                      <button type="button" className="is-primary" onClick={() => setActiveTimePicker(null)}>OK</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
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

          <label className="orders-filter-col-payment-method">
            Thanh toán
            <select
              value={paymentMethodFilter}
              onChange={(event) => {
                setPaymentMethodFilter(event.target.value as '' | 'CASH' | 'BANKING');
                setPage(1);
              }}
            >
              <option value="">Tất cả phương thức</option>
              <option value="CASH">Tiền mặt</option>
              <option value="BANKING">Chuyển khoản</option>
            </select>
          </label>

        </div>
      </div>

      <div className="orders-list-wrap">
        <table className="orders-list-table">
          <thead>
            <tr>
              <th className="orders-col-checkbox">
                <input
                  type="checkbox"
                  checked={allSelectableChecked}
                  disabled={isSelectingAllOrders}
                  onChange={(event) => toggleSelectAllOrders(event.target.checked)}
                  aria-label="Chọn tất cả hóa đơn"
                />
              </th>
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
                <td colSpan={10} className="orders-empty-row">
                  Chưa có hóa đơn
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id}>
                  <td className="orders-col-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedOrderIds.includes(order.id)}
                      onChange={(event) => {
                        setSelectedOrderIds((prev) => {
                          if (event.target.checked) {
                            if (prev.includes(order.id)) return prev;
                            return [...prev, order.id];
                          }
                          return prev.filter((id) => id !== order.id);
                        });
                      }}
                      aria-label={`Chọn hóa đơn ${order.code}`}
                    />
                  </td>
                  <td className="orders-col-code">
                    <button type="button" className="orders-code-link" onClick={() => openOrderDetail(order)}>
                      {order.code}
                    </button>
                  </td>
                  <td>{formatDateTimeVN(order.createdAt)}</td>
                  <td className="orders-col-room-table">{order.tableName}</td>
                  <td className="num-col orders-col-amount">{Math.trunc(Number(order.finalAmount ?? order.totalAmount)).toLocaleString('vi-VN')}</td>
                  <td className="num-col orders-col-paid">{Math.trunc(Number(order.paidAmount || 0)).toLocaleString('vi-VN')}</td>
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
                        title="In hóa đơn"
                        aria-label="In hóa đơn"
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
                        className="orders-icon-btn"
                        title="In phiếu order"
                        aria-label="In phiếu order"
                        onClick={() => onPrintOrderSlip(order)}
                        disabled={order.orderState === 'DELETED'}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
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
              <div className="orders-detail-header-actions">
                <button
                  type="button"
                  className="orders-icon-btn"
                  onClick={onPrintOrderDetail}
                  aria-label="In hóa đơn"
                  title="In hóa đơn"
                  disabled={!detailOrder || detailOrder.orderState === 'DELETED'}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M6 2h12a1 1 0 0 1 1 1v4H5V3a1 1 0 0 1 1-1Z" />
                    <path d="M5 14h14v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7Zm3 1v5h8v-5H8Z" />
                    <path d="M3 8h18a2 2 0 0 1 2 2v5h-4v-2H5v2H1v-5a2 2 0 0 1 2-2Zm16 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="orders-icon-btn"
                  onClick={onPrintOrderSlipDetail}
                  aria-label="In phiếu order"
                  title="In phiếu order"
                  disabled={!detailOrder || detailOrder.orderState === 'DELETED'}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                </button>
                <button type="button" className="orders-icon-btn" onClick={closeOrderDetail} aria-label="Đóng">
                  x
                </button>
              </div>
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
                      <span className="orders-detail-label">Phí dịch vụ</span>
                      <div className="orders-detail-amount-with-help">
                        <span>{detailBillSurchargeTotal.toLocaleString('vi-VN')}</span>
                        <button
                          type="button"
                          className="orders-detail-help-btn"
                          aria-label="Xem diễn giải Phí dịch vụ"
                          onClick={() => setDetailBreakdownType('surcharge')}
                        >
                          ?
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="orders-detail-label">Tạm tính</span>
                      <div className="orders-detail-amount-with-help">
                         <span>{Math.trunc(Number(detailOrder.totalAmount || 0)).toLocaleString('vi-VN')}</span>
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
                      <div>{Math.trunc(Number(detailOrder.finalAmount ?? (detailOrder.totalAmount || 0))).toLocaleString('vi-VN')}</div>
                    </div>
                    <div>
                      <span className="orders-detail-label">Khách thanh toán</span>
                      <div>{Math.trunc(Number(detailOrder.paidAmount || 0)).toLocaleString('vi-VN')}</div>
                    </div>
                    <div>
                      <span className="orders-detail-label">Phương thức thanh toán</span>
                      <div>{paymentMethodLabel(detailOrder.paymentMethod)}</div>
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
                      {detailOrder.items.length === 0 ? (
                        <tr>
                          <td colSpan={13} className="orders-empty-row">
                            Chưa có món trong hóa đơn
                          </td>
                        </tr>
                      ) : (
                        detailOrder.items.map((item, idx) => (
                          <tr key={item.lineId || `${item.productId}-${idx}`}>
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
                          ? 'Diễn giải phí dịch vụ'
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
                          Tổng {detailBreakdownType === 'discount' ? 'giảm giá' : 'phí dịch vụ'} toàn hóa đơn
                        </span>
                        <strong>
                          {(detailBreakdownType === 'discount' ? detailHeaderDiscount : detailHeaderSurcharge).toLocaleString('vi-VN')}
                        </strong>
                      </div>
                      <div className="orders-detail-breakdown-row">
                        <span>
                          Tổng {detailBreakdownType === 'discount' ? 'giảm giá' : 'phí dịch vụ'} sản phẩm
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
                          <td>{formatDateTimeVN(log.createdAt)}</td>
                          <td>{log.createdByName || '-'}</td>
                          <td>
                            <span className="orders-status-tag is-paid">Thành công</span>
                          </td>
                          <td>
                            {(() => {
                              const details = buildLogDetails(log);
                              return details.length === 0
                                ? '-'
                                : details.map((line, lineIdx) => (
                                    <div key={`${log.id}-detail-${lineIdx}`}>{line}</div>
                                  ));
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                </>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOrder && (
        <div className="orders-confirm-overlay" onClick={() => setDeleteConfirmOrder(null)}>
          <div className="orders-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Xác nhận xóa vĩnh viễn hóa đơn</h3>
            <p>
              Bạn có chắc chắn muốn xóa vĩnh viễn hóa đơn <strong>{deleteConfirmOrder.code}</strong> không?
            </p>
            <p>Thao tác này sẽ xóa hẳn dữ liệu và không thể hoàn tác.</p>
            <div className="orders-confirm-actions">
              <button type="button" className="ghost-btn" onClick={() => setDeleteConfirmOrder(null)}>
                Hủy
              </button>
              <button type="button" className="danger-btn" onClick={confirmHardDeleteOrder}>
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkDeleteConfirm && (
        <div className="orders-confirm-overlay" onClick={() => setShowBulkDeleteConfirm(false)}>
          <div className="orders-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Xác nhận xóa vĩnh viễn nhiều hóa đơn</h3>
            <p>
              Bạn có chắc chắn muốn xóa vĩnh viễn <strong>{selectedOrderIds.length}</strong> hóa đơn đã chọn không?
            </p>
            <p>Thao tác này có thể ảnh hưởng dữ liệu báo cáo và không thể hoàn tác.</p>
            <div className="orders-confirm-actions">
              <button type="button" className="ghost-btn" onClick={() => setShowBulkDeleteConfirm(false)}>
                Hủy
              </button>
              <button type="button" className="danger-btn" onClick={confirmBulkHardDeleteOrders}>
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
