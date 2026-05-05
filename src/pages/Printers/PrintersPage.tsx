import { useEffect, useMemo, useState } from 'react';
import { PrintActionIcon } from '../../components/ActionIcons';
import { printUsingConfiguredRoute } from '../../utils/printerRouting';
import { buildReceipt80mmBitmapDataUrl, DEFAULT_RECEIPT_80MM_DATA } from '../../utils/receipt80mmGenerator';
import './PrintersPage.css';

type PrinterRole = 'default' | 'backup' | null;
type TemplateKey = 'receipt_80mm' | 'invoice_a4' | 'order_slip_80mm' | 'order_slip_a4';
type ConnectionMode = 'bridge' | 'usb';

type PrinterRow = {
  id: string;
  label: string;
  vendorId?: number;
  productId?: number;
};

type BridgePrinterMapping = {
  type?: string;
  name?: string;
};

type BridgeSystemPrinter = {
  name?: string;
  description?: string;
};

type TemplateRow = {
  key: TemplateKey;
  name: string;
  content: string;
};

type TemplateTabKey = 'invoice' | 'order';
type InvoiceTemplateKey = 'receipt_80mm' | 'invoice_a4';
type OrderTemplateKey = 'order_slip_80mm' | 'order_slip_a4';

type UsbDeviceLike = {
  serialNumber?: string;
  productName?: string;
  vendorId?: number;
  productId?: number;
};

type UsbNavigatorLike = Navigator & {
  usb?: {
    getDevices: () => Promise<UsbDeviceLike[]>;
    requestDevice: (options: { filters: Array<Record<string, unknown>> }) => Promise<UsbDeviceLike>;
  };
};


const STORAGE_KEY = 'pos_printer_settings_v1';

const ORDER_SLIP_A4_SAMPLE = `PHIẾU ORDER

Mã đơn: HD-20260504-001
Thời gian: 04/05/2026, 14:30
Vị trí: Tầng 1 / Bàn 3

Danh sách món:
1. Gà rán *cay nồng đặc biệt
   SL: 1
2. Bia Budweiser
   SL: 3
3. Khoai tây chiên
   SL: 2

Vui lòng kiểm tra kỹ trước khi chế biến.`;

const RECEIPT_SAMPLE_80MM = `Mẫu 80mm hiện được render bằng bitmap code-driven.

Nguồn template:
- src/utils/receipt80mmGenerator.tsx
- Hàm: buildReceipt80mmEscPosBytes(...)

In thử và in thật đều dùng cùng renderer này.
Nội dung thô trong màn hình này chỉ để tham khảo.`;

const TEMPLATE_A4_SAMPLE = `HÓA ĐƠN GIÁ TRỊ GIA TĂNG

Đơn vị bán hàng: NHÀ HÀNG ABC
Địa chỉ: 123 Đường Láng, Đống Đa, Hà Nội
MST: 0101234567

Thông tin khách hàng:
- Tên khách: ................................
- Địa chỉ: ...................................
- MST: .......................................

Danh sách món:
1) Bánh flan (ít ngọt) - SL: 1 - ĐG: 15.000 - TT: 15.000
2) Gà rán (6 cái) - SL: 3 - ĐG: 55.000 - Giảm: 15.000 - TT: 165.000
3) Khoai tây chiên - SL: 2 - ĐG: 25.000 - TT: 50.000
4) Bắp xào - SL: 1 - ĐG: 20.000 - TT: 20.000

Cộng tiền hàng: 265.000
Giảm giá: 15.000
Tổng thanh toán: 250.000`;

const initialTemplates: TemplateRow[] = [
  { key: 'receipt_80mm', name: 'Hoá đơn 80mm', content: RECEIPT_SAMPLE_80MM },
  { key: 'invoice_a4', name: 'Hoá đơn A4', content: TEMPLATE_A4_SAMPLE },
  { key: 'order_slip_80mm', name: 'Phiếu order 80mm', content: RECEIPT_SAMPLE_80MM },
  { key: 'order_slip_a4', name: 'Phiếu order A4', content: ORDER_SLIP_A4_SAMPLE },
];

const getTemplateTabKey = (templateKey: TemplateKey): TemplateTabKey => (
  templateKey === 'order_slip_80mm' || templateKey === 'order_slip_a4' ? 'order' : 'invoice'
);

const getLegacyInvoiceDefaultTemplateKey = (templateKey?: TemplateKey): InvoiceTemplateKey => (
  templateKey === 'invoice_a4' || templateKey === 'order_slip_a4' ? 'invoice_a4' : 'receipt_80mm'
);

const getLegacyOrderDefaultTemplateKey = (templateKey?: TemplateKey): OrderTemplateKey => (
  templateKey === 'invoice_a4' || templateKey === 'order_slip_a4' ? 'order_slip_a4' : 'order_slip_80mm'
);

const formatPrinterLabel = (device: UsbDeviceLike) => {
  if (device.productName?.trim()) return device.productName;
  const vendor = device.vendorId ? device.vendorId.toString(16).toUpperCase().padStart(4, '0') : '----';
  const product = device.productId ? device.productId.toString(16).toUpperCase().padStart(4, '0') : '----';
      return `Máy in USB ${vendor}:${product}`;
};

const getDeviceKey = (device: UsbDeviceLike) => {
  if (device.serialNumber?.trim()) return device.serialNumber;
  return `${device.vendorId ?? 'na'}-${device.productId ?? 'na'}-${device.productName ?? 'unknown'}`;
};

const canUseWebUsb = () => typeof navigator !== 'undefined' && 'usb' in navigator;


export default function PrintersPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [defaultPrinterId, setDefaultPrinterId] = useState('');
  const [backupPrinterId, setBackupPrinterId] = useState('');
  const [invoiceDefaultTemplateKey, setInvoiceDefaultTemplateKey] = useState<InvoiceTemplateKey>('receipt_80mm');
  const [orderDefaultTemplateKey, setOrderDefaultTemplateKey] = useState<OrderTemplateKey>('order_slip_80mm');
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('bridge');
  const [bridgeEnabled, setBridgeEnabled] = useState(true);
  const [bridgeUrl, setBridgeUrl] = useState('ws://127.0.0.1:12212/printer');
  const [receiptType, setReceiptType] = useState('HD80');
  const [invoiceType, setInvoiceType] = useState('HDA4');
  const [orderA4Type, setOrderA4Type] = useState('ODA4');
  const [order80mmType, setOrder80mmType] = useState('OD80');
  const [bridgeStatus, setBridgeStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [bridgeStatusText, setBridgeStatusText] = useState('Chua kiem tra ket noi Bridge');
  const [bridgePrinters, setBridgePrinters] = useState<BridgeSystemPrinter[]>([]);
  const [bridgeMappings, setBridgeMappings] = useState<BridgePrinterMapping[]>([]);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTemplateKey, setPreviewTemplateKey] = useState<TemplateKey>('receipt_80mm');
  const [activeTemplateTab, setActiveTemplateTab] = useState<TemplateTabKey>('invoice');
  const usbNavigator = navigator as UsbNavigatorLike;

  const hasWebUsb = useMemo(() => canUseWebUsb(), []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as {
        defaultPrinterId?: string;
        backupPrinterId?: string;
        defaultTemplateKey?: TemplateKey;
        invoiceDefaultTemplateKey?: InvoiceTemplateKey;
        orderDefaultTemplateKey?: OrderTemplateKey;
        connectionMode?: ConnectionMode;
        bridgeEnabled?: boolean;
        bridgeUrl?: string;
        receiptType?: string;
        invoiceType?: string;
        orderA4Type?: string;
        order80mmType?: string;
      };
      if (parsed.defaultPrinterId) setDefaultPrinterId(parsed.defaultPrinterId);
      if (parsed.backupPrinterId) setBackupPrinterId(parsed.backupPrinterId);
      const nextInvoiceDefaultTemplateKey = parsed.invoiceDefaultTemplateKey || getLegacyInvoiceDefaultTemplateKey(parsed.defaultTemplateKey);
      const nextOrderDefaultTemplateKey = parsed.orderDefaultTemplateKey || getLegacyOrderDefaultTemplateKey(parsed.defaultTemplateKey);
      setInvoiceDefaultTemplateKey(nextInvoiceDefaultTemplateKey);
      setOrderDefaultTemplateKey(nextOrderDefaultTemplateKey);
      if (parsed.defaultTemplateKey) setActiveTemplateTab(getTemplateTabKey(parsed.defaultTemplateKey));
      if (parsed.connectionMode === 'bridge' || parsed.connectionMode === 'usb') setConnectionMode(parsed.connectionMode);
      if (typeof parsed.bridgeEnabled === 'boolean') setBridgeEnabled(parsed.bridgeEnabled);
      if (typeof parsed.bridgeUrl === 'string' && parsed.bridgeUrl.trim()) setBridgeUrl(parsed.bridgeUrl);
      if (typeof parsed.receiptType === 'string' && parsed.receiptType.trim()) setReceiptType(parsed.receiptType);
      if (typeof parsed.invoiceType === 'string' && parsed.invoiceType.trim()) setInvoiceType(parsed.invoiceType);
      if (typeof parsed.orderA4Type === 'string' && parsed.orderA4Type.trim()) setOrderA4Type(parsed.orderA4Type);
      if (typeof parsed.order80mmType === 'string' && parsed.order80mmType.trim()) setOrder80mmType(parsed.order80mmType);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        defaultPrinterId,
        backupPrinterId,
        invoiceDefaultTemplateKey,
        orderDefaultTemplateKey,
        connectionMode,
        bridgeEnabled,
        bridgeUrl,
        receiptType,
        invoiceType,
        orderA4Type,
        order80mmType,
      }),
    );
  }, [backupPrinterId, bridgeEnabled, bridgeUrl, connectionMode, defaultPrinterId, invoiceDefaultTemplateKey, invoiceType, orderDefaultTemplateKey, orderA4Type, order80mmType, receiptType]);

  useEffect(() => {
    if (!defaultPrinterId || !backupPrinterId) return;
    if (defaultPrinterId === backupPrinterId) {
      setBackupPrinterId('');
    }
  }, [defaultPrinterId, backupPrinterId]);

  const loadWebUsbPrinters = async () => {
    if (!hasWebUsb) return;
    setIsLoading(true);
    setError('');
    try {
      const devices = await usbNavigator.usb?.getDevices();
      if (!devices) {
        setPrinters([]);
        return;
      }
      const rows: PrinterRow[] = devices.map((device) => ({
        id: getDeviceKey(device),
        label: formatPrinterLabel(device),
        vendorId: device.vendorId,
        productId: device.productId,
      }));
      setPrinters(rows);
    } catch {
      setError('Không đọc được danh sách máy in từ WebUSB');
    } finally {
      setIsLoading(false);
    }
  };

  const deriveBridgeHttpBaseUrl = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return 'http://127.0.0.1:12212';
    if (trimmed.startsWith('ws://')) return `http://${trimmed.slice(5).replace(/\/printer\/?$/, '')}`;
    if (trimmed.startsWith('wss://')) return `https://${trimmed.slice(6).replace(/\/printer\/?$/, '')}`;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed.replace(/\/printer\/?$/, '');
    return 'http://127.0.0.1:12212';
  };

  const testBridgeConnection = async () => {
    if (!bridgeEnabled) {
      setBridgeStatus('idle');
      setBridgeStatusText('Bridge dang tat. Bam Enable Bridge de bat ket noi.');
      setBridgePrinters([]);
      setBridgeMappings([]);
      return;
    }
    const baseUrl = deriveBridgeHttpBaseUrl(bridgeUrl);
    setBridgeStatus('checking');
    setBridgeStatusText('Dang kiem tra ket noi Bridge...');
    try {
      const [printersRes, configRes] = await Promise.all([
        fetch(`${baseUrl}/system/printers.json`, { method: 'GET' }),
        fetch(`${baseUrl}/config.json`, { method: 'GET' }),
      ]);
      if (!printersRes.ok) throw new Error(`HTTP ${printersRes.status}`);
      if (!configRes.ok) throw new Error(`HTTP ${configRes.status}`);
      const printerData = await printersRes.json();
      const configData = await configRes.json();
      const rows = Array.isArray(printerData) ? (printerData as BridgeSystemPrinter[]) : [];
      const mappings = Array.isArray(configData?.printer?.mappings)
        ? (configData.printer.mappings as BridgePrinterMapping[])
        : [];
      setBridgePrinters(rows);
      setBridgeMappings(mappings);
      setBridgeStatus('connected');
      setBridgeStatusText(`Da ket noi Bridge. Tim thay ${rows.length} printer tren he dieu hanh.`);
    } catch (connectionError: any) {
      setBridgePrinters([]);
      setBridgeMappings([]);
      setBridgeStatus('error');
      setBridgeStatusText(`Khong ket noi duoc Bridge (${connectionError?.message || 'Unknown error'})`);
    }
  };

  useEffect(() => {
    loadWebUsbPrinters().catch(() => {
      setError('Không đọc được danh sách máy in từ WebUSB');
    });
  }, [hasWebUsb]);

  useEffect(() => {
    if (connectionMode !== 'bridge') return;
    testBridgeConnection().catch(() => undefined);
  }, [connectionMode]);

  useEffect(() => {
    if (bridgeEnabled) return;
    setBridgeStatus('idle');
    setBridgeStatusText('Bridge dang tat. Bam Enable Bridge de bat ket noi.');
    setBridgePrinters([]);
    setBridgeMappings([]);
  }, [bridgeEnabled]);

  const requestPrinter = async () => {
    if (!hasWebUsb) return;
    setError('');
    try {
      if (!usbNavigator.usb) return;
      await usbNavigator.usb.requestDevice({ filters: [] });
      await loadWebUsbPrinters();
    } catch {
      setError('Bạn đã hủy kết nối máy in hoặc trình duyệt chặn quyền truy cập USB');
    }
  };

  const onSelectDefaultPrinter = (printerId: string) => {
    setDefaultPrinterId(printerId);
    setBackupPrinterId((prev) => (prev === printerId ? '' : prev));
  };

  const onSelectBackupPrinter = (printerId: string) => {
    setBackupPrinterId(printerId);
    setDefaultPrinterId((prev) => (prev === printerId ? '' : prev));
  };

  const renderPrinterRole = (printerId: string): PrinterRole => {
    if (defaultPrinterId === printerId) return 'default';
    if (backupPrinterId === printerId) return 'backup';
    return null;
  };

  const bridgePrinterRows = useMemo(() => {
    const codesByPrinter = new Map<string, string[]>();
    bridgeMappings.forEach((mapping) => {
      const printerName = mapping.name?.trim();
      if (!printerName) return;
      const code = mapping.type?.trim();
      if (!codesByPrinter.has(printerName)) {
        codesByPrinter.set(printerName, []);
      }
      if (code) {
        const rows = codesByPrinter.get(printerName) as string[];
        if (!rows.includes(code)) rows.push(code);
      }
    });

    return bridgePrinters.map((printer) => {
      const printerName = printer.name?.trim() || 'Unknown printer';
      const codes = codesByPrinter.get(printerName) || [];
      return {
        name: printerName,
        codeLabel: codes.length > 0 ? codes.join(', ') : 'Chưa có mã',
      };
    });
  }, [bridgeMappings, bridgePrinters]);

  const bridgeTypeOptions = useMemo(() => {
    const mappedTypes = bridgeMappings
      .map((item) => item.type?.trim())
      .filter((item): item is string => Boolean(item));
    const baseTypes = ['VIRTUAL', 'HDA4', 'HD80', 'ODA4', 'OD80'];
    return Array.from(new Set([...baseTypes, ...mappedTypes]));
  }, [bridgeMappings]);

  const activeUsbPrinters = useMemo(() => {
    return printers.filter((printer) => printer.id === defaultPrinterId || printer.id === backupPrinterId);
  }, [backupPrinterId, defaultPrinterId, printers]);

  const activeDefaultTemplateKey = activeTemplateTab === 'invoice' ? invoiceDefaultTemplateKey : orderDefaultTemplateKey;

  const templatesByTab = useMemo(() => ({
    invoice: initialTemplates.filter((template) => template.key === 'receipt_80mm' || template.key === 'invoice_a4'),
    order: initialTemplates.filter((template) => template.key === 'order_slip_80mm' || template.key === 'order_slip_a4'),
  }), []);

  const onTestPrint = async () => {
    setPreviewTemplateKey(activeDefaultTemplateKey);
    setError('');
    setIsPreviewOpen(true);
  };

  const onPrintFromPreview = async () => {
    const selectedTemplate = initialTemplates.find((item) => item.key === previewTemplateKey) || initialTemplates[0];
    if (!selectedTemplate) return;

    const receipt80mmData =
      selectedTemplate.key === 'order_slip_80mm'
        ? { ...DEFAULT_RECEIPT_80MM_DATA, title: 'PHIẾU ORDER' }
        : selectedTemplate.key === 'receipt_80mm'
          ? DEFAULT_RECEIPT_80MM_DATA
          : undefined;

    try {
      await printUsingConfiguredRoute(selectedTemplate.name, selectedTemplate.content, {
        templateKey: selectedTemplate.key,
        ...(receipt80mmData ? { receipt80mmData } : {}),
      });
      setError('');
      setIsPreviewOpen(false);
    } catch (printError: any) {
      setError(`In thử thất bại: ${printError?.message || 'Lỗi không xác định'}`);
    }
  };

  const previewTemplate = initialTemplates.find((item) => item.key === previewTemplateKey) || initialTemplates[0];
  const receiptPreviewImage = useMemo(() => {
    if (previewTemplate?.key === 'receipt_80mm') return buildReceipt80mmBitmapDataUrl(DEFAULT_RECEIPT_80MM_DATA);
    if (previewTemplate?.key === 'order_slip_80mm') return buildReceipt80mmBitmapDataUrl({ ...DEFAULT_RECEIPT_80MM_DATA, title: 'PHIẾU ORDER' });
    return '';
  }, [previewTemplate?.key]);

  return (
    <section className="printers-page">
      <div className="printers-toolbar">
        <h2>Thiết lập máy in</h2>
        <div className="printers-toolbar-actions">
          <button className="ghost-btn printers-test-print-btn" onClick={() => onTestPrint().catch(() => undefined)}>
            <PrintActionIcon />
            In thử
          </button>
          {connectionMode === 'usb' && (
            <>
              <button className="ghost-btn" onClick={loadWebUsbPrinters} disabled={!hasWebUsb || isLoading}>
                {isLoading ? 'Đang quét...' : 'Tải lại danh sách USB'}
              </button>
              <button className="primary-btn" onClick={requestPrinter} disabled={!hasWebUsb}>
                Kết nối máy in USB
              </button>
            </>
          )}
        </div>
      </div>

      <div className="printers-method-section">
        <div className="printers-method-header">
          <strong>Phương thức in</strong>
          <span className="printers-method-hint">Chọn 1 phương thức để toàn hệ thống dùng khi in hóa đơn / phiếu order</span>
        </div>
        <div className="printers-method-pills" role="radiogroup" aria-label="Phương thức in">
          <button
            type="button"
            role="radio"
            aria-checked={connectionMode === 'bridge'}
            className={`printers-method-pill${connectionMode === 'bridge' ? ' is-active' : ''}`}
            onClick={() => setConnectionMode('bridge')}
          >
            <span className="printers-method-pill-title">In qua WebApp Hardware Bridge</span>
            <span className="printers-method-pill-desc">Gửi lệnh in qua app cầu nối chạy nền trên máy. Hỗ trợ in cả 80mm và A4 qua máy in đã cấu hình trong Bridge.</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={connectionMode === 'usb'}
            className={`printers-method-pill${connectionMode === 'usb' ? ' is-active' : ''}`}
            onClick={() => setConnectionMode('usb')}
          >
            <span className="printers-method-pill-title">In trực tiếp qua USB (WebUSB)</span>
            <span className="printers-method-pill-desc">Trình duyệt nói chuyện trực tiếp với máy in 80mm. Mẫu A4 sẽ mở hộp thoại in của trình duyệt để bạn chọn máy in.</span>
          </button>
        </div>
      </div>

      {connectionMode === 'usb' && !hasWebUsb && (
        <p className="printer-warning">
          Trình duyệt này không hỗ trợ WebUSB. Vui lòng dùng Chrome/Edge trên desktop để kết nối máy in.
        </p>
      )}
      {error && <p className="printer-warning">{error}</p>}

      {isPreviewOpen && (
        <div className="modal-overlay" onClick={() => setIsPreviewOpen(false)}>
          <div className="modal-content printers-preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Xem trước mẫu in</h3>
              <button className="icon-close" onClick={() => setIsPreviewOpen(false)}>
                x
              </button>
            </div>

            <div className="printers-preview-controls">
              <label>
                Mẫu in
                <select
                  value={previewTemplateKey}
                  onChange={(event) => setPreviewTemplateKey(event.target.value as TemplateKey)}
                >
                  {initialTemplates.map((template) => (
                    <option key={template.key} value={template.key}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>

            </div>

            {(() => {
              const is80mm = previewTemplate?.key === 'receipt_80mm' || previewTemplate?.key === 'order_slip_80mm';
              return (
                <div className={`printers-preview-paper ${is80mm ? 'is-80mm' : 'is-a4'}`}>
                  {is80mm ? (
                    <img src={receiptPreviewImage} alt="80mm bitmap preview" style={{ width: '100%', display: 'block' }} />
                  ) : (
                    <pre>{previewTemplate?.content || ''}</pre>
                  )}
                </div>
              );
            })()}

            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setIsPreviewOpen(false)}>
                Đóng
              </button>
              <button type="button" className="primary-btn printers-test-print-btn" onClick={() => onPrintFromPreview().catch(() => undefined)}>
                <PrintActionIcon />
                In thử
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="printers-layout">
        <div className="printer-panel">
          <h3>Cau hinh WebApp Hardware Bridge</h3>
          <div className="template-list">
            <article className="template-card is-active">
              <div className="template-head">
                <strong>Bridge routing</strong>
                <button
                  type="button"
                  className={bridgeEnabled ? 'ghost-btn' : 'primary-btn'}
                  onClick={() => setBridgeEnabled((prev) => !prev)}
                >
                  {bridgeEnabled ? 'Disable Bridge' : 'Enable Bridge'}
                </button>
              </div>
              <label>
                WebSocket URL
                <input value={bridgeUrl} onChange={(event) => setBridgeUrl(event.target.value)} placeholder="ws://127.0.0.1:12212/printer" />
              </label>
              <label>
                Máy in cho Hoá đơn A4
                <select
                  value={invoiceType}
                  onChange={(event) => setInvoiceType(event.target.value)}
                >
                  {bridgeTypeOptions.map((typeOption) => (
                    <option key={typeOption} value={typeOption}>
                      {typeOption}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Máy in cho Hoá đơn 80mm
                <select
                  value={receiptType}
                  onChange={(event) => setReceiptType(event.target.value)}
                >
                  {bridgeTypeOptions.map((typeOption) => (
                    <option key={typeOption} value={typeOption}>
                      {typeOption}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Máy in cho Phiếu order A4
                <select
                  value={orderA4Type}
                  onChange={(event) => setOrderA4Type(event.target.value)}
                >
                  {bridgeTypeOptions.map((typeOption) => (
                    <option key={typeOption} value={typeOption}>
                      {typeOption}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Máy in cho Phiếu order 80mm
                <select
                  value={order80mmType}
                  onChange={(event) => setOrder80mmType(event.target.value)}
                >
                  {bridgeTypeOptions.map((typeOption) => (
                    <option key={typeOption} value={typeOption}>
                      {typeOption}
                    </option>
                  ))}
                </select>
              </label>
              <div className="bridge-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => testBridgeConnection().catch(() => undefined)}
                  disabled={!bridgeEnabled || bridgeStatus === 'checking'}
                >
                  {bridgeStatus === 'checking' ? 'Dang kiem tra...' : 'Kiem tra ket noi Bridge'}
                </button>
              </div>
              <p className={`bridge-status bridge-status-${bridgeStatus}`}>{bridgeStatusText}</p>
              {connectionMode === 'bridge' && (
                <p className="bridge-note">
                  Luu y: Bridge chi doc danh sach printer tu he dieu hanh. Danh sach nay khong dam bao trang thai bat/tat vat ly cua may in.
                </p>
              )}
            </article>
          </div>
        </div>

        <div className="printer-panel">
          <h3>Danh sách máy in ({connectionMode === 'bridge' ? 'Bridge' : 'WebUSB'})</h3>
          {connectionMode === 'usb' && (
            <div className="printers-preview-controls">
              <label>
                May in USB mac dinh
                <select value={defaultPrinterId} onChange={(event) => onSelectDefaultPrinter(event.target.value)}>
                  <option value="">-- Chon may in --</option>
                  {printers.map((printer) => (
                    <option key={printer.id} value={printer.id}>
                      {printer.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                May in USB thay the
                <select value={backupPrinterId} onChange={(event) => onSelectBackupPrinter(event.target.value)}>
                  <option value="">-- Khong dung --</option>
                  {printers.map((printer) => (
                    <option key={printer.id} value={printer.id}>
                      {printer.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {connectionMode === 'bridge' ? (
            bridgePrinterRows.length === 0 ? (
              <div className="empty-state">Chua tim thay may in he thong tu Bridge.</div>
            ) : (
              <div className="printer-list">
                {bridgePrinterRows.map((printer) => (
                  <article key={printer.name} className="printer-card is-active">
                    <div>
                      <strong>{printer.name}</strong>
                      <div className="printer-meta">Mã: {printer.codeLabel}</div>
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : activeUsbPrinters.length === 0 ? (
            <div className="empty-state">Khong co may in USB dang online va duoc gan mac dinh/thay the.</div>
          ) : (
            <div className="printer-list">
              {activeUsbPrinters.map((printer) => {
                const role = renderPrinterRole(printer.id);
                return (
                  <article key={printer.id} className={`printer-card ${role ? 'is-active' : ''}`}>
                    <div>
                      <strong>{printer.label}</strong>
                      <div className="printer-meta">
                        VID: {printer.vendorId ?? '--'} - PID: {printer.productId ?? '--'}
                      </div>
                    </div>
                    <div className="printer-toggle-group">
                      <label>
                        <input
                          type="radio"
                          name="default-printer"
                          checked={defaultPrinterId === printer.id}
                          onChange={() => onSelectDefaultPrinter(printer.id)}
                        />
                        Đặt in mặc định
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="backup-printer"
                          checked={backupPrinterId === printer.id}
                          onChange={() => onSelectBackupPrinter(printer.id)}
                        />
                        Đặt in thay thế
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="template-panel">
          <h3>Danh sách mẫu in</h3>
          <div className="template-tabs" role="tablist" aria-label="Nhóm mẫu in">
            <button
              type="button"
              role="tab"
              aria-selected={activeTemplateTab === 'invoice'}
              className={`template-tab ${activeTemplateTab === 'invoice' ? 'is-active' : ''}`}
              onClick={() => setActiveTemplateTab('invoice')}
            >
              In Hóa đơn
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTemplateTab === 'order'}
              className={`template-tab ${activeTemplateTab === 'order' ? 'is-active' : ''}`}
              onClick={() => setActiveTemplateTab('order')}
            >
              In Order
            </button>
          </div>
          <div className="template-list">
            {templatesByTab[activeTemplateTab].map((template) => (
              <article key={template.key} className={`template-card ${activeDefaultTemplateKey === template.key ? 'is-active' : ''}`}>
                <div className="template-head">
                  <strong>{template.name}</strong>
                  <label>
                    <input
                      type="checkbox"
                      checked={activeDefaultTemplateKey === template.key}
                      onChange={() => {
                        if (template.key === 'receipt_80mm' || template.key === 'invoice_a4') {
                          setInvoiceDefaultTemplateKey(template.key);
                        } else {
                          setOrderDefaultTemplateKey(template.key);
                        }
                        setActiveTemplateTab(getTemplateTabKey(template.key));
                      }}
                    />
                    Đặt in mặc định
                  </label>
                </div>
                {template.key === 'receipt_80mm' || template.key === 'order_slip_80mm' ? (
                  <img
                    src={buildReceipt80mmBitmapDataUrl(
                      template.key === 'order_slip_80mm'
                        ? { ...DEFAULT_RECEIPT_80MM_DATA, title: 'PHIẾU ORDER' }
                        : DEFAULT_RECEIPT_80MM_DATA,
                    )}
                    alt="80mm render preview"
                    style={{ width: '100%', display: 'block', background: '#fff' }}
                  />
                ) : (
                  <pre>{template.content}</pre>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
