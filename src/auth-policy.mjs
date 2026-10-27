export function hasGoogleIdentity(value) {
  return Boolean(value && !value.is_anonymous && value.email && Array.isArray(value.identities)
    && value.identities.some(identity => identity?.provider === 'google'));
}

export function authUserKey(value) {
  return value ? `${value.id}|${value.email || ''}|${Boolean(value.is_anonymous)}|${hasGoogleIdentity(value)}` : '';
}

export function googleOAuthQuery(emailHint) {
  const hint = emailHint?.trim();
  if (hint && (hint.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hint))) throw new Error('Nhập email Google hợp lệ.');
  return hint ? {login_hint:hint} : {prompt:'select_account'};
}
