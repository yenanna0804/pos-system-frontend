import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { branchService, categoryService, productService } from '../../services/api';
import { DeleteActionIcon, EditActionIcon } from '../../components/ActionIcons';
import FormFieldError from '../../components/FormFieldError';
import FilterResetButton from '../../components/FilterResetButton';
import { useAuth } from '../../contexts/AuthContext';
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
  type?: 'SINGLE' | 'COMBO';
  autoPrice?: boolean;
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
  comboItems?: ComboItem[] | string;
};

type ComboItem = {
  itemProductId: string;
  quantity: number;
  itemName?: string;
  itemPrice?: number;
  itemUnit?: string;
};

type ComboDetailRow = {
  id: string;
  name: string;
  imageThumb?: string;
  imageUrl?: string;
  categoryName?: string;
  quantity: number;
  unit?: string;
  costPrice?: string;
  price?: string;
  stock?: string;
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

type ConfirmDialogState = {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type ProductForm = {
  type: 'SINGLE' | 'COMBO';
  autoCost: boolean;
  autoPrice: boolean;
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

type ProductFieldErrors = {
  name?: string;
  sku?: string;
  unit?: string;
  weight?: string;
  costPrice?: string;
  price?: string;
  comboItems?: string;
  branchConfigs?: string;
};

const initialForm: ProductForm = {
  type: 'SINGLE',
  autoCost: true,
  autoPrice: true,
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

const parseCatalogMoney = (value: unknown) => {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
  }
  return parseMoneyInput(raw);
};

const formatMoneyValue = (value: string | number | null | undefined) => {
  if (value == null || value === '') return '';
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return moneyFormatter.format(Math.trunc(numeric));
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
  const { branchId: authBranchId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isComboDetailOpen, setIsComboDetailOpen] = useState(false);
  const [comboDetailTitle, setComboDetailTitle] = useState('');
  const [comboDetailItems, setComboDetailItems] = useState<ComboItem[]>([]);
  const [comboDetailRows, setComboDetailRows] = useState<ComboDetailRow[]>([]);
  const [comboDetailPage, setComboDetailPage] = useState(1);
  const [isComboDetailLoading, setIsComboDetailLoading] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(initialForm);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState('');
  const [branchConfigs, setBranchConfigs] = useState<BranchConfig[]>([]);
  const [comboItems, setComboItems] = useState<ComboItem[]>([]);
  const [comboCatalog, setComboCatalog] = useState<Product[]>([]);
  const [comboSearchTerms, setComboSearchTerms] = useState<string[]>([]);
  const [activeComboDropdown, setActiveComboDropdown] = useState<number | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'SINGLE' | 'COMBO'>('all');
  const [filterStock, setFilterStock] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [filterBranchId, setFilterBranchId] = useState(authBranchId || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 7;
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isListLoading, setIsListLoading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [productFieldErrors, setProductFieldErrors] = useState<ProductFieldErrors>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({ open: false, title: '', message: '' });
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  const comboDetailPageSize = 5;
  const comboDetailTotalPages = Math.max(1, Math.ceil(comboDetailRows.length / comboDetailPageSize));
  const comboDetailPagedRows = comboDetailRows.slice(
    (comboDetailPage - 1) * comboDetailPageSize,
    comboDetailPage * comboDetailPageSize,
  );

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

  const getPreferredBranchId = () => filterBranchId || authBranchId || branches[0]?.id || '';

  const buildCreateBranchConfigs = () => {
    const preferredBranchId = getPreferredBranchId();
    if (!preferredBranchId) return [] as BranchConfig[];

    const preferredBranch = branches.find((branch) => branch.id === preferredBranchId);
    const existingConfig = branchConfigs.find((item) => item.branchId === preferredBranchId);

    return [
      {
        branchId: preferredBranchId,
        branchName: preferredBranch?.name || 'Chi nhánh mặc định',
        isActive: true,
        stock: existingConfig?.stock || '0',
      },
    ];
  };

  const loadBranches = async () => {
    const branchRows: Branch[] = (await branchService.getAll()).data || [];
    setBranches(branchRows);
    setBranchConfigs(buildDefaultBranchConfigs(branchRows));
  };

  const loadCategories = async (force = false) => {
    if (categoriesLoaded && !force) return;
    const categoryRows: Category[] = (await categoryService.list()).data || [];
    setCategories(categoryRows);
    setCategoriesLoaded(true);
  };

  const loadData = async () => {
    setIsListLoading(true);
    try {
      const productResult = await productService.list({
        page,
        pageSize,
        type: filterType === 'all' ? undefined : filterType,
        categoryId: filterCategoryId || undefined,
        stockStatus: filterStock,
        branchId: filterBranchId || undefined,
        search: debouncedSearch || undefined,
      });

      const productData = productResult.data;
      const productRows: Product[] = Array.isArray(productData)
        ? productData
        : Array.isArray(productData?.items)
          ? productData.items
          : [];
      setProducts(productRows);
      setTotalPages(productData?.pagination?.totalPages || 1);
      setTotalItems(productData?.pagination?.total || productRows.length);
    } finally {
      setIsListLoading(false);
    }
  };

  const loadComboCatalog = async () => {
    const res = await productService.list({ page: 1, pageSize: 100, branchId: filterBranchId || undefined });
    const data = res.data;
    const rows: Product[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    setComboCatalog(rows.filter((item) => (item.type || 'SINGLE') === 'SINGLE'));
  };

  const formatComboProductLabel = (product: Product | undefined) => {
    if (!product) return '';
    const unit = product.unit?.trim();
    return unit ? `${product.name} - ${unit}` : product.name;
  };

  useEffect(() => {
    loadBranches().catch(() => setError('Không tải được danh sách chi nhánh'));
  }, []);

  useEffect(() => {
    loadData().catch(() => setError('Không tải được dữ liệu hàng hóa'));
  }, [page, filterCategoryId, filterType, filterStock, filterBranchId, debouncedSearch]);

  useEffect(() => {
    setFilterBranchId(authBranchId || '');
    setPage(1);
  }, [authBranchId]);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  // Debounce search term
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 500); // Search after 500ms pause

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  useEffect(() => {
    if (productForm.type !== 'COMBO' || !productForm.autoCost) return;
    const total = comboItems.reduce((sum, item) => {
      const product = comboCatalog.find((entry) => entry.id === item.itemProductId);
      return sum + parseCatalogMoney(product?.costPrice) * Number(item.quantity || 0);
    }, 0);
    setProductForm((prev) => ({ ...prev, costPrice: formatMoneyValue(total) || '' }));
  }, [comboCatalog, comboItems, productForm.autoCost, productForm.type]);

  useEffect(() => {
    if (productForm.type !== 'COMBO' || !productForm.autoPrice) return;
    const total = comboItems.reduce((sum, item) => {
      const product = comboCatalog.find((entry) => entry.id === item.itemProductId);
      return sum + parseCatalogMoney(product?.price) * Number(item.quantity || 0);
    }, 0);
    setProductForm((prev) => ({ ...prev, price: formatMoneyValue(total) || '0' }));
  }, [comboCatalog, comboItems, productForm.autoPrice, productForm.type]);

  useEffect(() => {
    if (comboItems.length === 0) {
      if (comboSearchTerms.length) setComboSearchTerms([]);
      return;
    }

    setComboSearchTerms((prev) =>
      comboItems.map((item, idx) => {
        if (prev[idx]?.trim()) return prev[idx];
        return formatComboProductLabel(comboCatalog.find((entry) => entry.id === item.itemProductId));
      }),
    );
  }, [comboCatalog, comboItems]);

  const openCreateModal = () => {
    loadCategories().catch(() => pushToast('error', 'Không tải được nhóm hàng hóa'));
    loadComboCatalog().catch(() => pushToast('error', 'Không tải được danh sách hàng hóa thành phần'));
    setEditingProductId(null);
    setProductForm(initialForm);
    setPendingImageFile(null);
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingPreviewUrl('');
    setBranchConfigs(buildCreateBranchConfigs());
    setComboItems([]);
    setComboSearchTerms([]);
    setActiveComboDropdown(null);
    setProductFieldErrors({});
    setError('');
    setIsAddProductOpen(true);
  };

  const openEditModal = async (product: Product) => {
    await loadCategories().catch(() => {
      pushToast('error', 'Không tải được nhóm hàng hóa');
    });
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
      type: (details.type as 'SINGLE' | 'COMBO') || 'SINGLE',
      autoCost: true,
      autoPrice: details.autoPrice ?? true,
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
    await loadComboCatalog().catch(() => {
      pushToast('error', 'Không tải được danh sách hàng hóa thành phần');
    });
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

    const rawComboItems =
      typeof details.comboItems === 'string'
        ? (JSON.parse(details.comboItems) as ComboItem[])
        : (details.comboItems as ComboItem[] | undefined) || [];
    const normalizedComboItems = rawComboItems.map((item) => ({
      itemProductId: item.itemProductId,
      quantity: Number(item.quantity || 1),
    }));
    setComboItems(normalizedComboItems);
    setComboSearchTerms(
      normalizedComboItems.map((item) => formatComboProductLabel(comboCatalog.find((entry) => entry.id === item.itemProductId))),
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
    setBranchConfigs(buildCreateBranchConfigs());
    setComboItems([]);
    setComboSearchTerms([]);
    setActiveComboDropdown(null);
    setProductFieldErrors({});
  };

  const resetListFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setFilterCategoryId('');
    setFilterType('all');
    setFilterStock('all');
    setFilterBranchId(authBranchId || '');
    setPage(1);
  };

  const openComboDetailModal = async (product: Product) => {
    if ((product.type || 'SINGLE') !== 'COMBO') return;
    setComboDetailTitle(product.name);
    setComboDetailItems([]);
    setComboDetailRows([]);
    setComboDetailPage(1);
    setIsComboDetailOpen(true);
    setIsComboDetailLoading(true);
    try {
      const detailRes = await productService.getById(product.id);
      const details: Product = detailRes.data;
      const rawComboItems =
        typeof details.comboItems === 'string'
          ? (JSON.parse(details.comboItems) as ComboItem[])
          : (details.comboItems as ComboItem[] | undefined) || [];
      setComboDetailItems(rawComboItems);

      if (rawComboItems.length > 0) {
        const catalogRes = await productService.list({ page: 1, pageSize: 500, branchId: filterBranchId || undefined });
        const catalogData = catalogRes.data;
        const catalogRows: Product[] = Array.isArray(catalogData)
          ? catalogData
          : Array.isArray(catalogData?.items)
            ? catalogData.items
            : [];
        const catalogMap = new Map(catalogRows.map((entry) => [entry.id, entry]));
        setComboDetailRows(
          rawComboItems.map((item) => {
            const found = catalogMap.get(item.itemProductId);
            return {
              id: item.itemProductId,
              name: item.itemName || found?.name || 'Không rõ',
              imageThumb: found?.imageThumb,
              imageUrl: found?.imageUrl,
              categoryName: found?.categoryName,
              quantity: Number(item.quantity || 0),
              unit: item.itemUnit || found?.unit,
              costPrice: String(found?.costPrice || '0'),
              price: String(found?.price || '0'),
              stock: String(found?.stock || '0'),
            };
          }),
        );
      } else {
        setComboDetailRows([]);
      }
    } catch {
      pushToast('error', 'Không tải được danh sách hàng hóa thành phần');
    } finally {
      setIsComboDetailLoading(false);
    }
  };

  const validateProductForm = () => {
    const fieldErrors: ProductFieldErrors = {};
    if (!productForm.name.trim()) fieldErrors.name = 'Tên hàng là bắt buộc';
    if (productForm.name.trim().length < 2 || productForm.name.trim().length > 255) {
      fieldErrors.name = 'Tên hàng phải từ 2 đến 255 ký tự';
    }
    if (productForm.sku && !/^[A-Za-z0-9_-]{3,50}$/.test(productForm.sku.trim())) {
      fieldErrors.sku = 'Mã hàng hóa chỉ gồm chữ, số, gạch dưới hoặc gạch ngang (3-50 ký tự)';
    }
    if (productForm.unit && !/^[\p{L}\p{N}\s./-]{1,30}$/u.test(productForm.unit.trim())) {
      fieldErrors.unit = 'Đơn vị tính không đúng định dạng';
    }

    const weightValue = Number(productForm.weight || 0);
    if (!Number.isFinite(weightValue) || weightValue < 0) {
      fieldErrors.weight = 'Trọng lượng không hợp lệ';
    }

    const costPriceValue = parseMoneyInput(productForm.costPrice);
    const priceValue = parseMoneyInput(productForm.price);
    if (costPriceValue < 0) fieldErrors.costPrice = 'Giá vốn không hợp lệ';
    if (priceValue <= 0) fieldErrors.price = 'Giá bán phải lớn hơn 0';

    if (productForm.type === 'COMBO') {
      if (comboItems.length === 0) fieldErrors.comboItems = 'Combo phải có ít nhất một hàng hóa thành phần';
      const unresolvedIdx = comboItems.findIndex((item, idx) => !item.itemProductId && (comboSearchTerms[idx] || '').trim() !== '');
      if (unresolvedIdx >= 0) {
        fieldErrors.comboItems = `Dòng thành phần ${unresolvedIdx + 1}: vui lòng chọn hàng hóa từ danh sách gợi ý`;
      }
      if (comboItems.some((item) => !item.itemProductId || Number(item.quantity) <= 0)) {
        fieldErrors.comboItems = fieldErrors.comboItems || 'Thành phần combo không hợp lệ';
      }
    }

    const configsToValidate = editingProductId ? branchConfigs : buildCreateBranchConfigs();

    for (const config of configsToValidate) {
      const stockValue = Number(config.stock || 0);
      if (!Number.isFinite(stockValue) || stockValue < 0) {
        fieldErrors.branchConfigs = `Tồn kho chi nhánh ${config.branchName} không hợp lệ`;
        break;
      }
    }

    if (configsToValidate.length === 0) {
      fieldErrors.branchConfigs = 'Không tìm thấy chi nhánh mặc định để lưu hàng hóa';
    }

    if (!configsToValidate.some((item) => item.isActive)) {
      fieldErrors.branchConfigs = 'Ít nhất một chi nhánh phải bật trạng thái kinh doanh';
    }

    const firstError = Object.values(fieldErrors).find(Boolean) || null;
    return { fieldErrors, firstError };
  };

  const onSaveProduct = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const { fieldErrors, firstError } = validateProductForm();
    setProductFieldErrors(fieldErrors);
    if (firstError) {
      setError(firstError);
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
        type: productForm.type,
        autoPrice: productForm.type === 'COMBO' ? productForm.autoPrice : false,
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
        branchConfigs: (editingProductId ? branchConfigs : buildCreateBranchConfigs()).map((item) => ({
          branchId: item.branchId,
          isActive: item.isActive,
          stock: Number(item.stock || 0),
        })),
        comboItems:
          productForm.type === 'COMBO'
            ? comboItems.map((item) => ({ itemProductId: item.itemProductId, quantity: Number(item.quantity) }))
            : undefined,
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
      setBranchConfigs(buildCreateBranchConfigs());
      setComboItems([]);
      setComboSearchTerms([]);
      setActiveComboDropdown(null);
      setProductFieldErrors({});
      setPage(1);
    } catch (message: any) {
      setError(message || 'Không thể lưu hàng hóa');
      pushToast('error', message || 'Không thể lưu hàng hóa');
    } finally {
      setLoading(false);
    }
  };

  const onDeleteProduct = async (product: Product) => {
    let impactMessage = `Xóa hàng hóa "${product.name}"?`;
    try {
      const impactRes = await productService.getDeleteImpact(product.id);
      const impactData = impactRes.data || {};
      const impactOrders: { orderCode?: string; itemCount?: number }[] = Array.isArray(impactData.orders)
        ? impactData.orders
        : [];
      const totalOrders = Number(impactData.totalOrders || impactOrders.length || 0);

      if (totalOrders > 0) {
        const preview = impactOrders
          .slice(0, 8)
          .map((order) => `- ${order.orderCode || 'Không rõ mã'} (${Number(order.itemCount || 0)} dòng)`)
          .join('\n');
        const remain = totalOrders - Math.min(8, impactOrders.length);
        impactMessage =
          `Mặt hàng "${product.name}" đang nằm trong ${totalOrders} hóa đơn:\n` +
          `${preview}${remain > 0 ? `\n- ... và ${remain} hóa đơn khác` : ''}\n\n` +
          'Nếu tiếp tục, hệ thống sẽ xóa mặt hàng này khỏi toàn bộ hóa đơn liên quan và cập nhật lại dữ liệu hóa đơn.\n' +
          'Dữ liệu báo cáo có thể thay đổi.\n\n' +
          'Bạn có chắc muốn xóa?';
      }
    } catch {
      impactMessage =
        `Xóa hàng hóa "${product.name}"?\n\n` +
        'Nếu mặt hàng đang nằm trong hóa đơn, hệ thống sẽ tự động xóa khỏi các hóa đơn liên quan và cập nhật lại dữ liệu hóa đơn.';
    }

    const confirmed = await confirmAction({
      title: 'Xác nhận xóa hàng hóa',
      message: impactMessage,
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      danger: true,
    });
    if (!confirmed) return;
    setError('');
    try {
      const response = await productService.remove(product.id);
      await loadData();
      const affectedOrders = Number(response.data?.affectedOrders || 0);
      const removedItems = Number(response.data?.removedItems || 0);
      if (affectedOrders > 0 || removedItems > 0) {
        pushToast('info', `Đã xóa hàng hóa, cập nhật ${affectedOrders} hóa đơn (${removedItems} dòng món)`);
      } else {
        pushToast('success', 'Đã xóa hàng hóa');
      }
    } catch (message: any) {
      setError(message || 'Không thể xóa hàng hóa');
      pushToast('error', message || 'Không thể xóa hàng hóa');
    }
  };

  const onUploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    await applySelectedImageFile(selectedFile);
    event.target.value = '';
  };

  const applySelectedImageFile = async (selectedFile: File) => {
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
  };

  const onPasteImage = async (event: React.ClipboardEvent<HTMLElement>) => {
    const items = event.clipboardData?.items;
    if (!items || items.length === 0) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await applySelectedImageFile(file);
        }
        return;
      }
    }

    setError('Không tìm thấy ảnh trong dữ liệu dán. Vui lòng copy hình ảnh rồi dán lại.');
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
      await loadCategories(true);
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
      const confirmed = await confirmAction({
        title: 'Xác nhận cập nhật nhóm hàng',
        message: warning,
        confirmText: 'Cập nhật',
        cancelText: 'Hủy',
      });
      if (!confirmed) return;
    }

    setError('');
    try {
      await categoryService.update(editingCategoryId, editingCategoryName.trim());
      setEditingCategoryId(null);
      setEditingCategoryName('');
      await loadCategories(true);
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

    const confirmed = await confirmAction({
      title: 'Xác nhận xóa nhóm hàng',
      message: warning,
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      danger: true,
    });
    if (!confirmed) return;

    setError('');
    try {
      const response = await categoryService.remove(id);
      await loadCategories(true);
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

      {confirmDialog.open && (
        <div className="modal-overlay" onClick={() => closeConfirmDialog(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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
        <h2>Danh sách hàng hóa</h2>
        <div className="products-toolbar-actions">
          <button className="primary-btn" onClick={openCreateModal}>
            Thêm mới hàng hóa
          </button>
          <button
            className="secondary-btn"
            onClick={() => {
              loadCategories().catch(() => pushToast('error', 'Không tải được nhóm hàng hóa'));
              setIsCategoryOpen(true);
            }}
          >
            Quản lý nhóm hàng hóa
          </button>
        </div>
      </div>

      <div className="products-filters">
        <label className="search-label">
          Tìm kiếm
          <div className="search-input-wrap">
            <input
              type="text"
              placeholder="Tên hàng hóa, nhóm hàng..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
              }}
            />
            <button
              type="button"
              className="search-icon-btn"
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
            onFocus={() => {
              loadCategories().catch(() => pushToast('error', 'Không tải được nhóm hàng hóa'));
            }}
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
              setFilterType(event.target.value as 'all' | 'SINGLE' | 'COMBO');
              setPage(1);
            }}
          >
            <option value="all">Tất cả loại</option>
            <option value="SINGLE">Hàng riêng lẻ</option>
            <option value="COMBO">Combo</option>
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

        <FilterResetButton onClick={resetListFilters} />

      </div>

      <div className={`products-table-wrap ${isListLoading ? 'is-loading' : ''}`}>
        {isListLoading && (
          <div className="list-loading-overlay">
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
          </div>
        )}
        <table className="products-table">
          <thead>
            <tr>
              <th className="center-col">STT</th>
              <th>Mã hàng</th>
              <th>Hình ảnh</th>
              <th>Tên hàng</th>
              <th>Đơn vị tính</th>
              <th>Nhóm hàng</th>
              <th className="num-col">Giá vốn</th>
              <th className="num-col">Giá bán</th>
              <th className="num-col">Tồn kho</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isListLoading ? (
              <tr>
                <td colSpan={10} className="empty-row">
                  Đang tải dữ liệu
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={10} className="empty-row">
                  {debouncedSearch ? 'Không tìm thấy dữ liệu' : 'Không có hàng hóa phù hợp bộ lọc'}
                </td>
              </tr>
            ) : (
              products.map((product, index) => (
                <tr key={product.id}>
                  <td className="center-col">{(page - 1) * pageSize + index + 1}</td>
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
                  <td>
                    {(product.type || 'SINGLE') === 'COMBO' ? (
                      <button
                        type="button"
                        className="combo-name-btn"
                        onClick={() => {
                          openComboDetailModal(product).catch(() => {
                            pushToast('error', 'Không tải được danh sách hàng hóa thành phần');
                          });
                        }}
                      >
                        {product.name} (Combo)
                      </button>
                    ) : (
                      product.name
                    )}
                  </td>
                  <td>{product.unit || '-'}</td>
                  <td>{product.categoryName || '-'}</td>
                  <td className="num-col">{Math.trunc(Number(product.costPrice || 0)).toLocaleString('vi-VN')}</td>
                  <td className="num-col">{Math.trunc(Number(product.price || 0)).toLocaleString('vi-VN')}</td>
                  <td className="num-col">{Number(product.stock || 0).toLocaleString('vi-VN')}</td>
                  <td>
                    <div className="row-actions">
                      <button className="ghost-btn icon-action-btn" title="Sửa" aria-label="Sửa" onClick={() => openEditModal(product)}>
                        <EditActionIcon />
                      </button>
                      <button className="danger-btn icon-action-btn" title="Xóa" aria-label="Xóa" onClick={() => onDeleteProduct(product)}>
                        <DeleteActionIcon />
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
          {totalPages <= 7 ? (
            Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                className={`ghost-btn ${pageNum === page ? 'active' : ''}`}
                disabled={pageNum === page}
                onClick={() => setPage(pageNum)}
              >
                {pageNum}
              </button>
            ))
          ) : (
            <>
              {page > 3 && (
                <>
                  <button className="ghost-btn" onClick={() => setPage(1)}>1</button>
                  {page > 4 && <span>...</span>}
                </>
              )}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                return start + i;
              }).filter((p) => p >= 1 && p <= totalPages).map((pageNum) => (
                <button
                  key={pageNum}
                  className={`ghost-btn ${pageNum === page ? 'active' : ''}`}
                  disabled={pageNum === page}
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </button>
              ))}
              {page < totalPages - 2 && (
                <>
                  {page < totalPages - 3 && <span>...</span>}
                  <button className="ghost-btn" onClick={() => setPage(totalPages)}>{totalPages}</button>
                </>
              )}
            </>
          )}
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
        <div className="modal-overlay">
          <div className="modal-content modal-large" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingProductId ? 'Sửa hàng hóa' : 'Thêm hàng hóa'}</h3>
              <button className="icon-close" onClick={closeProductModal}>
                x
              </button>
            </div>

            <form className="product-form" onSubmit={onSaveProduct} onPaste={onPasteImage}>
              <div className="form-grid">
                <div className="form-field">
                  <span>Hình ảnh</span>
                  <div className="image-upload-row">
                    <div className="image-preview-box">
                      {pendingPreviewUrl || productForm.imageUrl ? (
                        <>
                          <img
                            src={pendingPreviewUrl || resolveImageUrl(productForm.imageUrl)}
                            alt="product preview"
                          />
                          <button
                            type="button"
                            className="danger-btn icon-action-btn image-remove-btn"
                            title="Xóa ảnh"
                            aria-label="Xóa ảnh"
                            onClick={onRemoveImage}
                          >
                            <DeleteActionIcon />
                          </button>
                        </>
                      ) : (
                        <span>Chưa có ảnh</span>
                      )}
                    </div>
                    <div className="image-upload-actions">
                      <input type="file" accept="image/*" onChange={onUploadImage} />
                      <div
                        className="paste-image-hint"
                        role="button"
                        tabIndex={0}
                        onPaste={onPasteImage}
                        onClick={(event) => {
                          event.currentTarget.focus();
                        }}
                      >
                        Nhấn vào đây rồi dán ảnh (Cmd/Ctrl + V)
                      </div>
                      <small>
                        {pendingImageFile
                          ? 'Ảnh đã chọn, sẽ upload/nén khi nhấn Lưu'
                          : 'Ảnh sẽ tự nén và resize khi nhấn Lưu'}
                      </small>
                    </div>
                  </div>
                </div>

                <label>
                  Loại hàng hóa
                  <select
                    value={productForm.type}
                    onChange={(event) =>
                      setProductForm((prev) => ({
                        ...prev,
                        type: event.target.value as 'SINGLE' | 'COMBO',
                        autoCost: event.target.value === 'COMBO' ? prev.autoCost : false,
                        autoPrice: event.target.value === 'COMBO' ? prev.autoPrice : false,
                      }))
                    }
                  >
                    <option value="SINGLE">Hàng hóa riêng lẻ</option>
                    <option value="COMBO">Combo</option>
                  </select>
                </label>

                <label>
                  Mã hàng hóa
                  <input
                    value={productForm.sku}
                    onChange={(event) => {
                      setProductForm({ ...productForm, sku: event.target.value.toUpperCase() });
                      if (productFieldErrors.sku) setProductFieldErrors((prev) => ({ ...prev, sku: undefined }));
                    }}
                    placeholder="Mã hàng tự động"
                    maxLength={50}
                    className={productFieldErrors.sku ? 'field-invalid' : ''}
                  />
                  <FormFieldError message={productFieldErrors.sku} />
                </label>

                <label>
                  Tên hàng *
                  <input
                    value={productForm.name}
                    onChange={(event) => {
                      setProductForm({ ...productForm, name: event.target.value });
                      if (productFieldErrors.name) setProductFieldErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    required
                    maxLength={255}
                    className={productFieldErrors.name ? 'field-invalid' : ''}
                  />
                  <FormFieldError message={productFieldErrors.name} />
                </label>

                <label>
                  Nhóm hàng
                  <select
                    value={productForm.categoryId}
                    onFocus={() => {
                      loadCategories().catch(() => pushToast('error', 'Không tải được nhóm hàng hóa'));
                    }}
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
                    onChange={(event) => {
                      setProductForm({ ...productForm, unit: event.target.value });
                      if (productFieldErrors.unit) setProductFieldErrors((prev) => ({ ...prev, unit: undefined }));
                    }}
                    placeholder="Ví dụ: lon, chai, hộp"
                    maxLength={30}
                    className={productFieldErrors.unit ? 'field-invalid' : ''}
                  />
                  <FormFieldError message={productFieldErrors.unit} />
                </label>

                <label>
                  Giá vốn
                  <div className="price-row">
                    <div className="price-input-wrap">
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
                        disabled={productForm.type === 'COMBO' && productForm.autoCost}
                      />
                    </div>
                    {productForm.type === 'COMBO' && (
                      <div className="inline-checkbox">
                        <input
                          type="checkbox"
                          checked={productForm.autoCost}
                          onChange={(event) => setProductForm((prev) => ({ ...prev, autoCost: event.target.checked }))}
                        />
                        <span>Tự động tính giá vốn</span>
                      </div>
                    )}
                  </div>
                </label>

                <label>
                  Giá bán *
                  <div className="price-row">
                    <div className="price-input-wrap">
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
                        onChange={(event) => {
                          setProductForm({ ...productForm, price: formatMoneyInput(event.target.value) });
                          if (productFieldErrors.price) setProductFieldErrors((prev) => ({ ...prev, price: undefined }));
                        }}
                        required
                        disabled={productForm.type === 'COMBO' && productForm.autoPrice}
                        className={productFieldErrors.price ? 'field-invalid' : ''}
                      />
                    </div>
                    {productForm.type === 'COMBO' && (
                      <div className="inline-checkbox">
                        <input
                          type="checkbox"
                          checked={productForm.autoPrice}
                          onChange={(event) => setProductForm((prev) => ({ ...prev, autoPrice: event.target.checked }))}
                        />
                        <span>Tự động tính giá bán</span>
                      </div>
                    )}
                  </div>
                  <FormFieldError message={productFieldErrors.price} />
                </label>
              </div>

              {productForm.type === 'COMBO' && (
                <>
                  <div className="branch-section">
                  <div className="branch-section-header">
                    <span>Hàng hóa thành phần</span>
                    <span>Số lượng</span>
                    <span>Thao tác</span>
                  </div>
                  {comboItems.map((item, idx) => (
                    <div key={`combo-row-${idx}`} className="branch-row combo-row">
                      <div className="combo-select-wrap">
                        <input
                          className={`combo-select ${productFieldErrors.comboItems ? 'field-invalid' : ''}`}
                          value={comboSearchTerms[idx] || ''}
                          onFocus={() => setActiveComboDropdown(idx)}
                          onBlur={() => {
                            setTimeout(() => {
                              setActiveComboDropdown((prev) => (prev === idx ? null : prev));
                            }, 120);
                          }}
                          onChange={(event) => {
                            if (productFieldErrors.comboItems) {
                              setProductFieldErrors((prev) => ({ ...prev, comboItems: undefined }));
                            }
                            const nextValue = event.target.value;
                            const selectedProduct = comboCatalog
                              .filter((entry) => entry.id !== editingProductId)
                              .find((entry) => formatComboProductLabel(entry).toLowerCase() === nextValue.trim().toLowerCase());

                            setComboSearchTerms((prev) =>
                              comboItems.map((_, entryIdx) => (entryIdx === idx ? nextValue : prev[entryIdx] || '')),
                            );
                            setComboItems((prev) =>
                              prev.map((entry, entryIdx) =>
                                entryIdx === idx
                                  ? { ...entry, itemProductId: selectedProduct?.id || '' }
                                  : entry,
                              ),
                            );
                            setActiveComboDropdown(idx);
                          }}
                          placeholder="Gõ để tìm hàng hóa"
                        />

                        {activeComboDropdown === idx && (
                          <div className="combo-dropdown">
                            {comboCatalog
                              .filter((entry) => entry.id !== editingProductId)
                              .filter((entry) =>
                                formatComboProductLabel(entry).toLowerCase().includes((comboSearchTerms[idx] || '').trim().toLowerCase()),
                              )
                              .map((entry) => {
                                const label = formatComboProductLabel(entry);
                                return (
                                  <button
                                    key={entry.id}
                                    type="button"
                                    className="combo-dropdown-item"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      if (productFieldErrors.comboItems) {
                                        setProductFieldErrors((prev) => ({ ...prev, comboItems: undefined }));
                                      }
                                      setComboSearchTerms((prev) =>
                                        comboItems.map((_, entryIdx) => (entryIdx === idx ? label : prev[entryIdx] || '')),
                                      );
                                      setComboItems((prev) =>
                                        prev.map((row, rowIdx) =>
                                          rowIdx === idx ? { ...row, itemProductId: entry.id } : row,
                                        ),
                                      );
                                      setActiveComboDropdown(null);
                                    }}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                          </div>
                        )}
                      </div>
                      <input
                        className="combo-qty-input"
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) =>
                          setComboItems((prev) =>
                            prev.map((entry, entryIdx) =>
                              entryIdx === idx
                                ? { ...entry, quantity: Math.max(1, Number(event.target.value) || 1) }
                                : entry,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="danger-btn icon-action-btn combo-remove-btn"
                        onClick={() => {
                          setComboItems((prev) => prev.filter((_, entryIdx) => entryIdx !== idx));
                          setComboSearchTerms((prev) => prev.filter((_, entryIdx) => entryIdx !== idx));
                          if (productFieldErrors.comboItems) {
                            setProductFieldErrors((prev) => ({ ...prev, comboItems: undefined }));
                          }
                          setActiveComboDropdown((prev) => {
                            if (prev == null) return null;
                            if (prev === idx) return null;
                            return prev > idx ? prev - 1 : prev;
                          });
                        }}
                      >
                        <DeleteActionIcon />
                      </button>
                    </div>
                  ))}
                  <div className="modal-actions combo-toolbar">
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        setComboItems((prev) => [...prev, { itemProductId: '', quantity: 1 }]);
                        setComboSearchTerms((prev) => [...prev, '']);
                        if (productFieldErrors.comboItems) {
                          setProductFieldErrors((prev) => ({ ...prev, comboItems: undefined }));
                        }
                      }}
                    >
                      + Thêm thành phần
                    </button>
                  </div>
                  </div>
                  <FormFieldError message={productFieldErrors.comboItems} />
                </>
              )}

              <div className="modal-tip">
                Hàng hóa sẽ gán theo chi nhánh đang chọn ({branches.find((b) => b.id === getPreferredBranchId())?.name ||
                  'chi nhánh mặc định'}).
              </div>

              {error && <div className="products-error">{error}</div>}

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
        <div className="modal-overlay">
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
                            className="ghost-btn icon-action-btn"
                            title="Sửa"
                            aria-label="Sửa"
                            onClick={() => {
                              setEditingCategoryId(category.id);
                              setEditingCategoryName(category.name);
                            }}
                          >
                            <EditActionIcon />
                          </button>
                          <button
                            className="danger-btn icon-action-btn"
                            title="Xóa"
                            aria-label="Xóa"
                            onClick={() => onDeleteCategory(category.id)}
                          >
                            <DeleteActionIcon />
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

      {isComboDetailOpen && (
        <div className="modal-overlay">
          <div className="modal-content modal-large combo-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Thành phần combo: {comboDetailTitle}</h3>
              <button className="icon-close" onClick={() => setIsComboDetailOpen(false)}>
                x
              </button>
            </div>
            {isComboDetailLoading ? (
              <div className="modal-tip">Đang tải thành phần combo...</div>
            ) : comboDetailItems.length === 0 ? (
              <div className="modal-tip">Combo chưa có hàng hóa thành phần</div>
            ) : (
              <div className="combo-detail-table-wrap">
                <table className="products-table combo-detail-table">
                  <thead>
                    <tr>
                      <th className="center-col">STT</th>
                      <th>Tên hàng</th>
                      <th>Hình ảnh</th>
                      <th className="num-col">Số lượng</th>
                      <th>Đơn vị tính</th>
                      <th>Nhóm hàng</th>
                      <th className="num-col">Giá vốn</th>
                      <th className="num-col">Giá bán</th>
                      <th className="num-col">Tồn kho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comboDetailPagedRows.map((item, idx) => (
                      <tr key={`${item.id}-${idx}`}>
                        <td className="center-col">{(comboDetailPage - 1) * comboDetailPageSize + idx + 1}</td>
                        <td>{item.name || '-'}</td>
                        <td>
                          <div className="product-thumb">
                            {item.imageThumb || item.imageUrl ? (
                              <img src={resolveImageUrl(item.imageThumb || item.imageUrl)} alt={item.name || 'item'} />
                            ) : (
                              <span>--</span>
                            )}
                          </div>
                        </td>
                        <td className="num-col">{item.quantity}</td>
                        <td>{item.unit || '-'}</td>
                        <td>{item.categoryName || '-'}</td>
                        <td className="num-col">{Math.trunc(Number(item.costPrice || 0)).toLocaleString('vi-VN')}</td>
                        <td className="num-col">{Math.trunc(Number(item.price || 0)).toLocaleString('vi-VN')}</td>
                        <td className="num-col">{Number(item.stock || 0).toLocaleString('vi-VN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!isComboDetailLoading && comboDetailRows.length > 0 && (
              <div className="pagination-bar combo-detail-pagination">
                <span>
                  Trang {comboDetailPage}/{comboDetailTotalPages} - {comboDetailRows.length} sản phẩm
                </span>
                <div className="pagination-actions">
                  <button
                    className="ghost-btn"
                    disabled={comboDetailPage <= 1}
                    onClick={() => setComboDetailPage((p) => Math.max(1, p - 1))}
                  >
                    Trước
                  </button>
                  {comboDetailTotalPages <= 7 ? (
                    Array.from({ length: comboDetailTotalPages }, (_, i) => i + 1).map((pageNum) => (
                      <button
                        key={pageNum}
                        className={`ghost-btn ${pageNum === comboDetailPage ? 'active' : ''}`}
                        disabled={pageNum === comboDetailPage}
                        onClick={() => setComboDetailPage(pageNum)}
                      >
                        {pageNum}
                      </button>
                    ))
                  ) : (
                    <>
                      {comboDetailPage > 3 && (
                        <>
                          <button className="ghost-btn" onClick={() => setComboDetailPage(1)}>1</button>
                          {comboDetailPage > 4 && <span>...</span>}
                        </>
                      )}
                      {Array.from({ length: Math.min(5, comboDetailTotalPages) }, (_, i) => {
                        const start = Math.max(1, Math.min(comboDetailPage - 2, comboDetailTotalPages - 4));
                        return start + i;
                      }).filter((p) => p >= 1 && p <= comboDetailTotalPages).map((pageNum) => (
                        <button
                          key={pageNum}
                          className={`ghost-btn ${pageNum === comboDetailPage ? 'active' : ''}`}
                          disabled={pageNum === comboDetailPage}
                          onClick={() => setComboDetailPage(pageNum)}
                        >
                          {pageNum}
                        </button>
                      ))}
                      {comboDetailPage < comboDetailTotalPages - 2 && (
                        <>
                          {comboDetailPage < comboDetailTotalPages - 3 && <span>...</span>}
                          <button className="ghost-btn" onClick={() => setComboDetailPage(comboDetailTotalPages)}>
                            {comboDetailTotalPages}
                          </button>
                        </>
                      )}
                    </>
                  )}
                  <button
                    className="ghost-btn"
                    disabled={comboDetailPage >= comboDetailTotalPages}
                    onClick={() => setComboDetailPage((p) => Math.min(comboDetailTotalPages, p + 1))}
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
