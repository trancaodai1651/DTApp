import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, AtSign, Check, ChevronRight, Facebook, FolderHeart, Instagram, Link2, MessageCircle, Music2, Plus, ShoppingBag, Store, Trash2 } from 'lucide-react';
import { translate, type Language } from './i18n';
import { isValidBioSlug, normalizeBioSlug } from './bio-slug.mjs';

export type ChannelPlatform = 'tiktok' | 'shopee' | 'facebook' | 'threads' | 'instagram' | 'zalo' | 'custom';
export type ChannelKind = 'store' | 'social' | 'custom';
export interface SalesChannel {
  id: string;
  platform: ChannelPlatform;
  kind: ChannelKind;
  name: string;
  destination: string;
}
export interface BioProfile {
  name: string;
  description: string;
  channels: SalesChannel[];
}
export interface BioPageSummary extends BioProfile {
  id: string;
  slug: string;
  shareId: string;
  isPublished: boolean;
  updatedAt: string;
}

export function appBaseUrl(): string {
  if (typeof window === 'undefined') return 'https://trancaodai1651.github.io/DTApp/';
  if (window.location.protocol === 'app:' || window.location.protocol === 'file:') return 'https://trancaodai1651.github.io/DTApp/';
  if (window.location.hostname === 'trancaodai1651.github.io') return `${window.location.origin}/DTApp/`;
  const path = window.location.pathname.replace(/\/bio(?:\/.*)?\/?$/i, '/').replace(/\/?$/, '/');
  return new URL(path, window.location.origin).toString();
}

export const defaultDestinations: Record<Exclude<ChannelPlatform, 'custom'>, string> = {
  tiktok: 'https://www.tiktok.com/',
  shopee: 'https://shopee.vn/',
  facebook: 'https://www.facebook.com/',
  threads: 'https://www.threads.net/',
  instagram: 'https://www.instagram.com/',
  zalo: 'https://zalo.me/',
};

const defaultSpecs: SalesChannel[] = [
  { id: 'shopee', platform: 'shopee', kind: 'store', name: 'Shopee Shop', destination: '' },
  { id: 'tiktok', platform: 'tiktok', kind: 'store', name: 'TikTok Shop', destination: '' },
  { id: 'facebook', platform: 'facebook', kind: 'social', name: 'Facebook', destination: '' },
  { id: 'threads', platform: 'threads', kind: 'social', name: 'Threads', destination: '' },
  { id: 'instagram', platform: 'instagram', kind: 'social', name: 'Instagram', destination: '' },
  { id: 'zalo', platform: 'zalo', kind: 'social', name: 'Zalo', destination: '' },
];
const SHARE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readBioShareId(): string | null {
  if (typeof window === 'undefined' || !window.location.hash.startsWith('#bio=')) return null;
  const value = window.location.hash.slice(5);
  return SHARE_ID.test(value) ? value : null;
}

export function readBioSlug(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/\/bio\/([^/]+)\/?$/i);
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[1]).toLowerCase();
    return isValidBioSlug(value) ? value : null;
  } catch { return null; }
}

/** Supports links generated before bio pages were moved into Supabase. */
export function readSharedBio(): BioProfile | null {
  if (typeof window === 'undefined' || !window.location.hash.startsWith('#bio=')) return null;
  try {
    const raw = JSON.parse(decodeURIComponent(window.location.hash.slice(5))) as { name?: unknown; description?: unknown; links?: unknown };
    if (!raw || typeof raw !== 'object' || !raw.links || typeof raw.links !== 'object') return null;
    const links = raw.links as Record<string, unknown>;
    const channels = createDefaultChannels().map(channel => {
      const value = links[channel.id];
      if (typeof value !== 'string' || !isHttpsUrl(value)) return channel;
      return { ...channel, destination: new URL(value).href };
    });
    if (!channels.some(channel => channel.destination)) return null;
    return {
      name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) || 'Tạp Hoá DT' : 'Tạp Hoá DT',
      description: typeof raw.description === 'string' ? raw.description.trim().slice(0, 240) : '',
      channels,
    };
  } catch { return null; }
}

const isPlatform = (value: unknown): value is ChannelPlatform => ['tiktok', 'shopee', 'facebook', 'threads', 'instagram', 'zalo', 'custom'].includes(String(value));
const isKind = (value: unknown): value is ChannelKind => ['store', 'social', 'custom'].includes(String(value));
const isHttpsUrl = (value: string) => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };

export function createDefaultChannels(legacyUrls: unknown = {}): SalesChannel[] {
  const legacy = legacyUrls && typeof legacyUrls === 'object' ? legacyUrls as Record<string, unknown> : {};
  return defaultSpecs.map(channel => {
    const oldValue = legacy[channel.id];
    const destination = typeof oldValue === 'string' && oldValue.trim() !== defaultDestinations[channel.id as keyof typeof defaultDestinations] ? oldValue.trim() : '';
    return { ...channel, destination };
  });
}

export function sanitizeSalesChannels(value: unknown): SalesChannel[] {
  if (!Array.isArray(value)) return createDefaultChannels();
  const seen = new Set<string>();
  const channels: SalesChannel[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const input = row as Partial<SalesChannel>;
    const id = typeof input.id === 'string' ? input.id.trim().slice(0, 80) : '';
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 60) : '';
    const destination = typeof input.destination === 'string' ? input.destination.trim().slice(0, 512) : '';
    if (!id || !name || seen.has(id) || (destination && !isPhoneNumber(destination, input.platform === 'zalo') && !isHttpsUrl(destination))) continue;
    const platform = isPlatform(input.platform) ? input.platform : 'custom';
    const kind = isKind(input.kind) ? input.kind : platform === 'custom' ? 'custom' : ['shopee', 'tiktok'].includes(platform) ? 'store' : 'social';
    seen.add(id);
    channels.push({ id, platform, kind, name, destination });
  }
  return channels.length ? channels : createDefaultChannels();
}

export function isPhoneNumber(value: string, allowBare = true): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!allowBare && !/^(?:\+|00|\d)/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 && /^[+()\d.\s-]+$/.test(trimmed);
}

export function channelHref(channel: SalesChannel): string | null {
  if (!channel.destination) return null;
  if (channel.platform === 'zalo' && isPhoneNumber(channel.destination)) {
    const digits = channel.destination.replace(/\D/g, '');
    return `tel:${channel.destination.trim().startsWith('+') ? '+' : ''}${digits}`;
  }
  try { const url = new URL(channel.destination); return url.protocol === 'https:' ? url.href : null; }
  catch { return null; }
}

export function channelOpenHref(channel: SalesChannel): string | null {
  return channelHref(channel) || (channel.platform === 'custom' ? null : defaultDestinations[channel.platform]);
}

export function makeCustomChannel(name: string): SalesChannel {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return { id, platform: 'custom', kind: 'custom', name: name.trim().slice(0, 60), destination: '' };
}

function channelIcon(platform: ChannelPlatform) {
  switch (platform) {
    case 'tiktok': return Music2;
    case 'shopee': return ShoppingBag;
    case 'facebook': return Facebook;
    case 'threads': return AtSign;
    case 'instagram': return Instagram;
    case 'zalo': return MessageCircle;
    default: return Link2;
  }
}

export function BioLinks({ channels, language }: { channels: SalesChannel[]; language: Language }) {
  const t = (text: string) => translate(language, text);
  const visible = channels.filter(channel => channelHref(channel));
  return <div className="bio-links">{visible.map((channel, index) => {
    const Icon = channelIcon(channel.platform);
    const isPhone = channel.platform === 'zalo' && isPhoneNumber(channel.destination);
    const label = isPhone ? channel.destination : channel.name;
    const sublabel = channel.kind === 'store' ? t('GIAN HÀNG') : isPhone ? t('GỌI ĐIỆN / ZALO') : t('MẠNG XÃ HỘI');
    return <a className={`bio-link-card ${channel.kind === 'store' ? 'priority' : 'social'}`} href={channelHref(channel)!} target={isPhone ? undefined : '_blank'} rel={isPhone ? undefined : 'noopener noreferrer'} key={channel.id} aria-label={isPhone ? `${t('Zalo')} ${channel.destination}` : channel.name}>
      <span className="bio-link-icon"><Icon size={19} /></span><span className="bio-link-copy"><small>{sublabel}</small><strong>{label}</strong></span><span className="bio-link-number">{String(index + 1).padStart(2, '0')}</span><ArrowUpRight className="bio-link-arrow" size={17} />
    </a>;
  })}</div>;
}

export function SalesChannelsPage({ channels, onChange, onSave, onOpenBio, busy, t }: {
  channels: SalesChannel[];
  onChange: (channels: SalesChannel[]) => void;
  onSave: () => void;
  onOpenBio: () => void;
  busy: boolean;
  t: (text: string) => string;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const update = (id: string, changes: Partial<SalesChannel>) => onChange(channels.map(channel => channel.id === id ? { ...channel, ...changes } : channel));
  const move = (index: number, delta: number) => {
    const next = [...channels]; const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]]; onChange(next);
  };
  const addChannel = (event: FormEvent) => {
    event.preventDefault(); const name = newName.trim(); if (!name) return;
    onChange([...channels, makeCustomChannel(name)]); setNewName(''); setAdding(false);
  };
  return <main className="channels-page">
    <div className="page-title"><div><div className="eyebrow"><span /> {t('KẾT NỐI CÁC KÊNH')}</div><h1>{t('Tạp Hoá DT ở mọi nơi')}<span>.</span></h1><p>{t('Mở nhanh gian hàng và trang mạng xã hội của bạn từ một nơi.')}</p></div></div>
    <button className="channels-bio-nav" onClick={onOpenBio}><span className="channels-bio-nav-icon"><Link2 size={20} /></span><span><strong>{t('Mở trang bio của cửa hàng')}</strong><small>{t('Xem trước, lưu và cập nhật trang liên kết công khai của bạn.')}</small></span><ChevronRight size={19} /></button>
    <section className="channels-brand-card"><div className="channels-brand-copy"><span className="brand-pill"><Store size={14} /> {t('NHẬN DIỆN MỚI')}</span><h2>{t('Tạp Hoá DT')}</h2><p>{t('Trẻ trung, thân thiện và sẵn sàng đồng hành trên mọi kênh bán hàng.')}</p><a className="button secondary" href={`${appBaseUrl()}tap-hoa-dt-logo.svg`} download="tap-hoa-dt-logo.svg"><ArrowUpRight size={16} /> {t('Tải logo SVG')}</a></div><img src={`${appBaseUrl()}tap-hoa-dt-logo.svg`} alt={t('Logo Tạp Hoá DT')} /></section>
    <div className="channels-heading"><div><div className="eyebrow">{t('CÁC ĐIỂM ĐẾN CỦA BẠN')}</div><h2>{t('Kênh bán hàng')}</h2></div><div className="channels-heading-actions"><button className="button secondary" onClick={() => { setAdding(value => !value); setNewName(''); }}><Plus size={16} /> {t('Thêm nền tảng')}</button><button className="button primary" disabled={busy} onClick={onSave}><Check size={16} /> {t('Lưu kênh & đồng bộ')}</button></div></div>
    {adding && <form className="channel-add-form" onSubmit={addChannel}><label htmlFor="new-channel-name">{t('Tên nền tảng mới')}</label><input autoFocus id="new-channel-name" maxLength={60} value={newName} onChange={event => setNewName(event.target.value)} placeholder={t('Ví dụ: YouTube, Messenger, Website')} /><button className="button primary" type="submit" disabled={!newName.trim()}><Plus size={16} /> {t('Thêm kênh')}</button></form>}
    <section className="channels-grid">{channels.map((channel, index) => {
      const Icon = channelIcon(channel.platform); const isZalo = channel.platform === 'zalo'; const isCustom = channel.platform === 'custom';
      return <article className={`channel-card channel-${channel.platform}`} key={channel.id}>
        <div className="channel-card-top"><span className="channel-icon"><Icon size={23} strokeWidth={2} /></span><span className="channel-index">{String(index + 1).padStart(2, '0')}</span><div className="channel-order-actions"><button className="icon-button" type="button" aria-label={`${t('Di chuyển lên')} ${channel.name}`} title={t('Di chuyển lên')} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button><button className="icon-button" type="button" aria-label={`${t('Di chuyển xuống')} ${channel.name}`} title={t('Di chuyển xuống')} disabled={index === channels.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button></div>{isCustom && <button className="icon-button channel-remove" type="button" aria-label={`${t('Xoá kênh')} ${channel.name}`} title={t('Xoá kênh')} onClick={() => onChange(channels.filter(item => item.id !== channel.id))}><Trash2 size={15} /></button>}</div>
        {isCustom ? <input className="channel-name-input" aria-label={t('Tên nền tảng')} maxLength={60} value={channel.name} onChange={event => update(channel.id, { name: event.target.value })} /> : <h3>{t(channel.name)}</h3>}
        <p>{isZalo ? t('Nhập số điện thoại để hiện số trên bio, hoặc dán liên kết Zalo để chỉ hiện nút Zalo.') : isCustom ? t('Thêm đường dẫn cửa hàng, hồ sơ hoặc trang web của bạn.') : channel.kind === 'store' ? t('Gian hàng trực tuyến') : t('Trang và cộng đồng')}</p>
        <label className="channel-url-label" htmlFor={`channel-url-${channel.id}`}>{isZalo ? t('Số điện thoại hoặc liên kết Zalo') : t('Đường dẫn kênh')}</label>
        <input id={`channel-url-${channel.id}`} type="text" inputMode={isZalo ? 'text' : 'url'} value={channel.destination} onChange={event => update(channel.id, { destination: event.target.value })} placeholder={isZalo ? '0987654321 hoặc https://zalo.me/...' : 'https://...'} />
        <div className="channel-actions"><button className="button secondary" disabled={busy} onClick={onSave}><Check size={15} /> {t('Lưu thay đổi')}</button>{channelOpenHref(channel) ? <a className="channel-open" href={channelOpenHref(channel)!} target={isZalo && isPhoneNumber(channel.destination) ? undefined : '_blank'} rel="noopener noreferrer">{isZalo && isPhoneNumber(channel.destination) ? t('Gọi điện') : t('Mở kênh')} <ArrowUpRight size={15} /></a> : <span className="channel-empty-hint">{t('Chưa có liên kết')}</span>}</div>
      </article>;
    })}</section><p className="channels-note"><Link2 size={15} /> {t('Dùng nút mũi tên để sắp xếp kênh. Chỉ link hoặc số bạn nhập mới hiện trên bio; nếu để trống, nút Mở kênh sẽ mở trang chính thức.')}</p>
  </main>;
}

export function BioPagesPage({ bios, urlFor, onCreate, onEdit, onDelete, t }: {
  bios: BioPageSummary[];
  urlFor: (slug: string) => string;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  t: (text: string) => string;
}) {
  return <main className="bio-pages-page">
    <div className="page-title"><div><div className="eyebrow"><span /> {t('TRANG CỦA BẠN')}</div><h1>{t('Quản lý các trang bio')}<span>.</span></h1><p>{t('Mỗi cửa hàng có trang riêng, đường dẫn riêng và danh sách kênh riêng.')}</p></div><button className="button primary" onClick={onCreate}><Plus size={16} /> {t('Tạo bio mới')}</button></div>
    {bios.length ? <section className="bio-pages-grid">{bios.map(bio => <article className="panel bio-page-card" key={bio.id}>
      <div className="bio-page-card-top"><span className="bio-page-card-icon"><Link2 size={18} /></span><span className={`bio-status-pill ${bio.isPublished ? 'published' : ''}`}>{t(bio.isPublished ? 'Đã xuất bản' : 'Bản nháp')}</span></div>
      <h2>{bio.name}</h2><p>{bio.description || t('Chưa có mô tả.')}</p>
      <div className="bio-page-url"><small>{t('ĐƯỜNG DẪN RIÊNG')}</small><code>{urlFor(bio.slug)}</code><span>{bio.slug}</span></div>
      <div className="bio-page-card-actions"><button className="button secondary" onClick={() => onEdit(bio.id)}><FolderHeart size={15} /> {t('Chỉnh sửa')}</button>{bio.isPublished && <a className="button primary" href={urlFor(bio.slug)} target="_blank" rel="noopener noreferrer"><ArrowUpRight size={15} /> {t('Mở trang')}</a>}<button className="icon-button danger-icon" title={t('Xoá trang bio')} aria-label={`${t('Xoá trang bio')} ${bio.name}`} onClick={() => onDelete(bio.id)}><Trash2 size={16} /></button></div>
    </article>)}</section> : <section className="panel bio-pages-empty"><span className="bio-page-card-icon"><Link2 size={22} /></span><h2>{t('Tạo trang bio đầu tiên')}</h2><p>{t('Tạo bao nhiêu trang cũng được. Mỗi trang sẽ có URL tuỳ chỉnh và bộ kênh riêng.')}</p><button className="button primary" onClick={onCreate}><Plus size={16} /> {t('Tạo bio mới')}</button></section>}
  </main>;
}

export function BioBuilderPage({ name, description, channels, slug, existingSlugs, shareUrl, saving, language, onNameChange, onDescriptionChange, onSlugChange, onSave, onCopy, onOpenChannels, t }: {
  name: string;
  description: string;
  channels: SalesChannel[];
  slug: string;
  existingSlugs: string[];
  shareUrl: string;
  saving: boolean;
  language: Language;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onSave: () => void;
  onCopy: () => void;
  onOpenChannels: () => void;
  t: (text: string) => string;
}) {
  const normalizedSlug = normalizeBioSlug(slug);
  const slugExists = existingSlugs.includes(normalizedSlug);
  const slugValid = isValidBioSlug(slug) && !slugExists;
  return <main className="bio-builder-page"><div className="page-title"><div><div className="eyebrow"><span /> {t('LINK TRONG TIỂU SỬ')}</div><h1>{t('Trang bio cửa hàng')}<span>.</span></h1><p>{t('Tạo trang công khai từ các kênh đã lưu. Thay đổi chỉ được áp dụng sau khi lưu.')}</p></div><div className="bio-title-actions"><button className="button secondary" onClick={onOpenChannels}>{t('Kênh bán hàng')}</button><button className="button primary" disabled={saving || !slugValid} onClick={onSave}><Check size={16} /> {t('Lưu & cập nhật trang bio')}</button>{shareUrl && <button className="button secondary" onClick={onCopy}><Link2 size={16} /> {t('Sao chép liên kết')}</button>}</div></div>
    <div className="bio-builder-grid"><section className="panel bio-settings-panel"><div className="bio-panel-heading"><span className="bio-panel-icon"><Link2 size={18} /></span><div><h2>{t('Thông tin trang')}</h2><p>{t('Dữ liệu sẽ được đồng bộ trong tài khoản Supabase của bạn.')}</p></div></div><label className="field-label" htmlFor="bio-name">{t('Tên cửa hàng')}</label><input id="bio-name" maxLength={60} value={name} onChange={event => onNameChange(event.target.value)} /><label className="field-label" htmlFor="bio-description">{t('Mô tả ngắn')}</label><textarea id="bio-description" maxLength={240} rows={3} value={description} onChange={event => onDescriptionChange(event.target.value)} /><label className="field-label" htmlFor="bio-slug">{t('Đường dẫn tuỳ chỉnh')}</label><div className="bio-slug-input"><span>{typeof window !== 'undefined' ? new URL(appBaseUrl()).origin + new URL(appBaseUrl()).pathname : ''}bio/</span><input id="bio-slug" maxLength={48} value={slug} onChange={event => onSlugChange(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-').slice(0, 48))} onBlur={() => onSlugChange(normalizeBioSlug(slug))} placeholder={normalizeBioSlug(name) || 'ten-cua-hang'} aria-invalid={!slugValid} /></div><small className={`slug-help ${slugValid ? '' : 'invalid'}`}>{t(slugExists ? 'Đường dẫn này đã được sử dụng.' : slugValid ? 'Chỉ dùng chữ thường, số và dấu gạch ngang; dài từ 3 đến 48 ký tự.' : 'Đường dẫn này chưa hợp lệ hoặc đã dành riêng.')}</small><div className="bio-priority-note"><ShoppingBag size={17} /><span><strong>{t('Thứ tự hiển thị')}</strong>{t('Theo thứ tự kênh bạn sắp xếp; mặc định Shopee Shop và TikTok Shop ở trên cùng.')}</span></div><div className="bio-channel-shortcut"><span>{t('Muốn thêm hoặc sắp xếp kênh?')}</span><button className="text-button" onClick={onOpenChannels}>{t('Quản lý kênh bán hàng')} <ChevronRight size={14} /></button></div>{shareUrl && <div className="bio-share-field"><label className="field-label" htmlFor="bio-share-url">{t('Liên kết trang bio')}</label><input id="bio-share-url" type="url" readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} /><button className="text-button" onClick={onCopy}>{t('Sao chép liên kết công khai')}</button></div>}<p className="bio-private-note">{t('Trang bio công khai lấy dữ liệu mới nhất đã lưu trong Supabase.')}</p></section>
      <section className="bio-preview-panel"><div className="bio-preview-heading"><div><div className="eyebrow">{t('XEM TRƯỚC TRANG CÔNG KHAI')}</div><h2>{t('Đây là trang khách sẽ mở')}</h2></div><span className="bio-live-badge"><span /> {t('XEM TRỰC TIẾP')}</span></div><div className="bio-preview-stage"><article className="bio-preview-card"><img src={`${appBaseUrl()}tap-hoa-dt-logo.svg`} alt={t('Logo Tạp Hoá DT')} /><span className="bio-kicker">{t('CỬA HÀNG CHÍNH THỨC')}</span><h3>{name.trim() || t('Tạp Hoá DT')}</h3>{description.trim() && <p className="bio-public-description">{description}</p>}<BioLinks channels={channels} language={language} /><footer>{t('Thiết kế bằng')} <strong>DT App</strong></footer></article></div></section>
    </div></main>;
}
