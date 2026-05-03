export type Receipt80mmItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  note?: string;
};

export type Receipt80mmData = {
  title?: string;
  orderCode?: string;
  datetime?: string;
  customerName?: string;
  location?: string;
  cashier?: string;
  guestCount?: number | string;
  items: Receipt80mmItem[];
  subtotal: number;
  discount: number;
  surcharge: number;
  total: number;
};

export const DEFAULT_RECEIPT_80MM_DATA: Receipt80mmData = {
  title: 'PHIẾU THANH TOÁN',
  datetime: '09/05/2026 21:16:08',
  location: 'Tầng 1 / Bàn 3',
  guestCount: '2',
  cashier: 'abc',
  items: [
    { name: 'Gà rán *cay nồng đặc biệt', quantity: 1, unitPrice: 15000, lineTotal: 15000 },
    { name: 'Bia budweisser', quantity: 3, unitPrice: 55000, lineTotal: 165000 },
  ],
  subtotal: 180000,
  discount: 15000,
  surcharge: 0,
  total: 165000,
};

const toMoney = (value: number) => `${Math.trunc(value).toLocaleString('vi-VN')}đ`;
const toNumberVi = (value: number) => Math.trunc(value).toLocaleString('vi-VN');

const wrapByWidth = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const normalized = (text || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return ['-'];
  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
};

const buildReceiptCanvas = (data: Receipt80mmData) => {
  const width = 576;
  const marginX = 16;
  const contentWidth = width - marginX * 2;
  const titleSize = 28;
  const bodySize = 24;
  const lineHeight = 34;

  const xIndex = marginX;
  const xName = marginX + 40;
  const xQtyRight = marginX + 280;
  const xUnitRight = marginX + 396;
  const xTotalRight = marginX + contentWidth;
  const nameColumnWidth = xQtyRight - xName - 12;
  const xCol1Right = xName - 12;
  const xCol2Right = xQtyRight + 10;
  const xCol3Right = xUnitRight + 10;

  const sampleCanvas = document.createElement('canvas');
  const sampleCtx = sampleCanvas.getContext('2d');
  if (!sampleCtx) throw new Error('Khong tao duoc canvas bitmap');
  sampleCtx.font = `${bodySize}px 'DejaVu Sans Mono', 'DejaVu Sans', 'Noto Sans', Arial, sans-serif`;

  let estimatedRows = 16;
  for (const item of data.items) {
    estimatedRows += wrapByWidth(sampleCtx, item.name, nameColumnWidth).length;
    if (item.note?.trim()) estimatedRows += wrapByWidth(sampleCtx, `*${item.note.trim()}`, nameColumnWidth).length;
  }
  const estimatedHeight = 86 + estimatedRows * lineHeight;
  const height = Math.max(320, Math.min(1700, estimatedHeight));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Khong tao duoc canvas bitmap');

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  let y = 10;
  const title = data.title || 'PHIẾU THANH TOÁN';
  ctx.font = `bold ${titleSize}px 'DejaVu Sans', 'Noto Sans', Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(title, width / 2, y);
  y += 44;
  ctx.fillRect(marginX, y, contentWidth, 2);
  y += 12;

  ctx.font = `${bodySize}px 'DejaVu Sans Mono', 'DejaVu Sans', 'Noto Sans', Arial, sans-serif`;
  ctx.textAlign = 'left';

  const drawLabelValue = (label: string, value: string) => {
    ctx.textAlign = 'left';
    ctx.fillText(`${label}: ${value || '-'}`, marginX, y);
    y += lineHeight;
  };

  drawLabelValue('Ngày', data.datetime || new Date().toLocaleString('vi-VN'));
  drawLabelValue('Vị trí', data.location || '-');
  drawLabelValue('SL khách', `${data.guestCount ?? '-'}`);
  drawLabelValue('Thu ngân', data.cashier || '-');

  y += 2;
  const tableTop = y;
  ctx.fillRect(marginX, y, contentWidth, 2);
  y += 10;

  ctx.font = `bold ${bodySize}px 'DejaVu Sans Mono', 'DejaVu Sans', 'Noto Sans', Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('#', xIndex + 4, y);
  ctx.fillText('Tên món', xName, y);
  ctx.textAlign = 'right';
  ctx.fillText('SL', xQtyRight, y);
  ctx.fillText('ĐG', xUnitRight, y);
  ctx.fillText('TT', xTotalRight, y);
  y += lineHeight;
  ctx.fillRect(marginX, y, contentWidth, 2);
  y += 10;
  ctx.font = `${bodySize}px 'DejaVu Sans Mono', 'DejaVu Sans', 'Noto Sans', Arial, sans-serif`;

  for (let idx = 0; idx < data.items.length; idx += 1) {
    const item = data.items[idx];
    const [baseName, inlineNoteRaw] = item.name.split('*');
    const inlineNote = inlineNoteRaw?.trim();
    const nameLines = wrapByWidth(ctx, (baseName || '').trim(), nameColumnWidth);

    ctx.textAlign = 'left';
    ctx.fillText(String(idx + 1), xIndex + 4, y);
    ctx.fillText(nameLines[0], xName, y);

    ctx.textAlign = 'right';
    ctx.fillText(String(Math.trunc(item.quantity)), xQtyRight, y);
    ctx.fillText(toNumberVi(item.unitPrice), xUnitRight, y);
    ctx.fillText(toNumberVi(item.lineTotal), xTotalRight, y);
    y += lineHeight;

    for (let i = 1; i < nameLines.length; i += 1) {
      ctx.textAlign = 'left';
      ctx.fillText(nameLines[i], xName, y);
      y += lineHeight;
    }

    const effectiveNote = item.note?.trim() || inlineNote;
    if (effectiveNote) {
      const noteLines = wrapByWidth(ctx, `*${effectiveNote}`, nameColumnWidth);
      for (const noteLine of noteLines) {
        ctx.textAlign = 'left';
        ctx.fillText(noteLine, xName, y);
        y += lineHeight;
      }
    }
  }

  const tableBottom = y;
  ctx.fillRect(marginX, y, contentWidth, 2);
  ctx.fillRect(xCol1Right, tableTop, 2, tableBottom - tableTop + 2);
  ctx.fillRect(xCol2Right, tableTop, 2, tableBottom - tableTop + 2);
  ctx.fillRect(xCol3Right, tableTop, 2, tableBottom - tableTop + 2);
  y += 12;

  const drawSummary = (label: string, value: string) => {
    ctx.textAlign = 'left';
    ctx.fillText(label, xName, y);
    ctx.textAlign = 'right';
    ctx.fillText(value, xTotalRight, y);
    y += lineHeight;
  };

  drawSummary('Tạm tính', toNumberVi(data.subtotal));
  drawSummary('Giảm giá', toNumberVi(Math.abs(data.discount)));
  drawSummary('Phụ phí', toNumberVi(data.surcharge));

  ctx.fillRect(marginX, y, contentWidth, 2);
  y += 22;
  ctx.font = `bold ${bodySize}px 'DejaVu Sans Mono', 'DejaVu Sans', 'Noto Sans', Arial, sans-serif`;
  drawSummary('THANH TOÁN', toMoney(data.total));
  ctx.font = `${bodySize}px 'DejaVu Sans Mono', 'DejaVu Sans', 'Noto Sans', Arial, sans-serif`;

  y += 28;
  ctx.textAlign = 'center';
  ctx.fillText('Vui lòng kiểm tra kỹ lại nội dung', width / 2, y);
  y += lineHeight;
  ctx.fillText('trước khi thanh toán', width / 2, y);

  return canvas;
};

export const buildReceipt80mmBitmapDataUrl = (data?: Receipt80mmData) => {
  const source = data || DEFAULT_RECEIPT_80MM_DATA;
  const canvas = buildReceiptCanvas(source);
  const dataUrl = canvas.toDataURL('image/png');
  if (!dataUrl) throw new Error('Khong tao duoc du lieu bitmap');
  return dataUrl;
};

const buildImageEscPosBytesFromCanvas = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Khong doc duoc du lieu canvas');
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height).data;
  const widthBytes = Math.ceil(width / 8);
  const raster = new Uint8Array(widthBytes * height);

  for (let y = 0; y < height; y += 1) {
    for (let xb = 0; xb < widthBytes; xb += 1) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const x = xb * 8 + bit;
        if (x >= width) continue;
        const idx = (y * width + x) * 4;
        const r = imageData[idx];
        const g = imageData[idx + 1];
        const b = imageData[idx + 2];
        const a = imageData[idx + 3];
        const luminance = (r * 299 + g * 587 + b * 114) / 1000;
        const isBlack = a > 16 && luminance < 170;
        if (isBlack) {
          byte |= 1 << (7 - bit);
        }
      }
      raster[y * widthBytes + xb] = byte;
    }
  }

  const xL = widthBytes & 0xff;
  const xH = (widthBytes >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;

  const escInit = Uint8Array.from([0x1b, 0x40]);
  const alignLeft = Uint8Array.from([0x1b, 0x61, 0x00]);
  const rasterHeader = Uint8Array.from([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
  const lf = Uint8Array.from([0x0a, 0x0a]);
  const cut = Uint8Array.from([0x1d, 0x56, 0x42, 0x00]);

  const wrapped = new Uint8Array(escInit.length + alignLeft.length + rasterHeader.length + raster.length + lf.length + cut.length);
  let cursor = 0;
  wrapped.set(escInit, cursor);
  cursor += escInit.length;
  wrapped.set(alignLeft, cursor);
  cursor += alignLeft.length;
  wrapped.set(rasterHeader, cursor);
  cursor += rasterHeader.length;
  wrapped.set(raster, cursor);
  cursor += raster.length;
  wrapped.set(lf, cursor);
  cursor += lf.length;
  wrapped.set(cut, cursor);

  return wrapped;
};

export const buildReceipt80mmEscPosBytes = async (data: Receipt80mmData) => {
  const canvas = buildReceiptCanvas(data);
  return buildImageEscPosBytesFromCanvas(canvas);
};
