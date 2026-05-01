import { useEffect, useMemo, useState } from 'react';
import { PrintActionIcon } from '../../components/ActionIcons';
import { printA4PlainText } from '../../utils/print';
import './PrintersPage.css';

type PrinterRole = 'default' | 'backup' | null;
type TemplateKey = 'receipt_80mm' | 'invoice_a4';

type PrinterRow = {
  id: string;
  label: string;
  vendorId?: number;
  productId?: number;
};

type TemplateRow = {
  key: TemplateKey;
  name: string;
  content: string;
};

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

type UsbEndpointLike = {
  endpointNumber: number;
  direction: 'in' | 'out';
  type?: 'bulk' | 'interrupt' | 'isochronous';
};

type UsbAlternateLike = {
  alternateSetting?: number;
  endpoints: UsbEndpointLike[];
};

type UsbInterfaceLike = {
  interfaceNumber: number;
  alternates: UsbAlternateLike[];
};

type UsbConfigurationLike = {
  configurationValue: number;
  interfaces: UsbInterfaceLike[];
};

type UsbWritableDeviceLike = UsbDeviceLike & {
  opened?: boolean;
  configuration?: UsbConfigurationLike;
  configurations?: UsbConfigurationLike[];
  open: () => Promise<void>;
  close: () => Promise<void>;
  selectConfiguration: (configurationValue: number) => Promise<void>;
  claimInterface: (interfaceNumber: number) => Promise<void>;
  selectAlternateInterface?: (interfaceNumber: number, alternateSetting: number) => Promise<void>;
  releaseInterface: (interfaceNumber: number) => Promise<void>;
  transferOut: (endpointNumber: number, data: BufferSource) => Promise<unknown>;
};

const STORAGE_KEY = 'pos_printer_settings_v1';

const RECEIPT_SAMPLE_80MM = `NHÀ HÀNG ABC
123 Đường Láng, Đống Đa, Hà Nội
ĐT: 024 3333 4444
--------------------------------
HÓA ĐƠN BÁN HÀNG
--------------------------------
Mã HĐ: HD26042910    Chưa trả hết
Thời gian: 23:16 29/04/2026
Vị trí: Tầng 1 / Phòng 2
--------------------------------
STT Tên món               SL T.Tiền
--------------------------------
1   Bánh flan (ít ngọt)    1 15.000
    15.000 x 1
2   Gà rán (6 cái)         3 165.000
    55.000 x 3, giảm 15.000
3   Khoai tây chiên        2 50.000
    25.000 x 2
4   Bắp xào                1 20.000
    20.000 x 1
--------------------------------
Tạm tính:                 265.000
Giảm giá:                 -15.000
Phụ phí:                       0
--------------------------------
PHẢI THANH TOÁN:         250.000đ
Khách thanh toán:              0đ
Còn lại:                 250.000đ
--------------------------------
Cảm ơn quý khách đã sử dụng dịch vụ!
Hẹn gặp lại ^^`;

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
  { key: 'receipt_80mm', name: 'Mẫu in giấy 80mm', content: RECEIPT_SAMPLE_80MM },
  { key: 'invoice_a4', name: 'Mẫu in giấy A4', content: TEMPLATE_A4_SAMPLE },
];

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

const buildCanvasFromTemplate = (content: string, templateKey: TemplateKey) => {
  const isReceipt = templateKey === 'receipt_80mm';
  const fontSize = isReceipt ? 22 : 24;
  const lineHeight = Math.round(fontSize * 1.45);
  const horizontalPadding = isReceipt ? 10 : 24;
  const lines = content.split('\n');
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const charsPerLine = isReceipt ? 32 : 48;

  const contentWidth = Math.max(320, Math.ceil((longestLine / charsPerLine) * 560));
  const width = Math.min(576, contentWidth + horizontalPadding * 2);
  const height = Math.max(160, lines.length * lineHeight + 24);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Không khởi tạo được canvas để tạo mẫu in');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';
  ctx.font = `${fontSize}px 'Courier New', monospace`;
  ctx.textBaseline = 'top';

  lines.forEach((line, index) => {
    ctx.fillText(line, horizontalPadding, 12 + index * lineHeight);
  });

  return canvas;
};

const buildEscPosRasterPayload = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Không đọc được dữ liệu canvas để in');
  }

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const width = image.width;
  const height = image.height;
  const bytesPerRow = Math.ceil(width / 8);
  const raster = new Uint8Array(bytesPerRow * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = image.data[index];
      const g = image.data[index + 1];
      const b = image.data[index + 2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      const isBlack = luminance < 160;
      if (isBlack) {
        const byteIndex = y * bytesPerRow + (x >> 3);
        raster[byteIndex] |= 0x80 >> (x & 7);
      }
    }
  }

  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;

  const init = new Uint8Array([0x1b, 0x40]);
  const alignLeft = new Uint8Array([0x1b, 0x61, 0x00]);
  const rasterHeader = new Uint8Array([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
  const feed = new Uint8Array([0x0a, 0x0a, 0x0a]);
  const cut = new Uint8Array([0x1d, 0x56, 0x42, 0x00]);

  const payload = new Uint8Array(init.length + alignLeft.length + rasterHeader.length + raster.length + feed.length + cut.length);
  let cursor = 0;
  payload.set(init, cursor);
  cursor += init.length;
  payload.set(alignLeft, cursor);
  cursor += alignLeft.length;
  payload.set(rasterHeader, cursor);
  cursor += rasterHeader.length;
  payload.set(raster, cursor);
  cursor += raster.length;
  payload.set(feed, cursor);
  cursor += feed.length;
  payload.set(cut, cursor);

  return payload;
};

export default function PrintersPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [printers, setPrinters] = useState<PrinterRow[]>([]);
  const [defaultPrinterId, setDefaultPrinterId] = useState('');
  const [backupPrinterId, setBackupPrinterId] = useState('');
  const [templates, setTemplates] = useState<TemplateRow[]>(initialTemplates);
  const [defaultTemplateKey, setDefaultTemplateKey] = useState<TemplateKey>('receipt_80mm');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTemplateKey, setPreviewTemplateKey] = useState<TemplateKey>('receipt_80mm');
  const [previewPrinterId, setPreviewPrinterId] = useState('');
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
        templates?: TemplateRow[];
      };
      if (parsed.defaultPrinterId) setDefaultPrinterId(parsed.defaultPrinterId);
      if (parsed.backupPrinterId) setBackupPrinterId(parsed.backupPrinterId);
      if (parsed.defaultTemplateKey) setDefaultTemplateKey(parsed.defaultTemplateKey);
      if (Array.isArray(parsed.templates) && parsed.templates.length > 0) {
        setTemplates(parsed.templates);
      }
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
        defaultTemplateKey,
        templates,
      }),
    );
  }, [backupPrinterId, defaultPrinterId, defaultTemplateKey, templates]);

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

  useEffect(() => {
    loadWebUsbPrinters().catch(() => {
      setError('Không đọc được danh sách máy in từ WebUSB');
    });
  }, [hasWebUsb]);

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

  const onChangeTemplate = (key: TemplateKey, nextContent: string) => {
    setTemplates((prev) => prev.map((item) => (item.key === key ? { ...item, content: nextContent } : item)));
  };

  const renderPrinterRole = (printerId: string): PrinterRole => {
    if (defaultPrinterId === printerId) return 'default';
    if (backupPrinterId === printerId) return 'backup';
    return null;
  };

  const sendEscPosPayloadToUsbPrinter = async (device: UsbWritableDeviceLike, payload: Uint8Array) => {
    const preferredConfig = device.configuration || device.configurations?.[0];
    if (!preferredConfig) {
      throw new Error('Không tìm thấy cấu hình USB hợp lệ cho máy in');
    }

    const targetInterface = preferredConfig.interfaces.find((iface) =>
      iface.alternates.some((alt) => alt.endpoints.some((ep) => ep.direction === 'out' && ep.type === 'bulk')),
    );
    const fallbackInterface = preferredConfig.interfaces.find((iface) =>
      iface.alternates.some((alt) => alt.endpoints.some((ep) => ep.direction === 'out')),
    );
    const selectedInterface = targetInterface || fallbackInterface;
    if (!selectedInterface) {
      throw new Error('Không tìm thấy cổng OUT để gửi lệnh in');
    }

    const selectedAlternate =
      selectedInterface.alternates.find((alt) => alt.endpoints.some((ep) => ep.direction === 'out' && ep.type === 'bulk')) ||
      selectedInterface.alternates.find((alt) => alt.endpoints.some((ep) => ep.direction === 'out'));
    if (!selectedAlternate) {
      throw new Error('Không tìm thấy alternate phù hợp để in');
    }

    const outEndpoint =
      selectedAlternate.endpoints.find((ep) => ep.direction === 'out' && ep.type === 'bulk') ||
      selectedAlternate.endpoints.find((ep) => ep.direction === 'out');
    if (!outEndpoint) {
      throw new Error('Không tìm thấy endpoint OUT để in');
    }

    let claimedInterfaceNumber: number | null = null;

    try {
      if (!device.opened) {
        await device.open();
      }
      if (!device.configuration) {
        await device.selectConfiguration(preferredConfig.configurationValue || 1);
      }
      await device.claimInterface(selectedInterface.interfaceNumber);
      claimedInterfaceNumber = selectedInterface.interfaceNumber;

      if (typeof device.selectAlternateInterface === 'function' && typeof selectedAlternate.alternateSetting === 'number') {
        await device.selectAlternateInterface(selectedInterface.interfaceNumber, selectedAlternate.alternateSetting);
      }

      const chunkSize = 512;
      for (let offset = 0; offset < payload.length; offset += chunkSize) {
        const chunk = payload.slice(offset, offset + chunkSize);
        await device.transferOut(outEndpoint.endpointNumber, chunk);
      }
    } finally {
      if (claimedInterfaceNumber !== null) {
        await device.releaseInterface(claimedInterfaceNumber).catch(() => undefined);
      }
      if (device.opened) {
        await device.close().catch(() => undefined);
      }
    }
  };

  const printViaUsbByPrinterId = async (printerId: string, templateKey: TemplateKey, content: string) => {
    const devices = await usbNavigator.usb?.getDevices();
    if (!devices) throw new Error('WebUSB chưa sẵn sàng');
    const device = devices.find((item) => getDeviceKey(item) === printerId) as UsbWritableDeviceLike | undefined;
    if (!device) throw new Error('Không tìm thấy máy in đã cấp quyền');
    const canvas = buildCanvasFromTemplate(content, templateKey);
    const payload = buildEscPosRasterPayload(canvas);
    await sendEscPosPayloadToUsbPrinter(device, payload);
  };

  const printWithFallback = async (
    primaryPrinterId: string,
    fallbackPrinterId: string | undefined,
    templateKey: TemplateKey,
    content: string,
  ) => {
    try {
      await printViaUsbByPrinterId(primaryPrinterId, templateKey, content);
      setError('');
      return;
    } catch (primaryError: any) {
      if (!fallbackPrinterId || fallbackPrinterId === primaryPrinterId) {
        throw new Error(primaryError?.message || 'Lỗi không xác định');
      }

      try {
        await printViaUsbByPrinterId(fallbackPrinterId, templateKey, content);
        setError('');
      } catch (fallbackError: any) {
        throw new Error(
          `Máy in chính lỗi: ${primaryError?.message || 'N/A'} | Máy in thay thế lỗi: ${fallbackError?.message || 'N/A'}`,
        );
      }
    }
  };

  const onTestPrint = async () => {
    setPreviewTemplateKey(defaultTemplateKey);
    setPreviewPrinterId(defaultPrinterId || printers[0]?.id || '');
    setIsPreviewOpen(true);
  };

  const onPrintFromPreview = async () => {
    const selectedTemplate = templates.find((item) => item.key === previewTemplateKey) || templates[0];
    if (!selectedTemplate) return;
    const isA4Template = selectedTemplate.key === 'invoice_a4';
    if (!isA4Template && !previewPrinterId) {
      setError('Vui lòng chọn máy in để in thử');
      return;
    }

    const fallbackPrinterId =
      previewPrinterId === defaultPrinterId
        ? backupPrinterId
        : previewPrinterId === backupPrinterId
          ? defaultPrinterId
          : '';

    try {
      if (isA4Template) {
        await printA4PlainText(selectedTemplate.name, selectedTemplate.content);
      } else {
        await printWithFallback(previewPrinterId, fallbackPrinterId, selectedTemplate.key, selectedTemplate.content);
      }
      setIsPreviewOpen(false);
    } catch (printError: any) {
      setError(`In thử thất bại: ${printError?.message || 'Lỗi không xác định'}`);
    }
  };

  const previewTemplate = templates.find((item) => item.key === previewTemplateKey) || templates[0];

  return (
    <section className="printers-page">
      <div className="printers-toolbar">
        <h2>Thiết lập máy in</h2>
        <div className="printers-toolbar-actions">
          <button className="ghost-btn printers-test-print-btn" onClick={() => onTestPrint().catch(() => undefined)}>
            <PrintActionIcon />
            In thử
          </button>
          <button className="ghost-btn" onClick={loadWebUsbPrinters} disabled={!hasWebUsb || isLoading}>
            {isLoading ? 'Đang quét...' : 'Tải lại danh sách USB'}
          </button>
          <button className="primary-btn" onClick={requestPrinter} disabled={!hasWebUsb}>
            Kết nối máy in USB
          </button>
        </div>
      </div>

      {!hasWebUsb && (
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
                  {templates.map((template) => (
                    <option key={template.key} value={template.key}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Máy in
                <select
                  value={previewPrinterId}
                  onChange={(event) => setPreviewPrinterId(event.target.value)}
                  disabled={previewTemplateKey === 'invoice_a4'}
                >
                  <option value="">-- Chọn máy in --</option>
                  {printers.map((printer) => (
                    <option key={printer.id} value={printer.id}>
                      {printer.label}
                    </option>
                  ))}
                </select>
              </label>
              {previewTemplateKey === 'invoice_a4' && (
                <p className="printer-warning">Mẫu A4 sẽ in qua hộp thoại in của trình duyệt (chọn máy in inkjet/laser tại đó).</p>
              )}
            </div>

            <div className={`printers-preview-paper ${previewTemplate?.key === 'receipt_80mm' ? 'is-80mm' : 'is-a4'}`}>
              <pre>{previewTemplate?.content || ''}</pre>
            </div>

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
          <h3>Danh sách máy in</h3>
          {printers.length === 0 ? (
            <div className="empty-state">Chưa tìm thấy máy in USB được cấp quyền.</div>
          ) : (
            <div className="printer-list">
              {printers.map((printer) => {
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
          <div className="template-list">
            {templates.map((template) => (
              <article key={template.key} className={`template-card ${defaultTemplateKey === template.key ? 'is-active' : ''}`}>
                <div className="template-head">
                  <strong>{template.name}</strong>
                  <label>
                    <input
                      type="checkbox"
                      checked={defaultTemplateKey === template.key}
                      onChange={() => setDefaultTemplateKey(template.key)}
                    />
                    Đặt in mặc định
                  </label>
                </div>
                <textarea
                  value={template.content}
                  onChange={(event) => onChangeTemplate(template.key, event.target.value)}
                  rows={14}
                />
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
