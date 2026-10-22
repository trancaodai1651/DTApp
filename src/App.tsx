import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Copy, FolderHeart, Home, ImagePlus, Layers3, LayoutGrid, Leaf, LoaderCircle, Menu, Minus, Moon, MousePointer2, Palette, Plus, Redo2, RotateCcw, Save, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Sun, Trash2, Undo2, Upload, WandSparkles, X } from 'lucide-react';
import { initialPoster, styles, ratios, categories, type Poster, type StyleId, type RatioId } from './model';
import { renderPoster, exportPoster, downloadBlob } from './renderer';
import { readProduct, visionImage, backgroundImage } from './image-tools';
import { localSuggestions, nameFromFile } from './suggestions.mjs';
import { saveProject, getProjects, deleteProject, type SavedProject } from './storage';
import { apiRequest, connectionUrl, type Connection } from './api';
import { loadAIProfiles, saveAIProfiles, type AIProfile, type AIProviderId } from './ai-profiles';
import { translate, type Language } from './i18n';
import { configureCloud, configuredClient, deleteCloudProject, readCloudConfig, readCloudProjects, uploadCloudProject, type CloudConfig } from './cloud';
import type { User } from '@supabase/supabase-js';

type Page = 'dashboard' | 'editor' | 'projects' | 'brand';
type Modal = 'export' | 'settings' | 'help' | null;
interface Suggestions { names: string[]; descriptions: string[]; source: string }
const safeRead = (key: string, fallback = '') => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Có lỗi xảy ra. Hãy thử lại.';
const aiProviders: Record<AIProviderId, { label: string; key: string; modelEnv: string; model: string; url: string }> = {
  openai: { label: 'ChatGPT / OpenAI', key: 'OPENAI_API_KEY', modelEnv: 'OPENAI_MODEL', model: 'gpt-4.1-mini', url: 'https://platform.openai.com/api-keys' },
  gemini: { label: 'Gemini', key: 'GEMINI_API_KEY', modelEnv: 'GEMINI_MODEL', model: 'gemini-3.8-flash', url: 'https://aistudio.google.com/apikey' },
  anthropic: { label: 'Claude / Anthropic', key: 'ANTHROPIC_API_KEY', modelEnv: 'ANTHROPIC_MODEL', model: 'claude-sonnet-5', url: 'https://console.anthropic.com/settings/keys' },
  grok: { label: 'Grok / xAI', key: 'XAI_API_KEY', modelEnv: 'XAI_MODEL', model: 'grok-4.7', url: 'https://console.x.ai/team/default/api-keys' },
};

function PosterCanvas({ poster, language = 'vi', thumbnail = false, onMove, canvasRef }: { poster: Poster; language?: Language; thumbnail?: boolean; onMove?: (x: number, y: number) => void; canvasRef?: React.RefObject<HTMLCanvasElement | null> }) {
  const internalRef = useRef<HTMLCanvasElement>(null);
  const ref = canvasRef || internalRef;
  const [error, setError] = useState('');
  const start = useRef<{ x: number; y: number; imageX: number; imageY: number } | null>(null);
  useEffect(() => {
    let disposed = false;
    // Render into a temporary canvas so an old image load cannot paint over a new edit.
    const temporary = document.createElement('canvas');
    renderPoster(temporary, poster, thumbnail ? 240 : 1440).then(() => {
      if (disposed || !ref.current) return;
      ref.current.width = temporary.width; ref.current.height = temporary.height;
      ref.current.getContext('2d')!.drawImage(temporary, 0, 0); setError('');
    }).catch(e => { if (!disposed) setError(errorMessage(e)); });
    return () => { disposed = true; };
  }, [poster, thumbnail, ref]);
  const ratio = ratios.find(r => r.id === poster.ratio)!;
  return <>{error ? <div className="canvas-error">{error}</div> : null}<canvas ref={ref} aria-label={`${translate(language, 'Poster')} ${poster.name}, ${translate(language, 'Mẫu thiết kế')} ${translate(language, styles.find(s => s.id === poster.style)?.name || '')}, ${translate(language, 'Tỷ lệ khung hình')} ${poster.ratio}`} style={{ aspectRatio: `${ratio.width}/${ratio.height}`, cursor: onMove ? 'grab' : undefined }}
    onPointerDown={event => { if (!onMove) return; event.currentTarget.setPointerCapture(event.pointerId); start.current = { x: event.clientX, y: event.clientY, imageX: poster.imageX, imageY: poster.imageY }; }}
    onPointerUp={event => { if (!start.current || !onMove) return; const box = event.currentTarget.getBoundingClientRect(); onMove(Math.max(-60, Math.min(60, start.current.imageX + (event.clientX - start.current.x) / box.width * 100)), Math.max(-60, Math.min(60, start.current.imageY + (event.clientY - start.current.y) / box.height * 100))); start.current = null; }}
    onPointerCancel={() => { start.current = null; }}
  /></>;
}

function ModalBox({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input, select')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab' && ref.current) {
        const focusable = Array.from(ref.current.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,a[href]'));
        if (!focusable.length) return;
        const first = focusable[0], last = focusable.at(-1)!;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [close]);
  return <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label={translate(document.documentElement.lang === 'en' ? 'en' : 'vi', 'Đóng')}><X size={20} /></button></div>{children}</div></div>;
}

export default function App() {
  const [language, setLanguage] = useState<Language>(() => safeRead('dt.language', 'vi') === 'en' ? 'en' : 'vi');
  const [appearance, setAppearance] = useState<'light' | 'dark'>(() => safeRead('dt.theme', window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') === 'dark' ? 'dark' : 'light');
  const t = (text: string) => translate(language, text);
  const [timeline, setTimeline] = useState<{ history: Poster[]; cursor: number }>({ history: [{ ...initialPoster, brand: safeRead('dt.brand', initialPoster.brand) }], cursor: 0 });
  const { history, cursor } = timeline;
  const setHistory = (next: Poster[]) => setTimeline(t => ({ ...t, history: next }));
  const setCursor = useCallback((next: number | ((value: number) => number)) => setTimeline(t => ({ ...t, cursor: typeof next === 'function' ? next(t.cursor) : next })), []);
  const poster = history[cursor];
  const [page, setPage] = useState<Page>('dashboard');
  const [modal, setModal] = useState<Modal>(null);
  const closeModal = useCallback(() => setModal(null), []);
  const [mobileNav, setMobileNav] = useState(false);
  const [activeTab, setActiveTab] = useState<'content' | 'adjust'>('content');
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [styleFilter, setStyleFilter] = useState('');
  const [zoom, setZoom] = useState(1);
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [savedPoster, setSavedPoster] = useState<Poster | null>(poster);
  const [draft, setDraft] = useState<SavedProject | null>(null);
  const [connection, setConnection] = useState<Connection>(() => ({ url: safeRead('dt.server', 'http://127.0.0.1:8787'), token: (() => { try { return sessionStorage.getItem('dt.token') || ''; } catch { return ''; } })() }));
  const [serverForm, setServerForm] = useState(connection);
  const [serverStatus, setServerStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [useAiApi, setUseAiApi] = useState(() => safeRead('dt.useAiApi', '0') === '1');
  const [providerGuide, setProviderGuide] = useState<AIProviderId>(() => (safeRead('dt.aiProvider', 'openai') in aiProviders ? safeRead('dt.aiProvider', 'openai') as AIProviderId : 'openai'));
  const [aiProfiles, setAiProfiles] = useState<AIProfile[]>([]);
  const [aiProfilesReady, setAiProfilesReady] = useState(false);
  const [aiVaultError, setAiVaultError] = useState('');
  const [activeAIProfileId, setActiveAIProfileId] = useState(() => safeRead('dt.aiProfile'));
  const [editingAIProfileId, setEditingAIProfileId] = useState<string | null>(null);
  const [aiProfileName, setAiProfileName] = useState('');
  const [aiProfileKey, setAiProfileKey] = useState('');
  const [aiProfileModel, setAiProfileModel] = useState(() => aiProviders.openai.model);
  const [cloudForm, setCloudForm] = useState<CloudConfig>(() => readCloudConfig());
  const [cloudClient, setCloudClient] = useState(() => configuredClient());
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('png');
  const [exportScale, setExportScale] = useState(1);
  const [brandName, setBrandName] = useState(safeRead('dt.brand', poster.brand));
  const [brandColor, setBrandColor] = useState(safeRead('dt.brandColor', '#31564a'));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const aiRequestRef = useRef<AbortController | null>(null);
  const notify = useCallback((text: string, error = false) => setToast({ text, error }), []);
  const update = useCallback((changes: Partial<Poster>) => {
    setTimeline(t => ({ history: [...t.history.slice(0, t.cursor + 1), { ...t.history[t.cursor], ...changes }].slice(-60), cursor: Math.min(t.cursor + 1, 59) }));
  }, []);
  const ratio = ratios.find(r => r.id === poster.ratio)!;
  const theme = styles.find(s => s.id === poster.style)!;
  const activeAIProfile = aiProfiles.find(profile => profile.id === activeAIProfileId) || null;
  const dirty = savedPoster !== poster;

  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(null), 5000); return () => clearTimeout(timeout); }, [toast]);
  useEffect(() => { document.documentElement.lang = language; try { localStorage.setItem('dt.language', language); } catch {} }, [language]);
  useEffect(() => { document.documentElement.dataset.theme = appearance; try { localStorage.setItem('dt.theme', appearance); } catch {} }, [appearance]);
  useEffect(() => {
    document.title = page === 'dashboard' ? `${t('DT App')} · ${t('Bảng điều khiển')}` : `${t('DT Poster Studio')} · ${page === 'editor' ? t('Xưởng thiết kế') : page === 'projects' ? t('Thiết kế đã lưu') : t('Bộ thương hiệu')}`;
  }, [page, language]);
  useEffect(() => {
    let mounted = true;
    loadAIProfiles().then(profiles => {
      if (!mounted) return;
      setAiProfiles(profiles);
      const preferred = safeRead('dt.aiProfile');
      const active = profiles.some(profile => profile.id === preferred) ? preferred : profiles[0]?.id || '';
      setActiveAIProfileId(active);
      const selected = profiles.find(profile => profile.id === active);
      if (selected) { setProviderGuide(selected.provider); setAiProfileModel(selected.model); }
      if (active) try { localStorage.setItem('dt.aiProfile', active); } catch {}
      setAiProfilesReady(true);
    }).catch(error => { if (mounted) { setAiVaultError(errorMessage(error)); setAiProfilesReady(true); } });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!cloudClient) { setCloudUser(null); return; }
    cloudClient.auth.getSession().then(({ data }) => setCloudUser(data.session?.user || null));
    const { data: listener } = cloudClient.auth.onAuthStateChange((_event, session) => setCloudUser(session?.user || null));
    return () => listener.subscription.unsubscribe();
  }, [cloudClient]);
  useEffect(() => {
    getProjects().then(list => { setProjects(list.filter(p => p.id !== '__draft__')); setDraft(list.find(p => p.id === '__draft__') || null); }).catch(e => notify(errorMessage(e), true));
  }, [notify]);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ status: string }>(connection, 'health', undefined, controller.signal).then(() => setServerStatus('online')).catch(() => { if (!controller.signal.aborted) setServerStatus('offline'); });
    return () => controller.abort();
  }, [connection]);
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      saveProject({ id: '__draft__', name: poster.name || 'Bản nháp', savedAt: Date.now(), poster, thumbnail: canvasRef.current?.toDataURL('image/jpeg', .35) || '' }).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [poster, dirty]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault(); setCursor(c => Math.max(0, Math.min(history.length - 1, c + (event.shiftKey ? 1 : -1))));
      }
    };
    document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler);
  }, [history.length]);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function upload(file?: File) {
    if (!file || busy) return;
    try {
      const data = await readProduct(file);
      const suggestedName = nameFromFile(file.name);
      update({ image: data, originalImage: data, fileName: file.name, cutout: false, imageX: 0, imageY: 0, imageScale: 1, rotation: 0, ...(poster.fileName === 'Ảnh sản phẩm mẫu' ? {
        name: poster.name === initialPoster.name ? suggestedName : poster.name,
        description: poster.description === initialPoster.description ? '' : poster.description,
        price: poster.price === initialPoster.price ? '' : poster.price,
        badge: poster.badge === initialPoster.badge ? '' : poster.badge,
        category: poster.category === initialPoster.category ? 'Sản phẩm khác' : poster.category,
      } : !poster.name.trim() && suggestedName ? { name: suggestedName } : {}) });
      setSuggestions(null); notify(t(useAiApi ? "Đã thêm ảnh. Có thể xoá nền hoặc yêu cầu AI gợi ý nội dung." : "Đã thêm ảnh. Có thể xoá nền hoặc dùng gợi ý cục bộ."));
    } catch (e) { notify(errorMessage(e), true); }
    if (fileRef.current) fileRef.current.value = '';
  }
  async function cutout() {
    const controller = new AbortController(); abortRef.current = controller;
    setBusy(t("Đang xoá nền trên server…"));
    try {
      const result = await apiRequest<{ image: string }>(connection, 'remove-background', { image: await backgroundImage(poster.originalImage) }, controller.signal);
      if (controller.signal.aborted) return;
      if (!result.image?.startsWith('data:image/png;base64,')) throw new Error('Máy chủ trả về ảnh không hợp lệ.');
      update({ image: result.image, cutout: true }); notify(t("Đã xoá nền. Kéo ảnh trên poster để căn lại vị trí.")); setServerStatus('online');
    } catch (e) { if (!controller.signal.aborted) { notify(errorMessage(e), true); setServerStatus('offline'); } }
    finally { setBusy(''); abortRef.current = null; }
  }
  async function suggest(useAI: boolean) {
    if (!useAI) { setSuggestions(localSuggestions(poster)); return; }
    const controller = new AbortController(); abortRef.current = controller; aiRequestRef.current = controller; setBusy(t("AI đang đọc ảnh và gợi ý nội dung…"));
    try {
      const credential = activeAIProfile ? { provider: activeAIProfile.provider, apiKey: activeAIProfile.apiKey, model: activeAIProfile.model } : undefined;
      const data = await apiRequest<Suggestions>(connection, 'suggestions', { image: await visionImage(poster.originalImage), name: poster.name, category: poster.category, description: poster.description, language }, controller.signal, credential);
      if (controller.signal.aborted) return;
      setSuggestions(data); if (!poster.name.trim() && data.names[0]) update({ name: data.names[0] }); setServerStatus('online');
    } catch (e) { if (!controller.signal.aborted) notify(errorMessage(e), true); }
    finally { setBusy(''); if (abortRef.current === controller) abortRef.current = null; if (aiRequestRef.current === controller) aiRequestRef.current = null; }
  }
  async function save() {
    try {
      const id = projectId || crypto.randomUUID();
      const temp = document.createElement('canvas'); await renderPoster(temp, poster, 300);
      const snapshot = { id, name: poster.name || 'Thiết kế chưa đặt tên', poster, savedAt: Date.now(), thumbnail: temp.toDataURL('image/jpeg', .75) };
      await saveProject(snapshot); setProjectId(id); setSavedPoster(poster);
      setProjects((await getProjects()).filter(p => p.id !== '__draft__'));
      if (cloudClient && cloudUser) {
        try { const synced = await uploadCloudProject(cloudClient, cloudUser, snapshot); if (synced.id !== id) { setProjectId(synced.id); await saveProject(synced); } notify(t('Đã lưu thiết kế trên thiết bị và đồng bộ lên Supabase.')); }
        catch (error) { notify(t(`Đã lưu trên thiết bị nhưng chưa đồng bộ được: ${errorMessage(error)}`), true); return; }
      } else notify(t("Đã lưu thiết kế trên thiết bị này."));
    } catch (e) { notify(errorMessage(e), true); }
  }
  async function exportImage() {
    setBusy(t("Đang xuất ảnh chất lượng cao…"));
    try {
      const blob = await exportPoster(poster, exportFormat, exportScale);
      const name = (poster.name || 'DT-Poster').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
      downloadBlob(blob, `${name}-${poster.ratio.replace(':', 'x')}.${exportFormat === 'jpeg' ? 'jpg' : 'png'}`);
      closeModal(); notify(`Đã xuất ${ratio.width * exportScale} × ${ratio.height * exportScale} px.`);
    } catch (e) { notify(errorMessage(e), true); } finally { setBusy(''); }
  }
  function openProject(project: SavedProject) {
    abortRef.current?.abort();
    setHistory([project.poster]); setCursor(0); setProjectId(project.id === '__draft__' ? null : project.id); setSavedPoster(project.poster); setPage('editor'); setDraft(null); setSuggestions(null);
  }
  async function newProject() {
    abortRef.current?.abort();
    if (dirty) await save();
    const next = { ...initialPoster, brand: safeRead('dt.brand', initialPoster.brand), accent: safeRead('dt.brandColor', initialPoster.accent) };
    setHistory([next]); setCursor(0); setProjectId(null); setSavedPoster(next); setPage('editor'); setSuggestions(null); notify(t("Đã mở thiết kế mới."));
  }
  function projectFile() {
    downloadBlob(new Blob([JSON.stringify({ format: 'dt-poster', version: 1, poster }, null, 2)], { type: 'application/json' }), 'thiet-ke.dtposter.json');
  }
  async function importProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error('Tệp thiết kế tối đa 30 MB.');
      const value = JSON.parse(await file.text()); const p = value.poster;
      if (value.format !== 'dt-poster' || value.version !== 1 || !p || !styles.some(s => s.id === p.style) || !ratios.some(r => r.id === p.ratio)) throw new Error('Tệp thiết kế không hợp lệ.');
      const validImage = (v: unknown) => typeof v === 'string' && (/^data:image\/(png|jpeg|webp);base64,/.test(v) || v === initialPoster.image);
      if (!validImage(p.image) || !validImage(p.originalImage) || !/^#[a-f0-9]{6}$/i.test(p.accent)) throw new Error('Tệp chứa dữ liệu ảnh hoặc màu không hợp lệ.');
      for (const key of ['name', 'description', 'brand', 'category', 'price', 'cta', 'badge', 'fileName']) if (typeof p[key] !== 'string' || p[key].length > 2000) throw new Error('Nội dung thiết kế không hợp lệ.');
      for (const key of ['imageScale', 'imageX', 'imageY', 'rotation']) if (typeof p[key] !== 'number' || !Number.isFinite(p[key])) throw new Error('Vị trí ảnh không hợp lệ.');
      const safe = { ...initialPoster, ...p, imageScale: Math.max(.2, Math.min(2.5, p.imageScale)), imageX: Math.max(-60, Math.min(60, p.imageX)), imageY: Math.max(-60, Math.min(60, p.imageY)), rotation: Math.max(-45, Math.min(45, p.rotation)), shadow: !!p.shadow, cutout: !!p.cutout };
      update(safe); setProjectId(null); setPage('editor'); notify(t("Đã mở tệp thiết kế."));
    } catch (e) { notify(errorMessage(e), true); }
    if (importRef.current) importRef.current.value = '';
  }
  async function saveAIProfile() {
    if (!aiProfileName.trim() || !aiProfileKey.trim()) { notify(t('Nhập tên cấu hình và API key.'), true); return; }
    if (!editingAIProfileId && aiProfiles.length >= 20) { notify(t('Mỗi thiết bị lưu tối đa 20 API.'), true); return; }
    const profile: AIProfile = { id: editingAIProfileId || crypto.randomUUID(), name: aiProfileName.trim().slice(0, 80), provider: providerGuide, apiKey: aiProfileKey.trim(), model: aiProfileModel.trim() || aiProviders[providerGuide].model };
    const next = editingAIProfileId ? aiProfiles.map(item => item.id === editingAIProfileId ? profile : item) : [profile, ...aiProfiles];
    try {
      await saveAIProfiles(next);
      setAiProfiles(next); setActiveAIProfileId(profile.id); setEditingAIProfileId(null);
      localStorage.setItem('dt.aiProfile', profile.id); localStorage.setItem('dt.aiProvider', profile.provider);
      setAiProfileName(''); setAiProfileKey(''); setProviderGuide(profile.provider); setAiProfileModel(aiProviders[profile.provider].model); setAiVaultError('');
      notify(t('API đã được mã hoá và lưu trên thiết bị.'));
    } catch (error) { notify(errorMessage(error), true); }
  }
  function toggleAiApi() {
    const next = !useAiApi;
    setUseAiApi(next);
    try { localStorage.setItem('dt.useAiApi', next ? '1' : '0'); } catch {}
    if (!next) {
      aiRequestRef.current?.abort();
      setSuggestions(null);
      notify(t('API AI đã tắt. Gợi ý cục bộ đang được dùng.'));
    } else notify(t('API AI đã bật.'));
  }
  async function activateAIProfile(profile: AIProfile) {
    setActiveAIProfileId(profile.id); setProviderGuide(profile.provider);
    try { localStorage.setItem('dt.aiProfile', profile.id); localStorage.setItem('dt.aiProvider', profile.provider); } catch {}
    notify(t('Đã chuyển API đang sử dụng.'));
  }
  function editAIProfile(profile: AIProfile) {
    setEditingAIProfileId(profile.id); setAiProfileName(profile.name); setAiProfileKey(profile.apiKey); setProviderGuide(profile.provider); setAiProfileModel(profile.model);
  }
  async function deleteAIProfile(profile: AIProfile) {
    if (!window.confirm(t('Xóa API này khỏi kho khóa trên thiết bị?'))) return;
    const next = aiProfiles.filter(item => item.id !== profile.id);
    try {
      await saveAIProfiles(next); setAiProfiles(next);
      if (activeAIProfileId === profile.id) {
        const nextActive = next[0]?.id || ''; setActiveAIProfileId(nextActive);
        const selected = next[0];
        if (selected) { setProviderGuide(selected.provider); setAiProfileModel(selected.model); }
        if (nextActive) localStorage.setItem('dt.aiProfile', nextActive); else localStorage.removeItem('dt.aiProfile');
      }
      if (editingAIProfileId === profile.id) { setEditingAIProfileId(null); setAiProfileName(''); setAiProfileKey(''); }
      notify(t('Đã xóa API khỏi thiết bị.'));
    } catch (error) { notify(errorMessage(error), true); }
  }
  async function checkServer() {
    setBusy(t("Đang kiểm tra kết nối…"));
    try {
      const next = { ...serverForm, url: connectionUrl(serverForm.url) };
      const health = await apiRequest<{ backgroundRemoval: boolean; suggestions: boolean }>(next, 'health');
      localStorage.setItem('dt.server', next.url); sessionStorage.setItem('dt.token', next.token); setConnection(next); setServerStatus('online');
      const hasSuggestions = health.suggestions || !!activeAIProfile;
      notify(hasSuggestions ? t('Server sẵn sàng: xoá nền và gợi ý từ ảnh.') : t('Server xoá nền sẵn sàng. Hãy thêm API AI hoặc cấu hình khóa trên server.'));
    } catch (e) { notify(errorMessage(e), true); } finally { setBusy(''); }
  }
  async function copyAISetup() {
    const provider = aiProviders[providerGuide];
    const snippet = `AI_PROVIDER=${providerGuide}\n${provider.key}=paste_your_key_here\n${provider.modelEnv}=${provider.model}`;
    try { await navigator.clipboard.writeText(snippet); notify(t('Đã sao chép cấu hình mẫu. Hãy dán vào .env trên máy chủ.')); }
    catch { notify(t('Trình duyệt không cho phép sao chép. Hãy thêm các dòng hiển thị trong tài liệu AI_SETUP.md vào .env.'), true); }
  }
  function connectCloud() {
    try { const client = configureCloud(cloudForm); setCloudClient(client); notify(t('Đã lưu cấu hình Supabase. Hãy đăng nhập để bật đồng bộ đám mây.')); }
    catch (error) { notify(errorMessage(error), true); }
  }
  async function refreshCloudProjects(user = cloudUser) {
    if (!cloudClient || !user) return;
    setBusy(t('Đang tải thiết kế từ Supabase…'));
    try {
      const remote = await readCloudProjects(cloudClient, user);
      const local = (await getProjects()).filter(project => project.id !== '__draft__');
      const merged = [...remote, ...local.filter(project => !remote.some(item => item.id === project.id))].sort((a, b) => b.savedAt - a.savedAt);
      await Promise.all(remote.map(saveProject)); setProjects(merged); notify(t('Đã đồng bộ thiết kế từ Supabase.'));
    } catch (error) { notify(`${t('Không tải được dữ liệu Supabase:')} ${errorMessage(error)}`, true); }
    finally { setBusy(''); }
  }
  async function signInCloud() {
    if (!cloudClient) { connectCloud(); notify(t('Hãy kết nối Supabase trước.')); return; }
    setBusy(t('Đang đăng nhập Supabase…'));
    try {
      const { data, error } = await cloudClient.auth.signInWithPassword({ email: cloudEmail.trim(), password: cloudPassword });
      if (error) throw error;
      setCloudPassword(''); if (data.user) await refreshCloudProjects(data.user); notify(t('Đã đăng nhập và đồng bộ Supabase.'));
    } catch (error) { notify(`${t('Không đăng nhập được:')} ${errorMessage(error)}`, true); }
    finally { setBusy(''); }
  }
  async function signUpCloud() {
    if (!cloudClient) { connectCloud(); notify(t('Hãy kết nối Supabase trước.')); return; }
    setBusy(t('Đang tạo tài khoản Supabase…'));
    try {
      const { data, error } = await cloudClient.auth.signUp({ email: cloudEmail.trim(), password: cloudPassword });
      if (error) throw error;
      setCloudPassword('');
      if (data.user && data.session) await refreshCloudProjects(data.user);
      else notify(t('Kiểm tra email để xác nhận tài khoản Supabase.'));
    } catch (error) { notify(`${t('Không tạo được tài khoản:')} ${errorMessage(error)}`, true); }
    finally { setBusy(''); }
  }
  async function signOutCloud() {
    if (!cloudClient) return;
    const { error } = await cloudClient.auth.signOut();
    if (error) notify(errorMessage(error), true);
    else { setProjects((await getProjects()).filter(project => project.id !== '__draft__')); notify(t('Đã đăng xuất Supabase.')); }
  }
  const switchPage = (next: Page) => { setPage(next); setMobileNav(false); };

  return <div className="app-shell" data-theme={appearance}>
    <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
      <a className="logo" href="#dashboard" onClick={e => { e.preventDefault(); switchPage('dashboard'); }}><span className="logo-mark">D<span /></span><span>DT App<span className="logo-studio">{t('CÔNG CỤ SÁNG TẠO')}</span></span></a>
      <button className="create-button" onClick={newProject}><Plus size={17} /> {t("Tạo poster mới")}</button>
      <div className="nav-label">{t("DT APP")}</div>
      <nav aria-label={t("Điều hướng chính")}>
        <button className={page === 'dashboard' ? 'active' : ''} onClick={() => switchPage('dashboard')}><Home size={18} /> {t("Bảng điều khiển")}</button>
        <button className={page === 'editor' ? 'active' : ''} onClick={() => switchPage('editor')}><LayoutGrid size={18} /> {t("Xưởng thiết kế")} <span className="nav-dot" /></button>
        <button className={page === 'projects' ? 'active' : ''} onClick={() => switchPage('projects')}><FolderHeart size={18} /> {t('Thiết kế đã lưu')} {projects.length > 0 && <span className="count">{projects.length}</span>}</button>
        <button className={page === 'brand' ? 'active' : ''} onClick={() => switchPage('brand')}><Palette size={18} /> {t("Bộ thương hiệu")}</button>
      </nav>
      <div className="sidebar-note"><span className="note-icon"><Sparkles size={20} /></span><h3>{t("Ý tưởng nhỏ.")}<br />{t("Ấn tượng lớn.")}</h3><p>{t("Mỗi sản phẩm đều xứng đáng có một diện mạo riêng.")}</p><button onClick={() => setModal('help')}>{t("Khám phá cách dùng")} <ArrowUpRight size={14} /></button><span className="note-decoration">✳</span></div>
      <div className="sidebar-bottom"><button onClick={() => { setServerForm(connection); setModal('settings'); }}><Settings2 size={17} /> {t("Cài đặt kết nối")}</button><button onClick={() => setModal('help')}><CircleHelp size={17} /> {t("Hướng dẫn sử dụng")}</button><div className="profile"><span>DT</span><div>{t("Không gian cá nhân")}<small>{t("Lưu trên thiết bị")}</small></div></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumbs"><button className="mobile-menu icon-button" onClick={() => setMobileNav(v => !v)} aria-label={t('Mở menu')}><Menu size={20} /></button><span>{t('DT App')}</span><ChevronRight size={14} /><strong>{page === 'dashboard' ? t('Bảng điều khiển') : page === 'editor' ? t('Xưởng thiết kế') : page === 'projects' ? t('Thiết kế đã lưu') : t('Bộ thương hiệu')}</strong></div><div className="top-actions"><span className="version-tag">{t('BẢN THỬ NGHIỆM 0.1')}</span><button className="language-toggle" onClick={() => setLanguage(v => v === 'vi' ? 'en' : 'vi')} aria-label={language === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}>{language === 'vi' ? 'EN' : 'VI'}</button><button className="icon-button" onClick={() => setAppearance(v => v === 'light' ? 'dark' : 'light')} aria-label={appearance === 'light' ? t('Chế độ tối') : t('Chế độ sáng')} title={appearance === 'light' ? t('Chế độ tối') : t('Chế độ sáng')}>{appearance === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button><button className="icon-button help-button" aria-label={t('Trợ giúp')} onClick={() => setModal('help')}><CircleHelp size={19} /></button><span className="avatar">D</span></div></header>
      {page === 'dashboard' ? <main className="dashboard-page">
        <section className="dashboard-welcome">
          <div className="dashboard-welcome-copy"><div className="eyebrow"><span /> DT APP · {t('MỘT KHÔNG GIAN CHO SÁNG TẠO')}</div><h1>{t('Chào mừng đến DT App')}<span>.</span></h1><p>{t('Quản lý công cụ sáng tạo, thiết kế và cài đặt của bạn từ một nơi.')}</p><div className="dashboard-hero-actions"><button className="button primary" onClick={newProject}><Plus size={17} /> {t('Tạo poster mới')}</button><button className="button secondary" onClick={() => switchPage('projects')}><FolderHeart size={16} /> {t('Xem thiết kế đã lưu')}</button></div></div>
          <div className="dashboard-welcome-art"><div className="dashboard-sparkle sparkle-one">✳</div><div className="dashboard-sparkle sparkle-two">✦</div><div className="dashboard-preview"><PosterCanvas language={language} poster={poster} thumbnail /></div><div className="dashboard-preview-label"><span className="dashboard-preview-icon"><LayoutGrid size={16} /></span><span><strong>DT Poster Studio</strong><small>{t('Công cụ thiết kế poster')}</small></span><ArrowUpRight size={15} /></div></div>
        </section>
        <section className="dashboard-stats" aria-label={t('Tổng quan')}>
          <article className="dashboard-stat"><span className="stat-icon"><FolderHeart size={18} /></span><span className="stat-label">{t('Thiết kế đã lưu')}</span><strong>{projects.length}</strong><small>{t('Trên thiết bị này')}</small></article>
          <article className="dashboard-stat ai-status-stat"><span className="stat-icon"><Sparkles size={18} /></span><div className="ai-status-copy"><span className="stat-label">{t('API AI bên ngoài')}</span><strong>{useAiApi ? t('Đang bật') : t('Đã tắt')}</strong><small>{useAiApi ? t('Dùng theo API đang chọn') : t('Gợi ý chạy cục bộ')}</small></div><button type="button" className="dashboard-inline-toggle" aria-pressed={useAiApi} onClick={toggleAiApi}>{t(useAiApi ? 'Tắt API AI' : 'Bật API AI')}</button></article>
          <article className="dashboard-stat"><span className="stat-icon"><ShieldCheck size={18} /></span><span className="stat-label">{t('API đã lưu')}</span><strong>{aiProfiles.length}</strong><small>{t('Lưu riêng trên thiết bị')}</small></article>
        </section>
        <div className="dashboard-section-heading"><div><div className="eyebrow">{t('DT APP')}</div><h2>{t('Ứng dụng của bạn')}</h2></div><p>{t('Chọn một không gian để tiếp tục.')}</p></div>
        <section className="dashboard-app-grid">
          <button className="dashboard-app-card featured" onClick={() => switchPage('editor')}><span className="dashboard-app-icon"><LayoutGrid size={21} /></span><small>01 · DT POSTER STUDIO</small><strong>{t('Thiết kế poster')}</strong><span className="dashboard-app-description">{t('Tạo poster sản phẩm với mẫu, tỷ lệ và phong cách có sẵn.')}</span><span className="dashboard-card-action">{t('Mở ứng dụng')} <ArrowRight size={15} /></span></button>
          <button className="dashboard-app-card" onClick={() => switchPage('projects')}><span className="dashboard-app-icon warm"><FolderHeart size={21} /></span><small>02 · {t('THƯ VIỆN')}</small><strong>{t('Thiết kế đã lưu')}</strong><span className="dashboard-app-description">{t('Mở lại và tiếp tục chỉnh sửa thiết kế của bạn.')}</span><span className="dashboard-card-action">{t('Mở thư viện')} <ArrowRight size={15} /></span></button>
          <button className="dashboard-app-card" onClick={() => switchPage('brand')}><span className="dashboard-app-icon violet"><Palette size={21} /></span><small>03 · {t('NHẬN DIỆN')}</small><strong>{t('Bộ thương hiệu')}</strong><span className="dashboard-app-description">{t('Lưu tên thương hiệu và màu cho poster tiếp theo.')}</span><span className="dashboard-card-action">{t('Mở bộ thương hiệu')} <ArrowRight size={15} /></span></button>
          <button className="dashboard-app-card" onClick={() => { setServerForm(connection); setModal('settings'); }}><span className="dashboard-app-icon blue"><Settings2 size={21} /></span><small>04 · {t('CÀI ĐẶT')}</small><strong>{t('Cài đặt kết nối')}</strong><span className="dashboard-app-description">{t('Chọn chế độ gợi ý và quản lý các API đã lưu.')}</span><span className="dashboard-card-action">{t('Mở cài đặt')} <ArrowRight size={15} /></span></button>
        </section>
      </main> : page === 'editor' ? <main className="editor-page">
        <section className="page-title"><div><div className="eyebrow"><span /> {t("MỘT CHÚT SÁNG TẠO, MỖI NGÀY")}</div><h1>{t("Poster đẹp, bắt đầu từ đây")}<span>.</span></h1><p>{t("Thêm ảnh sản phẩm. Chọn phong cách. Kể câu chuyện của bạn.")}</p></div><div className="title-actions"><button className="button secondary" onClick={save}><Save size={16} /> {t("Lưu thiết kế")}</button><button className="button primary" onClick={() => setModal('export')}><ArrowDownToLine size={17} /> {t("Xuất poster")} <ArrowUpRight size={15} /></button></div></section>
        {draft && <div className="draft-banner"><span>{t("Bạn có một bản nháp từ lần trước.")}</span><button onClick={() => openProject(draft)}>{t("Tiếp tục chỉnh sửa")} <ArrowRight size={14} /></button><button className="icon-button" onClick={() => setDraft(null)} aria-label={t("Ẩn bản nháp")}><X size={15} /></button></div>}
        <div className="workspace">
          <section className="content-panel panel">
            <div className="panel-tabs"><button className={activeTab === 'content' ? 'selected' : ''} onClick={() => setActiveTab('content')}><Layers3 size={15} /> {t("Nội dung")}</button><button className={activeTab === 'adjust' ? 'selected' : ''} onClick={() => setActiveTab('adjust')}><SlidersHorizontal size={15} /> {t("Tinh chỉnh")}</button></div>
            {activeTab === 'content' ? <div className="panel-content">
              <div className="step-heading"><span>01</span><h2>{t("Ảnh sản phẩm")}</h2><span className="tiny-tag">{t("BẮT ĐẦU TẠI ĐÂY")}</span></div>
              <div className="upload-zone" onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }} onDragLeave={e => e.currentTarget.classList.remove('dragover')} onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('dragover'); void upload(e.dataTransfer.files[0]); }}>
                <button className="upload-content" onClick={() => fileRef.current?.click()} disabled={!!busy}><div className="upload-icon"><ImagePlus size={25} /><span>+</span></div><strong>{t("Thả ảnh của bạn vào đây")}</strong><span>{t("hoặc")} <em>{t("chọn ảnh từ thiết bị")}</em></span><small>{t("JPG, PNG, WebP · Tối đa 20 MB")}</small></button>
              </div>
              <div className="image-file"><span className="file-thumb"><img src={poster.image} alt={t("Ảnh sản phẩm hiện tại")} /></span><div><strong title={t(poster.fileName)}>{t(poster.fileName)}</strong><small><span className="small-dot" />{poster.cutout ? t('Đã xoá nền') : t('Đã thêm vào thiết kế')}</small></div><button className="icon-button" aria-label={t("Thay ảnh")} title={t("Thay ảnh")} onClick={() => fileRef.current?.click()} disabled={!!busy}><Upload size={15} /></button></div>
              <button className={`remove-bg ${poster.cutout ? 'completed' : ''}`} onClick={cutout} disabled={!!busy || poster.cutout}><WandSparkles size={16} />{poster.cutout ? t('Đã xoá nền') : t('Xoá nền sản phẩm')}<span>AI</span></button>
              {poster.cutout && <button className="text-button restore" onClick={() => update({ image: poster.originalImage, cutout: false })}><RotateCcw size={12} /> {t("Khôi phục ảnh gốc")}</button>}
              <p className="privacy-note"><ShieldCheck size={12} /> {t("Ảnh chỉ gửi tới server khi xóa nền hoặc dùng gợi ý AI.")}</p>
              <div className="section-divider" />
              <div className="step-heading"><span>02</span><h2>{t("Kể về sản phẩm")}</h2></div>
              <label className="field-label" htmlFor="product-name">{t("Tên sản phẩm")} <span>{poster.name.length}/64</span></label><input id="product-name" placeholder={t("Ví dụ: Tinh dầu Thảo Mộc")} value={poster.name} maxLength={64} onChange={e => update({ name: e.target.value })} />
              <label className="field-label" htmlFor="category">{t("Nhóm sản phẩm")}</label><div className="select-wrap"><select id="category" value={poster.category} onChange={e => update({ category: e.target.value })}>{categories.map(c => <option key={c} value={c}>{t(c)}</option>)}</select><ChevronDown size={14} /></div>
              <div className="label-row"><label className="field-label" htmlFor="description">{t("Mô tả ngắn")}</label><button className="ai-link" disabled={!!busy} onClick={() => suggest(useAiApi)}><Sparkles size={12} /> {t(useAiApi ? "AI gợi ý" : "Gợi ý cục bộ")}</button></div>
              <textarea id="description" rows={3} maxLength={240} value={poster.description} placeholder={t("Một câu chuyện nhỏ về sản phẩm của bạn…")} onChange={e => update({ description: e.target.value })} />
              <button className="suggest-button" onClick={() => suggest(useAiApi)} disabled={!!busy}><Sparkles size={15} /> {t(useAiApi ? "Gợi ý tên & mô tả từ ảnh" : "Gợi ý tên & mô tả (không dùng AI)")} <ArrowUpRight size={14} /></button>
              <button className="text-button local-suggest" onClick={() => suggest(false)}>{t("Tham khảo câu chữ theo nhóm sản phẩm")}</button>
              {suggestions && <div className="suggestions"><div className="suggestion-heading"><strong><Sparkles size={13} /> {suggestions.source === 'ai' ? t('Ý tưởng từ AI') : t('Gợi ý theo nhóm')}</strong><button className="icon-button" onClick={() => setSuggestions(null)} aria-label={t("Đóng gợi ý")}><X size={14} /></button></div>{suggestions.source !== 'ai' && <p>{t("Câu chữ tham khảo, chưa phân tích ảnh.")}</p>}<small>{t("TÊN SẢN PHẨM · NHẤN ĐỂ ÁP DỤNG")}</small>{suggestions.names.map((name, i) => <button key={i} className="name-suggestion" onClick={() => update({ name: name.slice(0, 64) })}>{name}<Plus size={12} /></button>)}<small>{t("MÔ TẢ · NHẤN ĐỂ ÁP DỤNG")}</small>{suggestions.descriptions.map((description, i) => <button key={i} className="description-suggestion" onClick={() => update({ description: description.slice(0, 240) })}>{description}<ArrowUpRight size={12} /></button>)}</div>}
            </div> : <div className="panel-content adjust-panel">
              <div className="step-heading"><span>01</span><h2>{t("Căn chỉnh sản phẩm")}</h2></div><p className="muted">{t("Kéo ảnh trên poster để đặt vị trí. Dùng các thanh dưới đây để chỉnh chính xác.")}</p>
              <label className="field-label" htmlFor="scale">{t("Kích thước ảnh")} <span>{Math.round(poster.imageScale * 100)}%</span></label><input id="scale" type="range" min="0.2" max="2.5" step="0.05" value={poster.imageScale} onChange={e => update({ imageScale: +e.target.value })} />
              <label className="field-label" htmlFor="rotation">{t("Xoay ảnh")} <span>{poster.rotation}°</span></label><input id="rotation" type="range" min="-45" max="45" value={poster.rotation} onChange={e => update({ rotation: +e.target.value })} />
              <label className="field-label" htmlFor="image-x">{t("Vị trí ngang")} <span>{Math.round(poster.imageX)}%</span></label><input id="image-x" type="range" min="-60" max="60" value={poster.imageX} onChange={e => update({ imageX: +e.target.value })} />
              <label className="field-label" htmlFor="image-y">{t("Vị trí dọc")} <span>{Math.round(poster.imageY)}%</span></label><input id="image-y" type="range" min="-60" max="60" value={poster.imageY} onChange={e => update({ imageY: +e.target.value })} />
              <label className="checkbox-label"><input type="checkbox" checked={poster.shadow} onChange={e => update({ shadow: e.target.checked })} /> {t("Bóng đổ tự nhiên")}</label><button className="button secondary full" onClick={() => update({ imageX: 0, imageY: 0, imageScale: 1, rotation: 0 })}><RotateCcw size={14} /> {t("Đặt lại vị trí ảnh")}</button>
              <div className="section-divider" /><div className="step-heading"><span>02</span><h2>{t("Thông tin trên poster")}</h2></div>
              <label className="field-label" htmlFor="brand">{t("Thương hiệu")}</label><input id="brand" maxLength={32} value={poster.brand} onChange={e => update({ brand: e.target.value })} />
              <label className="field-label" htmlFor="badge">{t("Nhãn đầu trang")}</label><input id="badge" maxLength={40} value={poster.badge} onChange={e => update({ badge: e.target.value })} placeholder={t("BỘ SƯU TẬP MỚI")} />
              <label className="field-label" htmlFor="price">{t("Giá / thông tin nổi bật")}</label><input id="price" maxLength={28} value={poster.price} onChange={e => update({ price: e.target.value })} placeholder={t("Để trống nếu không cần")} />
              <label className="field-label" htmlFor="cta">{t("Lời kêu gọi hành động")}</label><input id="cta" maxLength={32} value={poster.cta} onChange={e => update({ cta: e.target.value })} />
            </div>}
          </section>
          <section className="stage-panel"><div className="stage-toolbar"><div><span className="design-indicator" /><strong>{t(theme.name)}</strong><span className="stage-toolbar-ratio">/ {t(ratio.name)}</span></div><div><button className="icon-button" title={`${t('Hoàn tác')} (Ctrl+Z)`} aria-label={t('Hoàn tác')} disabled={cursor === 0 || !!busy} onClick={() => setCursor(c => c - 1)}><Undo2 size={17} /></button><button className="icon-button" title={`${t('Làm lại')} (Ctrl+Shift+Z)`} aria-label={t('Làm lại')} disabled={cursor === history.length - 1 || !!busy} onClick={() => setCursor(c => c + 1)}><Redo2 size={17} /></button></div></div>
            <div className="artboard-area"><div className="artboard" style={{ width: `${Math.min(100, ratio.width / ratio.height * 100)}%`, maxWidth: `${(ratio.width >= ratio.height ? 570 : 530 * ratio.width / ratio.height) * zoom}px` }}><PosterCanvas language={language} poster={poster} canvasRef={canvasRef} onMove={(x, y) => update({ imageX: x, imageY: y })} /></div><span className="artboard-size">{ratio.width} × {ratio.height} px <span>·</span> {poster.ratio}</span></div>
            <div className="stage-bottom"><span><MousePointer2 size={13} /> {t("Kéo sản phẩm để căn vị trí")}</span><div className="zoom-control"><button className="icon-button" aria-label={t("Thu nhỏ")} onClick={() => setZoom(z => Math.max(.5, z - .1))}><Minus size={14} /></button><button className="zoom-reset" title={t("Vừa khung")} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button className="icon-button" aria-label={t("Phóng to")} onClick={() => setZoom(z => Math.min(1.5, z + .1))}><Plus size={14} /></button></div></div>
            <div className="creative-tip"><span><Leaf size={15} /></span><p><strong>{t("Mẹo nhỏ cho một poster đẹp")}</strong>{t("Ảnh có ánh sáng rõ và nền đơn giản sẽ cho kết quả xoá nền tốt hơn.")}</p></div>
          </section>
          <section className="template-panel panel"><div className="template-heading"><h2>{t("Chọn diện mạo")}</h2><span>{styles.length} {t('mẫu')}</span></div><div className="template-inner"><div className="right-label"><span className="step-number">03</span><h3>{t('Tỷ lệ thiết kế')}</h3></div><div className="ratio-grid">{ratios.map(r => <button key={r.id} className={poster.ratio === r.id ? 'selected' : ''} onClick={() => update({ ratio: r.id as RatioId })} title={`${t(r.name)} · ${r.width} × ${r.height}`}><span className="ratio-icon" style={{ width: r.width >= r.height ? 19 : 19 * r.width / r.height, height: r.height >= r.width ? 19 : 19 * r.height / r.width }} /><strong>{r.id}</strong></button>)}</div><div className="selected-ratio-name">{t(ratio.name)}<Check size={11} /></div><div className="section-divider" /><div className="right-label style-label"><span className="step-number">04</span><h3>{t('Phong cách của bạn')}</h3></div><div className="style-search"><Search size={13} /><input aria-label={t('Tìm phong cách')} placeholder={t('Tìm phong cách…')} value={styleFilter} onChange={e => setStyleFilter(e.target.value)} /></div><div className="template-grid">{styles.filter(s => `${t(s.name)} ${t(s.tag)} ${s.name} ${s.tag}`.toLocaleLowerCase(language).includes(styleFilter.toLocaleLowerCase(language))).map(style => <button className={`template-card ${poster.style === style.id ? 'selected' : ''}`} key={style.id} onClick={() => update({ style: style.id as StyleId, accent: style.accent })}><div className="template-preview"><PosterCanvas language={language} thumbnail poster={{ ...initialPoster, style: style.id, accent: style.accent }} />{poster.style === style.id && <span className="selected-check"><Check size={11} /></span>}</div><strong>{t(style.name)}</strong><small>{t(style.tag)}</small></button>)}</div>{styles.filter(s => `${t(s.name)} ${t(s.tag)} ${s.name} ${s.tag}`.toLocaleLowerCase(language).includes(styleFilter.toLocaleLowerCase(language))).length === 0 && <p className="muted">{t("Chưa có phong cách phù hợp. Thử từ khóa khác.")}</p>}<div className="section-divider" /><div className="color-heading"><h3>{t('Màu nhấn')}</h3><span>{poster.accent.toUpperCase()}</span></div><div className="swatches">{['#31564a', '#9b4439', '#806343', '#3e4fa0', '#82449b', '#e8c794'].map(color => <button key={color} aria-label={`${t('Màu')} ${color}`} title={color} className={poster.accent === color ? 'selected' : ''} style={{ backgroundColor: color }} onClick={() => update({ accent: color })}>{poster.accent === color && <Check size={12} color={color === '#e8c794' ? '#334b3b' : 'white'} />}</button>)}<label className="custom-color" title={t("Chọn màu tuỳ chỉnh")}><Plus size={13} /><input aria-label={t("Màu tuỳ chỉnh")} type="color" value={poster.accent} onChange={e => update({ accent: e.target.value })} /></label></div></div></section>
        </div><footer className="workspace-footer"><span><span className={`connection-dot ${serverStatus}`} /><button onClick={() => { setServerForm(connection); setModal('settings'); }}>{serverStatus === 'online' ? t('Đã kết nối server AI') : t('Kết nối server để dùng AI')} <ArrowUpRight size={11} /></button></span><span>{dirty ? t('Bản nháp tự lưu trên thiết bị') : t('Sẵn sàng sáng tạo')}<span className="footer-dot">·</span>{t("Được làm cho ý tưởng của bạn")} <span className="footer-spark">✳</span></span></footer>
      </main> : page === 'projects' ? <main className="library-page"><div className="page-title"><div><div className="eyebrow">{t("GÓC SÁNG TẠO CỦA BẠN")}</div><h1>{t("Những ý tưởng đã thành hình")}<span>.</span></h1><p>{t("Thiết kế được lưu trên thiết bị và trình duyệt này.")}</p></div>{cloudUser && <button className="button secondary" onClick={() => refreshCloudProjects()} disabled={!!busy}><RotateCcw size={15} /> {t('Đồng bộ ngay')}</button>}<button className="button secondary" onClick={() => importRef.current?.click()}><Upload size={15} /> {t("Mở tệp thiết kế")}</button></div>{projects.length ? <div className="projects-grid">{projects.map(project => <article className="project-card" key={project.id}><button onClick={() => openProject(project)}><img src={project.thumbnail} alt={`Thiết kế ${project.name}`} /><h3>{project.name}</h3><p>{new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(project.savedAt)}</p></button><button className="icon-button delete-project" title={t("Xoá thiết kế đã lưu")} aria-label={`Xoá ${project.name}`} onClick={async () => { if (cloudClient && cloudUser) await deleteCloudProject(cloudClient, cloudUser, project.id); await deleteProject(project.id); setProjects(p => p.filter(v => v.id !== project.id)); if (projectId === project.id) setProjectId(null); notify(t("Đã xoá bản lưu.")); }}><Trash2 size={15} /></button></article>)}</div> : <div className="empty-state"><FolderHeart size={45} /><h2>{t("Mọi ý tưởng đều có một khởi đầu")}</h2><p>{t("Tạo poster đầu tiên và lưu lại để tiếp tục bất cứ lúc nào.")}</p><button className="button primary" onClick={() => switchPage('editor')}>{t("Bắt đầu thiết kế")} <ArrowRight size={15} /></button></div>}</main> : <main className="brand-page"><div className="page-title"><div><div className="eyebrow">{t("NHẤT QUÁN TRONG TỪNG CHI TIẾT")}</div><h1>{t("Mang dấu ấn của bạn")}<span>.</span></h1><p>{t("Lưu tên và màu thương hiệu cho những thiết kế tiếp theo.")}</p></div></div><div className="brand-layout"><div className="panel brand-form"><label className="field-label" htmlFor="brand-name">{t("Tên thương hiệu")}</label><input id="brand-name" maxLength={32} value={brandName} onChange={e => setBrandName(e.target.value)} /><label className="field-label" htmlFor="brand-color">{t("Màu thương hiệu")}</label><div className="brand-color-field"><input id="brand-color" type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)} /><span>{brandColor.toUpperCase()}</span></div><button className="button primary full" onClick={() => { try { localStorage.setItem('dt.brand', brandName); localStorage.setItem('dt.brandColor', brandColor); update({ brand: brandName, accent: brandColor }); notify(t("Đã lưu thương hiệu và áp dụng vào poster hiện tại.")); } catch (e) { notify(errorMessage(e), true); } }}><Check size={16} /> {t("Lưu & áp dụng")}</button></div><div className="brand-preview" style={{ backgroundColor: brandColor }}><span>{t("BỘ NHẬN DIỆN CỦA BẠN")}</span><h2>{brandName || t('Thương hiệu của bạn')}</h2><span>Every little detail tells a story.</span></div></div></main>}
    </div>
    <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" ref={fileRef} onChange={e => upload(e.target.files?.[0])} aria-label={t("Chọn ảnh sản phẩm")} />
    <input className="sr-only" type="file" accept=".json" ref={importRef} onChange={e => importProject(e.target.files?.[0])} aria-label={t("Mở tệp thiết kế")} />
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <CircleHelp size={18} /> : <CheckCircle2 size={18} />}<span>{toast.text}</span><button className="icon-button" onClick={() => setToast(null)} aria-label={t("Đóng thông báo")}><X size={15} /></button></div>}
    {busy && <div className="busy-pill" role="status"><LoaderCircle size={17} className="spin" /><span>{busy}</span>{abortRef.current && <button onClick={() => abortRef.current?.abort()}>{t("Huỷ")}</button>}</div>}
    {modal === 'export' && <ModalBox title={t("Sẵn sàng toả sáng.")} close={closeModal}><p className="modal-subtitle">{t("Xuất poster hoàn chỉnh, không có watermark.")}</p><div className="export-summary"><div className="export-thumb"><PosterCanvas language={language} poster={poster} thumbnail /></div><div><strong>{poster.name || t('Thiết kế của bạn')}</strong><p>{theme.name} · {poster.ratio}</p><small>{ratio.width * exportScale} × {ratio.height * exportScale} px</small></div></div><label className="field-label" htmlFor="export-format">{t("Định dạng")}</label><select id="export-format" value={exportFormat} onChange={e => setExportFormat(e.target.value as 'png' | 'jpeg')}><option value="png">{t("PNG — chi tiết rõ nét")}</option><option value="jpeg">{t("JPG — dung lượng nhẹ")}</option></select><label className="field-label" htmlFor="export-scale">{t("Độ phân giải")}</label><select id="export-scale" value={exportScale} onChange={e => setExportScale(+e.target.value)}><option value="1">1× · {ratio.width} × {ratio.height} px</option><option value="2">2× · {ratio.width * 2} × {ratio.height * 2} px</option></select><button className="button primary full export-action" disabled={!!busy} onClick={exportImage}><ArrowDownToLine size={17} /> {t("Tải poster xuống")}</button><div className="export-project-links"><button className="text-button" onClick={projectFile}><Copy size={13} /> {t("Tải tệp để chỉnh sửa sau")}</button><button className="text-button" onClick={() => importRef.current?.click()}><Upload size={13} /> {t("Mở tệp thiết kế")}</button></div></ModalBox>}
    {modal === 'settings' && <ModalBox title={t("Kết nối máy chủ AI")} close={closeModal}><p className="modal-subtitle">{t("Web và app dùng chung server để xoá nền, nhận diện ảnh và viết nội dung.")}</p><label className="field-label" htmlFor="server-url">{t("Địa chỉ server")}</label><input id="server-url" type="url" value={serverForm.url} onChange={e => setServerForm(s => ({ ...s, url: e.target.value }))} placeholder="https://poster-api.tenmien.vn" /><p className="field-help">{t("Để trống nếu web và API cùng tên miền. Server từ xa cần HTTPS.")}</p><label className="field-label" htmlFor="server-token">{t("Mã truy cập server (nếu có)")}</label><input id="server-token" type="password" value={serverForm.token} onChange={e => setServerForm(s => ({ ...s, token: e.target.value }))} placeholder={t("Mã do quản trị server cung cấp")} autoComplete="off" /><p className="field-help">{t("Mã chỉ giữ trong phiên này. API cá nhân được lưu mã hoá trên thiết bị.")}</p><section className="cloud-settings"><div className="provider-heading"><div><span className="eyebrow">SUPABASE CLOUD</span><h3>{t('Lưu thiết kế trên đám mây')}</h3></div><span className={`provider-badge ${cloudUser ? 'connected' : ''}`}>{cloudUser ? cloudUser.email : t('Chưa đăng nhập')}</span></div><p>{t('Nhập Project URL và publishable/anon key từ Supabase. Khóa này công khai; bảo vệ dữ liệu bằng đăng nhập và RLS, không dùng service_role key.')}</p><label className="field-label" htmlFor="supabase-url">Project URL</label><input id="supabase-url" type="url" value={cloudForm.url} onChange={e => setCloudForm(v => ({ ...v, url: e.target.value }))} placeholder="https://your-project.supabase.co" /><label className="field-label" htmlFor="supabase-anon">{t('Publishable key / anon key')}</label><input id="supabase-anon" type="text" value={cloudForm.anonKey} onChange={e => setCloudForm(v => ({ ...v, anonKey: e.target.value }))} placeholder="sb_publishable_…" autoComplete="off" /><div className="provider-actions"><button className="button secondary" onClick={connectCloud}><CheckCircle2 size={15} /> {t('Lưu cấu hình Supabase')}</button><a className="text-button" href="./poster_cloud.sql" target="_blank" rel="noreferrer">{t('Mở schema đồng bộ')} <ArrowUpRight size={13} /></a></div>{cloudClient && !cloudUser ? <><label className="field-label" htmlFor="cloud-email">Email</label><input id="cloud-email" type="email" value={cloudEmail} onChange={e => setCloudEmail(e.target.value)} autoComplete="email" /><label className="field-label" htmlFor="cloud-password">{t('Mật khẩu tài khoản Supabase')}</label><input id="cloud-password" type="password" value={cloudPassword} onChange={e => setCloudPassword(e.target.value)} autoComplete="current-password" /><div className="provider-actions"><button className="button primary" onClick={signInCloud} disabled={!!busy}>{t('Đăng nhập')}</button><button className="text-button" onClick={signUpCloud} disabled={!!busy}>{t('Tạo tài khoản mới')}</button></div></> : cloudUser ? <div className="provider-actions"><button className="button secondary" onClick={() => refreshCloudProjects()} disabled={!!busy}><RotateCcw size={14} /> {t('Đồng bộ ngay')}</button><button className="text-button" onClick={signOutCloud}>{t('Đăng xuất')}</button></div> : null}<p className="field-help">{t('Lưu thiết kế sẽ đồng bộ ảnh riêng tư và dữ liệu poster vào tài khoản Supabase đang đăng nhập. Mỗi tài khoản chỉ truy cập dữ liệu của mình.')}</p></section><section className="provider-help api-keys-panel">
  <div className="provider-heading"><div><span className="eyebrow">{t('API CÁ NHÂN')}</span><h3>{t('Thêm và chuyển API')}</h3></div><span className={`provider-badge ${useAiApi ? 'connected' : ''}`}>{useAiApi ? t('API AI đang bật') : t('API AI đã tắt')}</span></div>
  <div className="ai-mode-row"><div><strong>{t('Cho phép dùng API AI')}</strong><p>{t(useAiApi ? 'API AI đang bật. Chỉ gợi ý tên và mô tả từ ảnh mới gọi nhà cung cấp; xóa nền vẫn dùng U²-Net trên server.' : 'API AI đang tắt. Gợi ý tên và mô tả dùng thư viện cục bộ; ảnh, nội dung và khóa không gửi tới nhà cung cấp. Xóa nền vẫn dùng U²-Net trên server.')}</p></div><button type="button" className={`ai-mode-toggle ${useAiApi ? 'enabled' : ''}`} role="switch" aria-checked={useAiApi} onClick={toggleAiApi}>{useAiApi ? t('Đang bật') : t('Đang tắt')}</button></div>
  <p>{t('Lưu nhiều API riêng trên thiết bị này; chỉ gửi API tới server khi công tắc ở trạng thái bật.')}</p>
  <label className="field-label" htmlFor="ai-provider">{t('Nhà cung cấp')}</label>
  <select id="ai-provider" value={providerGuide} onChange={event => { const value = event.target.value as AIProviderId; setProviderGuide(value); setAiProfileModel(aiProviders[value].model); try { localStorage.setItem('dt.aiProvider', value); } catch {} }}>
    {Object.entries(aiProviders).map(([id, provider]) => <option key={id} value={id}>{t(provider.label)}</option>)}
  </select>
  <label className="field-label" htmlFor="ai-profile-name">{t('Tên cấu hình')}</label>
  <input id="ai-profile-name" value={aiProfileName} maxLength={80} onChange={event => setAiProfileName(event.target.value)} placeholder={t('Ví dụ: Gemini cá nhân')} />
  <label className="field-label" htmlFor="ai-profile-key">API key</label>
  <input id="ai-profile-key" type="password" value={aiProfileKey} maxLength={4096} onChange={event => setAiProfileKey(event.target.value)} placeholder={t('Dán API key vừa tạo')} autoComplete="new-password" />
  <label className="field-label" htmlFor="ai-profile-model">{t('Model (tuỳ chọn)')}</label>
  <input id="ai-profile-model" value={aiProfileModel} maxLength={128} onChange={event => setAiProfileModel(event.target.value)} placeholder={aiProviders[providerGuide].model} />
  <div className="provider-actions">
    <button className="button primary" onClick={saveAIProfile} disabled={!aiProfilesReady}><CheckCircle2 size={15} /> {editingAIProfileId ? t('Cập nhật API') : t('Lưu API trên thiết bị')}</button>
    {editingAIProfileId && <button className="text-button" onClick={() => { setEditingAIProfileId(null); setAiProfileName(''); setAiProfileKey(''); setAiProfileModel(aiProviders[providerGuide].model); }}>{t('Hủy sửa')}</button>}
    <a className="text-button" href="./api-guide.html"><ArrowUpRight size={13} /> {t('Hướng dẫn lấy API')}</a>
  </div>
  {aiVaultError && <p className="field-help vault-error">{aiVaultError}</p>}
  <p className="field-help">{t('Web mã hoá API trong hồ sơ trình duyệt này; app desktop dùng kho bảo mật của Windows hoặc macOS. API không được đồng bộ lên Supabase. Khi dùng AI, khóa, ảnh và thông tin sản phẩm được gửi tới server bạn đã chọn.')}</p>
  <div className="api-profile-list">
    {aiProfiles.map(profile => <article className="api-profile-row" key={profile.id}>
      <div className="api-profile-info"><strong>{profile.name}</strong>{profile.id === activeAIProfileId && <span className="provider-badge connected">{t('Đang dùng')}</span>}<small>{t(aiProviders[profile.provider].label)} · {profile.model}</small><small>••••••••{profile.apiKey.slice(-4)}</small></div>
      <div className="provider-actions">
        <button className="text-button" onClick={() => activateAIProfile(profile)} disabled={profile.id === activeAIProfileId}>{t('Dùng API này')}</button>
        <button className="text-button" onClick={() => editAIProfile(profile)}>{t('Sửa')}</button>
        <button className="text-button danger-text" onClick={() => deleteAIProfile(profile)}>{t('Xóa')}</button>
      </div>
    </article>)}
    {aiProfilesReady && aiProfiles.length === 0 && <p className="field-help">{t('Chưa lưu API nào trên thiết bị này.')}</p>}
  </div>
</section>
<section className="provider-help server-provider-help">
  <div className="provider-heading"><div><span className="eyebrow">{t('TÙY CHỌN CHO QUẢN TRỊ SERVER')}</span><h3>{t('API mặc định trên server')}</h3></div></div>
  <p>{t('Nếu không chọn API cá nhân, server có thể dùng khóa mặc định trong tệp .env.')}</p>
  <label className="field-label" htmlFor="server-ai-provider">{t('Nhà cung cấp')}</label>
  <select id="server-ai-provider" value={providerGuide} onChange={event => { const value = event.target.value as AIProviderId; setProviderGuide(value); }}>
    {Object.entries(aiProviders).map(([id, provider]) => <option key={id} value={id}>{t(provider.label)}</option>)}
  </select>
  <div className="provider-actions"><a className="text-button" href={aiProviders[providerGuide].url} target="_blank" rel="noreferrer">{t('Tạo API key')} <ArrowUpRight size={13} /></a><button className="text-button" onClick={copyAISetup}><Copy size={13} /> {t('Sao chép cấu hình server')}</button></div>
  <pre className="env-snippet">{`AI_PROVIDER=${providerGuide}\n${aiProviders[providerGuide].key}=your_key_here\n${providerGuide.toUpperCase()}_MODEL=${aiProviders[providerGuide].model}`}</pre>
</section><div className="settings-note"><ShieldCheck size={21} /><p>{t("Khi bạn dùng AI, ảnh và nội dung cùng API đang chọn được gửi tới server đã cấu hình để chuyển tiếp đến nhà cung cấp. Server không lưu API cá nhân.")}</p></div><button className="button primary full" onClick={checkServer} disabled={!!busy}><CheckCircle2 size={16} /> {t("Kiểm tra & lưu kết nối")}</button></ModalBox>}
    {modal === 'help' && <ModalBox title={t("Từ một bức ảnh đến một ý tưởng.")} close={closeModal} wide><p className="modal-subtitle">{t("Một không gian nhỏ để sản phẩm của bạn được nổi bật.")}</p><div className="help-steps">{[['01', 'Thêm ảnh', 'Chọn ảnh JPG, PNG hoặc WebP. Ảnh rõ nét, sản phẩm tách biệt với nền sẽ cho kết quả tốt hơn.'], ['02', 'Để AI hỗ trợ', 'Kết nối server trong Cài đặt. Nhấn Xoá nền hoặc Gợi ý tên & mô tả từ ảnh. Bạn luôn có thể sửa lại nội dung.'], ['03', 'Chọn diện mạo', 'Chọn một trong 8 phong cách, 6 tỷ lệ. Chỉnh màu, kích thước, vị trí, nhãn, giá và thương hiệu trong Tinh chỉnh.'], ['04', 'Lưu & chia sẻ', 'Xuất PNG/JPG ở 1× hoặc 2×. Lưu trên thiết bị, đồng bộ với Supabase hoặc tải tệp thiết kế để chuyển sang một máy khác.']].map(([step, title, description]) => <div key={step}><span>{step}</span><div><h3>{title}</h3><p>{description}</p></div></div>)}</div><p className="help-footnote">{t("Bản mẫu hiện dùng ảnh minh hoạ. Nội dung AI là gợi ý và cần được bạn kiểm tra trước khi sử dụng. Đăng nhập Supabase trong Cài đặt để đồng bộ thiết kế giữa các thiết bị.")}</p><button className="button primary full" onClick={closeModal}>{t("Bắt đầu sáng tạo")} <ArrowRight size={16} /></button></ModalBox>}
  </div>;
}
