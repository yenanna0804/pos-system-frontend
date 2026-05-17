import { formatDateTimeVN } from './formatters';

export type Receipt80mmItem = {
  name: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  lineTotal: number;
  note?: string;
};

export type Receipt80mmData = {
  title?: string;
  orderCode?: string;
  datetime?: string;
  customerName?: string;
  location?: string;
  fullName?: string;
  items: Receipt80mmItem[];
  itemDiscountTotal?: number;
  subtotal: number;
  discount: number;
  discountMode?: 'percent' | 'amount';
  discountValue?: number;
  surcharge: number;
  surchargeMode?: 'percent' | 'amount';
  surchargeValue?: number;
  paymentMethod?: 'CASH' | 'BANKING' | null;
  paidAmount?: number;
  total: number;
};

export const DEFAULT_RECEIPT_80MM_DATA: Receipt80mmData = {
  title: 'PHIẾU TẠM TÍNH',
  datetime: '09/05/2026 21:16:08',
  orderCode: "HĐ1234",
  customerName: 'Nguyen Van A - 09xxxxxxx',
  location: 'Tầng 1 / Bàn 3',
  fullName: 'Nguyen Van B',
  items: [
    {
      name: 'Gói karaoke',
      note: "\nTổng thời gian: 1h20'\n23:40 -> 01:00 (1h20')",
      quantity: 1,
      unitPrice: 1600000,
      discount: 10,
      lineTotal: 1500000,
    },
    {
      name: 'Bia budweisser combo đặc biệt',
      note: "Combo bao gồm: (Budweisser: 10 chai, Hoa quả: 1 đĩa)",
      quantity: 2,
      unitPrice: 1000000,
      lineTotal: 2000000
    },
  ],
  itemDiscountTotal: 100000,
  subtotal: 3500000,
  discount: 300000,
  discountMode: 'percent',
  discountValue: 10,
  surcharge: 0,
  surchargeMode: 'amount',
  surchargeValue: 0,
  paymentMethod: 'CASH',
  paidAmount: 3500000,
  total: 3200000,
};

const toMoney = (value: number) => `${Math.trunc(value).toLocaleString('vi-VN')}đ`;
const toNumberVi = (value: number) => Math.trunc(value).toLocaleString('vi-VN');
const toPercentVi = (value: number) => {
  const normalized = Number.isFinite(value) ? Math.max(0, value) : 0;
  const rounded = Math.round(normalized * 10) / 10;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString('vi-VN', { maximumFractionDigits: 0 })
    : rounded.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

const RECEIPT_FONT_FAMILY = 'Helvetica';

const assertReceiptFontLoaded = async () => {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const fonts = document.fonts;
  const check = () => fonts.check(`16px "${RECEIPT_FONT_FAMILY}"`);
  if (check()) return;
  await fonts.load(`400 16px "${RECEIPT_FONT_FAMILY}"`);
  await fonts.load(`700 16px "${RECEIPT_FONT_FAMILY}"`);
  await fonts.load(`italic 400 16px "${RECEIPT_FONT_FAMILY}"`);
  if (!check()) {
    throw new Error(`Font ${RECEIPT_FONT_FAMILY} is not loaded`);
  }
};

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

const wrapByWidthHard = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const normalized = (text || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return ['-'];
  if (ctx.measureText(normalized).width <= maxWidth) return [normalized];
  const lines: string[] = [];
  let current = '';
  for (const ch of normalized) {
    const next = `${current}${ch}`;
    if (!current || ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    lines.push(current);
    current = ch;
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
  const titleSize = 28;
  const bodySize = isOrderPrint ? 30 : 24;
  const totalAmountSize = bodySize + 8;
  const contentLineHeight = isOrderPrint ? 52 : 48;
  const tableLineHeight = isOrderPrint ? 40 : 32;

  const tableLeft = marginX;
  const tableRight = marginX + contentWidth;
  const colHashWidth = 30;
  const colSlWidth = isOrderPrint ? 100 : 34;
  const colUnitWidth = isOrderPrint ? 50 : 0;
  const colDgWidth = isOrderPrint ? 0 : 120;
  const colKmWidth = isOrderPrint ? 0 : 55;
  const colTtWidth = isOrderPrint ? 0 : 120;

  const colHashRight = tableLeft + colHashWidth;
  const colNameRight = tableRight - (colSlWidth + colUnitWidth + colDgWidth + colKmWidth + colTtWidth);
  const colSlRight = colNameRight + colSlWidth;
  const colUnitRight = colSlRight + colUnitWidth;
  const colDgRight = colUnitRight + colDgWidth;
  const colKmRight = colDgRight + colKmWidth;
  const colTtRight = tableRight;

  const xHashCenter = tableLeft + Math.floor(colHashWidth / 2);
  const xSlCenter = colNameRight + Math.floor(colSlWidth / 2);
  const xUnitCenter = colSlRight + Math.floor(colUnitWidth / 2);
  const xKmCenter = colDgRight + Math.floor(colKmWidth / 2);
  const xName = colHashRight + 10;
  const xUnitRight = colDgRight - 4;
  const xTotalRight = colTtRight - 4;
  const nameColumnWidth = colNameRight - xName - 8;
  const noteX = xName;
  const noteColumnWidth = tableRight - noteX - 8;
  const noteSize = Math.max(20, bodySize - 2);
  const noteLineHeight = Math.max(20, tableLineHeight - 4);

  const sampleCanvas = document.createElement('canvas');
  const sampleCtx = sampleCanvas.getContext('2d');
  if (!sampleCtx) throw new Error('Khong tao duoc canvas bitmap');
  sampleCtx.font = `${bodySize}px '${RECEIPT_FONT_FAMILY}'`;

  // Base rows for header, table summary, totals, payment/debt block and footer.
  // Keep this in sync with the summary section so canvas height is not clipped.
  let estimatedRows = 22;
  for (let itemIdx = 0; itemIdx < data.items.length; itemIdx += 1) {
    const item = data.items[itemIdx];
    const nameRows = wrapByWidth(sampleCtx, item.name, nameColumnWidth).length;
    const dgRows = isOrderPrint ? 1 : wrapByWidthHard(sampleCtx, toNumberVi(item.unitPrice), Math.max(10, colDgWidth - 8)).length;
    const kmRows = isOrderPrint ? 1 : wrapByWidthHard(sampleCtx, toPercentVi(Number(item.discount || 0)), Math.max(10, colKmWidth - 8)).length;
    const ttRows = isOrderPrint ? 1 : wrapByWidthHard(sampleCtx, toNumberVi(item.lineTotal), Math.max(10, colTtWidth - 8)).length;
    estimatedRows += Math.max(nameRows, dgRows, kmRows, ttRows);
    if (item.note?.trim()) {
      const noteSegments = item.note
        .split(/\r?\n/)
        .map((segment) => segment.trim())
        .filter(Boolean);
      for (const segment of noteSegments) {
        estimatedRows += wrapByWidth(sampleCtx, segment, noteColumnWidth).length;
      }
    }
    if (isOrderPrint) estimatedRows += 1;
    if (item.note?.trim()) estimatedRows += 1;
    if (itemIdx < data.items.length - 1) estimatedRows += 1;
  }
  const estimatedHeight = 86 + estimatedRows * tableLineHeight;
  // Keep a generous upper bound to avoid clipping when receipt has many items
  // plus extended summary/footer blocks.
  const height = Math.max(320, Math.min(6000, estimatedHeight));

  let canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const initialCtx = canvas.getContext('2d');
  if (!initialCtx) throw new Error('Khong tao duoc canvas bitmap');
  let ctx: CanvasRenderingContext2D = initialCtx;

  const ensureSpace = (neededHeight: number) => {
    if (neededHeight <= canvas.height) return;
    const prevFont = ctx.font;
    const prevTextAlign = ctx.textAlign;
    const prevTextBaseline = ctx.textBaseline;
    const prevFillStyle = ctx.fillStyle;
    const expandedHeight = Math.max(neededHeight, Math.ceil(canvas.height * 1.5));
    const nextCanvas = document.createElement('canvas');
    nextCanvas.width = width;
    nextCanvas.height = expandedHeight;
    const nextCtx = nextCanvas.getContext('2d');
    if (!nextCtx) return;
    nextCtx.imageSmoothingEnabled = false;
    nextCtx.fillStyle = '#ffffff';
    nextCtx.fillRect(0, 0, width, expandedHeight);
    nextCtx.drawImage(canvas, 0, 0);
    canvas = nextCanvas;
    ctx = nextCtx;
    ctx.font = prevFont;
    ctx.textAlign = prevTextAlign;
    ctx.textBaseline = prevTextBaseline;
    ctx.fillStyle = prevFillStyle;
  };

  const finalizeCanvasHeight = (usedHeight: number) => {
    const minFinalHeight = 260;
    const trimmedHeight = Math.max(minFinalHeight, Math.ceil(usedHeight));
    if (trimmedHeight >= canvas.height) return canvas;
    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = width;
    trimmedCanvas.height = trimmedHeight;
    const trimmedCtx = trimmedCanvas.getContext('2d');
    if (!trimmedCtx) return canvas;
    trimmedCtx.imageSmoothingEnabled = false;
    trimmedCtx.drawImage(canvas, 0, 0, width, trimmedHeight, 0, 0, width, trimmedHeight);
    return trimmedCanvas;
  };

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  let y = 10;
  const mergedRowBands: Array<{ start: number; end: number }> = [];
  const title = isOrderPrint ? 'PHIẾU ORDER' : 'PHIẾU TẠM TÍNH';
  ctx.font = `bold ${titleSize}px '${RECEIPT_FONT_FAMILY}'`;
  ctx.textAlign = 'center';
  ctx.fillText(title, width / 2, y);
  y += 40;
  ctx.fillRect(marginX, y, contentWidth, 2);
  y += 12;

  ctx.font = `${bodySize}px '${RECEIPT_FONT_FAMILY}'`;
  ctx.textAlign = 'left';

  const drawLabelValue = (label: string, value: string) => {
    ensureSpace(y + contentLineHeight + 20);
    ctx.textAlign = 'left';
    const labelText = `${label}: `;
    ctx.font = `bold ${bodySize}px '${RECEIPT_FONT_FAMILY}'`;
    ctx.fillText(labelText, marginX, y);
    const labelWidth = ctx.measureText(labelText).width;
    ctx.font = `${bodySize}px '${RECEIPT_FONT_FAMILY}'`;
    ctx.fillText(value || '-', marginX + labelWidth, y);
    y += contentLineHeight;
  };

  drawLabelValue('Ngày', data.datetime || formatDateTimeVN(new Date().toISOString()));
  drawLabelValue('Mã HĐ', data.orderCode || '-');
  drawLabelValue('Vị trí', data.location || '-');
  drawLabelValue('Khách hàng', data.customerName || '-');
  drawLabelValue('Thu ngân', data.fullName || '-');

  y += 2;
  const tableTop = y;
  ctx.fillRect(marginX, y, contentWidth, 2);
  y += 10;

  ctx.font = `bold ${bodySize}px '${RECEIPT_FONT_FAMILY}'`;
  ctx.textAlign = 'center';
  ctx.fillText('#', xHashCenter, y);
  ctx.textAlign = 'left';
  ctx.fillText('Tên món', xName, y);
  ctx.textAlign = 'center';
  if (isOrderPrint) {
    ctx.fillText('ĐVT', xSlCenter, y);
    ctx.fillText('SL', xUnitCenter, y);
  } else {
    ctx.fillText('SL', xSlCenter, y);
    ctx.textAlign = 'right';
    ctx.fillText('ĐG', xUnitRight, y);
    ctx.textAlign = 'center';
    ctx.fillText('%KM', xKmCenter, y);
    ctx.textAlign = 'right';
    ctx.fillText('TT', xTotalRight, y);
  }
  y += tableLineHeight;
  ctx.fillRect(marginX, y, contentWidth, 2);
  y += 10;
  ctx.font = `${bodySize}px '${RECEIPT_FONT_FAMILY}'`;

  for (let idx = 0; idx < data.items.length; idx += 1) {
    const item = data.items[idx];
    const nameLines = wrapByWidth(ctx, (item.name || '').trim(), nameColumnWidth);
    const dgLines = isOrderPrint ? [] : wrapByWidthHard(ctx, toNumberVi(item.unitPrice), Math.max(10, colDgWidth - 8));
    const kmLines = isOrderPrint ? [] : wrapByWidthHard(ctx, toPercentVi(Number(item.discount || 0)), Math.max(10, colKmWidth - 8));
    const ttLines = isOrderPrint ? [] : wrapByWidthHard(ctx, toNumberVi(item.lineTotal), Math.max(10, colTtWidth - 8));
    const rowLineCount = isOrderPrint
      ? Math.max(1, nameLines.length)
      : Math.max(1, nameLines.length, dgLines.length, kmLines.length, ttLines.length);

    ctx.textAlign = 'center';
    ctx.fillText(String(idx + 1), xHashCenter, y);
    if (isOrderPrint) {
      ctx.textAlign = 'center';
      ctx.fillText((item.unit || '-').trim() || '-', xSlCenter, y);
      ctx.fillText(String(Math.trunc(item.quantity)), xUnitCenter, y);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.trunc(item.quantity)), xSlCenter, y);
    }

    for (let rowLineIdx = 0; rowLineIdx < rowLineCount; rowLineIdx += 1) {
      const nameLine = nameLines[rowLineIdx];
      ensureSpace(y + tableLineHeight + 20);
      ctx.textAlign = 'left';
      if (nameLine) ctx.fillText(nameLine, xName, y);
      if (!isOrderPrint) {
        const dgLine = dgLines[rowLineIdx];
        const kmLine = kmLines[rowLineIdx];
        const ttLine = ttLines[rowLineIdx];
        ctx.textAlign = 'right';
        if (dgLine) ctx.fillText(dgLine, xUnitRight, y);
        ctx.textAlign = 'center';
        if (kmLine) ctx.fillText(kmLine, xKmCenter, y);
        ctx.textAlign = 'right';
        if (ttLine) ctx.fillText(ttLine, xTotalRight, y);
      }
      y += tableLineHeight;
    }

    const itemNote = item.note?.trim();
    if (itemNote) {
      const noteBandStart = y;
      ctx.fillRect(colHashRight, y, tableRight - colHashRight, 2);
      y += 8;
      ctx.font = `italic ${noteSize}px '${RECEIPT_FONT_FAMILY}'`;
      const noteSegments = itemNote
        .split(/\r?\n/)
        .map((segment) => segment.trim())
        .filter(Boolean);
      for (const segment of noteSegments) {
        const noteLines = wrapByWidth(ctx, segment, noteColumnWidth);
        for (const noteLine of noteLines) {
          ensureSpace(y + noteLineHeight + 20);
          ctx.textAlign = 'left';
          ctx.fillText(noteLine, noteX, y);
          y += noteLineHeight;
        }
      }
      ctx.font = `${bodySize}px '${RECEIPT_FONT_FAMILY}'`;
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
    drawVerticalWithMergedBands(colKmRight, mergedRowBands);
  }
  ctx.fillRect(tableRight, tableTop, 2, tableBottom - tableTop + 2);
  y += 12;

  if (isOrderPrint) {
    y += 8;
    ensureSpace(y + contentLineHeight * 3 + 32);
    ctx.textAlign = 'center';
    ctx.fillText('Vui lòng kiểm tra kỹ lại nội dung', width / 2, y);
    y += contentLineHeight;
    ctx.fillText('trước khi chế biến', width / 2, y);
    return finalizeCanvasHeight(y + contentLineHeight + 8);
  }

  const drawSummary = (label: string, value: string) => {
    ensureSpace(y + contentLineHeight + 20);
    ctx.textAlign = 'left';
    ctx.fillText(label, xName, y);
    ctx.textAlign = 'right';
    ctx.fillText(value, xTotalRight, y);
    y += contentLineHeight;
  };

  drawSummary('Giảm giá theo món', toMoney(Math.abs(Number(data.itemDiscountTotal || 0))));
  ctx.font = `bold ${bodySize}px '${RECEIPT_FONT_FAMILY}'`;
  drawSummary('Tạm tính', toMoney(data.subtotal));
  ctx.font = `${bodySize}px '${RECEIPT_FONT_FAMILY}'`;

  const discountLabel =
    data.discountMode === 'percent'
      ? `Giảm giá hoá đơn (${toPercentVi(Number(data.discountValue || 0))}%)`
      : 'Giảm giá hoá đơn';
  const surchargeLabel =
    data.surchargeMode === 'percent'
      ? `Phí dịch vụ (${toPercentVi(Number(data.surchargeValue || 0))}%)`
      : 'Phí dịch vụ';
  const paidAmount = Math.max(0, Math.trunc(Number(data.paidAmount || 0)));
  const changeAmount = Math.max(0, paidAmount - Math.max(0, Math.trunc(Number(data.total || 0))));
  const debtAmount = Math.max(0, Math.max(0, Math.trunc(Number(data.total || 0))) - paidAmount);
  const paymentMethodLabel = data.paymentMethod === 'BANKING' ? 'Chuyển khoản' : 'Tiền mặt';

  drawSummary(discountLabel, toMoney(Math.abs(data.discount)));
  drawSummary(surchargeLabel, toMoney(data.surcharge));

  y += 10;
  ctx.font = `bold ${totalAmountSize}px '${RECEIPT_FONT_FAMILY}'`;
  drawSummary('THANH TOÁN', toMoney(data.total));
  ctx.font = `${bodySize}px '${RECEIPT_FONT_FAMILY}'`;

  ctx.fillRect(marginX, y, contentWidth, 2);
  y += 14;
  drawSummary(paymentMethodLabel, toMoney(paidAmount));
  ctx.font = `bold ${bodySize}px '${RECEIPT_FONT_FAMILY}'`;
  drawSummary('Trả lại khách', toMoney(changeAmount));
  ctx.fillRect(marginX, y, contentWidth, 2);
  y += 14;
  ctx.font = `bold ${bodySize}px '${RECEIPT_FONT_FAMILY}'`;
  drawSummary('Khách nợ', toMoney(debtAmount));
  ctx.font = `${bodySize}px '${RECEIPT_FONT_FAMILY}'`;

  y += 32;
  ensureSpace(y + contentLineHeight * 3 + 32);
  ctx.textAlign = 'center';
  ctx.fillText('Vui lòng kiểm tra kỹ lại nội dung', width / 2, y);
  y += contentLineHeight;
  ctx.fillText('trước khi thanh toán', width / 2, y);

  return finalizeCanvasHeight(y + contentLineHeight + 8);
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
  const STRIP_HEIGHT = 250;

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
  await assertReceiptFontLoaded();
  const canvas = buildReceiptCanvas(data);
  return buildImageEscPosBytesFromCanvas(canvas);
};
