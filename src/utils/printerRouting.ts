import { printA4PlainText } from './print';
import {
  DEFAULT_RECEIPT_80MM_DATA,
  buildReceipt80mmEscPosBytes,
  type Receipt80mmData,
} from './receipt80mmGenerator';

type TemplateKey = 'receipt_80mm' | 'invoice_a4';
type ConnectionMode = 'bridge' | 'usb';

type PrinterSettings = {
  defaultTemplateKey?: TemplateKey;
  bridgeEnabled?: boolean;
  bridgeUrl?: string;
  receiptType?: string;
  invoiceType?: string;
  connectionMode?: ConnectionMode;
  defaultPrinterId?: string;
  backupPrinterId?: string;
};

type PrintRouteOptions = {
  receipt80mmData?: Receipt80mmData;
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
  ctx.font = `${fontSize}px 'Courier New', monospace`;
  ctx.textBaseline = 'top';

  lines.forEach((line, index) => {
    ctx.fillText(line, horizontalPadding, isReceipt ? 12 : 24 + index * lineHeight);
  });

  return canvas;
};

const submitBridgeJob = (url: string, payload: Record<string, unknown>) =>
  new Promise<void>((resolve, reject) => {
    const websocket = new WebSocket(url);
    let settled = false;

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

    const timeoutId = window.setTimeout(() => {
      finishError('Khong ket noi duoc WebApp Hardware Bridge');
    }, 3500);

    websocket.onopen = () => {
      try {
        websocket.send(JSON.stringify(payload));
      } catch {
        window.clearTimeout(timeoutId);
        finishError('Khong gui duoc lenh in den Bridge');
      }
    };

    websocket.onmessage = (event) => {
      try {
        const response = JSON.parse(String(event.data)) as { success?: boolean; message?: string };
        if (response.success === false) {
          window.clearTimeout(timeoutId);
          finishError(response.message || 'Bridge tu choi lenh in');
          return;
        }
      } catch {
      }
      window.clearTimeout(timeoutId);
      finishOk();
    };

    websocket.onerror = () => {
      window.clearTimeout(timeoutId);
      finishError('WebSocket den Bridge bi loi');
    };

    websocket.onclose = () => {
      window.clearTimeout(timeoutId);
      if (!settled) {
        finishError('Bridge da dong ket noi truoc khi in xong');
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
  if (templateKey === 'invoice_a4') {
    const invoiceType = settings.invoiceType?.trim() || 'INVOICE';
    const canvas = buildCanvasFromText(_content, 'invoice_a4');
    const imageBase64 = canvas.toDataURL('image/png').split(',')[1] || '';
    if (!imageBase64) throw new Error('Khong tao duoc du lieu anh de in A4');
    await submitBridgeJob(bridgeUrl, {
      id: `invoice-${Date.now()}`,
      type: invoiceType,
      url: `${title || 'invoice'}.png`,
      file_content: imageBase64,
    });
    return;
  }

  const receiptType = settings.receiptType?.trim() || 'RECEIPT';
  const payload = await buildReceipt80mmEscPosBytes(options?.receipt80mmData || DEFAULT_RECEIPT_80MM_DATA);
  await submitBridgeJob(bridgeUrl, {
    id: `receipt-${Date.now()}`,
    type: receiptType,
    raw_content: uint8ToBase64(payload),
  });
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
  if (templateKey === 'invoice_a4') {
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
    const templateKey = settings.defaultTemplateKey || 'receipt_80mm';
    const connectionMode = settings.connectionMode || 'bridge';
    const bridgeEnabled = settings.bridgeEnabled !== false;

    if (connectionMode === 'bridge' && bridgeEnabled) {
      await printViaBridge(title, content, templateKey, settings, options);
      return;
    }

    await printViaUsb(title, content, templateKey, settings, options);
  });
};
