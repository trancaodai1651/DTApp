import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const modelDir = path.join(root, 'server/models');
await mkdir(modelDir, { recursive: true });
const modelFile = path.join(modelDir, 'u2net.onnx');
const expectedMd5 = '60024c5c889badc19c04ad937298a77b';
const matches = data => createHash('md5').update(data).digest('hex') === expectedMd5;
let present = false;
try { present = matches(await readFile(modelFile)); } catch {}
if (!present) {
  console.log('Downloading U²-Net model (176 MB) from the rembg release…');
  const response = await fetch('https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx', { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (!matches(data)) throw new Error('U²-Net model checksum mismatch. Refusing an unverified file.');
  await writeFile(`${modelFile}.tmp`, data);
  await rename(`${modelFile}.tmp`, modelFile);
}
console.log('Server AI model ready.');
