import { spawn } from 'node:child_process';
import path from 'node:path';
export function extractDocument(format: string, bytes: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--max-old-space-size=128', path.join(process.cwd(), 'src/campaigns/knowledge/extract.mjs')],
      {
        stdio: ['pipe', 'pipe', 'ignore'],
        env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production' },
      },
    );
    let output = '',
      ended = false;
    const end = (error?: Error, text?: string) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(text!);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      end(Error('EXTRACTION_TIMEOUT'));
    }, 12000);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.length > 700000) {
        child.kill('SIGKILL');
        end(Error('EXTRACTED_TEXT_LIMIT'));
      }
    });
    child.on('error', () => end(Error('EXTRACTION_FAILED')));
    child.stdin.on('error', () => end(Error('EXTRACTION_FAILED')));
    child.on('close', () => {
      try {
        const d = JSON.parse(output);
        if (d.error || typeof d.text !== 'string') end(Error(d.error ?? 'EXTRACTION_FAILED'));
        else end(undefined, d.text);
      } catch {
        end(Error('EXTRACTION_FAILED'));
      }
    });
    child.stdin.end(JSON.stringify({ format, base64: bytes.toString('base64') }));
  });
}
