import { printA4PlainText } from './print';
import {
  DEFAULT_RECEIPT_80MM_DATA,
  buildReceipt80mmEscPosBytes,
  type Receipt80mmData,
} from './receipt80mmGenerator';

type TemplateKey = 'receipt_80mm' | 'invoice_a4' | 'order_slip_80mm' | 'order_slip_a4';
type ConnectionMode = 'bridge' | 'usb';

type PrinterSettings = {
  defaultTemplateKey?: TemplateKey;
  invoiceDefaultTemplateKey?: 'receipt_80mm' | 'invoice_a4';
  orderDefaultTemplateKey?: 'order_slip_80mm' | 'order_slip_a4';
  bridgeEnabled?: boolean;
  bridgeUrl?: string;
  receiptType?: string;
  invoiceType?: string;
  orderA4Type?: string;
  order80mmType?: string;
  connectionMode?: ConnectionMode;
  defaultPrinterId?: string;
  backupPrinterId?: string;
};

type PrintRouteOptions = {
  receipt80mmData?: Receipt80mmData;
  templateKey?: TemplateKey;
};

type PrintFamily = 'invoice' | 'order_slip';

type UsbDeviceLike = {
  serialNumber?: string;
  productName?: string;
  vendorId?: number;
  productId?: number;
};

type UsbNavigatorLike = Navigator & {
  usb?: {
    getDevices: () => Promise<UsbDeviceLike[]>;
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
let printQueue: Promise<void> = Promise.resolve();

const uint8ToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const loadSettings = (): PrinterSettings => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return {};
  try {
    return JSON.parse(saved) as PrinterSettings;
  } catch {
    return {};
  }
};

export const resolveTemplateKeyForPrintFamily = (family: PrintFamily): TemplateKey => {
  const settings = loadSettings();
  if (family === 'order_slip') {
    if (settings.orderDefaultTemplateKey) return settings.orderDefaultTemplateKey;
    const prefersA4 = settings.defaultTemplateKey === 'invoice_a4' || settings.defaultTemplateKey === 'order_slip_a4';
    return prefersA4 ? 'order_slip_a4' : 'order_slip_80mm';
  }

  if (settings.invoiceDefaultTemplateKey) return settings.invoiceDefaultTemplateKey;
  const prefersA4 = settings.defaultTemplateKey === 'invoice_a4' || settings.defaultTemplateKey === 'order_slip_a4';
  return prefersA4 ? 'invoice_a4' : 'receipt_80mm';
};

const getDeviceKey = (device: UsbDeviceLike) => {
  if (device.serialNumber?.trim()) return device.serialNumber;
  return `${device.vendorId ?? 'na'}-${device.productId ?? 'na'}-${device.productName ?? 'unknown'}`;
};

const buildCanvasFromText = (content: string, templateKey: TemplateKey) => {
  const isReceipt = templateKey === 'receipt_80mm';
  const fontSize = isReceipt ? 22 : 26;
  const lineHeight = Math.round(fontSize * 1.45);
  const horizontalPadding = isReceipt ? 10 : 36;
  const lines = content.split('\n');
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const charsPerLine = isReceipt ? 32 : 48;

  const contentWidth = Math.max(isReceipt ? 320 : 960, Math.ceil((longestLine / charsPerLine) * (isReceipt ? 560 : 1100)));
  const width = isReceipt ? Math.min(576, contentWidth + horizontalPadding * 2) : 1240;
  const height = Math.max(isReceipt ? 160 : 1754, lines.length * lineHeight + (isReceipt ? 24 : 72));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Khong khoi tao duoc canvas de in');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';
  ctx.font = `${fontSize}px 'Times New Roman', serif`;
  ctx.textBaseline = 'top';

  lines.forEach((line, index) => {
    ctx.fillText(line, horizontalPadding, isReceipt ? 12 : 24 + index * lineHeight);
  });

  return canvas;
};

const deriveBridgeHttpBaseUrl = (url: string) => {
  const trimmed = url.trim();
  if (!trimmed) return 'http://127.0.0.1:12212';
  if (trimmed.startsWith('ws://')) return `http://${trimmed.slice(5).replace(/\/printer\/?$/, '')}`;
  if (trimmed.startsWith('wss://')) return `https://${trimmed.slice(6).replace(/\/printer\/?$/, '')}`;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed.replace(/\/printer\/?$/, '');
  return 'http://127.0.0.1:12212';
};

// Pre-flight kiểm tra Bridge có mapping cho `type` chưa.
// Best-effort: nếu HTTP /config.json không truy cập được (Bridge không mở
// HTTP endpoint, bị CORS, hoặc Bridge tắt) thì BỎ QUA — vẫn gửi job qua
// WebSocket để xem WS có chạy không. Chỉ throw khi:
//   - fetch thành công nhưng mapping thiếu (sai cấu hình rõ ràng)
const verifyBridgeMapping = async (bridgeUrl: string, type: string): Promise<void> => {
  const baseUrl = deriveBridgeHttpBaseUrl(bridgeUrl);
  let configData: { printer?: { mappings?: Array<{ type?: string }> } } | null = null;
  try {
    const res = await fetch(`${baseUrl}/config.json`, { method: 'GET' });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[Bridge] HTTP ${res.status} on /config.json — bỏ qua pre-flight check, vẫn gửi qua WebSocket`);
      return;
    }
    configData = await res.json();
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn(`[Bridge] Không fetch được /config.json (${e?.message || 'unknown'}) — bỏ qua pre-flight check, vẫn gửi qua WebSocket`);
    return;
  }
  const mappings = Array.isArray(configData?.printer?.mappings) ? configData!.printer!.mappings! : [];
  const found = mappings.some((m) => String(m?.type || '').trim() === type);
  if (!found) {
    throw new Error(`Bridge chưa có mapping cho loại "${type}". Mở app Bridge → Settings → Printer Mapping để thêm máy in cho loại này.`);
  }
};

const submitBridgeJob = (url: string, payload: Record<string, unknown>) =>
  new Promise<void>((resolve, reject) => {
    const websocket = new WebSocket(url);
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      finishError('Bridge không phản hồi trong thời gian chờ');
    }, 5000);

    const cleanup = () => {
      websocket.onopen = null;
      websocket.onmessage = null;
      websocket.onerror = null;
      websocket.onclose = null;
      if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
        websocket.close();
      }
    };

    const finishOk = () => {
      if (settled) return;
      settled = true;
      window.setTimeout(() => {
        cleanup();
        resolve();
      }, 260);
    };

    const finishError = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    websocket.onopen = () => {
      try {
        websocket.send(JSON.stringify(payload));
      } catch {
        window.clearTimeout(timeoutId);
        finishError('Không gửi được lệnh in tới Bridge');
      }
    };

    websocket.onmessage = (event) => {
      const raw = String(event.data || '');
      // eslint-disable-next-line no-console
      console.debug('[Bridge response]', raw);
      let response: { success?: boolean; message?: string; error?: string } | null = null;
      try {
        response = JSON.parse(raw);
      } catch {
        window.clearTimeout(timeoutId);
        finishError(`Bridge trả về dữ liệu không hợp lệ: ${raw.slice(0, 120)}`);
        return;
      }

      if (response?.success === false || response?.error) {
        window.clearTimeout(timeoutId);
        finishError(response.message || response.error || 'Bridge từ chối lệnh in');
        return;
      }

      if (response?.success === true) {
        window.clearTimeout(timeoutId);
        finishOk();
        return;
      }

      // eslint-disable-next-line no-console
      console.warn('[Bridge] phản hồi không có field success/error — vẫn coi là OK:', response);
      window.clearTimeout(timeoutId);
      finishOk();
    };

    websocket.onerror = () => {
      window.clearTimeout(timeoutId);
      finishError('WebSocket tới Bridge bị lỗi');
    };

    websocket.onclose = () => {
      window.clearTimeout(timeoutId);
      if (!settled) {
        finishError('Bridge đóng kết nối trước khi in xong');
      }
    };
  });

const enqueuePrintJob = async <T>(job: () => Promise<T>) => {
  const run = async () => {
    try {
      return await job();
    } finally {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 900));
    }
  };

  const next = printQueue.then(run, run);
  printQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
};

const printViaBridge = async (
  title: string,
  _content: string,
  templateKey: TemplateKey,
  settings: PrinterSettings,
  options?: PrintRouteOptions,
) => {
  const bridgeUrl = settings.bridgeUrl?.trim() || 'ws://127.0.0.1:12212/printer';

  const submitInvoiceA4 = async () => {
    const invoiceType = settings.invoiceType?.trim() || 'HDA4';
    await verifyBridgeMapping(bridgeUrl, invoiceType);
    const canvas = buildCanvasFromText(_content, 'invoice_a4');
    const imageBase64 = canvas.toDataURL('image/png').split(',')[1] || '';
    if (!imageBase64) throw new Error('Không tạo được dữ liệu ảnh để in A4');
    await submitBridgeJob(bridgeUrl, {
      id: `invoice-${Date.now()}`,
      type: invoiceType,
      url: `${title || 'invoice'}.png`,
      file_content: imageBase64,
    });
  };

  const submitReceipt80mm = async () => {
    const receiptType = settings.receiptType?.trim() || 'HD80';
    await verifyBridgeMapping(bridgeUrl, receiptType);
    const payload = await buildReceipt80mmEscPosBytes(options?.receipt80mmData || DEFAULT_RECEIPT_80MM_DATA);
    await submitBridgeJob(bridgeUrl, {
      id: `receipt-${Date.now()}`,
      type: receiptType,
      raw_content: uint8ToBase64(payload),
    });
  };

  const submitOrderSlipA4 = async () => {
    const type = settings.orderA4Type?.trim() || 'ODA4';
    await verifyBridgeMapping(bridgeUrl, type);
    const canvas = buildCanvasFromText(_content, 'invoice_a4');
    const imageBase64 = canvas.toDataURL('image/png').split(',')[1] || '';
    if (!imageBase64) throw new Error('Không tạo được dữ liệu ảnh để in A4 order');
    await submitBridgeJob(bridgeUrl, {
      id: `order-a4-${Date.now()}`,
      type,
      url: `${title || 'order'}.png`,
      file_content: imageBase64,
    });
  };

  const submitOrderSlip80mm = async () => {
    const type = settings.order80mmType?.trim() || 'OD80';
    await verifyBridgeMapping(bridgeUrl, type);
    const payload = await buildReceipt80mmEscPosBytes(options?.receipt80mmData || DEFAULT_RECEIPT_80MM_DATA);
    await submitBridgeJob(bridgeUrl, {
      id: `order-${Date.now()}`,
      type,
      raw_content: uint8ToBase64(payload),
    });
  };

  if (templateKey === 'invoice_a4') return submitInvoiceA4();
  if (templateKey === 'order_slip_a4') return submitOrderSlipA4();
  if (templateKey === 'order_slip_80mm') return submitOrderSlip80mm();
  return submitReceipt80mm();
};

const sendEscPosPayloadToUsbPrinter = async (device: UsbWritableDeviceLike, payload: Uint8Array) => {
  const preferredConfig = device.configuration || device.configurations?.[0];
  if (!preferredConfig) {
    throw new Error('Khong tim thay cau hinh USB hop le cho may in');
  }

  const targetInterface = preferredConfig.interfaces.find((iface) =>
    iface.alternates.some((alt) => alt.endpoints.some((ep) => ep.direction === 'out' && ep.type === 'bulk')),
  );
  const fallbackInterface = preferredConfig.interfaces.find((iface) =>
    iface.alternates.some((alt) => alt.endpoints.some((ep) => ep.direction === 'out')),
  );
  const selectedInterface = targetInterface || fallbackInterface;
  if (!selectedInterface) {
    throw new Error('Khong tim thay cong OUT de gui lenh in');
  }

  const selectedAlternate =
    selectedInterface.alternates.find((alt) => alt.endpoints.some((ep) => ep.direction === 'out' && ep.type === 'bulk')) ||
    selectedInterface.alternates.find((alt) => alt.endpoints.some((ep) => ep.direction === 'out'));
  if (!selectedAlternate) {
    throw new Error('Khong tim thay alternate phu hop de in');
  }

  const outEndpoint =
    selectedAlternate.endpoints.find((ep) => ep.direction === 'out' && ep.type === 'bulk') ||
    selectedAlternate.endpoints.find((ep) => ep.direction === 'out');
  if (!outEndpoint) {
    throw new Error('Khong tim thay endpoint OUT de in');
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

const printViaUsbByPrinterId = async (printerId: string, _content: string, options?: PrintRouteOptions) => {
  const usbNavigator = navigator as UsbNavigatorLike;
  const devices = await usbNavigator.usb?.getDevices();
  if (!devices) throw new Error('WebUSB chua san sang');
  const device = devices.find((item) => getDeviceKey(item) === printerId) as UsbWritableDeviceLike | undefined;
  if (!device) throw new Error('Khong tim thay may in da cap quyen');
  const payload = await buildReceipt80mmEscPosBytes(options?.receipt80mmData || DEFAULT_RECEIPT_80MM_DATA);
  await sendEscPosPayloadToUsbPrinter(device, payload);
};

const printViaUsb = async (title: string, content: string, templateKey: TemplateKey, settings: PrinterSettings, options?: PrintRouteOptions) => {
  if (templateKey === 'invoice_a4' || templateKey === 'order_slip_a4') {
    await printA4PlainText(title, content);
    return;
  }
  if (!settings.defaultPrinterId) {
    throw new Error('Chua cau hinh may in USB mac dinh');
  }
  try {
    await printViaUsbByPrinterId(settings.defaultPrinterId, content, options);
  } catch (primaryError: any) {
    if (!settings.backupPrinterId || settings.backupPrinterId === settings.defaultPrinterId) {
      throw primaryError;
    }
    await printViaUsbByPrinterId(settings.backupPrinterId, content, options);
  }
};

export const printUsingConfiguredRoute = async (title: string, content: string, options?: PrintRouteOptions) => {
  await enqueuePrintJob(async () => {
    const settings = loadSettings();
    const templateKey = options?.templateKey || settings.invoiceDefaultTemplateKey || settings.defaultTemplateKey || 'receipt_80mm';
    const connectionMode = settings.connectionMode || 'bridge';
    const bridgeEnabled = settings.bridgeEnabled !== false;

    if (connectionMode === 'bridge' && bridgeEnabled) {
      await printViaBridge(title, content, templateKey, settings, options);
      return;
    }

    await printViaUsb(title, content, templateKey, settings, options);
  });
};
