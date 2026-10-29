import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from '../desktop';
import { configuredClient } from '../cloud';
import { hasGoogleIdentity } from '../auth-policy.mjs';

export interface DouyinChannel {
  id: string; url: string; name: string; notes: string; tags: string; favorite: boolean;
  monitor: boolean; interval: number; lastCheck: number | null; nextCheck: number | null;
  status: string; videoCount: number; failures: number;
}
export interface DouyinVideo {
  qualityVerified?: boolean; downloadWidth?: number; downloadHeight?: number;
  id: string; title: string; url: string; author: string; createdAt: number | null;
  channelId: string; duration: number; isImage: boolean; file: string; dubbedFile: string;
  width?: number; height?: number; bitRate?: number; voiceMode?: 'narration' | 'dub';
}
export interface MediaJob {
  id: string; kind: string; state: string; progress: number; message: string;
  output: string; resultIds?: string[]; createdAt: number;
  transcript?: string; detectedLanguage?: string; referenceAudio?: string; referenceText?: string;
}
export interface MediaSettings { downloadDir: string; voicePython: string; device: string; interval: number; browserVisible: boolean }
export interface MediaSnapshot {
  channels: DouyinChannel[]; videos: DouyinVideo[]; jobs: MediaJob[]; settings: MediaSettings;
  runtime: { browserInstalled: boolean; browserBundled?: boolean; guestOpen: boolean; voiceConfigured: boolean; speech?: { ready:boolean; supported:boolean; message:string; bundled:boolean; backend:string; cudaSupported:boolean }; dataDir: string };
}

export async function mediaRequest<T = unknown>(command: string, payload: unknown = {}): Promise<T> {
  if (!isDesktop()) throw new Error('Chức năng tải và lồng tiếng cần bản desktop Tauri của DT App.');
  const client = configuredClient();
  if (!client) throw new Error('Chưa cấu hình đăng nhập Google.');
  const { data, error } = await client.auth.getSession();
  if (error || !data.session || !hasGoogleIdentity(data.session.user)) throw new Error('Cần đăng nhập Google để sử dụng DT App.');
  return invoke<T>('media_request', { command, payload, accessToken:data.session.access_token });
}

export async function lockMediaSession(): Promise<void> {
  if (isDesktop()) await invoke('media_request', {command:'lock_session', payload:{}, accessToken:null});
}
