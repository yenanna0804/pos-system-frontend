import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { DeleteActionIcon, EditActionIcon } from '../../components/ActionIcons';
import { areaService, diningTableService, roomService } from '../../services/api';
import './TablesPage.css';

type Area = {
  id: string;
  name: string;
  branchId?: string | null;
  roomCount?: number;
  tableCount?: number;
};

type Room = {
  id: string;
  name: string;
  areaId: string;
  areaName?: string;
  tableCount?: number;
};

type DiningTable = {
  id: string;
  name: string;
  areaId: string;
  areaName: string;
  roomId?: string | null;
  roomName?: string | null;
};

type Mode = 'table' | 'room';
type EntitySource = 'new' | 'existing';
type Toast = { id: number; type: 'success' | 'error'; message: string };
type QuickContext = { mode: Mode; areaId: string; roomId?: string } | null;
type ConfirmDialogState = {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

export default function TablesPage() {
  const { branchId } = useAuth();
  const [areas, setAreas] = useState<Area[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);

  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');

  const [page, setPage] = useState(1);
  const pageSize = 7;
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [error, setError] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({ open: false, title: '', message: '' });
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  const [isEntityModalOpen, setIsEntityModalOpen] = useState(false);
  const [quickContext, setQuickContext] = useState<QuickContext>(null);
  const [mode, setMode] = useState<Mode>('table');
  const [entitySource, setEntitySource] = useState<EntitySource>('new');
  const [selectedExistingId, setSelectedExistingId] = useState('');
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [areaId, setAreaId] = useState('');
  const [roomId, setRoomId] = useState('');

  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
  const [areaDraft, setAreaDraft] = useState('');
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [entityErrors, setEntityErrors] = useState<{ name?: string; areaId?: string; selectedExistingId?: string }>({});
  const [areaErrors, setAreaErrors] = useState<{ name?: string }>({});

  const getErrorMessage = (err: unknown) => {
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message?: unknown }).message || 'Có lỗi xảy ra');
    }
    return 'Có lỗi xảy ra';
  };

  const pushToast = (type: Toast['type'], message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3000);
  };

  const confirmAction = (config: Omit<ConfirmDialogState, 'open'>) => {
    setConfirmDialog({ open: true, ...config });
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
    });
  };

  const closeConfirmDialog = (confirmed: boolean) => {
    setConfirmDialog({ open: false, title: '', message: '' });
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    if (resolver) resolver(confirmed);
  };

  const resetListFilters = () => {
    setSearch('');
    setAreaFilter('');
    setRoomFilter('');
    setTableFilter('');
    setPage(1);
  };

  const loadAll = async () => {
    const [areasRes, roomsRes, tablesRes] = await Promise.all([
      areaService.list(branchId || undefined),
      roomService.list({ branchId: branchId || undefined }),
      diningTableService.list({
        branchId: branchId || undefined,
        areaId: areaFilter || undefined,
        roomId: roomFilter || undefined,
        search: search.trim() || undefined,
        page,
        pageSize,
      }),
    ]);
    setAreas(areasRes.data || []);
    setRooms(roomsRes.data || []);
    const tableData = tablesRes.data;
    const tableRows: DiningTable[] = Array.isArray(tableData)
      ? tableData
      : Array.isArray(tableData?.items)
        ? tableData.items
        : [];
    setTables(tableRows);
    setTotalPages(tableData?.pagination?.totalPages || 1);
    setTotalItems(tableData?.pagination?.total || tableRows.length);
  };

  useEffect(() => {
    loadAll().catch((e) => setError(getErrorMessage(e) || 'Không tải được dữ liệu'));
  }, [branchId, areaFilter, roomFilter, search, page]);

  const resetEntityForm = () => {
    setEditingEntityId(null);
    setQuickContext(null);
    setMode('table');
    setEntitySource('new');
    setSelectedExistingId('');
    setName('');
    setAreaId('');
    setRoomId('');
    setEntityErrors({});
  };

  const openCreateTable = () => {
    resetEntityForm();
    setMode('table');
    setEntitySource('new');
    setAreaId(areaFilter || '');
    setRoomId(roomFilter || '');
    setIsEntityModalOpen(true);
  };

  const openQuickAddTable = (targetAreaId: string, targetRoomId?: string) => {
    resetEntityForm();
    setMode('table');
    setEntitySource('existing');
    setAreaId(targetAreaId);
    setRoomId(targetRoomId || '');
    setQuickContext({ mode: 'table', areaId: targetAreaId, roomId: targetRoomId });
    setIsEntityModalOpen(true);
  };

  const openQuickAddRoom = (targetAreaId: string) => {
    resetEntityForm();
    setMode('room');
    setEntitySource('existing');
    setAreaId(targetAreaId);
    setQuickContext({ mode: 'room', areaId: targetAreaId });
    setIsEntityModalOpen(true);
  };

  const openEditTable = (item: DiningTable) => {
    setEditingEntityId(item.id);
    setMode('table');
    setEntitySource('existing');
    setSelectedExistingId(item.id);
    setName(item.name);
    setAreaId(item.areaId);
    setRoomId(item.roomId || '');
    setIsEntityModalOpen(true);
  };

  const openEditRoom = (item: Room) => {
    setEditingEntityId(item.id);
    setMode('room');
    setEntitySource('existing');
    setSelectedExistingId(item.id);
    setName(item.name);
    setAreaId(item.areaId);
    setRoomId('');
    setIsEntityModalOpen(true);
  };

  const onSaveEntity = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setError('');
      const trimmedName = name.trim();
      const nextErrors: { name?: string; areaId?: string; selectedExistingId?: string } = {};
      if (entitySource === 'new' && !trimmedName) nextErrors.name = `Tên ${mode === 'room' ? 'phòng' : 'bàn'} là bắt buộc`;
      const effectiveAreaId = quickContext?.areaId || areaId;
      const effectiveRoomId = quickContext?.mode === 'table' ? quickContext.roomId || '' : roomId;
      if (!effectiveAreaId) nextErrors.areaId = 'Khu vực là bắt buộc';
      if (entitySource === 'existing' && !selectedExistingId) {
        nextErrors.selectedExistingId = `Vui lòng chọn ${mode === 'room' ? 'phòng' : 'bàn'} sẵn có`;
      }
      if (Object.keys(nextErrors).length > 0) {
        setEntityErrors(nextErrors);
        return;
      }
      setEntityErrors({});

      const resolvedName =
        entitySource === 'existing'
          ? mode === 'room'
            ? rooms.find((r) => r.id === selectedExistingId)?.name || trimmedName
            : tables.find((t) => t.id === selectedExistingId)?.name || trimmedName
          : trimmedName;

      if (mode === 'room') {
        const roomTargetId = editingEntityId || (entitySource === 'existing' ? selectedExistingId : '');
        const nextAreaName = areas.find((a) => a.id === effectiveAreaId)?.name || effectiveAreaId;
        if (roomTargetId) {
          const currentRoom = rooms.find((r) => r.id === roomTargetId);
          const tableDependentCount = Number(currentRoom?.tableCount || tables.filter((t) => t.roomId === roomTargetId).length || 0);
          if (tableDependentCount > 0) {
            const shouldContinue = await confirmAction({
              title: 'Xác nhận cập nhật phòng',
              message:
                `Phòng đang có ${tableDependentCount} bàn phụ thuộc.\n` +
                `Nếu lưu, trường cha của các bàn con sẽ cập nhật sang:\n` +
                `- Phòng: "${resolvedName}"\n` +
                `- Khu vực: "${nextAreaName}"\n\n` +
                `Bạn có chắc muốn tiếp tục?`,
              confirmText: 'Tiếp tục',
              cancelText: 'Hủy',
            });
            if (!shouldContinue) return;
          }

          await roomService.update(roomTargetId, {
            name: resolvedName,
            areaId: effectiveAreaId,
            branchId: branchId || undefined,
          });
        } else {
          await roomService.create({
            name: resolvedName,
            areaId: effectiveAreaId,
            branchId: branchId || undefined,
          });
        }
      } else {
        const tableTargetId = editingEntityId || (entitySource === 'existing' ? selectedExistingId : '');
        if (tableTargetId) {
          const currentTable = tables.find((t) => t.id === tableTargetId);
          if (currentTable) {
            const nextAreaName = areas.find((a) => a.id === effectiveAreaId)?.name || effectiveAreaId;
            const nextRoomName = effectiveRoomId ? rooms.find((r) => r.id === effectiveRoomId)?.name || effectiveRoomId : 'Không phòng';
            const parentChanged = currentTable.areaId !== effectiveAreaId || (currentTable.roomId || '') !== effectiveRoomId;
            if (parentChanged) {
              const shouldContinue = await confirmAction({
                title: 'Xác nhận cập nhật bàn',
                message:
                  `Bàn này đang phụ thuộc vào cha hiện tại:\n` +
                  `- Khu vực: "${currentTable.areaName}"\n` +
                  `- Phòng: "${currentTable.roomName || 'Không phòng'}"\n\n` +
                  `Nếu lưu, trường cha sẽ đổi thành:\n` +
                  `- Khu vực: "${nextAreaName}"\n` +
                  `- Phòng: "${nextRoomName}"\n\n` +
                  `Bạn có chắc muốn tiếp tục?`,
                confirmText: 'Tiếp tục',
                cancelText: 'Hủy',
              });
              if (!shouldContinue) return;
            }
          }

            await diningTableService.update(tableTargetId, {
            name: resolvedName,
            areaId: effectiveAreaId,
            roomId: effectiveRoomId || null,
            branchId: branchId || undefined,
          });
        } else {
          await diningTableService.create({
            name: resolvedName,
            areaId: effectiveAreaId,
            roomId: effectiveRoomId || null,
            branchId: branchId || undefined,
          });
        }
      }

      setIsEntityModalOpen(false);
      resetEntityForm();
      await loadAll();
      pushToast('success', `${mode === 'room' ? 'Lưu phòng' : 'Lưu bàn'} thành công`);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      pushToast('error', message);
    }
  };

  const onDeleteTable = async (id: string) => {
    try {
      setError('');
      const target = tables.find((t) => t.id === id);
      const confirmed = await confirmAction({
        title: 'Xác nhận xóa bàn',
        message: target ? `Bạn có chắc muốn xóa bàn "${target.name}"?` : 'Bạn có chắc muốn xóa bàn này?',
        confirmText: 'Xóa',
        cancelText: 'Hủy',
        danger: true,
      });
      if (!confirmed) return;
      await diningTableService.remove(id);
      await loadAll();
      if (tableFilter === id) setTableFilter('');
      pushToast('success', 'Xóa bàn thành công');
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      pushToast('error', message);
    }
  };

  const onDeleteRoom = async (id: string) => {
    try {
      setError('');
      const targetRoom = rooms.find((r) => r.id === id);
      const tableDependentCount = Number(targetRoom?.tableCount || tables.filter((t) => t.roomId === id).length || 0);
      const confirmed = await confirmAction({
        title: 'Xác nhận xóa phòng',
        message:
          `Bạn có chắc muốn xóa phòng "${targetRoom?.name || id}"?\n` +
          `Phòng này đang có ${tableDependentCount} bàn phụ thuộc.\n` +
          `Nếu xóa, toàn bộ ${tableDependentCount} bàn thuộc phòng này sẽ bị xóa theo.`,
        confirmText: 'Xóa',
        cancelText: 'Hủy',
        danger: true,
      });
      if (!confirmed) return;

      await roomService.remove(id);
      if (roomFilter === id) setRoomFilter('');
      await loadAll();
      pushToast('success', 'Xóa phòng thành công');
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      pushToast('error', message);
    }
  };

  const openAreaModal = () => {
    setEditingAreaId(null);
    setAreaDraft('');
    setIsAreaModalOpen(true);
  };

  const onSubmitArea = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setError('');
      const trimmed = areaDraft.trim();
      if (!trimmed) {
        setAreaErrors({ name: 'Tên khu vực là bắt buộc' });
        return;
      }
      setAreaErrors({});

      if (editingAreaId) {
        const targetArea = areas.find((a) => a.id === editingAreaId);
        const dependentRooms = Number(targetArea?.roomCount || 0);
        const dependentTables = Number(targetArea?.tableCount || 0);
        if (dependentRooms > 0 || dependentTables > 0) {
          const shouldContinue = await confirmAction({
            title: 'Xác nhận cập nhật khu vực',
            message:
              `Khu vực này đang có ${dependentRooms} phòng và ${dependentTables} bàn phụ thuộc.\n` +
              `Nếu lưu, trường cha của các dữ liệu con sẽ cập nhật sang khu vực mới: "${trimmed}".\n\n` +
              `Bạn có chắc muốn tiếp tục?`,
            confirmText: 'Tiếp tục',
            cancelText: 'Hủy',
          });
          if (!shouldContinue) return;
        }

        await areaService.update(editingAreaId, { name: trimmed, branchId: branchId || undefined });
      } else {
        await areaService.create({ name: trimmed, branchId: branchId || undefined });
      }

      setEditingAreaId(null);
      setAreaDraft('');
      await loadAll();
      pushToast('success', 'Lưu khu vực thành công');
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      pushToast('error', message);
    }
  };

  const onDeleteArea = async (id: string) => {
    try {
      setError('');
      const targetArea = areas.find((a) => a.id === id);
      const dependentRooms = Number(targetArea?.roomCount || 0);
      const dependentTables = Number(targetArea?.tableCount || 0);
      const confirmed = await confirmAction({
        title: 'Xác nhận xóa khu vực',
        message:
          `Bạn có chắc muốn xóa khu vực "${targetArea?.name || id}"?\n` +
          `Khu vực này đang có ${dependentRooms} phòng và ${dependentTables} bàn phụ thuộc.\n` +
          `Nếu xóa, toàn bộ phòng và bàn thuộc khu vực này sẽ bị xóa theo.`,
        confirmText: 'Xóa',
        cancelText: 'Hủy',
        danger: true,
      });
      if (!confirmed) return;

      await areaService.remove(id);
      if (areaFilter === id) setAreaFilter('');
      if (areaId === id) setAreaId('');
      if (roomFilter && rooms.find((r) => r.id === roomFilter)?.areaId === id) setRoomFilter('');
      if (tableFilter) {
        const selectedTable = tables.find((t) => t.id === tableFilter);
        if (selectedTable?.areaId === id) setTableFilter('');
      }
      await loadAll();
      pushToast('success', 'Xóa khu vực thành công');
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      pushToast('error', message);
    }
  };

  const filteredRoomsForForm = useMemo(() => rooms.filter((r) => !areaId || r.areaId === areaId), [rooms, areaId]);
  const filteredExistingRooms = useMemo(
    () => (quickContext ? rooms : rooms.filter((r) => !areaId || r.areaId === areaId)),
    [rooms, areaId, quickContext],
  );
  const filteredExistingTables = useMemo(
    () =>
      quickContext
        ? tables
        : tables.filter((t) => (!areaId || t.areaId === areaId) && (!roomId || t.roomId === roomId)),
    [tables, areaId, roomId, quickContext],
  );
  const filteredRoomsForFilter = useMemo(
    () => rooms.filter((r) => !areaFilter || r.areaId === areaFilter),
    [rooms, areaFilter],
  );
  const filteredTablesForFilter = useMemo(
    () => tables.filter((t) => (!areaFilter || t.areaId === areaFilter) && (!roomFilter || t.roomId === roomFilter)),
    [tables, areaFilter, roomFilter],
  );

  const selectedRoom = rooms.find((r) => r.id === roomFilter);
  const effectiveAreaFilter = areaFilter || selectedRoom?.areaId || '';

  const grouped = useMemo(() => {
    const sourceAreas = areas.filter((a) => {
      if (effectiveAreaFilter) return a.id === effectiveAreaFilter;
      return true;
    });
    return sourceAreas
      .map((area) => {
        const areaRooms = rooms.filter((r) => r.areaId === area.id && (!roomFilter || r.id === roomFilter));
        const directTables = tables.filter(
          (t) => t.areaId === area.id && !t.roomId && (!tableFilter || t.id === tableFilter),
        );
        const roomGroups = areaRooms.map((room) => ({
          room,
          tables: tables.filter((t) => t.roomId === room.id && (!tableFilter || t.id === tableFilter)),
        }));
        const total = directTables.length + roomGroups.reduce((acc, item) => acc + item.tables.length, 0);
        return { area, directTables, roomGroups, total };
      });
  }, [areas, rooms, tables, effectiveAreaFilter, roomFilter, tableFilter]);

  const currentPage = Math.min(page, totalPages);

  const quickContextDescription = useMemo(() => {
    if (!quickContext) return '';

    const areaName = areas.find((a) => a.id === quickContext.areaId)?.name || 'Khu vực đã chọn';
    if (quickContext.mode === 'room') {
      return `Luồng thêm nhanh: phòng mới sẽ lưu trực tiếp vào ${areaName}.`;
    }

    const roomName = quickContext.roomId
      ? rooms.find((r) => r.id === quickContext.roomId)?.name || 'Phòng đã chọn'
      : '';

    return roomName
      ? `Luồng thêm nhanh: bàn mới sẽ lưu vào ${areaName} / ${roomName}.`
      : `Luồng thêm nhanh: bàn mới sẽ lưu trực tiếp vào ${areaName}.`;
  }, [quickContext, areas, rooms]);

  useEffect(() => {
    if (!isEntityModalOpen || entitySource !== 'existing') return;
    if (!selectedExistingId) {
      setName('');
      return;
    }

    if (mode === 'room') {
      const room = rooms.find((r) => r.id === selectedExistingId);
      setName(room?.name || '');
      return;
    }

    const table = tables.find((t) => t.id === selectedExistingId);
    setName(table?.name || '');
  }, [isEntityModalOpen, entitySource, selectedExistingId, mode, rooms, tables]);

  return (
    <section className="tables-page products-page">
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
            {toast.message}
          </div>
        ))}
      </div>

      {confirmDialog.open && (
        <div
          className="modal-overlay confirm-overlay"
          onClick={(e) => e.target === e.currentTarget && closeConfirmDialog(false)}
        >
          <div className="modal-content confirm-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{confirmDialog.title}</h3>
              <button className="icon-close" onClick={() => closeConfirmDialog(false)}>
                x
              </button>
            </div>
            <p style={{ whiteSpace: 'pre-line', margin: '4px 0 0', color: '#344054' }}>{confirmDialog.message}</p>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button type="button" className="ghost-btn" onClick={() => closeConfirmDialog(false)}>
                {confirmDialog.cancelText || 'Hủy'}
              </button>
              <button
                type="button"
                className={confirmDialog.danger ? 'danger-btn' : 'primary-btn'}
                onClick={() => closeConfirmDialog(true)}
              >
                {confirmDialog.confirmText || 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="products-toolbar">
        <h2>Danh sách phòng/bàn</h2>
        <div className="products-toolbar-actions">
          <button className="primary-btn" onClick={openCreateTable}>
            Thêm mới phòng/bàn
          </button>
          <button className="secondary-btn" onClick={openAreaModal}>
            Quản lý khu vực
          </button>
        </div>
      </div>

      <div className="products-filters tables-filters">
        <label className="search-label">
          Tìm kiếm
          <div className="search-input-wrap">
            <input
              placeholder="Tên khu vực, tên phòng, tên bàn..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <button type="button" className="search-icon-btn" aria-label="Tìm kiếm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </button>
          </div>
        </label>

        <label>
          Khu vực
          <select
            value={areaFilter}
            onChange={(e) => {
              setAreaFilter(e.target.value);
              setRoomFilter('');
              setTableFilter('');
              setPage(1);
            }}
          >
            <option value="">Tất cả khu vực</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Phòng
          <select
            value={roomFilter}
            onChange={(e) => {
              setRoomFilter(e.target.value);
              setTableFilter('');
              setPage(1);
            }}
          >
            <option value="">Tất cả phòng</option>
            {filteredRoomsForFilter.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Bàn
          <select
            value={tableFilter}
            onChange={(e) => {
              setTableFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả bàn</option>
            {filteredTablesForFilter.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="ghost-btn icon-action-btn filter-reset-btn"
          onClick={resetListFilters}
          title="Đặt lại bộ lọc"
          aria-label="Đặt lại bộ lọc"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M20 12a8 8 0 1 1-2.35-5.65" />
            <path d="M20 4v6h-6" />
          </svg>
        </button>
      </div>

      {error && <p className="products-error">{error}</p>}

      <div className="products-table-wrap tables-table-wrap">
        {grouped.length === 0 ? (
          <div className="empty-row table-empty-block">Không có dữ liệu</div>
        ) : (
          <div className="area-group-list">
            {grouped.map((group) => (
              <div className="area-group-card" key={group.area.id}>
                <div className="area-group-header">
                  <div>
                    <strong>{group.area.name}</strong>
                  </div>
                  <div className="row-actions">
                    <button className="ghost-btn quick-add-btn" onClick={() => openQuickAddRoom(group.area.id)}>
                      Thêm phòng
                    </button>
                    <button className="ghost-btn quick-add-btn" onClick={() => openQuickAddTable(group.area.id)}>
                      Thêm bàn
                    </button>
                  </div>
                </div>

                <div className="tree-wrap">
                  {group.directTables.map((table) => (
                    <div className="tree-row tree-table-row tree-direct-table-row" key={table.id}>
                      <div className="tree-node-label">
                        <span className="tree-dot table-dot" />
                        <span>Bàn: {table.name}</span>
                      </div>
                      <div className="row-actions">
                        <button className="ghost-btn icon-action-btn" title="Sửa" aria-label="Sửa" onClick={() => openEditTable(table)}>
                          <EditActionIcon />
                        </button>
                        <button className="danger-btn icon-action-btn" title="Xóa" aria-label="Xóa" onClick={() => onDeleteTable(table.id)}>
                          <DeleteActionIcon />
                        </button>
                      </div>
                    </div>
                  ))}

                  {group.roomGroups.map((roomGroup) => (
                    <div className="tree-room-block" key={roomGroup.room.id}>
                      <div className="tree-row tree-room-row">
                        <div className="tree-node-label">
                          <span className="tree-dot room-dot" />
                          <span>Phòng: {roomGroup.room.name}</span>
                        </div>
                        <div className="row-actions">
                          <button
                            className="ghost-btn icon-action-btn"
                            title="Sửa phòng"
                            aria-label="Sửa phòng"
                            onClick={() => openEditRoom(roomGroup.room)}
                          >
                            <EditActionIcon />
                          </button>
                          <button
                            className="danger-btn icon-action-btn"
                            title="Xóa phòng"
                            aria-label="Xóa phòng"
                            onClick={() => onDeleteRoom(roomGroup.room.id)}
                          >
                            <DeleteActionIcon />
                          </button>
                          <button
                            className="ghost-btn quick-add-btn"
                            onClick={() => openQuickAddTable(group.area.id, roomGroup.room.id)}
                          >
                            Thêm bàn
                          </button>
                        </div>
                      </div>

                      {roomGroup.tables.length > 0 && (
                        <div className="tree-room-children">
                          {roomGroup.tables.map((table) => (
                            <div className="tree-row tree-table-row" key={table.id}>
                              <div className="tree-node-label">
                                <span className="tree-dot table-dot" />
                                <span>Bàn: {table.name}</span>
                              </div>
                              <div className="row-actions">
                                <button
                                  className="ghost-btn icon-action-btn"
                                  title="Sửa"
                                  aria-label="Sửa"
                                  onClick={() => openEditTable(table)}
                                >
                                  <EditActionIcon />
                                </button>
                                <button
                                  className="danger-btn icon-action-btn"
                                  title="Xóa"
                                  aria-label="Xóa"
                                  onClick={() => onDeleteTable(table.id)}
                                >
                                  <DeleteActionIcon />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {group.directTables.length === 0 && group.roomGroups.length === 0 && (
                    <div className="empty-row tree-empty">Chưa có phòng/bàn trong khu vực</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pagination-bar">
        <span>
          Trang {currentPage}/{totalPages} - {totalItems} bản ghi
        </span>
        <div className="pagination-actions">
          <button className="ghost-btn" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Trước
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
            <button
              key={num}
              className={`ghost-btn ${num === currentPage ? 'active' : ''}`}
              disabled={num === currentPage}
              onClick={() => setPage(num)}
            >
              {num}
            </button>
          ))}
          <button
            className="ghost-btn"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Sau
          </button>
        </div>
      </div>

      {isEntityModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsEntityModalOpen(false);
              resetEntityForm();
            }
          }}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {editingEntityId ? 'Sửa' : 'Thêm'} {mode === 'room' ? 'phòng' : 'bàn'}
              </h3>
              <button
                className="icon-close"
                onClick={() => {
                  setIsEntityModalOpen(false);
                  resetEntityForm();
                }}
              >
                x
              </button>
            </div>

            <form onSubmit={onSaveEntity} className="tables-form">
              {quickContext ? (
                <div className="modal-tip">{quickContextDescription}</div>
              ) : (
                <div className="modal-tip">Luồng thêm tổng quát: bạn tự chọn khu vực/phòng trước khi lưu.</div>
              )}

              {!editingEntityId && !quickContext && (
                <label>
                  Loại
                  <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} disabled={Boolean(editingEntityId)}>
                    <option value="table">Bàn</option>
                    <option value="room">Phòng</option>
                  </select>
                </label>
              )}

              {!editingEntityId && quickContext && (
                <div className="entity-source-radio">
                  <span>Tùy chọn</span>
                  <label>
                    <input
                      type="radio"
                      name="entity-source"
                      value="existing"
                      checked={entitySource === 'existing'}
                      onChange={() => {
                        setEntitySource('existing');
                        setSelectedExistingId('');
                        setName('');
                      }}
                    />
                    Có sẵn
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="entity-source"
                      value="new"
                      checked={entitySource === 'new'}
                      onChange={() => {
                        setEntitySource('new');
                        setSelectedExistingId('');
                        setName('');
                      }}
                    />
                    Tạo mới
                  </label>
                </div>
              )}

              {!editingEntityId && entitySource === 'existing' && mode === 'room' && (
                <label>
                  Chọn phòng sẵn có
                  <select
                    value={selectedExistingId}
                    onChange={(e) => {
                      setSelectedExistingId(e.target.value);
                      const selected = filteredExistingRooms.find((r) => r.id === e.target.value);
                      setName(selected?.name || '');
                      if (entityErrors.selectedExistingId && e.target.value) {
                        setEntityErrors((prev) => ({ ...prev, selectedExistingId: undefined }));
                      }
                    }}
                  >
                    <option value="">Chọn phòng</option>
                    {filteredExistingRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  {entityErrors.selectedExistingId && <small className="field-error">{entityErrors.selectedExistingId}</small>}
                </label>
              )}

              {!editingEntityId && entitySource === 'existing' && mode === 'table' && (
                <label>
                  Chọn bàn sẵn có
                  <select
                    value={selectedExistingId}
                    onChange={(e) => {
                      setSelectedExistingId(e.target.value);
                      const selected = filteredExistingTables.find((t) => t.id === e.target.value);
                      setName(selected?.name || '');
                      if (entityErrors.selectedExistingId && e.target.value) {
                        setEntityErrors((prev) => ({ ...prev, selectedExistingId: undefined }));
                      }
                    }}
                  >
                    <option value="">Chọn bàn</option>
                    {filteredExistingTables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {entityErrors.selectedExistingId && <small className="field-error">{entityErrors.selectedExistingId}</small>}
                </label>
              )}

              {(editingEntityId || entitySource === 'new') && (
                <label>
                  Tên {mode === 'room' ? 'phòng' : 'bàn'}
                  <input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (entityErrors.name && e.target.value.trim()) {
                        setEntityErrors((prev) => ({ ...prev, name: undefined }));
                      }
                    }}
                    placeholder={`Nhập tên ${mode === 'room' ? 'phòng' : 'bàn'}`}
                  />
                  {entityErrors.name && <small className="field-error">{entityErrors.name}</small>}
                </label>
              )}

              {!quickContext && (
                <label>
                  Khu vực *
                  <select
                    value={areaId}
                    onChange={(e) => {
                      setAreaId(e.target.value);
                      if (entityErrors.areaId && e.target.value) {
                        setEntityErrors((prev) => ({ ...prev, areaId: undefined }));
                      }
                    }}
                  >
                    <option value="">Chọn khu vực</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  {entityErrors.areaId && <small className="field-error">{entityErrors.areaId}</small>}
                </label>
              )}

              {mode === 'table' && !quickContext && (
                <label>
                  Chọn phòng (không bắt buộc)
                  <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                    <option value="">Không phòng</option>
                    {filteredRoomsForForm.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    setIsEntityModalOpen(false);
                    resetEntityForm();
                  }}
                >
                  Bỏ qua
                </button>
                <button type="submit" className="primary-btn">
                  {editingEntityId ? 'Cập nhật' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAreaModalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsAreaModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Quản lý khu vực</h3>
              <button className="icon-close" onClick={() => setIsAreaModalOpen(false)}>
                x
              </button>
            </div>

            <form className="category-create-row" onSubmit={onSubmitArea}>
              <div className="category-input-wrap">
                <input
                  value={areaDraft}
                  placeholder="Tên khu vực mới"
                  onChange={(e) => {
                    setAreaDraft(e.target.value);
                    if (areaErrors.name && e.target.value.trim()) {
                      setAreaErrors({});
                    }
                  }}
                />
                {areaErrors.name && <small className="field-error">{areaErrors.name}</small>}
              </div>
              <button type="submit" className="primary-btn">
                {editingAreaId ? 'Cập nhật' : 'Thêm'}
              </button>
            </form>

            <div className="category-list">
              {areas.length === 0 ? (
                <div className="empty-row">Chưa có khu vực</div>
              ) : (
                areas.map((area) => (
                  <div key={area.id} className="category-item">
                    <div>
                      <strong>{area.name}</strong>
                      <span className="category-count">
                        {area.roomCount || 0} phòng - {area.tableCount || 0} bàn
                      </span>
                    </div>

                    <div className="category-actions">
                      {editingAreaId === area.id ? (
                        <button
                          className="ghost-btn"
                          onClick={() => {
                            setEditingAreaId(null);
                            setAreaDraft('');
                          }}
                        >
                          Hủy
                        </button>
                      ) : (
                        <button
                          className="ghost-btn icon-action-btn"
                          title="Sửa"
                          aria-label="Sửa"
                          onClick={() => {
                            setEditingAreaId(area.id);
                            setAreaDraft(area.name);
                          }}
                        >
                          <EditActionIcon />
                        </button>
                      )}
                      <button
                        className="danger-btn icon-action-btn"
                        title="Xóa"
                        aria-label="Xóa"
                        onClick={() => onDeleteArea(area.id)}
                      >
                        <DeleteActionIcon />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
