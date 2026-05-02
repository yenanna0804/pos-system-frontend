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
  items: Receipt80mmItem[];
  subtotal: number;
  discount: number;
  surcharge: number;
  total: number;
};

declare global {
  interface Window {
    Receipt?: {
      from: (markdown: string, options?: string) => {
        toCommand: () => Promise<string>;
        toSVG?: () => Promise<string>;
      };
    };
    ReceiptPrinter?: {
      create: (name: string) => unknown;
    };
  }
}

const RECEIPT_SCRIPT_URL = '/vendor/receiptjs/receipt.js';
const RECEIPT_PRINTER_SCRIPT_URL = '/vendor/receiptjs/receipt-printer.js';

let receiptLibLoadingPromise: Promise<void> | null = null;

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-receiptjs-src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed loading script: ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.receiptjsSrc = src;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed loading script: ${src}`));
    document.head.appendChild(script);
  });

const ensureReceiptLib = async () => {
  if (!window.Receipt) {
    const receiptFromEval = window.eval('typeof Receipt !== "undefined" ? Receipt : undefined') as typeof window.Receipt;
    if (receiptFromEval) {
      window.Receipt = receiptFromEval;
    }
  }
  if (window.Receipt) return;
  if (!receiptLibLoadingPromise) {
    receiptLibLoadingPromise = (async () => {
      await loadScript(RECEIPT_SCRIPT_URL);
      await loadScript(RECEIPT_PRINTER_SCRIPT_URL);
      const receiptFromEval = window.eval('typeof Receipt !== "undefined" ? Receipt : undefined') as typeof window.Receipt;
      const printerFromEval = window.eval('typeof ReceiptPrinter !== "undefined" ? ReceiptPrinter : undefined') as typeof window.ReceiptPrinter;
      if (receiptFromEval) {
        window.Receipt = receiptFromEval;
      }
      if (printerFromEval) {
        window.ReceiptPrinter = printerFromEval;
      }
      if (!window.Receipt?.from) {
        throw new Error('Receipt.js not available after loading scripts');
      }
    })();
  }
  await receiptLibLoadingPromise;
};

const toMoney = (value: number) => `${Math.trunc(value).toLocaleString('vi-VN')}đ`;
const toNumberVi = (value: number) => Math.trunc(value).toLocaleString('vi-VN');

const splitName = (name: string, max = 18) => {
  const normalized = (name || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return ['-'];
  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    if (!current) {
      current = word;
      return;
    }
    if (`${current} ${word}`.length <= max) {
      current = `${current} ${word}`;
      return;
    }
    lines.push(current);
    current = word;
  });

  if (current) lines.push(current);

  const finalLines: string[] = [];
  lines.forEach((line) => {
    if (line.length <= max) {
      finalLines.push(line);
      return;
    }
    let cursor = 0;
    while (cursor < line.length) {
      finalLines.push(line.slice(cursor, cursor + max));
      cursor += max;
    }
  });
  return finalLines;
};

const buildReceiptMarkdown = (data: Receipt80mmData) => {
  const lines: string[] = [];
  lines.push('^^^"PHIẾU TẠM TÍNH"');
  lines.push('');
  lines.push('{width: 10 *}');
  lines.push('');
  lines.push(`Ngày:     |${data.datetime || new Date().toLocaleString('vi-VN')}`);
  lines.push(`Mã HĐ:    |${data.orderCode || '-'}`);
  lines.push(`Vị trí:   |${data.location || '-'}`);
  lines.push(`Khách:    |${data.customerName || '-'}`);
  if (data.cashier) lines.push(`Thu ngân: |${data.cashier}`);
  lines.push('-');
  lines.push('{width:2 * 2 10 11; border:space}');
  lines.push('| "#" |"Tên món"        |"SL"|"ĐG"|"TT"|');
  lines.push('-');

  data.items.forEach((item, index) => {
    const nameLines = splitName(item.name, 14);
    const unit = toNumberVi(item.unitPrice);
    const total = toNumberVi(item.lineTotal);
    const firstName = nameLines[0].padEnd(14, ' ');
    const qty = String(Math.trunc(item.quantity)).padStart(2, ' ');
    lines.push(`| ${String(index + 1).padStart(1, ' ')} |${firstName}|${qty}|${unit.padStart(10, ' ')}|${total.padStart(11, ' ')}`);
    for (let i = 1; i < nameLines.length; i += 1) {
      lines.push(`|   |${nameLines[i].padEnd(14, ' ')}|  |          |           `);
    }
    if (item.note?.trim()) {
      const notes = splitName(`*${item.note.trim()}`, 14);
      notes.forEach((note) => lines.push(`|   |${note.padEnd(14, ' ')}|  |          |           `));
    }
  });

  lines.push('-');
  lines.push('{width:* 12; border:space}');
  lines.push(`Tạm tính       |${toNumberVi(data.subtotal).padStart(12, ' ')}`);
  lines.push(`Giảm giá       |${toNumberVi(Math.abs(data.discount)).padStart(12, ' ')}`);
  lines.push(`Phụ phí        |${toNumberVi(data.surcharge).padStart(12, ' ')}`);
  lines.push('-');
  lines.push(`"THANH TOÁN" | "${toMoney(data.total)}"`);
  lines.push('');
  lines.push('{width:*, align:center}');
  lines.push('Vui lòng kiểm tra kỹ lại nội dung trước khi thanh toán');
  lines.push('===');
  return lines.join('\n');
};

const commandToBytes = (command: string) => {
  const bytes = new Uint8Array(command.length);
  for (let i = 0; i < command.length; i += 1) {
    bytes[i] = command.charCodeAt(i) & 0xff;
  }
  return bytes;
};

export const buildReceipt80mmEscPosBytes = async (data: Receipt80mmData) => {
  await ensureReceiptLib();
  const markdown = buildReceiptMarkdown(data);
  const receipt = window.Receipt?.from(markdown, '-p escpos -c 38 -l en');
  if (!receipt) {
    throw new Error('Receipt.js is not initialized');
  }
  const command = await receipt.toCommand();
  return commandToBytes(command);
};

export const buildEscPosBytesFromReceiptMarkdown = async (markdown: string) => {
  await ensureReceiptLib();
  const receipt = window.Receipt?.from(markdown, '-p escpos -c 38 -l en');
  if (!receipt) {
    throw new Error('Receipt.js is not initialized');
  }
  const command = await receipt.toCommand();
  return commandToBytes(command);
};
