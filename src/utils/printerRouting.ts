import { printA4PlainText } from './print';

type TemplateKey = 'receipt_80mm' | 'invoice_a4';

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

const getDeviceKey = (device: UsbDeviceLike) => {
  if (device.serialNumber?.trim()) return device.serialNumber;
  return `${device.vendorId ?? 'na'}-${device.productId ?? 'na'}-${device.productName ?? 'unknown'}`;
};

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
  const usbNavigator = navigator as UsbNavigatorLike;
  const devices = await usbNavigator.usb?.getDevices();
  if (!devices) throw new Error('WebUSB chưa sẵn sàng');
  const device = devices.find((item) => getDeviceKey(item) === printerId) as UsbWritableDeviceLike | undefined;
  if (!device) throw new Error('Không tìm thấy máy in đã cấp quyền');
  const canvas = buildCanvasFromTemplate(content, templateKey);
  const payload = buildEscPosRasterPayload(canvas);
  await sendEscPosPayloadToUsbPrinter(device, payload);
};

const printWithFallback = async (primaryPrinterId: string, fallbackPrinterId: string | undefined, content: string) => {
  try {
    await printViaUsbByPrinterId(primaryPrinterId, 'receipt_80mm', content);
    return;
  } catch (primaryError: any) {
    if (!fallbackPrinterId || fallbackPrinterId === primaryPrinterId) {
      throw new Error(primaryError?.message || 'Lỗi không xác định');
    }

    try {
      await printViaUsbByPrinterId(fallbackPrinterId, 'receipt_80mm', content);
    } catch (fallbackError: any) {
      throw new Error(`Máy in chính lỗi: ${primaryError?.message || 'N/A'} | Máy in thay thế lỗi: ${fallbackError?.message || 'N/A'}`);
    }
  }
};

export const printUsingConfiguredRoute = async (title: string, content: string) => {
  const saved = localStorage.getItem(STORAGE_KEY);
  let parsed: { defaultPrinterId?: string; backupPrinterId?: string; defaultTemplateKey?: TemplateKey } = {};
  if (saved) {
    try {
      parsed = JSON.parse(saved) as { defaultPrinterId?: string; backupPrinterId?: string; defaultTemplateKey?: TemplateKey };
    } catch {
      parsed = {};
    }
  }
  const templateKey = parsed.defaultTemplateKey || 'receipt_80mm';

  if (templateKey === 'invoice_a4') {
    await printA4PlainText(title, content);
    return;
  }

  if (typeof navigator === 'undefined' || !(navigator as UsbNavigatorLike).usb) {
    throw new Error('Trình duyệt không hỗ trợ WebUSB để in 80mm. Vui lòng dùng Chrome/Edge desktop hoặc đổi mẫu mặc định sang A4');
  }

  if (!parsed.defaultPrinterId) {
    throw new Error('Chưa cấu hình máy in mặc định trong trang /printers');
  }

  await printWithFallback(parsed.defaultPrinterId, parsed.backupPrinterId, content);
};
