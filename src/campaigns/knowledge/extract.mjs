import process from 'node:process';
import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
// Bounded child process. Input bytes only; never URLs, scripts or attachments.
import { unzipSync } from 'fflate';
import { parse } from 'csv-parse/sync';
globalThis.fetch = () => {
  throw Error('EXTERNAL_FETCH_DISABLED');
};
const chunks = [];
let size = 0;
for await (const c of process.stdin) {
  size += c.length;
  if (size > 3000000) process.exit(2);
  chunks.push(c);
}
try {
  const { format, base64 } = JSON.parse(Buffer.concat(chunks).toString('utf8')),
    bytes = Buffer.from(base64, 'base64');
  if (bytes.length > 2097152) throw Error('FILE_TOO_LARGE');
  let text = '';
  const utf8 = (b) => new TextDecoder('utf-8', { fatal: true }).decode(b);
  if (['txt', 'md', 'csv'].includes(format)) {
    text = utf8(bytes);
    if (
      [...text].some((c) => c.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(c)) ||
      /<(?:script|iframe|html)|<!DOCTYPE|<!ENTITY/i.test(text)
    )
      throw Error('UNSAFE_TEXT');
    if (format === 'csv') {
      const rows = parse(text, { bom: true, max_record_size: 8000, skip_empty_lines: true });
      if (
        rows.length > 1000 ||
        rows.some((r) => r.length > 30 || r.some((v) => /^\s*[=+@-]/.test(v)))
      )
        throw Error('UNSAFE_CSV');
      text = rows.map((r) => r.join(' | ')).join('\n');
    }
  } else if (format === 'docx') {
    if (bytes.readUInt32LE(0) !== 0x04034b50) throw Error('INVALID_DOCX');
    let files = 0,
      total = 0;
    const out = unzipSync(bytes, {
      filter: (f) => {
        files++;
        total += f.originalSize;
        if (
          files > 200 ||
          total > 8000000 ||
          f.originalSize > 2000000 ||
          f.name.includes('..') ||
          f.name.startsWith('/') ||
          /vbaProject|embeddings|activeX/i.test(f.name)
        )
          throw Error('UNSAFE_DOCX');
        return f.name === 'word/document.xml' || f.name === '[Content_Types].xml';
      },
    });
    if (!out['word/document.xml'] || !out['[Content_Types].xml']) throw Error('INVALID_DOCX');
    const xml = utf8(out['word/document.xml']);
    if (/<!DOCTYPE|<!ENTITY|<w:altChunk|INCLUDETEXT|DDEAUTO/i.test(xml)) throw Error('UNSAFE_DOCX');
    text = xml
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:tab[^>]*\/>/g, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  } else if (format === 'pdf') {
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw Error('INVALID_PDF');
    if (/\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|Encrypt)\b/.test(bytes.toString('latin1')))
      throw Error('UNSAFE_PDF');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      disableAutoFetch: true,
      disableStream: true,
      verbosity: 0,
    });
    const pdf = await task.promise;
    if (pdf.numPages > 100) throw Error('PDF_PAGE_LIMIT');
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const p = await pdf.getPage(i),
        content = await p.getTextContent();
      pages.push(content.items.map((x) => x.str ?? '').join(' '));
      if (pages.join('\n').length > 100000) throw Error('EXTRACTED_TEXT_LIMIT');
      p.cleanup();
    }
    text = pages.join('\n');
    await task.destroy();
  } else throw Error('UNSUPPORTED_FORMAT');
  text = text.normalize('NFKC').replace(/\r\n?/g, '\n').trim();
  if (!text) throw Error('NO_READABLE_TEXT');
  if (text.length > 100000) throw Error('EXTRACTED_TEXT_LIMIT');
  process.stdout.write(JSON.stringify({ text }));
} catch (e) {
  process.stdout.write(
    JSON.stringify({
      error: String(e.message).match(/^[A-Z_]{3,50}$/)?.[0] ?? 'EXTRACTION_FAILED',
    }),
  );
  process.exitCode = 1;
}
