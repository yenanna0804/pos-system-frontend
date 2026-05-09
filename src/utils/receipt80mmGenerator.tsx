import { formatDateTimeVN } from './formatters';

export type Receipt80mmItem = {
  name: string;
  unit?: string;
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
  title: 'PHIẾU TẠM TÍNH',
  datetime: '09/05/2026 21:16:08',
  orderCode: "HĐ1234",
  location: 'Tầng 1 / Bàn 3',
  guestCount: '2',
  cashier: 'abc',
  items: [
    { name: 'Gà rán', note: 'cay nồng đặc biệt', quantity: 1, unitPrice: 15000, lineTotal: 15000 },
    { name: 'Bia budweisser combo đặc biệt', quantity: 3, unitPrice: 55000, lineTotal: 165000 },
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
  const normalizedTitle = (data.title || '').trim().toUpperCase();
  const isOrderPrint =
    normalizedTitle === 'CHẾ BIẾN' ||
    normalizedTitle === 'CHE BIEN' ||
    normalizedTitle === 'PHIẾU ORDER' ||
    normalizedTitle === 'PHIEU ORDER' ||
    normalizedTitle === 'ORDER';
  const width = 576;
  const marginX = 16;
  const contentWidth = width - marginX * 2;
  const titleSize = 24;
  const bodySize = 16;
  const lineHeight = 24;

  const tableLeft = marginX;
  const tableRight = marginX + contentWidth;
  const colHashWidth = 30;
  const colSlWidth = 34;
  const colUnitWidth = isOrderPrint ? 94 : 0;
  const colDgWidth = isOrderPrint ? 0 : 90;
  const colTtWidth = isOrderPrint ? 0 : 95;

  const colHashRight = tableLeft + colHashWidth;
  const colNameRight = tableRight - (colSlWidth + colUnitWidth + colDgWidth + colTtWidth);
  const colSlRight = colNameRight + colSlWidth;
  const colUnitRight = colSlRight + colUnitWidth;
  const colDgRight = colUnitRight + colDgWidth;
  const colTtRight = tableRight;

  const xHashCenter = tableLeft + Math.floor(colHashWidth / 2);
  const xSlCenter = colNameRight + Math.floor(colSlWidth / 2);
  const xUnitCenter = colSlRight + Math.floor(colUnitWidth / 2);
  const xName = colHashRight + 10;
  const xUnitRight = colDgRight - 10;
  const xTotalRight = colTtRight - 10;
  const nameColumnWidth = colNameRight - xName - 8;
  const noteX = xName;
  const noteColumnWidth = tableRight - noteX - 8;
  const noteSize = Math.max(14, bodySize - 2);
  const noteLineHeight = Math.max(20, lineHeight - 4);

  const sampleCanvas = document.createElement('canvas');
  const sampleCtx = sampleCanvas.getContext('2d');
  if (!sampleCtx) throw new Error('Khong tao duoc canvas bitmap');
  sampleCtx.font = `${bodySize}px 'DejaVu Sans Mono', 'DejaVu Sans', 'Noto Sans', Arial, sans-serif`;

  let estimatedRows = 16;
  for (let itemIdx = 0; itemIdx < data.items.length; itemIdx += 1) {
    const item = data.items[itemIdx];
    estimatedRows += wrapByWidth(sampleCtx, item.name, nameColumnWidth).length;
    if (item.note?.trim()) estimatedRows += wrapByWidth(sampleCtx, item.note.trim(), noteColumnWidth).length;
    if (isOrderPrint) estimatedRows += 1;
    if (item.note?.trim()) estimatedRows += 1;
    if (itemIdx < data.items.length - 1) estimatedRows += 1;
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
  const mergedRowBands: Array<{ start: number; end: number }> = [];
  const title = isOrderPrint ? 'PHIẾU ORDER' : 'PHIẾU TẠM TÍNH';
  ctx.font = `bold ${titleSize}px 'DejaVu Sans', 'Noto Sans', Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(title, width / 2, y);
  y += 40;
  ctx.fillRect(marginX, y, contentWidth, 2);
  y += 12;

  ctx.font = `${bodySize}px 'DejaVu Sans Mono', 'DejaVu Sans', 'Noto Sans', Arial, sans-serif`;
  ctx.textAlign = 'left';

  const drawLabelValue = (label: string, value: string) => {
    ctx.textAlign = 'left';
    ctx.fillText(`${label}: ${value || '-'}`, marginX, y);
    y += lineHeight;
  };

  drawLabelValue('Ngày', data.datetime || formatDateTimeVN(new Date().toISOString()));
  drawLabelValue('Mã HĐ', data.orderCode || '-');
  drawLabelValue('Vị trí', data.location || '-');
  drawLabelValue('SL khách', `${data.guestCount ?? '-'}`);
  drawLabelValue('Thu ngân', data.cashier || '-');

  y += 2;
  const tableTop = y;
  ctx.fillRect(marginX, y, contentWidth, 2);
  y += 10;

  ctx.font = `bold ${bodySize}px 'DejaVu Sans Mono', 'DejaVu Sans', 'Noto Sans', Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('#', xHashCenter, y);
  ctx.textAlign = 'left';
  ctx.fillText('Tên món', xName, y);
  ctx.textAlign = 'center';
  ctx.fillText('SL', xSlCenter, y);
  if (isOrderPrint) {
    ctx.fillText('ĐVT', xUnitCenter, y);
  } else {
    ctx.textAlign = 'right';
    ctx.fillText('ĐG', xUnitRight, y);
    ctx.fillText('TT', xTotalRight, y);
  }
  y += lineHeight;
  ctx.fillRect(marginX, y, contentWidth, 2);
  y += 10;
  ctx.font = `${bodySize}px 'DejaVu Sans Mono', 'DejaVu Sans', 'Noto Sans', Arial, sans-serif`;

  for (let idx = 0; idx < data.items.length; idx += 1) {
    const item = data.items[idx];
    const nameLines = wrapByWidth(ctx, (item.name || '').trim(), nameColumnWidth);

    ctx.textAlign = 'center';
    ctx.fillText(String(idx + 1), xHashCenter, y);
    ctx.textAlign = 'left';
    ctx.fillText(nameLines[0] || '-', xName, y);

    ctx.textAlign = 'center';
    ctx.fillText(String(Math.trunc(item.quantity)), xSlCenter, y);
    if (isOrderPrint) {
      ctx.fillText((item.unit || '-').trim() || '-', xUnitCenter, y);
    } else {
      ctx.textAlign = 'right';
      ctx.fillText(toNumberVi(item.unitPrice), xUnitRight, y);
      ctx.fillText(toNumberVi(item.lineTotal), xTotalRight, y);
    }
    y += lineHeight;

    for (let nameLineIdx = 1; nameLineIdx < nameLines.length; nameLineIdx += 1) {
      ctx.textAlign = 'left';
      ctx.fillText(nameLines[nameLineIdx], xName, y);
      y += lineHeight;
    }

    const itemNote = item.note?.trim();
    if (itemNote) {
      const noteBandStart = y;
      ctx.fillRect(colHashRight, y, tableRight - colHashRight, 2);
      y += 8;
      const noteLines = wrapByWidth(ctx, itemNote, noteColumnWidth);
      ctx.font = `italic ${noteSize}px 'DejaVu Sans Mono', 'DejaVu Sans', 'Noto Sans', Arial, sans-serif`;
      for (const noteLine of noteLines) {
        ctx.textAlign = 'left';
        ctx.fillText(noteLine, noteX, y);
        y += noteLineHeight;
      }
      ctx.font = `${bodySize}px 'DejaVu Sans Mono', 'DejaVu Sans', 'Noto Sans', Arial, sans-serif`;
      mergedRowBands.push({ start: noteBandStart, end: y });
    }

    if (idx < data.items.length - 1) {
      ctx.fillRect(marginX, y, contentWidth, 2);
      y += 10;
    }
  }

  const tableBottom = y;
  ctx.fillRect(marginX, y, contentWidth, 2);
  const drawVerticalWithMergedBands = (x: number, bands: Array<{ start: number; end: number }>) => {
    if (bands.length === 0) {
      ctx.fillRect(x, tableTop, 2, tableBottom - tableTop + 2);
      return;
    }
    let cursor = tableTop;
    for (const band of bands) {
      const bandStart = Math.max(tableTop, band.start);
      const bandEnd = Math.min(tableBottom + 2, band.end);
      if (bandStart > cursor) {
        ctx.fillRect(x, cursor, 2, bandStart - cursor);
      }
      cursor = Math.max(cursor, bandEnd);
    }
    if (cursor < tableBottom + 2) {
      ctx.fillRect(x, cursor, 2, tableBottom + 2 - cursor);
    }
  };

  ctx.fillRect(tableLeft, tableTop, 2, tableBottom - tableTop + 2);
  ctx.fillRect(colHashRight, tableTop, 2, tableBottom - tableTop + 2);
  drawVerticalWithMergedBands(colNameRight, mergedRowBands);
  drawVerticalWithMergedBands(colSlRight, mergedRowBands);
  if (isOrderPrint) {
    drawVerticalWithMergedBands(colUnitRight, mergedRowBands);
  } else {
    drawVerticalWithMergedBands(colDgRight, mergedRowBands);
  }
  ctx.fillRect(tableRight, tableTop, 2, tableBottom - tableTop + 2);
  y += 12;

  if (isOrderPrint) {
    y += 8;
    ctx.textAlign = 'center';
    ctx.fillText('Vui lòng kiểm tra kỹ lại nội dung', width / 2, y);
    y += lineHeight;
    ctx.fillText('trước khi chế biến', width / 2, y);
    return canvas;
  }

  const drawSummary = (label: string, value: string) => {
    ctx.textAlign = 'left';
    ctx.fillText(label, xName, y);
    ctx.textAlign = 'right';
    ctx.fillText(value, xTotalRight, y);
    y += lineHeight;
  };

  drawSummary('Tạm tính', toNumberVi(data.subtotal));
  drawSummary('Giảm giá', toNumberVi(Math.abs(data.discount)));
  drawSummary('Phí dịch vụ', toNumberVi(data.surcharge));

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
  const escInit = Uint8Array.from([0x1b, 0x40]);
  const alignLeft = Uint8Array.from([0x1b, 0x61, 0x00]);
  const lf = Uint8Array.from([0x0a, 0x0a]);
  const cut = Uint8Array.from([0x1d, 0x56, 0x42, 0x00]);
  const STRIP_HEIGHT = 200;

  const strips: Uint8Array[] = [];
  for (let stripStart = 0; stripStart < height; stripStart += STRIP_HEIGHT) {
    const stripH = Math.min(STRIP_HEIGHT, height - stripStart);
    const yL = stripH & 0xff;
    const yH = (stripH >> 8) & 0xff;
    const rasterHeader = Uint8Array.from([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
    const stripData = raster.slice(stripStart * widthBytes, (stripStart + stripH) * widthBytes);
    strips.push(rasterHeader);
    strips.push(stripData);
  }

  const stripsTotal = strips.reduce((sum, part) => sum + part.length, 0);
  const wrapped = new Uint8Array(escInit.length + alignLeft.length + stripsTotal + lf.length + cut.length);
  let cursor = 0;
  wrapped.set(escInit, cursor);
  cursor += escInit.length;
  wrapped.set(alignLeft, cursor);
  cursor += alignLeft.length;
  for (const part of strips) {
    wrapped.set(part, cursor);
    cursor += part.length;
  }
  wrapped.set(lf, cursor);
  cursor += lf.length;
  wrapped.set(cut, cursor);

  return wrapped;
};

export const buildReceipt80mmEscPosBytes = async (data: Receipt80mmData) => {
  const canvas = buildReceiptCanvas(data);
  return buildImageEscPosBytesFromCanvas(canvas);
};
