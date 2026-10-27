export function hasGoogleIdentity(value) {
  return Boolean(value && !value.is_anonymous && value.email && Array.isArray(value.identities)
    && value.identities.some(identity => identity?.provider === 'google'));
}

export function authUserKey(value) {
  return value ? `${value.id}|${value.email || ''}|${Boolean(value.is_anonymous)}|${hasGoogleIdentity(value)}` : '';
}
