import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { branchService, categoryService, productService } from '../../services/api';
import './ProductsPage.css';

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
  productCount: number;
};

type BranchConfig = {
  branchId: string;
  branchName: string;
  isActive: boolean;
  stock: string;
};

type Product = {
  id: string;
  sku: string;
  name: string;
  imageUrl?: string;
  imageThumb?: string;
  categoryId?: string;
  categoryName?: string;
  unit?: string;
  weight?: string;
  costPrice?: string;
  price: string;
  stock?: string;
  isActive: boolean;
  branchNames?: string;
  branchConfigs?: BranchConfig[] | string;
};

type Branch = {
  id: string;
  name: string;
};

type Toast = {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
};

type ProductForm = {
  sku: string;
  name: string;
  imageUrl: string;
  imageThumb: string;
  categoryId: string;
  unit: string;
  weight: string;
  costPrice: string;
  price: string;
  isActive: boolean;
};

const initialForm: ProductForm = {
  sku: '',
  name: '',
  imageUrl: '',
  imageThumb: '',
  categoryId: '',
  unit: '',
  weight: '',
  costPrice: '',
  price: '0',
  isActive: true,
};

const moneyFormatter = new Intl.NumberFormat('vi-VN');

const formatMoneyInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return moneyFormatter.format(Number(digits));
};

const parseMoneyInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
};

const formatMoneyValue = (value: string | number | null | undefined) => {
  if (value == null || value === '') return '';
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return moneyFormatter.format(Math.round(numeric));
};

const normalizeDecimalInput = (value: string, maxScale = 3) => {
  const sanitized = value.replace(/[^0-9.]/g, '');
  const parts = sanitized.split('.');
  const intPart = parts[0] ?? '';
  const decimalPart = parts.slice(1).join('').slice(0, maxScale);
  if (sanitized.includes('.')) {
    return `${intPart}.${decimalPart}`;
  }
  return intPart;
};

const buildDefaultBranchConfigs = (rows: Branch[]): BranchConfig[] =>
  rows.map((branch) => ({
    branchId: branch.id,
    branchName: branch.name,
    isActive: true,
    stock: '0',
  }));

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(initialForm);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState('');
  const [branchConfigs, setBranchConfigs] = useState<BranchConfig[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterStock, setFilterStock] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [filterBranchId, setFilterBranchId] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isListLoading, setIsListLoading] = useState(false);
  const [, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = (type: Toast['type'], message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3000);
  };

  const loadData = async () => {
    setIsListLoading(true);
    try {
      const [productResult, categoryResult, branchResult] = await Promise.allSettled([
        productService.list({
          page,
          pageSize,
          categoryId: filterCategoryId || undefined,
          stockStatus: filterStock,
          branchId: filterBranchId || undefined,
        }),
        categoryService.list(),
        branchService.getAll(),
      ]);

      if (productResult.status !== 'fulfilled') {
        throw new Error('Không tải được danh sách hàng hóa');
      }

      const productData = productResult.value.data;
      const productRows: Product[] = Array.isArray(productData)
        ? productData
        : Array.isArray(productData?.items)
          ? productData.items
          : [];
      setProducts(productRows);
      setTotalPages(productData?.pagination?.totalPages || 1);
      setTotalItems(productData?.pagination?.total || productRows.length);

      const categoryRows = categoryResult.status === 'fulfilled' ? categoryResult.value.data || [] : [];
      setCategories(categoryRows);

      const branchRows: Branch[] = branchResult.status === 'fulfilled' ? branchResult.value.data || [] : [];
      setBranches(branchRows);
      setBranchConfigs(buildDefaultBranchConfigs(branchRows));

      if (categoryResult.status !== 'fulfilled' || branchResult.status !== 'fulfilled') {
        pushToast('info', 'Một phần dữ liệu bộ lọc chưa tải được, danh sách hàng hóa vẫn hiển thị');
      }
    } finally {
      setIsListLoading(false);
    }
  };

  useEffect(() => {
    loadData().catch(() => setError('Không tải được dữ liệu hàng hóa'));
  }, [page, filterCategoryId, filterStock, filterBranchId]);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  const openCreateModal = () => {
    setEditingProductId(null);
    setProductForm(initialForm);
    setPendingImageFile(null);
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingPreviewUrl('');
    setBranchConfigs(buildDefaultBranchConfigs(branches));
    setError('');
    setIsAddProductOpen(true);
  };

  const openEditModal = async (product: Product) => {
    setLoading(true);
    let details: Product;
    try {
      const detailRes = await productService.getById(product.id);
      details = detailRes.data;
    } catch (message: any) {
      pushToast('error', message || 'Không tải được chi tiết hàng hóa từ CSDL');
      setLoading(false);
      return;
    }

    setEditingProductId(details.id);
    setProductForm({
      sku: details.sku || '',
      name: details.name || '',
      imageUrl: details.imageUrl || '',
      imageThumb: details.imageThumb || '',
      categoryId: details.categoryId || '',
      unit: details.unit || '',
      weight: details.weight || '',
      costPrice: formatMoneyValue(details.costPrice),
      price: formatMoneyValue(details.price) || '0',
      isActive: Boolean(details.isActive),
    });
    setPendingImageFile(null);
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingPreviewUrl('');

    const rawConfigs =
      typeof details.branchConfigs === 'string'
        ? (JSON.parse(details.branchConfigs) as BranchConfig[])
        : (details.branchConfigs as BranchConfig[] | undefined) || [];

    const configMap = new Map(rawConfigs.map((item) => [item.branchId, item]));
    setBranchConfigs(
      branches.map((branch) => ({
        branchId: branch.id,
        branchName: branch.name,
        isActive: configMap.has(branch.id) ? Boolean(configMap.get(branch.id)?.isActive) : false,
        stock: String(configMap.get(branch.id)?.stock ?? 0),
      })),
    );

    setError('');
    setIsAddProductOpen(true);
    setLoading(false);
  };

  const closeProductModal = () => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setIsAddProductOpen(false);
    setEditingProductId(null);
    setProductForm(initialForm);
    setPendingImageFile(null);
    setPendingPreviewUrl('');
    setBranchConfigs(buildDefaultBranchConfigs(branches));
  };

  const validateProductForm = () => {
    if (!productForm.name.trim()) return 'Tên hàng là bắt buộc';
    if (productForm.name.trim().length < 2 || productForm.name.trim().length > 255) {
      return 'Tên hàng phải từ 2 đến 255 ký tự';
    }
    if (productForm.sku && !/^[A-Za-z0-9_-]{3,50}$/.test(productForm.sku.trim())) {
      return 'Mã hàng hóa chỉ gồm chữ, số, gạch dưới hoặc gạch ngang (3-50 ký tự)';
    }
    if (productForm.unit && !/^[\p{L}\p{N}\s./-]{1,30}$/u.test(productForm.unit.trim())) {
      return 'Đơn vị tính không đúng định dạng';
    }

    const weightValue = Number(productForm.weight || 0);
    if (!Number.isFinite(weightValue) || weightValue < 0) {
      return 'Trọng lượng không hợp lệ';
    }

    const costPriceValue = parseMoneyInput(productForm.costPrice);
    const priceValue = parseMoneyInput(productForm.price);
    if (costPriceValue < 0) return 'Giá vốn không hợp lệ';
    if (priceValue <= 0) return 'Giá bán phải lớn hơn 0';

    for (const config of branchConfigs) {
      const stockValue = Number(config.stock || 0);
      if (!Number.isFinite(stockValue) || stockValue < 0) {
        return `Tồn kho chi nhánh ${config.branchName} không hợp lệ`;
      }
    }

    if (!branchConfigs.some((item) => item.isActive)) {
      return 'Ít nhất một chi nhánh phải bật trạng thái kinh doanh';
    }

    return null;
  };

  const onSaveProduct = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const validationError = validateProductForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    try {
      let imageUrl = productForm.imageUrl || null;
      let imageThumb = productForm.imageThumb || null;
      if (pendingImageFile) {
        const uploadResponse = await productService.uploadImage(pendingImageFile);
        imageUrl = uploadResponse.data.imageUrl;
        imageThumb = uploadResponse.data.imageThumb;
      }

      const payload = {
        sku: productForm.sku || undefined,
        name: productForm.name,
        imageUrl,
        imageThumb,
        categoryId: productForm.categoryId || null,
        unit: productForm.unit || undefined,
        weight: Number(productForm.weight || 0),
        costPrice: productForm.costPrice.trim() === '' ? undefined : parseMoneyInput(productForm.costPrice),
        price: parseMoneyInput(productForm.price),
        isActive: productForm.isActive,
        branchConfigs: branchConfigs.map((item) => ({
          branchId: item.branchId,
          isActive: item.isActive,
          stock: Number(item.stock || 0),
        })),
      };

      if (editingProductId) {
        await productService.update(editingProductId, payload);
        pushToast('success', 'Cập nhật hàng hóa thành công');
      } else {
        await productService.create(payload);
        pushToast('success', 'Thêm mới hàng hóa thành công');
      }

      await loadData();
      setIsAddProductOpen(false);
      setEditingProductId(null);
      setProductForm(initialForm);
      setPendingImageFile(null);
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
      setPendingPreviewUrl('');
      setBranchConfigs(buildDefaultBranchConfigs(branches));
      setPage(1);
    } catch (message: any) {
      setError(message || 'Không thể lưu hàng hóa');
      pushToast('error', message || 'Không thể lưu hàng hóa');
    } finally {
      setLoading(false);
    }
  };

  const onDeleteProduct = async (product: Product) => {
    const confirmed = window.confirm(`Xóa hàng hóa "${product.name}"?`);
    if (!confirmed) return;
    setError('');
    try {
      await productService.remove(product.id);
      await loadData();
      pushToast('success', 'Đã xóa hàng hóa');
    } catch (message: any) {
      setError(message || 'Không thể xóa hàng hóa');
      pushToast('error', message || 'Không thể xóa hàng hóa');
    }
  };

  const onUploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('image/')) {
      setError('Vui lòng chọn file hình ảnh hợp lệ');
      return;
    }

    setError('');
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    const objectUrl = URL.createObjectURL(selectedFile);
    setPendingPreviewUrl(objectUrl);
    setPendingImageFile(selectedFile);
    event.target.value = '';
  };

  const onRemoveImage = async () => {
    if (!productForm.imageUrl && !pendingImageFile) return;
    setError('');
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingPreviewUrl('');
    setPendingImageFile(null);
    setProductForm((prev) => ({ ...prev, imageUrl: '', imageThumb: '' }));
  };

  const onCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      setError('Tên nhóm hàng không được để trống');
      return;
    }
    if (!/^[\p{L}\p{N}\s&()./-]{2,100}$/u.test(newCategoryName.trim())) {
      setError('Tên nhóm hàng không đúng định dạng (2-100 ký tự)');
      return;
    }
    setError('');
    try {
      await categoryService.create(newCategoryName.trim());
      setNewCategoryName('');
      await loadData();
      pushToast('success', 'Đã thêm nhóm hàng hóa');
    } catch (message: any) {
      setError(message || 'Không thể thêm nhóm hàng');
      pushToast('error', message || 'Không thể thêm nhóm hàng');
    }
  };

  const onUpdateCategory = async () => {
    if (!editingCategoryId) return;
    if (!editingCategoryName.trim()) {
      setError('Tên nhóm hàng không được để trống');
      return;
    }
    if (!/^[\p{L}\p{N}\s&()./-]{2,100}$/u.test(editingCategoryName.trim())) {
      setError('Tên nhóm hàng không đúng định dạng (2-100 ký tự)');
      return;
    }

    const category = categories.find((item) => item.id === editingCategoryId);
    if (category && category.productCount > 0 && category.name.trim() !== editingCategoryName.trim()) {
      const warning =
        `Nhóm hàng "${category.name}" đang có ${category.productCount} mặt hàng.\n` +
        `Nếu đổi tên, toàn bộ mặt hàng thuộc nhóm này sẽ hiển thị theo tên mới.\n\n` +
        'Bạn có chắc muốn cập nhật?';
      const confirmed = window.confirm(warning);
      if (!confirmed) return;
    }

    setError('');
    try {
      await categoryService.update(editingCategoryId, editingCategoryName.trim());
      setEditingCategoryId(null);
      setEditingCategoryName('');
      await loadData();
      pushToast('success', 'Đã cập nhật nhóm hàng hóa');
    } catch (message: any) {
      setError(message || 'Không thể sửa nhóm hàng');
      pushToast('error', message || 'Không thể sửa nhóm hàng');
    }
  };

  const onDeleteCategory = async (id: string) => {
    const category = categories.find((item) => item.id === id);
    if (!category) return;

    const warning =
      category.productCount > 0
        ? `Nhóm hàng "${category.name}" đang có ${category.productCount} mặt hàng.\nNếu xóa, các mặt hàng này sẽ không còn thuộc nhóm hàng hóa nào.\n\nBạn có chắc muốn xóa?`
        : `Bạn có chắc muốn xóa nhóm hàng "${category.name}"?`;

    const confirmed = window.confirm(warning);
    if (!confirmed) return;

    setError('');
    try {
      const response = await categoryService.remove(id);
      await loadData();
      if (response.data?.message) {
        pushToast('info', response.data.message);
      } else {
        pushToast('success', 'Đã xóa nhóm hàng hóa');
      }
    } catch (message: any) {
      setError(message || 'Không thể xóa nhóm hàng');
      pushToast('error', message || 'Không thể xóa nhóm hàng');
    }
  };

  return (
    <section className="products-page">
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>

      <div className="products-toolbar">
        <h2>Danh sách hàng hóa</h2>
        <div className="products-toolbar-actions">
          <button className="primary-btn" onClick={openCreateModal}>
            Thêm mới hàng hóa
          </button>
          <button className="secondary-btn" onClick={() => setIsCategoryOpen(true)}>
            Quản lý nhóm hàng hóa
          </button>
        </div>
      </div>

      <div className="products-filters">
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

        <label>
          Chi nhánh
          <select
            value={filterBranchId}
            onChange={(event) => {
              setFilterBranchId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả chi nhánh</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isListLoading && (
        <div className="list-loading">
          <span className="dot-spinner" aria-hidden>
            <span className="dot-spinner__dot" />
            <span className="dot-spinner__dot" />
            <span className="dot-spinner__dot" />
            <span className="dot-spinner__dot" />
            <span className="dot-spinner__dot" />
            <span className="dot-spinner__dot" />
            <span className="dot-spinner__dot" />
            <span className="dot-spinner__dot" />
          </span>
          <span>Đang tải dữ liệu</span>
        </div>
      )}

      <div className="products-table-wrap">
        <table className="products-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Mã hàng</th>
              <th>Hình ảnh</th>
              <th>Tên hàng</th>
              <th>Nhóm hàng</th>
              <th>Đơn vị tính</th>
              <th>Giá vốn</th>
              <th>Giá bán</th>
              <th>Tồn kho</th>
              <th>Chi nhánh</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isListLoading ? (
              <tr>
                <td colSpan={12} className="empty-row">
                  Đang tải dữ liệu
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={12} className="empty-row">
                  Không có hàng hóa phù hợp bộ lọc
                </td>
              </tr>
            ) : (
              products.map((product, index) => (
                <tr key={product.id}>
                  <td>{(page - 1) * pageSize + index + 1}</td>
                  <td>{product.sku}</td>
                  <td>
                    <div className="product-thumb">
                      {product.imageThumb || product.imageUrl ? (
                        <img src={resolveImageUrl(product.imageThumb || product.imageUrl)} alt={product.name} />
                      ) : (
                        <span>--</span>
                      )}
                    </div>
                  </td>
                  <td>{product.name}</td>
                  <td>{product.categoryName || '-'}</td>
                  <td>{product.unit || '-'}</td>
                  <td>{Number(product.costPrice || 0).toLocaleString('vi-VN')}</td>
                  <td>{Number(product.price || 0).toLocaleString('vi-VN')}</td>
                  <td>{Number(product.stock || 0).toLocaleString('vi-VN')}</td>
                  <td>{product.branchNames || '-'}</td>
                  <td>
                    <span className={product.isActive ? 'status-active' : 'status-inactive'}>
                      {product.isActive ? 'Đang kinh doanh' : 'Ngừng kinh doanh'}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="ghost-btn" onClick={() => openEditModal(product)}>
                        Sửa
                      </button>
                      <button className="danger-btn" onClick={() => onDeleteProduct(product)}>
                        Xóa
                      </button>
                    </div>
                  </td>
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
          <button
            className="ghost-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Sau
          </button>
        </div>
      </div>

      {isAddProductOpen && (
        <div className="modal-overlay" onClick={closeProductModal}>
          <div className="modal-content modal-large" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingProductId ? 'Sửa hàng hóa' : 'Thêm hàng hóa'}</h3>
              <button className="icon-close" onClick={closeProductModal}>
                x
              </button>
            </div>

            <form className="product-form" onSubmit={onSaveProduct}>
              <div className="form-grid">
                <label>
                  Hình ảnh
                  <div className="image-upload-row">
                    <div className="image-preview-box">
                      {pendingPreviewUrl || productForm.imageUrl ? (
                        <img
                          src={pendingPreviewUrl || resolveImageUrl(productForm.imageUrl)}
                          alt="product preview"
                        />
                      ) : (
                        <span>Chưa có ảnh</span>
                      )}
                    </div>
                    <div className="image-upload-actions">
                      <input type="file" accept="image/*" onChange={onUploadImage} />
                      {productForm.imageUrl && (
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={onRemoveImage}
                        >
                          Xóa ảnh
                        </button>
                      )}
                      <small>
                        {pendingImageFile
                          ? 'Ảnh đã chọn, sẽ upload/nén khi nhấn Lưu'
                          : 'Ảnh sẽ tự nén và resize khi nhấn Lưu'}
                      </small>
                    </div>
                  </div>
                </label>

                <label>
                  Mã hàng hóa
                  <input
                    value={productForm.sku}
                    onChange={(event) => setProductForm({ ...productForm, sku: event.target.value.toUpperCase() })}
                    placeholder="Mã hàng tự động"
                    maxLength={50}
                  />
                </label>

                <label>
                  Tên hàng *
                  <input
                    value={productForm.name}
                    onChange={(event) => setProductForm({ ...productForm, name: event.target.value })}
                    required
                    maxLength={255}
                  />
                </label>

                <label>
                  Nhóm hàng
                  <select
                    value={productForm.categoryId}
                    onChange={(event) => setProductForm({ ...productForm, categoryId: event.target.value })}
                  >
                    <option value="">--Lựa chọn--</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Trọng lượng (kg)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={productForm.weight}
                    onChange={(event) =>
                      setProductForm({ ...productForm, weight: normalizeDecimalInput(event.target.value, 3) })
                    }
                  />
                </label>

                <label>
                  Đơn vị tính
                  <input
                    value={productForm.unit}
                    onChange={(event) => setProductForm({ ...productForm, unit: event.target.value })}
                    placeholder="Ví dụ: lon, chai, hộp"
                    maxLength={30}
                  />
                </label>

                <label>
                  Giá vốn
                  <input
                    type="text"
                    inputMode="numeric"
                    value={productForm.costPrice}
                    onFocus={(event) => {
                      if (parseMoneyInput(productForm.costPrice) === 0) {
                        setProductForm((prev) => ({ ...prev, costPrice: '' }));
                      } else {
                        event.target.select();
                      }
                    }}
                    onBlur={() => {
                      setProductForm((prev) => ({
                        ...prev,
                        costPrice: prev.costPrice.trim() === '' ? '' : formatMoneyInput(prev.costPrice),
                      }));
                    }}
                    onChange={(event) =>
                      setProductForm({ ...productForm, costPrice: formatMoneyInput(event.target.value) })
                    }
                  />
                </label>

                <label>
                  Giá bán *
                  <input
                    type="text"
                    inputMode="numeric"
                    value={productForm.price}
                    onFocus={(event) => {
                      if (parseMoneyInput(productForm.price) === 0) {
                        setProductForm((prev) => ({ ...prev, price: '' }));
                      } else {
                        event.target.select();
                      }
                    }}
                    onBlur={() => {
                      setProductForm((prev) => ({
                        ...prev,
                        price: prev.price.trim() === '' ? '0' : formatMoneyInput(prev.price),
                      }));
                    }}
                    onChange={(event) =>
                      setProductForm({ ...productForm, price: formatMoneyInput(event.target.value) })
                    }
                    required
                  />
                </label>
              </div>

              <div className="branch-section">
                <div className="branch-section-header">
                  <span>Tên chi nhánh</span>
                  <span>Tồn kho</span>
                  <span>Trạng thái kinh doanh</span>
                </div>
                {branchConfigs.map((config) => (
                  <div key={config.branchId} className="branch-row">
                    <span>{config.branchName}</span>
                    <input
                      className="branch-stock-input"
                      type="text"
                      inputMode="decimal"
                      value={config.stock}
                      onFocus={(event) => {
                        if (event.target.value === '0') {
                          setBranchConfigs((prev) =>
                            prev.map((item) =>
                              item.branchId === config.branchId ? { ...item, stock: '' } : item,
                            ),
                          );
                        } else {
                          event.target.select();
                        }
                      }}
                      onBlur={() => {
                        setBranchConfigs((prev) =>
                          prev.map((item) =>
                            item.branchId === config.branchId
                              ? { ...item, stock: item.stock.trim() === '' ? '0' : item.stock }
                              : item,
                          ),
                        );
                      }}
                      onChange={(event) => {
                        const value = normalizeDecimalInput(event.target.value, 3);
                        setBranchConfigs((prev) =>
                          prev.map((item) =>
                            item.branchId === config.branchId ? { ...item, stock: value } : item,
                          ),
                        );
                      }}
                    />
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={config.isActive}
                        onChange={(event) => {
                          setBranchConfigs((prev) =>
                            prev.map((item) =>
                              item.branchId === config.branchId
                                ? { ...item, isActive: event.target.checked }
                                : item,
                            ),
                          );
                        }}
                      />
                      <span className="slider" />
                    </label>
                  </div>
                ))}
              </div>

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={closeProductModal}>
                  Bỏ qua
                </button>
                <button type="submit" className="primary-btn" disabled={loading}>
                  {loading ? 'Đang lưu...' : editingProductId ? 'Cập nhật' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isCategoryOpen && (
        <div className="modal-overlay" onClick={() => setIsCategoryOpen(false)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Quản lý nhóm hàng hóa</h3>
              <button className="icon-close" onClick={() => setIsCategoryOpen(false)}>
                x
              </button>
            </div>

            <div className="category-create-row">
              <input
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="Tên nhóm hàng mới"
              />
              <button className="primary-btn" onClick={onCreateCategory}>
                Thêm
              </button>
            </div>

            <div className="category-list">
              {categories.length === 0 ? (
                <div className="empty-row">Chưa có nhóm hàng</div>
              ) : (
                categories.map((category) => (
                  <div key={category.id} className="category-item">
                    {editingCategoryId === category.id ? (
                      <input
                        value={editingCategoryName}
                        onChange={(event) => setEditingCategoryName(event.target.value)}
                      />
                    ) : (
                      <div>
                        <strong>{category.name}</strong>
                        <span className="category-count">{category.productCount} hàng hóa</span>
                      </div>
                    )}

                    <div className="category-actions">
                      {editingCategoryId === category.id ? (
                        <>
                          <button className="primary-btn" onClick={onUpdateCategory}>
                            Lưu
                          </button>
                          <button
                            className="ghost-btn"
                            onClick={() => {
                              setEditingCategoryId(null);
                              setEditingCategoryName('');
                            }}
                          >
                            Hủy
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="ghost-btn"
                            onClick={() => {
                              setEditingCategoryId(category.id);
                              setEditingCategoryName(category.name);
                            }}
                          >
                            Sửa
                          </button>
                          <button className="danger-btn" onClick={() => onDeleteCategory(category.id)}>
                            Xóa
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="modal-tip">
              Lưu ý:
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
