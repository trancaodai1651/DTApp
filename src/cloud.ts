import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { Poster } from './model';
import type { SavedProject } from './storage';
import { sanitizeSalesChannels, type BioProfile } from './sales-channels';
import { isDesktop, openDesktopOAuth } from './desktop';

export interface CloudConfig { url: string; anonKey: string }
export interface CloudBio extends BioProfile { id: string; slug: string; shareId: string; isPublished: boolean; updatedAt: string }
export type AppRole = 'admin' | 'editor';
export interface AppUserRecord { email: string; displayName: string; role: AppRole; isActive: boolean; createdAt: string }
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
  activeClient = createClient(normalized.url, normalized.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: isDesktop() ? 'pkce' : 'implicit', storageKey: 'dt-poster-supabase-auth' } });
  if (persist) localStorage.setItem(CONFIG_KEY, JSON.stringify(normalized));
  return activeClient;
}

export function configuredClient(): SupabaseClient | null {
  const config = readCloudConfig();
  if (!config.url || !config.anonKey) return null;
  try { return configureCloud(config, false); } catch { return null; }
}

export async function signInWithGoogle(client: SupabaseClient): Promise<void> {
  const desktop = isDesktop() || Boolean(window.dtPosterSecureStore?.openOAuthURL);
  let redirectTo = 'dtapp://auth/callback';
  if (!desktop) {
    const redirect = new URL(window.location.href);
    redirect.hash = '';
    redirect.search = '';
    const bioPath = redirect.pathname.indexOf('/bio/');
    if (bioPath >= 0) redirect.pathname = redirect.pathname.slice(0, bioPath + 1);
    redirectTo = redirect.toString();
  }
  const options = { redirectTo, skipBrowserRedirect: desktop, queryParams: { prompt: 'select_account' } };
  const result = await client.auth.signInWithOAuth({ provider: 'google', options });
  const { data, error } = result;
  if (error) throw error;
  if (desktop && data.url) {
    if (isDesktop()) await openDesktopOAuth(data.url);
    else await window.dtPosterSecureStore!.openOAuthURL(data.url);
  }
}

export async function applyDesktopOAuthCallback(client: SupabaseClient, callbackUrl: string): Promise<void> {
  const parsed = new URL(callbackUrl);
  if (parsed.protocol !== 'dtapp:' || parsed.hostname !== 'auth' || parsed.pathname !== '/callback') throw new Error('Callback đăng nhập desktop không hợp lệ.');
  const code = parsed.searchParams.get('code');
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }
  const values = new URLSearchParams(parsed.hash.slice(1));
  const accessToken = values.get('access_token');
  const refreshToken = values.get('refresh_token');
  if (!accessToken || !refreshToken) throw new Error(values.get('error_description') || 'Google chưa trả về phiên đăng nhập.');
  const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw error;
}

export async function readAppAccess(client: SupabaseClient, user: User): Promise<AppUserRecord | null> {
  if (!user.email) return null;
  const { data, error } = await client.from('app_users').select('email,display_name,role,is_active,created_at').eq('email', user.email.toLowerCase()).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { email: data.email, displayName: data.display_name || '', role: data.role, isActive: data.is_active === true, createdAt: data.created_at };
}

export async function readManagedUsers(client: SupabaseClient): Promise<AppUserRecord[]> {
  const { data, error } = await client.from('app_users').select('email,display_name,role,is_active,created_at').order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(row => ({ email: row.email, displayName: row.display_name || '', role: row.role, isActive: row.is_active === true, createdAt: row.created_at }));
}

export async function addManagedUser(client: SupabaseClient, input: Pick<AppUserRecord, 'email' | 'displayName' | 'role'>): Promise<void> {
  const { error } = await client.from('app_users').insert({ email: input.email.trim().toLowerCase(), display_name: input.displayName.trim().slice(0, 80), role: input.role, is_active: true });
  if (error) throw error;
}

export async function updateManagedUser(client: SupabaseClient, input: Pick<AppUserRecord, 'email' | 'displayName' | 'role' | 'isActive'>): Promise<void> {
  const { error } = await client.from('app_users').update({ display_name: input.displayName.trim().slice(0, 80), role: input.role, is_active: input.isActive, updated_at: new Date().toISOString() }).eq('email', input.email.toLowerCase());
  if (error) throw error;
}

export async function deleteManagedUser(client: SupabaseClient, email: string): Promise<void> {
  const { error } = await client.from('app_users').delete().eq('email', email.toLowerCase());
  if (error) throw error;
}

export async function readCloudBios(client: SupabaseClient, user: User): Promise<CloudBio[]> {
  const { data, error } = await client.from('bio_pages').select('id,share_id,slug,name,description,channels,is_published,updated_at').eq('user_id', user.id).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(row => ({
    id: row.id, shareId: row.share_id, slug: row.slug,
    name: typeof row.name === 'string' ? row.name.slice(0, 60) : 'Tạp Hoá DT',
    description: typeof row.description === 'string' ? row.description.slice(0, 240) : '',
    channels: sanitizeSalesChannels(row.channels), isPublished: row.is_published === true, updatedAt: row.updated_at,
  }));
}

export async function saveCloudBio(client: SupabaseClient, user: User, bio: BioProfile, recordId: string | null, previousShareId: string | null, slug: string, publish: boolean): Promise<CloudBio> {
  const id = recordId && UUID.test(recordId) ? recordId : crypto.randomUUID();
  const shareId = previousShareId && UUID.test(previousShareId) ? previousShareId : crypto.randomUUID();
  const { data, error } = await client.from('bio_pages').upsert({
    id,
    user_id: user.id,
    share_id: shareId,
    slug,
    name: bio.name.trim().slice(0, 60) || 'Tạp Hoá DT',
    description: bio.description.trim().slice(0, 240),
    channels: sanitizeSalesChannels(bio.channels),
    is_published: publish,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' }).select('id,share_id,slug,name,description,channels,is_published,updated_at').single();
  if (error) throw error;
  return {
    id: data.id, shareId: data.share_id, slug: data.slug, updatedAt: data.updated_at,
    name: data.name,
    description: data.description,
    channels: sanitizeSalesChannels(data.channels),
    isPublished: data.is_published === true,
  };
}

export async function deleteCloudBio(client: SupabaseClient, id: string): Promise<void> {
  if (!UUID.test(id)) return;
  const { error } = await client.from('bio_pages').delete().eq('id', id);
  if (error) throw error;
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

export async function readPublicBioBySlug(client: SupabaseClient, slug: string): Promise<BioProfile | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const { data, error } = await client.rpc('get_public_bio_by_slug', { p_slug: slug });
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
