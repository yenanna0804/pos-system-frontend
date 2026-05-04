import { useEffect, useRef, useState } from 'react';
import { categoryService, productService } from '../../../services/api';
import type { ProductOption } from '../types';

const API_ASSET_ORIGIN = import.meta.env.VITE_API_ASSET_ORIGIN || import.meta.env.VITE_API_PROXY_TARGET || '';

const resolveImageUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return API_ASSET_ORIGIN ? `${API_ASSET_ORIGIN}${url}` : url;
  return url;
};

type Category = {
  id: string;
  name: string;
};

type ProductRow = {
  id: string;
  type?: 'SINGLE' | 'COMBO' | 'TIME';
  sku?: string;
  name: string;
  imageUrl?: string;
  imageThumb?: string;
  unit?: string;
  categoryName?: string;
  price?: string | number;
  timeRateAmount?: string | number;
  timeRateMinutes?: string | number;
  stock?: string | number;
};

type Props = {
  branchId: string;
  onAddProduct: (product: ProductOption) => void;
};

export default function OrdersProductPicker({ branchId, onAddProduct }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);

  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'SINGLE' | 'COMBO' | 'TIME'>('all');
  const [filterStock, setFilterStock] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isListLoading, setIsListLoading] = useState(false);
  const [error, setError] = useState('');

  const pageSize = 7;

  const loadCategories = async () => {
    const categoryRows: Category[] = (await categoryService.list()).data || [];
    setCategories(categoryRows);
  };

  const loadData = async () => {
    setIsListLoading(true);
    try {
      const result = await productService.list({
        page,
        pageSize,
        type: filterType === 'all' ? undefined : filterType,
        categoryId: filterCategoryId || undefined,
        stockStatus: filterStock,
        branchId: branchId || undefined,
        search: debouncedSearch || undefined,
      });

      const productData = result.data;
      const rows: ProductRow[] = Array.isArray(productData)
        ? productData
        : Array.isArray(productData?.items)
          ? productData.items
          : [];
      setProducts(rows);
      setTotalPages(productData?.pagination?.totalPages || 1);
      setTotalItems(productData?.pagination?.total || rows.length);
      setError('');
    } catch {
      setError('Không tải được danh sách hàng hóa');
    } finally {
      setIsListLoading(false);
    }
  };

  useEffect(() => {
    loadCategories().catch(() => setError('Không tải được nhóm hàng hóa'));
  }, []);

  useEffect(() => {
    loadData().catch(() => setError('Không tải được danh sách hàng hóa'));
  }, [page, filterCategoryId, filterType, filterStock, branchId, debouncedSearch]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 400);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  const resetListFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setFilterCategoryId('');
    setFilterType('all');
    setFilterStock('all');
    setPage(1);
  };

  return (
    <div className="orders-product-picker">
      <div className="orders-picker-filters orders-picker-filters-inline">
        <label className="orders-search-label">
          Tìm kiếm
          <div className="orders-search-input-wrap">
            <input
              type="text"
              placeholder="Tên hàng hóa, nhóm hàng..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <button
              type="button"
              className="orders-search-icon-btn"
              onClick={() => {
                setDebouncedSearch(searchTerm.trim());
                setPage(1);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </button>
          </div>
        </label>

        <label>
          Nhóm hàng
          <select
            value={filterCategoryId}
            onChange={(event) => {
              setFilterCategoryId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả nhóm hàng</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Loại hàng hóa
          <select
            value={filterType}
            onChange={(event) => {
               setFilterType(event.target.value as 'all' | 'SINGLE' | 'COMBO' | 'TIME');
              setPage(1);
            }}
          >
            <option value="all">Tất cả loại</option>
            <option value="SINGLE">Hàng riêng lẻ</option>
            <option value="COMBO">Combo</option>
            <option value="TIME">Dịch vụ tính giờ</option>
          </select>
        </label>

        <label>
          Tồn kho
          <select
            value={filterStock}
            onChange={(event) => {
              setFilterStock(event.target.value as 'all' | 'in_stock' | 'out_of_stock');
              setPage(1);
            }}
          >
            <option value="all">Tất cả</option>
            <option value="in_stock">Còn hàng</option>
            <option value="out_of_stock">Hết hàng</option>
          </select>
        </label>

        <button
          type="button"
          className="ghost-btn orders-filter-reset-btn"
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

      <div className={`orders-table-wrap ${isListLoading ? 'is-loading' : ''}`}>
        <table className="orders-products-table">
          <thead>
            <tr>
              <th className="center-col">STT</th>
              <th className="orders-col-sku">Mã hàng</th>
              <th className="orders-col-image">Hình ảnh</th>
              <th>Tên hàng</th>
              <th className="orders-col-unit">Đơn vị tính</th>
              <th className="orders-col-category">Nhóm hàng</th>
              <th className="num-col">Giá bán</th>
              <th className="num-col">Tồn kho</th>
            </tr>
          </thead>
          <tbody>
            {isListLoading ? (
              <tr>
                <td colSpan={8} className="orders-empty-row">
                  Đang tải dữ liệu
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={8} className="orders-empty-row">
                  {debouncedSearch ? 'Không tìm thấy dữ liệu' : 'Không có hàng hóa phù hợp bộ lọc'}
                </td>
              </tr>
            ) : (
              products.map((product, index) => (
                <tr
                  key={product.id}
                  className="orders-clickable-row"
                  onClick={() =>
                    onAddProduct({
                      id: product.id,
                      sku: product.sku,
                      name: product.name,
                      unit: product.unit,
                      categoryName: product.categoryName,
                       type: product.type || 'SINGLE',
                       price: Math.trunc(Number(product.price || 0)),
                       timeRateAmount: Math.trunc(Number(product.timeRateAmount || 0)),
                       timeRateMinutes: Math.max(1, Math.trunc(Number(product.timeRateMinutes || 0))),
                       stock: Number(product.stock || 0),
                    })
                  }
                >
                  <td className="center-col">{(page - 1) * pageSize + index + 1}</td>
                  <td className="orders-col-sku">{product.sku || '-'}</td>
                  <td className="orders-col-image">
                    <div className="orders-product-thumb">
                      {product.imageThumb || product.imageUrl ? (
                        <img src={resolveImageUrl(product.imageThumb || product.imageUrl)} alt={product.name} />
                      ) : (
                        <span>--</span>
                      )}
                    </div>
                  </td>
                  <td>{product.name}</td>
                  <td className="orders-col-unit">{product.unit || '-'}</td>
                  <td className="orders-col-category">{product.categoryName || '-'}</td>
                  <td className="num-col">{Math.trunc(Number(product.price || 0)).toLocaleString('vi-VN')}</td>
                  <td className="num-col">{Number(product.stock || 0).toLocaleString('vi-VN')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination-bar">
        <span>
          Trang {page}/{totalPages} - {totalItems} sản phẩm
        </span>
        <div className="pagination-actions">
          <button className="ghost-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Trước
          </button>
          {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNumber) => (
            <button
              key={pageNumber}
              className={`ghost-btn ${pageNumber === page ? 'active' : ''}`}
              disabled={pageNumber === page}
              onClick={() => setPage(pageNumber)}
            >
              {pageNumber}
            </button>
          ))}
          <button
            className="ghost-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Sau
          </button>
        </div>
      </div>
    </div>
  );
}
