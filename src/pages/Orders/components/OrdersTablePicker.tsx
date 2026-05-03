import { useEffect, useMemo, useState } from 'react';
import { areaService, diningTableService, roomService } from '../../../services/api';
import type { SelectableTable } from '../types';

type Area = {
  id: string;
  name: string;
};

type Room = {
  id: string;
  name: string;
  areaId: string;
};

type DiningTable = {
  id: string;
  name: string;
  areaId: string;
  areaName: string;
  roomId?: string | null;
  roomName?: string | null;
};

type Props = {
  branchId: string;
  selectedTableId: string;
  onSelectTable: (table: SelectableTable) => void;
};

export default function OrdersTablePicker({ branchId, selectedTableId, onSelectTable }: Props) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);

  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const pageSize = 7;

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

    setAreas((areasRes.data || []) as Area[]);
    setRooms((roomsRes.data || []) as Room[]);

    const incomingAreas = (areasRes.data || []) as Area[];
    if (!areaFilter && incomingAreas.length > 0) {
      setAreaFilter(incomingAreas[0].id);
    }

    const tableData = tablesRes.data;
    const tableRows: DiningTable[] = Array.isArray(tableData)
      ? tableData
      : Array.isArray(tableData?.items)
        ? tableData.items
        : [];
    setTables(tableRows);
  };

  useEffect(() => {
    loadAll().catch(() => setError('Không tải được danh sách phòng/bàn'));
  }, [branchId, areaFilter, roomFilter, search, page]);

  const filteredRoomsForFilter = useMemo(
    () => rooms.filter((room) => !areaFilter || room.areaId === areaFilter),
    [rooms, areaFilter],
  );

  const filteredTablesForFilter = useMemo(
    () => tables.filter((table) => (!areaFilter || table.areaId === areaFilter) && (!roomFilter || table.roomId === roomFilter)),
    [tables, areaFilter, roomFilter],
  );

  const selectedRoom = rooms.find((room) => room.id === roomFilter);
  const effectiveAreaFilter = areaFilter || selectedRoom?.areaId || '';

  const grouped = useMemo(() => {
    const sourceAreas = areas.filter((area) => {
      if (effectiveAreaFilter) return area.id === effectiveAreaFilter;
      return true;
    });

    return sourceAreas.map((area) => {
      const areaRooms = rooms.filter((room) => room.areaId === area.id && (!roomFilter || room.id === roomFilter));
      const directTables = tables.filter((table) => table.areaId === area.id && !table.roomId && (!tableFilter || table.id === tableFilter));
      const roomGroups = areaRooms.map((room) => ({
        room,
        tables: tables.filter((table) => table.roomId === room.id && (!tableFilter || table.id === tableFilter)),
      }));

      return { area, directTables, roomGroups };
    });
  }, [areas, rooms, tables, effectiveAreaFilter, roomFilter, tableFilter]);

  const resetListFilters = () => {
    setSearch('');
    setRoomFilter('');
    setTableFilter('');
    setPage(1);
  };

  return (
    <div className="orders-table-picker">
      <div className="orders-picker-filters orders-picker-filters-inline">
        <label className="orders-search-label">
          Tìm kiếm
          <div className="orders-search-input-wrap">
            <input
              placeholder="Tên khu vực, tên phòng, tên bàn..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <button type="button" className="orders-search-icon-btn" aria-label="Tìm kiếm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </button>
          </div>
        </label>

        <label>
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
            {filteredRoomsForFilter.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Bàn
          <select
            value={tableFilter}
            onChange={(event) => {
              setTableFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả bàn</option>
            {filteredTablesForFilter.map((table) => (
              <option key={table.id} value={table.id}>
                {table.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="orders-ghost-btn orders-filter-reset-btn"
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

      {error && <p className="orders-picker-error">{error}</p>}

      {areas.length > 0 && (
        <div className="orders-area-tabs" role="tablist" aria-label="Khu vực">
          {areas.map((area) => {
            const isActive = area.id === effectiveAreaFilter;
            return (
              <button
                key={area.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`orders-area-tab ${isActive ? 'is-active' : ''}`}
                onClick={() => {
                  setAreaFilter(area.id);
                  setRoomFilter('');
                  setTableFilter('');
                  setPage(1);
                }}
              >
                {area.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="orders-tree-wrap">
        {grouped.length === 0 ? (
          <div className="orders-empty-row">Không có dữ liệu</div>
        ) : (
          grouped.map((group) => (
            <div className="orders-tree-content" key={group.area.id}>
              {group.directTables.map((table) => {
                const isSelected = selectedTableId === table.id;
                return (
                  <button
                    type="button"
                    className={`orders-tree-row orders-table-row ${isSelected ? 'is-selected' : ''}`}
                    key={table.id}
                    onClick={() => onSelectTable({ ...table, entityType: 'TABLE' })}
                  >
                    <span className="orders-tree-node-label">
                      <span className="orders-tree-dot orders-table-dot" />
                      <span>Bàn: {table.name}</span>
                    </span>
                    {isSelected && <span className="orders-selected-tag">Đã chọn</span>}
                  </button>
                );
              })}

              {group.roomGroups.map((roomGroup) => (
                <div className="orders-room-block" key={roomGroup.room.id}>
                  <button
                    type="button"
                    className={`orders-tree-row orders-room-row ${selectedTableId === roomGroup.room.id ? 'is-selected' : ''}`}
                    onClick={() =>
                      onSelectTable({
                        entityType: 'ROOM',
                        id: roomGroup.room.id,
                        name: roomGroup.room.name,
                        areaId: group.area.id,
                        areaName: group.area.name,
                        roomId: roomGroup.room.id,
                        roomName: roomGroup.room.name,
                      })
                    }
                  >
                    <span className="orders-tree-node-label">
                      <span className="orders-tree-dot orders-room-dot" />
                      <span>Phòng: {roomGroup.room.name}</span>
                    </span>
                    {selectedTableId === roomGroup.room.id && <span className="orders-selected-tag">Đã chọn</span>}
                  </button>

                  {roomGroup.tables.length > 0 && (
                    <div className="orders-room-children">
                      {roomGroup.tables.map((table) => {
                        const isSelected = selectedTableId === table.id;
                        return (
                          <button
                            type="button"
                            className={`orders-tree-row orders-table-row orders-child-table-row ${isSelected ? 'is-selected' : ''}`}
                            key={table.id}
                            onClick={() => onSelectTable({ ...table, entityType: 'TABLE' })}
                          >
                            <span className="orders-tree-node-label">
                              <span className="orders-tree-dot orders-table-dot" />
                              <span>Bàn: {table.name}</span>
                            </span>
                            {isSelected && <span className="orders-selected-tag">Đã chọn</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}

              {group.directTables.length === 0 && group.roomGroups.length === 0 && (
                <div className="orders-empty-row">Chưa có phòng/bàn trong khu vực</div>
              )}
            </div>
          ))
        )}
      </div>

    </div>
  );
}
