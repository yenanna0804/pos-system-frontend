import { useEffect, useMemo, useState } from 'react';
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

  const reloadAfterSuccess = () => {
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchCategory = !filterCategoryId || product.categoryId === filterCategoryId;

      const stockValue = Number(product.stock || 0);
      const matchStock =
        filterStock === 'all' ||
        (filterStock === 'in_stock' && stockValue > 0) ||
        (filterStock === 'out_of_stock' && stockValue <= 0);

      const rawConfigs =
        typeof product.branchConfigs === 'string'
          ? (JSON.parse(product.branchConfigs) as BranchConfig[])
          : (product.branchConfigs as BranchConfig[] | undefined) || [];
      const activeBranchIds = rawConfigs.filter((item) => item.isActive).map((item) => item.branchId);
      const matchBranch = !filterBranchId || activeBranchIds.includes(filterBranchId);

      return matchCategory && matchStock && matchBranch;
    });
  }, [products, filterCategoryId, filterStock, filterBranchId]);

  const loadData = async () => {
    const [productRes, categoryRes, branchRes] = await Promise.all([
      productService.list(),
      categoryService.list(),
      branchService.getAll(),
    ]);

    const productRows: Product[] = productRes.data || [];
    setProducts(productRows);
    setCategories(categoryRes.data || []);
    const branchRows: Branch[] = branchRes.data || [];
    setBranches(branchRows);
    setBranchConfigs(buildDefaultBranchConfigs(branchRows));
  };

  useEffect(() => {
    loadData().catch(() => setError('Không tải được dữ liệu hàng hóa'));
  }, []);

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

  const openEditModal = (product: Product) => {
    setEditingProductId(product.id);
    setProductForm({
      sku: product.sku || '',
      name: product.name || '',
      imageUrl: product.imageUrl || '',
      categoryId: product.categoryId || '',
      unit: product.unit || '',
      weight: product.weight || '',
      costPrice: Number(product.costPrice || 0) > 0 ? formatMoneyInput(String(product.costPrice)) : '',
      price: formatMoneyInput(String(product.price || 0)),
      isActive: Boolean(product.isActive),
    });
    setPendingImageFile(null);
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingPreviewUrl('');

    const rawConfigs =
      typeof product.branchConfigs === 'string'
        ? (JSON.parse(product.branchConfigs) as BranchConfig[])
        : (product.branchConfigs as BranchConfig[] | undefined) || [];

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
      if (pendingImageFile) {
        const uploadResponse = await productService.uploadImage(pendingImageFile);
        imageUrl = uploadResponse.data.imageUrl;
      }

      const payload = {
        sku: productForm.sku || undefined,
        name: productForm.name,
        imageUrl,
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
      reloadAfterSuccess();
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
      reloadAfterSuccess();
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
    setProductForm((prev) => ({ ...prev, imageUrl: '' }));
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
      reloadAfterSuccess();
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
      reloadAfterSuccess();
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
      reloadAfterSuccess();
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
          <select value={filterCategoryId} onChange={(event) => setFilterCategoryId(event.target.value)}>
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
            onChange={(event) => setFilterStock(event.target.value as 'all' | 'in_stock' | 'out_of_stock')}
          >
            <option value="all">Tất cả</option>
            <option value="in_stock">Còn hàng</option>
            <option value="out_of_stock">Hết hàng</option>
          </select>
        </label>

        <label>
          Chi nhánh
          <select value={filterBranchId} onChange={(event) => setFilterBranchId(event.target.value)}>
            <option value="">Tất cả chi nhánh</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="products-table-wrap">
        <table className="products-table">
          <thead>
            <tr>
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
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={11} className="empty-row">
                  Không có hàng hóa phù hợp bộ lọc
                </td>
              </tr>
            ) : (
              filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td>{product.sku}</td>
                  <td>
                    <div className="product-thumb">
                      {product.imageUrl ? <img src={resolveImageUrl(product.imageUrl)} alt={product.name} /> : <span>--</span>}
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
              Lưu ý: sửa tên hoặc xóa nhóm hàng sẽ được validate chéo với các hàng hóa đang thuộc nhóm.
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
