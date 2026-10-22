import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidBioSlug, normalizeBioSlug } from '../src/bio-slug.mjs';

test('normalizes Vietnamese names into readable URL slugs', () => {
  assert.equal(normalizeBioSlug('Tạp Hoá ĐT - Cửa Hàng!'), 'tap-hoa-dt-cua-hang');
});

test('slug validation rejects reserved, malformed, and out-of-range values', () => {
  assert.equal(isValidBioSlug('tap-hoa-dt'), true);
  assert.equal(isValidBioSlug('users'), false);
  assert.equal(isValidBioSlug('has space'), false);
  assert.equal(isValidBioSlug('ab'), false);
  assert.equal(isValidBioSlug('a'.repeat(49)), false);
});
