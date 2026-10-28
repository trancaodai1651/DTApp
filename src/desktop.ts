import { isTauri, invoke } from '@tauri-apps/api/core';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { openUrl } from '@tauri-apps/plugin-opener';

export const isDesktop = () => isTauri();

export type OAuthBrowser = 'default' | 'edge';

export function supportsEdgeOAuth() {
  return isDesktop() && /Windows/i.test(navigator.userAgent);
}

export async function openDesktopOAuth(url: string, browser: OAuthBrowser = 'default') {
  const validated = await invoke<string>('validate_oauth_url', { url });
  if (browser === 'edge' && !supportsEdgeOAuth()) throw new Error('Microsoft Edge chỉ được hỗ trợ cho đăng nhập trên Windows.');
  await openUrl(validated, browser === 'edge' ? 'msedge' : undefined);
}

export async function subscribeDesktopOAuth(callback: (url: string) => void): Promise<() => void> {
  if (!isDesktop()) return () => {};
  const accept = (urls: string[]) => urls.filter(url => url.startsWith('dtapp://auth/callback')).forEach(callback);
  const unsubscribe = await onOpenUrl(accept);
  accept(await getCurrent() || []);
  return unsubscribe;
}
