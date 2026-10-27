import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from '../server/node_modules/sharp/lib/index.js';
import { createApp, decodeImage, validateSuggestions } from '../server/app.mjs';
import { nameFromFile, localSuggestions } from '../src/suggestions.mjs';

async function withServer(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
test('does not invent product identification from a generic camera filename', () => {
  assert.equal(nameFromFile('IMG_2344.jpg'), '');
  assert.equal(nameFromFile('chai-tinh_dau.png'), 'chai tinh dau');
  const output = localSuggestions({ fileName: 'IMG_2344.jpg', category: 'Công nghệ' });
  assert.equal(output.source, 'local'); assert.equal(output.names.length, 3);
  assert.ok(output.descriptions.every(text => !text.includes('IMG')));
});
test('rejects URLs, SVG and malformed image data on API boundary', () => {
  assert.throws(() => decodeImage('https://example.com/photo.png'));
  assert.throws(() => decodeImage('data:image/svg+xml;base64,AAAA'));
  assert.throws(() => decodeImage('data:image/png;base64,!!!'));
  assert.throws(() => validateSuggestions({ names: ['A'], descriptions: ['B'] }));
});
test('access token and origin allowlist protect both AI routes', async () => {
  await withServer(createApp({ accessToken: 'private-test-token' }), async base => {
    assert.equal((await fetch(`${base}/api/health`)).status, 401);
    assert.equal((await fetch(`${base}/api/health`, { headers: { Authorization: 'Bearer private-test-token' } })).status, 200);
    assert.equal((await fetch(`${base}/api/health`, { headers: { Origin: 'https://untrusted.invalid', Authorization: 'Bearer private-test-token' } })).status, 403);
    const preflight = await fetch(`${base}/api/remove-background`, { method: 'OPTIONS', headers: { Origin: 'app://dt' } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'app://dt');
    const pagesPreflight = await fetch(`${base}/api/suggestions`, { method: 'OPTIONS', headers: { Origin: 'https://trancaodai1651.github.io' } });
    assert.equal(pagesPreflight.status, 204); assert.equal(pagesPreflight.headers.get('access-control-allow-origin'), 'https://trancaodai1651.github.io');
    for (const origin of ['tauri://localhost', 'http://tauri.localhost', 'http://127.0.0.1:1420']) {
      const tauriPreflight = await fetch(`${base}/api/suggestions`, { method: 'OPTIONS', headers: { Origin: origin } });
      assert.equal(tauriPreflight.status, 204);
      assert.equal(tauriPreflight.headers.get('access-control-allow-origin'), origin);
    }
  });
});
test('missing provider key produces an actionable error without fabricated AI content', async () => {
  await withServer(createApp(), async base => {
    const response = await fetch(`${base}/api/suggestions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: 'data:image/png;base64,AAAA' }) });
    assert.equal(response.status, 503); assert.match((await response.json()).error, /OPENAI_API_KEY/);
  });
});
test('vision adapter sends image and strict schema, validates provider output', async () => {
  const expected = { names: ['Chai tinh dầu', 'Tinh dầu Mộc', 'Khoảnh khắc dịu dàng'], descriptions: ['Một lựa chọn cho góc nhỏ của bạn.', 'Thêm chút cảm hứng mỗi ngày.', 'Khám phá một nét riêng.'] };
  await withServer(createApp({ aiKey: 'test-key', aiModel: 'test-vision' }, { fetch: async (url, options) => {
    assert.ok(url.endsWith('/responses'));
    const body = JSON.parse(options.body); assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
    assert.equal(body.input[0].content[1].type, 'input_image');
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(expected) }] }] });
  } }), async base => {
    const response = await fetch(`${base}/api/suggestions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: 'data:image/png;base64,AAAA' }) });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ...expected, source: 'ai' });
  });
});
test('uses a per-request Claude API key without requiring or persisting a server key', async () => {
  const expected = { names: ['Mộc lành', 'Tinh dầu an nhiên', 'Hương dịu'], descriptions: ['Một chút thư thái cho ngày mới.', 'Hương thơm nhẹ nhàng cho không gian nhỏ.', 'Gợi cảm giác bình yên mỗi ngày.'] };
  let upstreamCalls = 0;
  await withServer(createApp({}, { fetch: async (url, options) => {
    upstreamCalls++;
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(options.headers['x-api-key'], 'client-owned-key');
    assert.equal(options.headers['anthropic-version'], '2023-06-01');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'claude-sonnet-5');
    assert.equal(body.messages[0].content[1].source.type, 'base64');
    assert.equal(body.messages[0].content[1].source.media_type, 'image/png');
    assert.equal(body.output_config.format.type, 'json_schema');
    assert.equal(body.output_config.format.schema.properties.names.maxItems, undefined);
    return Response.json({ content: [{ type: 'text', text: JSON.stringify(expected) }] });
  } }), async base => {
    const response = await fetch(`${base}/api/suggestions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      image: 'data:image/png;base64,AAAA', name: '', category: 'Đồ thủ công', description: '', language: 'vi',
      ai: { provider: 'anthropic', apiKey: 'client-owned-key', model: '' },
    }) });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ...expected, source: 'ai' });
    const invalid = await fetch(`${base}/api/suggestions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: 'data:image/png;base64,AAAA', ai: { provider: 'custom', apiKey: 'bad' } }) });
    assert.equal(invalid.status, 400);
  });
  assert.equal(upstreamCalls, 1);
});
test('real U2Net inference creates transparent PNG and preserves a visible product', { timeout: 90000 }, async () => {
  const sample = await sharp(await readFile(new URL('../public/sample-product.svg', import.meta.url))).flatten({ background: '#e8e4dc' }).jpeg().toBuffer();
  await withServer(createApp(), async base => {
    const response = await fetch(`${base}/api/remove-background`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: `data:image/jpeg;base64,${sample.toString('base64')}` }) });
    assert.equal(response.status, 200);
    const output = await response.json(); assert.ok(output.image.startsWith('data:image/png;base64,'));
    const image = await sharp(Buffer.from(output.image.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transparent = 0, opaque = 0, retainedCap = 0;
    for (let i = 3; i < image.data.length; i += 4) {
      if (image.data[i] < 15) transparent++;
      if (image.data[i] > 220) { opaque++; if (image.data[i - 3] < 90 && image.data[i - 2] < 110 && image.data[i - 1] < 90) retainedCap++; }
    }
    const pixels = image.info.width * image.info.height;
    assert.ok(transparent > pixels * .15, `expected background transparency, got ${transparent}/${pixels}`);
    assert.ok(opaque > pixels * .1, `expected retained product, got ${opaque}/${pixels}`);
    assert.ok(retainedCap > 10000, `expected retained dark bottle cap, got ${retainedCap} pixels`);
    let capWidth = 0;
    for (let x = 0; x < image.info.width; x++) if (image.data[(40 * image.info.width + x) * 4 + 3] > 128) capWidth++;
    assert.ok(capWidth >= 155 && capWidth <= 190, `non-square image mask must preserve the 172px cap width, got ${capWidth}`);
    assert.ok(output.width > 100 && output.height > 200);
  });
});
