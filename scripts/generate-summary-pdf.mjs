import fs from 'fs';
import path from 'path';

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/generate-summary-pdf.mjs <input.md> <output.pdf>');
  process.exit(1);
}

const pageWidth = 595.28;
const pageHeight = 841.89;
const marginLeft = 54;
const marginRight = 54;
const marginTop = 58;
const marginBottom = 58;
const maxWidth = pageWidth - marginLeft - marginRight;

const raw = fs.readFileSync(inputPath, 'utf8').replace(/\r\n/g, '\n');
const sourceLines = raw.split('\n');

function escapePdfText(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function estimateWidth(text, fontSize) {
  return text.length * fontSize * 0.52;
}

function wrapText(text, fontSize, indent = 0) {
  const availableWidth = maxWidth - indent;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [''];
  }

  const lines = [];
  let current = words[0];

  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (estimateWidth(candidate, fontSize) <= availableWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }

  lines.push(current);
  return lines;
}

function markdownToBlocks(lines) {
  const blocks = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      blocks.push({ type: 'spacer', height: 8 });
      continue;
    }

    if (trimmed.startsWith('# ')) {
      blocks.push({
        type: 'text',
        text: trimmed.slice(2),
        font: 'F2',
        fontSize: 22,
        leading: 28,
        indent: 0,
        gapBefore: 8,
        gapAfter: 8,
      });
      continue;
    }

    if (trimmed.startsWith('## ')) {
      blocks.push({
        type: 'text',
        text: trimmed.slice(3),
        font: 'F2',
        fontSize: 15,
        leading: 20,
        indent: 0,
        gapBefore: 10,
        gapAfter: 4,
      });
      continue;
    }

    if (trimmed.startsWith('### ')) {
      blocks.push({
        type: 'text',
        text: trimmed.slice(4),
        font: 'F2',
        fontSize: 12,
        leading: 16,
        indent: 0,
        gapBefore: 6,
        gapAfter: 2,
      });
      continue;
    }

    if (trimmed.startsWith('- ')) {
      blocks.push({
        type: 'bullet',
        text: trimmed.slice(2),
        font: 'F1',
        fontSize: 10.5,
        leading: 14,
        indent: 18,
        bulletIndent: 0,
        gapBefore: 0,
        gapAfter: 0,
      });
      continue;
    }

    blocks.push({
      type: 'text',
      text: trimmed.replace(/`/g, ''),
      font: 'F1',
      fontSize: 10.5,
      leading: 14,
      indent: 0,
      gapBefore: 0,
      gapAfter: 0,
    });
  }

  return blocks;
}

function blocksToPages(blocks) {
  const pages = [];
  let page = [];
  let y = pageHeight - marginTop;

  function newPage() {
    if (page.length > 0) {
      pages.push(page);
    }
    page = [];
    y = pageHeight - marginTop;
  }

  for (const block of blocks) {
    if (block.type === 'spacer') {
      if (y - block.height < marginBottom) {
        newPage();
      }
      y -= block.height;
      continue;
    }

    const wrapped = wrapText(block.text, block.fontSize, block.indent);
    const totalHeight =
      (block.gapBefore || 0) +
      wrapped.length * block.leading +
      (block.gapAfter || 0);

    if (y - totalHeight < marginBottom) {
      newPage();
    }

    y -= block.gapBefore || 0;

    wrapped.forEach((line, index) => {
      const text = block.type === 'bullet' && index === 0 ? `- ${line}` : line;
      const indent =
        block.type === 'bullet' && index > 0 ? block.indent : (block.bulletIndent || 0);

      page.push({
        text,
        font: block.font,
        fontSize: block.fontSize,
        x: marginLeft + indent,
        y,
      });

      y -= block.leading;
    });

    y -= block.gapAfter || 0;
  }

  if (page.length > 0) {
    pages.push(page);
  }

  return pages;
}

function buildContentStream(pageLines, pageNumber, totalPages) {
  const commands = [];

  for (const line of pageLines) {
    commands.push(
      'BT',
      `/${line.font} ${line.fontSize} Tf`,
      `1 0 0 1 ${line.x.toFixed(2)} ${line.y.toFixed(2)} Tm`,
      `(${escapePdfText(line.text)}) Tj`,
      'ET',
    );
  }

  commands.push(
    'BT',
    '/F1 9 Tf',
    `1 0 0 1 ${pageWidth - marginRight - 70} ${marginBottom - 18} Tm`,
    `(${escapePdfText(`Pagina ${pageNumber} de ${totalPages}`)}) Tj`,
    'ET',
  );

  return commands.join('\n');
}

function buildPdf(pages) {
  const objects = [];

  function addObject(content) {
    objects.push(content);
    return objects.length;
  }

  const catalogId = addObject('');
  const pagesId = addObject('');
  const fontRegularId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontBoldId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  const pageIds = [];

  pages.forEach((pageLines, index) => {
    const content = buildContentStream(pageLines, index + 1, pages.length);
    const contentId = addObject(
      `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
    );
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

const blocks = markdownToBlocks(sourceLines);
const pages = blocksToPages(blocks);
const pdf = buildPdf(pages);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, pdf, 'binary');
