const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const printA4PlainText = async (title: string, content: string) => {
  const escapedTitle = escapeHtml(title);
  const escapedContent = escapeHtml(content);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = iframe.contentDocument;
  if (!frameWindow || !frameDocument) {
    document.body.removeChild(iframe);
    throw new Error('Không khởi tạo được phiên in A4');
  }

  frameDocument.open();
  frameDocument.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapedTitle}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        font-family: 'Times New Roman', serif;
        color: #000;
        background: #fff;
        padding: 12mm;
      }
      .a4-sheet {
        width: 100%;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 22px;
        text-align: center;
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: 'Times New Roman', serif;
        font-size: 16px;
        line-height: 1.45;
      }
      @media print {
        body { padding: 0; }
      }
    </style>
  </head>
  <body>
    <article class="a4-sheet">
      <h1>${escapedTitle}</h1>
      <pre>${escapedContent}</pre>
    </article>
  </body>
</html>`);
  frameDocument.close();

  await new Promise<void>((resolve) => {
    let handled = false;
    const cleanup = () => {
      if (handled) return;
      handled = true;
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
      resolve();
    };

    const triggerPrint = () => {
      frameWindow.focus();
      frameWindow.print();
      const timeoutId = window.setTimeout(cleanup, 1500);
      frameWindow.onafterprint = () => {
        window.clearTimeout(timeoutId);
        cleanup();
      };
    };

    if (frameDocument.readyState === 'complete') {
      triggerPrint();
      return;
    }

    iframe.onload = () => triggerPrint();
    window.setTimeout(triggerPrint, 500);
  });
};
