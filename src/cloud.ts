import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { Poster } from './model';
import type { SavedProject } from './storage';
import { sanitizeSalesChannels, type BioProfile } from './sales-channels';

export interface CloudConfig { url: string; anonKey: string }
export interface CloudBio extends BioProfile { shareId: string; isPublished: boolean }
const CONFIG_KEY = 'dt.supabase';
// Supabase publishable keys are intended for browser clients. RLS and the
// private storage policies in the migration protect each user's poster data.
const DEFAULT_CLOUD_CONFIG: CloudConfig = {
  url: 'https://xpdosyzwdvfnxzwyjwur.supabase.co',
  anonKey: 'sb_publishable_EBTRELqnk_6QjoGmebV0GA_SxNSQY5h',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let activeConfig = '';
let activeClient: SupabaseClient | null = null;

export function readCloudConfig(): CloudConfig {
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') as Partial<CloudConfig>;
    return { url: stored.url || DEFAULT_CLOUD_CONFIG.url, anonKey: stored.anonKey || DEFAULT_CLOUD_CONFIG.anonKey };
  } catch { return DEFAULT_CLOUD_CONFIG; }
}

export function configureCloud(config: CloudConfig, persist = true): SupabaseClient {
  const url = new URL(config.url.trim());
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.username || url.password || url.search || url.hash) throw new Error('Nhập Project URL HTTPS hợp lệ từ Supabase.');
  const anonKey = config.anonKey.trim();
  if (anonKey.length < 20) throw new Error('Nhập publishable key hoặc anon key của project Supabase.');
  const normalized = { url: url.origin, anonKey };
  const identity = `${normalized.url}|${normalized.anonKey}`;
  if (activeClient && activeConfig === identity) return activeClient;
  activeConfig = identity;
  activeClient = createClient(normalized.url, normalized.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'dt-poster-supabase-auth' } });
  if (persist) localStorage.setItem(CONFIG_KEY, JSON.stringify(normalized));
  return activeClient;
}

export function configuredClient(): SupabaseClient | null {
  const config = readCloudConfig();
  if (!config.url || !config.anonKey) return null;
  try { return configureCloud(config, false); } catch { return null; }
}

export async function readCloudBio(client: SupabaseClient, user: User): Promise<CloudBio | null> {
  const { data, error } = await client.from('bio_pages').select('share_id,name,description,channels,is_published').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    shareId: data.share_id,
    name: typeof data.name === 'string' ? data.name.slice(0, 60) : 'Tạp Hoá DT',
    description: typeof data.description === 'string' ? data.description.slice(0, 240) : '',
    channels: sanitizeSalesChannels(data.channels),
    isPublished: data.is_published === true,
  };
}

export async function saveCloudBio(client: SupabaseClient, user: User, bio: BioProfile, previousShareId: string | null, publish: boolean): Promise<CloudBio> {
  const shareId = previousShareId && UUID.test(previousShareId) ? previousShareId : crypto.randomUUID();
  const { data, error } = await client.from('bio_pages').upsert({
    user_id: user.id,
    share_id: shareId,
    name: bio.name.trim().slice(0, 60) || 'Tạp Hoá DT',
    description: bio.description.trim().slice(0, 240),
    channels: sanitizeSalesChannels(bio.channels),
    is_published: publish,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }).select('share_id,name,description,channels,is_published').single();
  if (error) throw error;
  return {
    shareId: data.share_id,
    name: data.name,
    description: data.description,
    channels: sanitizeSalesChannels(data.channels),
    isPublished: data.is_published === true,
  };
}

export async function readPublicBio(client: SupabaseClient, shareId: string): Promise<BioProfile | null> {
  if (!UUID.test(shareId)) return null;
  const { data, error } = await client.rpc('get_public_bio', { p_share_id: shareId });
  if (error) throw error;
  if (!data || typeof data !== 'object') return null;
  const result = data as Partial<BioProfile>;
  return {
    name: typeof result.name === 'string' ? result.name.slice(0, 60) : 'Tạp Hoá DT',
    description: typeof result.description === 'string' ? result.description.slice(0, 240) : '',
    channels: sanitizeSalesChannels(result.channels),
  };
}

async function asBlob(value: string): Promise<Blob> {
  const response = await fetch(value);
  if (!response.ok) throw new Error('Không đọc được ảnh để đồng bộ.');
  return response.blob();
}

export async function uploadCloudProject(client: SupabaseClient, user: User, project: SavedProject): Promise<SavedProject> {
  const id = UUID.test(project.id) ? project.id : crypto.randomUUID();
  const root = `${user.id}/${id}`;
  const currentPath = `${root}/current-image`;
  const originalPath = project.poster.image === project.poster.originalImage ? currentPath : `${root}/original-image`;
  const current = await asBlob(project.poster.image);
  const original = originalPath === currentPath ? current : await asBlob(project.poster.originalImage);
  for (const [path, blob] of [[currentPath, current], [originalPath, original]] as const) {
    const { error } = await client.storage.from('poster-assets').upload(path, blob, { upsert: true, contentType: blob.type || 'image/png', cacheControl: '3600' });
    if (error) throw error;
  }
  const poster: Poster = { ...project.poster, image: `storage:${currentPath}`, originalImage: `storage:${originalPath}` };
  const { error } = await client.from('poster_projects').upsert({ id, user_id: user.id, name: project.name.slice(0, 64), poster, thumbnail: project.thumbnail, saved_at: new Date(project.savedAt).toISOString() });
  if (error) throw error;
  return { ...project, id };
}

export async function readCloudProjects(client: SupabaseClient, user: User): Promise<SavedProject[]> {
  const { data, error } = await client.from('poster_projects').select('id,name,poster,thumbnail,saved_at').eq('user_id', user.id).order('saved_at', { ascending: false }).limit(100);
  if (error) throw error;
  const projects: SavedProject[] = [];
  for (const row of data || []) {
    const poster = row.poster as Poster;
    const paths = [poster.image, poster.originalImage].map(value => value.startsWith('storage:') ? value.slice(8) : '');
    const signed = await Promise.all(paths.map(async path => {
      if (!path) return '';
      const { data: item, error: signError } = await client.storage.from('poster-assets').createSignedUrl(path, 3600);
      if (signError) throw signError;
      return item.signedUrl;
    }));
    projects.push({ id: row.id, name: row.name, poster: { ...poster, image: signed[0], originalImage: signed[1] }, thumbnail: row.thumbnail || '', savedAt: new Date(row.saved_at).getTime() });
  }
  return projects;
}

export async function deleteCloudProject(client: SupabaseClient, user: User, id: string): Promise<void> {
  if (!UUID.test(id)) return;
  const { data, error: readError } = await client.from('poster_projects').select('poster').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (readError) throw readError;
  const poster = data?.poster as Poster | undefined;
  const paths = poster ? [...new Set([poster.image, poster.originalImage].filter(value => value.startsWith('storage:')).map(value => value.slice(8)))] : [];
  const { error } = await client.from('poster_projects').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  if (paths.length) await client.storage.from('poster-assets').remove(paths);
}
