const reservedSlugs = new Set(['api', 'bio', 'dashboard', 'editor', 'users', 'assets']);

export function normalizeBioSlug(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

export function isValidBioSlug(value) {
  return typeof value === 'string'
    && value.length >= 3
    && value.length <= 48
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
    && !reservedSlugs.has(value);
}
