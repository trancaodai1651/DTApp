import { isTauri, invoke } from '@tauri-apps/api/core';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { openUrl } from '@tauri-apps/plugin-opener';

export const isDesktop = () => isTauri();

export async function openDesktopOAuth(url: string) {
  const validated = await invoke<string>('validate_oauth_url', { url });
  await openUrl(validated);
}

export async function subscribeDesktopOAuth(callback: (url: string) => void): Promise<() => void> {
  if (!isDesktop()) return () => {};
  const accept = (urls: string[]) => urls.filter(url => url.startsWith('dtapp://auth/callback')).forEach(callback);
  const unsubscribe = await onOpenUrl(accept);
  accept(await getCurrent() || []);
  return unsubscribe;
}
