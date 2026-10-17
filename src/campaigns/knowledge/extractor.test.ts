import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { extractDocument } from './extractor';

function pdf() {
  const stream='BT /F1 12 Tf 72 720 Td (Synthetic document extraction only) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let body='%PDF-1.4\n'; const offsets=[0];
  objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(body));body+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
  const xref=Buffer.byteLength(body);
  body+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
  return Buffer.from(body+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
}
test('five deterministic document formats extract without network; unsafe inputs fail closed',async()=>{
  for(const format of ['txt','md']) assert.match(await extractDocument(format,Buffer.from('Synthetic document evidence')),/Synthetic document/);
  assert.match(await extractDocument('csv',Buffer.from('name,value\nSynthetic,42')),/Synthetic \| 42/);
  const docx=Buffer.from(zipSync({'[Content_Types].xml':strToU8('<Types/>'),'word/document.xml':strToU8('<w:document><w:p><w:r><w:t>Synthetic DOCX evidence</w:t></w:r></w:p></w:document>')}));
  assert.match(await extractDocument('docx',docx),/Synthetic DOCX/);
  assert.match(await extractDocument('pdf',pdf()),/Synthetic document/);
  await assert.rejects(extractDocument('csv',Buffer.from('name,value\nunsafe,=1+1')),/UNSAFE_CSV/);
  await assert.rejects(extractDocument('txt',Buffer.from('<script>bad</script>')),/UNSAFE_TEXT/);
  await assert.rejects(extractDocument('pdf',Buffer.from('%PDF-1.4 /JavaScript')),/UNSAFE_PDF/);
});
