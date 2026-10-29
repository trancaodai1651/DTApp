import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, Bookmark, Check, Clock3, ExternalLink, FolderOpen, LoaderCircle, Mic2, Monitor, Pencil, Plus, Radio, RefreshCw, Search, Settings2, Star, Trash2, Video, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { isDesktop } from '../desktop';
import { mediaRequest, type DouyinChannel, type DouyinVideo, type MediaJob, type MediaSettings, type MediaSnapshot } from './api';
import './douyin.css';

const dateText = (value?: number | null) => value ? new Date(value * 1000).toLocaleString('vi-VN') : 'Chưa có';
const dateOnly = (value?: number | null) => value ? new Date(value * 1000).toLocaleDateString('vi-VN') : 'Chưa rõ ngày';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const jobNames: Record<string, string> = { scan: 'Quét Douyin', search: 'Tìm video Douyin', download: 'Tải video', dub: 'Tạo thuyết minh / lồng tiếng', transcribe: 'Chép lời audio', install_asr: 'Cài Whisper', guest: 'Mở phiên khách', close_guest: 'Đóng phiên khách', install_browser: 'Cài Chromium', install_voice: 'Cài OmniVoice' };
const statusNames: Record<string, string> = { queued: 'Đang chờ', running: 'Đang chạy', done: 'Hoàn tất', error: 'Có lỗi', blocked: 'Cần kiểm tra phiên khách', partial: 'Chưa lấy hết', interrupted: 'Bị gián đoạn', cancelled: 'Đã hủy' };
type Run = <T = unknown>(command: string, payload?: unknown, message?: string) => Promise<T | undefined>;
type Tab = 'videos' | 'channels' | 'jobs' | 'settings';

export default function DouyinStudio() {
  const [snapshot, setSnapshot] = useState<MediaSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>('videos');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [searchTerms, setSearchTerms] = useState({vi: '', en: '', zh: ''});
  const [searchJobId, setSearchJobId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [period, setPeriod] = useState('all');
  const [anchor, setAnchor] = useState(today);
  const [end, setEnd] = useState(today);
  const [autoDownload, setAutoDownload] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [videoChannel, setVideoChannel] = useState('');
  const [resultIds, setResultIds] = useState<string[] | null>(null);
  const [editing, setEditing] = useState<Partial<DouyinChannel> | null>(null);
  const [dubVideo, setDubVideo] = useState<DouyinVideo | null>(null);
  const [limit, setLimit] = useState(60);
  const polling = useRef(false);
  const refresh = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try { setSnapshot(await mediaRequest<MediaSnapshot>('snapshot')); }
    finally { polling.current = false; }
  }, []);
  useEffect(() => {
    if (!isDesktop()) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try { if (!disposed) await refresh(); }
      catch (e) { if (!disposed) setError(errorText(e)); }
      if (!disposed) timer = setTimeout(tick, 2000);
    };
    void tick();
    return () => { disposed = true; clearTimeout(timer); };
  }, [refresh]);
  const run: Run = useCallback(async <T,>(command: string, payload: unknown = {}, message = '') => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await mediaRequest<T>(command, payload);
      await refresh();
      if (message) setNotice(message);
      return result;
    } catch (e) { setError(errorText(e)); return undefined; }
    finally { setBusy(false); }
  }, [refresh]);
  const videos = useMemo(() => {
    const ids = resultIds ? new Set(resultIds) : null;
    const search = filter.trim().toLocaleLowerCase();
    return (snapshot?.videos || []).filter(v => (!videoChannel || v.channelId === videoChannel) && (!ids || ids.has(v.id)) && (!search || `${v.title} ${v.author} ${v.id}`.toLocaleLowerCase().includes(search)));
  }, [snapshot?.videos, videoChannel, filter, resultIds]);
  const channels = useMemo(() => (snapshot?.channels || []).filter(c => `${c.name} ${c.tags} ${c.notes} ${c.url}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).sort((a, b) => Number(b.favorite) - Number(a.favorite)), [snapshot?.channels, filter]);
  const selectedVideoChannel = snapshot?.channels.find(channel => channel.id === videoChannel);
  const searchJob = snapshot?.jobs.find(job => job.id === searchJobId);
  useEffect(() => {
    if (!searchJob || !['done', 'partial', 'error', 'blocked', 'cancelled', 'interrupted'].includes(searchJob.state)) return;
    if (['done', 'partial'].includes(searchJob.state)) {
      setResultIds(searchJob.resultIds || []);
      setVideoChannel('');
      setFilter('');
      setNotice(searchJob.message);
    } else {
      setResultIds(null);
      setNotice(searchJob.message);
    }
    setSearchJobId('');
  }, [searchJob]);
  const changeTab = (next: Tab) => { setTab(next); setFilter(''); setLimit(60); };
  const beginScan = async (event: FormEvent) => {
    event.preventDefault();
    const result = await run('scan', { url, channelId: channelId || undefined, mode: period, anchor, end, autoDownload }, 'Đã thêm lượt quét vào hàng đợi. Xem kết quả trong Tác vụ.');
    if (result) setTab('jobs');
  };
  const beginSearch = async (event: FormEvent) => {
    event.preventDefault();
    const queries = (Object.entries(searchTerms) as Array<["vi" | "en" | "zh", string]>)
      .filter(([, query]) => query.trim())
      .map(([language, query]) => ({language, query:query.trim()}));
    if (!queries.length) { setError('Nhập từ khóa tiếng Việt, English hoặc 中文 để tìm.'); return; }
    setResultIds([]);
    setSelected(new Set());
    setVideoChannel('');
    setFilter('');
    const result = await run<{jobId:string}>('search', {queries}, 'Đang tìm video công khai trên Douyin…');
    if (result) setSearchJobId(result.jobId);
    else setResultIds(null);
  };
  const queueSelected = async () => {
    const result = await run<{queued: number; skipped: number}>('download', { ids: [...selected] });
    if (result) { setNotice(`Đã xếp ${result.queued} video; bỏ qua ${result.skipped} video đã tải/đang tải hoặc không hỗ trợ.`); setSelected(new Set()); }
  };
  const pickChannel = (channel: DouyinChannel) => { setUrl(channel.url); setChannelId(channel.id); setTab('videos'); setFilter(''); setResultIds(null); setVideoChannel(channel.id); };
  if (!isDesktop()) return <main className="douyin-studio"><section className="dy-empty"><Monitor size={40} /><h1>Douyin Studio trên desktop</h1><p>Mở DT App bản Windows hoặc macOS để tải video, theo dõi kênh và chạy OmniVoice trên thiết bị.</p><p>Phiên bản web vẫn dùng các công cụ poster và bio như trước.</p></section></main>;
  return <main className="douyin-studio">
    <header className="dy-hero"><div><span className="eyebrow">DT APP · VIDEO & GIỌNG NÓI</span><h1>Douyin Studio<span>.</span></h1><p>Lưu cảm hứng. Tải video. Kể lại bằng giọng của bạn.</p></div><button className="button secondary" disabled={busy} onClick={() => { void run('open_guest', { url: url || 'https://www.douyin.com/' }, 'Đang mở cửa sổ Douyin khách.'); }}><ExternalLink size={16} /> Mở Douyin khách</button></header>
    <div className="dy-info"><Radio size={18} /><span>Chế độ khách · không cần tài khoản Douyin. Đóng cửa sổ sẽ thu xuống khay hệ thống. Theo dõi kiểm tra theo chu kỳ khi app còn chạy; khi máy ngủ hoặc thoát app, việc kiểm tra tạm dừng.</span></div>
    {error && <div className="dy-alert error" role="alert">{error}<button aria-label="Đóng thông báo lỗi" onClick={() => setError('')}><X size={16} /></button></div>}
    {notice && <div className="dy-alert" role="status">{notice}<button aria-label="Đóng thông báo" onClick={() => setNotice('')}><X size={16} /></button></div>}
    <section className="dy-stats" aria-label="Tổng quan Douyin"><div><Bookmark size={19} /><strong>{snapshot?.channels.length || 0}</strong><span>Kênh tham khảo</span></div><div><Radio size={19} /><strong>{snapshot?.channels.filter(c => c.monitor).length || 0}</strong><span>Đang theo dõi</span></div><div><Video size={19} /><strong>{snapshot?.videos.filter(v => v.file).length || 0}</strong><span>Video đã tải</span></div><div><Clock3 size={19} /><strong>{snapshot?.jobs.filter(j => ['queued', 'running'].includes(j.state)).length || 0}</strong><span>Tác vụ đang chờ/chạy</span></div></section>
    <nav className="dy-tabs" aria-label="Công cụ Douyin">{([['videos', Video, 'Video & tải về'], ['channels', Bookmark, 'Kênh tham khảo'], ['jobs', Clock3, 'Tác vụ'], ['settings', Settings2, 'Cài đặt']] as const).map(([id, Icon, label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'active' : ''} onClick={() => changeTab(id)}><Icon size={17} />{label}</button>)}</nav>
    {!snapshot ? <div className="dy-empty" role="status"><LoaderCircle className="spin" size={28} /><p>Đang kết nối bộ xử lý trên thiết bị…</p></div> : <>
      {!snapshot.runtime.browserInstalled && <div className="dy-alert">Chromium đang được chuẩn bị tự động. Nếu cài đặt gặp lỗi, bấm thử cài lại bên dưới.<button className="button secondary" disabled={busy} onClick={() => { void run('install_browser', {}, 'Đã xếp tác vụ cài Chromium. Xem tiến độ ở Tác vụ.'); setTab('jobs'); }}>Cài trình duyệt</button></div>}
      {tab === 'videos' && <><form className="dy-panel dy-scan" onSubmit={event => { void beginSearch(event); }}><div className="dy-section-heading"><h2>Tìm video trên Douyin</h2><span>Gộp kết quả từ tiếng Việt, English và 中文</span></div><div className="dy-form-grid dy-search-languages"><label>Tiếng Việt<input maxLength={120} value={searchTerms.vi} onChange={e => setSearchTerms(v => ({...v, vi:e.target.value}))} placeholder="làm đồ gỗ DIY" /></label><label>English<input maxLength={120} value={searchTerms.en} onChange={e => setSearchTerms(v => ({...v, en:e.target.value}))} placeholder="woodworking DIY" /></label><label>中文<input maxLength={120} value={searchTerms.zh} onChange={e => setSearchTerms(v => ({...v, zh:e.target.value}))} placeholder="木工DIY" /></label></div><div className="dy-input-action"><span className="dy-muted">Nhập một hoặc nhiều cách diễn đạt; kết quả được gộp và bỏ trùng. Từ khóa không tự dịch.</span><button className="button primary" disabled={busy || !!searchJobId || !snapshot.runtime.browserInstalled}><Search size={16} /> Tìm trên Douyin</button></div>{searchJob && <div className="dy-search-progress" role="status"><span>{searchJob.message}</span>{searchJob.state === 'running' && <progress max={100} value={searchJob.progress || undefined} />}<button type="button" className="button secondary" disabled={busy} onClick={() => { void run('cancel', {id:searchJob.id}); }}>Hủy tìm kiếm</button></div>}<small>Tìm kiếm dùng Chromium theo chế độ hiển thị hoặc chạy ngầm đã chọn trong Cài đặt. Nếu có CAPTCHA, hoàn tất trong chính cửa sổ đó; app chờ tối đa 3 phút và tự nhận kết quả sau xác minh. Nếu cần thêm thời gian, giữ tab mở rồi bấm tìm lại.</small></form><form className="dy-panel dy-scan" onSubmit={event => { void beginScan(event); }}><div className="dy-section-heading"><h2>Thêm video hoặc quét kênh</h2><span>Link chia sẻ ngắn, video hoặc trang kênh</span></div><label htmlFor="dy-url">Link Douyin</label><div className="dy-input-action"><input id="dy-url" value={url} onChange={e => { setUrl(e.target.value); setChannelId(''); }} required placeholder="https://v.douyin.com/… hoặc https://www.douyin.com/user/…" /><button className="button primary" disabled={busy || !snapshot.runtime.browserInstalled}><Search size={16} /> Quét video</button></div><div className="dy-form-grid"><label>Kênh đã lưu<select value={channelId} onChange={e => { const c = snapshot.channels.find(c => c.id === e.target.value); setChannelId(e.target.value); if (c) setUrl(c.url); }}><option value="">Dùng link bên trên</option>{snapshot.channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Khoảng thời gian<select value={period} onChange={e => setPeriod(e.target.value)}><option value="all">Toàn bộ video công khai</option><option value="day">Theo ngày</option><option value="week">Theo tuần (thứ Hai–Chủ nhật)</option><option value="month">Theo tháng</option><option value="range">Khoảng ngày tùy chọn</option></select></label>{period !== 'all' && <label>{period === 'range' ? 'Từ ngày' : 'Ngày thuộc khoảng cần tải'}<input aria-label="Ngày bắt đầu" type="date" value={anchor} onChange={e => setAnchor(e.target.value)} required /></label>}{period === 'range' && <label>Đến hết ngày<input type="date" min={anchor} value={end} onChange={e => setEnd(e.target.value)} required /></label>}</div><label className="dy-check"><input type="checkbox" checked={autoDownload} onChange={e => setAutoDownload(e.target.checked)} /> Tự tải các video trong khoảng thời gian đã chọn sau khi quét</label><small>Link video lẻ được tự tải sau khi quét. Chế độ Chromium chọn trong Cài đặt; cần hiển thị cửa sổ để xử lý CAPTCHA. Ngày/tuần/tháng tính theo múi giờ máy. Chỉ tải video truy cập được bằng phiên khách; bài ảnh được đánh dấu riêng. Quét video sẽ lưu kênh tác giả nếu lấy được thông tin.</small></form>
       <section className="dy-panel"><div className="dy-section-heading"><h2>Thư viện video <span>{videos.length}</span></h2><div className="dy-actions"><button className="button secondary" disabled={busy || !selected.size} onClick={() => { void queueSelected(); }}><ArrowDownToLine size={15} /> Tải đã chọn ({selected.size})</button><button className="button secondary" onClick={() => { setEditing({url: '', name: '', notes: '', tags: ''}); }}>Lưu kênh</button></div></div><div className="dy-filters"><label className="dy-search"><Search size={16} /><input aria-label="Tìm video" placeholder="Tìm theo tên, tác giả, ID…" value={filter} onChange={e => { setFilter(e.target.value); setLimit(60); }} /></label><select aria-label="Lọc theo kênh" value={videoChannel} onChange={e => { setVideoChannel(e.target.value); setLimit(60); }}><option value="">Tất cả kênh</option>{snapshot.channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{resultIds && <button className="button secondary" onClick={() => setResultIds(null)}>Bỏ lọc kết quả quét</button>}</div>{videos.length ? <><p className="dy-muted">Luôn lấy lại nguồn từ trang video và tải bản cao nhất Douyin cung cấp, giữ nguyên luồng hình. Nếu bản tốt nhất lỗi, app dừng và báo lỗi thay vì tự tải bản thấp hơn.</p><label className="dy-check"><input type="checkbox" checked={videos.filter(v => !v.isImage).length > 0 && videos.filter(v => !v.isImage).every(v => selected.has(v.id))} onChange={e => setSelected(e.target.checked ? new Set(videos.filter(v => !v.isImage).map(v => v.id)) : new Set())} /> Chọn toàn bộ {videos.length} kết quả</label><div className="dy-video-list">{videos.slice(0, limit).map(v => <article className="dy-video" key={v.id}><input aria-label={`Chọn video ${v.id}`} type="checkbox" disabled={v.isImage} checked={selected.has(v.id)} onChange={e => setSelected(current => { const next = new Set(current); if (e.target.checked) next.add(v.id); else next.delete(v.id); return next; })} /><span className="dy-video-symbol"><Video size={22} /></span><div className="dy-video-copy"><h3>{v.title}</h3><p>{v.author || 'Chưa rõ tác giả'} · {dateOnly(v.createdAt)} · {Math.round(v.duration || 0)} giây</p><small>{v.isImage ? 'Bài ảnh · chưa hỗ trợ tải video' : v.dubbedFile ? (v.voiceMode === 'narration' ? 'Đã thuyết minh' : 'Đã lồng tiếng') : v.file ? (v.qualityVerified ? 'Đã tải bản cao nhất' : 'Đã tải trên thiết bị') : 'Chưa tải'}{v.width && v.height ? ` · nguồn ${v.width}×${v.height}${v.bitRate ? ` · ${Math.round(v.bitRate/1000)} kbps` : ''}` : ''} · {v.id}</small></div><div className="dy-actions"><button className="icon-button" title="Mở video Douyin" aria-label={`Mở video ${v.id}`} onClick={() => { void openUrl(v.url).catch(e => setError(errorText(e))); }}><ExternalLink size={16} /></button>{v.file ? <><button className="icon-button" title="Mở vị trí video" aria-label={`Mở vị trí video ${v.id}`} onClick={() => { void revealItemInDir(v.dubbedFile || v.file).catch(e => setError(errorText(e))); }}><FolderOpen size={17} /></button><button className="button secondary" disabled={busy} onClick={() => { void run('download', {ids:[v.id], force:true}, 'Đã xếp tải lại bản cao nhất. Tệp cũ chỉ được thay sau khi tải và kiểm tra xong.'); }}><ArrowDownToLine size={15} /> Tải lại bản cao nhất</button><button className="button secondary" disabled={snapshot.runtime.speech?.supported === false} title={snapshot.runtime.speech?.message} onClick={() => setDubVideo(v)}><Mic2 size={15} /> Tạo giọng</button></> : <button className="button secondary" disabled={busy || v.isImage} onClick={() => { void run('download', { ids: [v.id] }, 'Đã xếp video vào hàng đợi tải.'); }}><ArrowDownToLine size={15} /> Tải</button>}</div></article>)}</div>{videos.length > limit && <button className="button secondary" onClick={() => setLimit(n => n+60)}>Xem thêm 60 video</button>}</> : <Empty icon="video" text={videoChannel ? 'Chưa có video của kênh này trong thư viện' : resultIds !== null ? 'Không tìm thấy kết quả video' : 'Tìm video công khai hoặc dán link để quét video đầu tiên'} detail={videoChannel ? selectedVideoChannel?.status || 'Quét kênh để tải danh sách video công khai.' : resultIds !== null ? searchJobId ? 'Đang tải kết quả tìm kiếm từ phiên khách Douyin…' : 'Douyin chưa trả video khớp từ khóa trong phiên khách.' : 'Video và kênh tham khảo được lưu riêng trên thiết bị này.'} />}</section></>}
      {tab === 'channels' && <section className="dy-panel"><div className="dy-section-heading"><div><h2>Kênh tham khảo</h2><p>Lưu link, ghi chú và chủ đề ngay cả khi bạn không đăng nhập Douyin.</p></div><div className="dy-actions"><button className="button secondary" onClick={() => { const blob = new Blob([JSON.stringify(snapshot.channels.map(({name,url,notes,tags,favorite}) => ({name,url,notes,tags,favorite})), null, 2)], {type:'application/json'}); const address = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = address; a.download = 'DTApp-kenh-Douyin.json'; a.click(); setTimeout(() => URL.revokeObjectURL(address), 1000); }}>Xuất danh sách</button><button className="button primary" onClick={() => setEditing({url:'', name:'', notes:'', tags:''})}><Plus size={16} /> Thêm kênh</button></div></div><label className="dy-search"><Search size={16} /><input aria-label="Tìm kênh tham khảo" placeholder="Tìm tên, chủ đề, ghi chú…" value={filter} onChange={e => setFilter(e.target.value)} /></label><div className="dy-channel-grid">{channels.map(c => <ChannelCard key={c.id} channel={c} busy={busy} run={run} onEdit={() => setEditing(c)} onScan={() => pickChannel(c)} />)}</div>{!channels.length && <Empty icon="bookmark" text="Góc cảm hứng của bạn" detail="Lưu kênh yêu thích, thêm ghi chú và bật theo dõi khi cần." />}</section>}
      {tab === 'jobs' && <section className="dy-panel"><div className="dy-section-heading"><h2>Tác vụ tải & lồng tiếng</h2><span>Hàng đợi giữ lại khi khởi động lại app</span></div>{snapshot.jobs.length ? <div className="dy-jobs">{snapshot.jobs.map(j => <article className="dy-job" key={j.id}><div className="dy-section-heading"><strong>{jobNames[j.kind] || j.kind}</strong><span className={`dy-status ${j.state}`}>{statusNames[j.state] || j.state}</span></div><p>{j.message}</p>{j.state === 'running' && <progress aria-label="Tiến độ tác vụ" max={100} value={j.progress || undefined} />}<div className="dy-section-heading"><small>{dateText(j.createdAt)}</small><div className="dy-actions">{j.resultIds && <button className="button secondary" onClick={() => { setResultIds(j.resultIds!); setVideoChannel(''); setFilter(''); setTab('videos'); }}>Xem {j.resultIds.length} video</button>}{j.output && <button className="button secondary" onClick={() => { void revealItemInDir(j.output).catch(e => setError(errorText(e))); }}><FolderOpen size={15} /> Mở vị trí tệp</button>}{['queued','running'].includes(j.state) ? <button className="button secondary" disabled={busy} onClick={() => { void run('cancel', {id:j.id}); }}>Hủy</button> : ['error','blocked','interrupted','cancelled','partial'].includes(j.state) && <button className="button secondary" disabled={busy} onClick={() => { void run('retry', {id:j.id}, 'Đã xếp tác vụ để thử lại.'); }}><RefreshCw size={14} /> Thử lại</button>}</div></div></article>)}</div> : <Empty icon="video" text="Chưa có tác vụ" detail="Tiến độ quét, tải video và tạo giọng sẽ xuất hiện ở đây." />}</section>}
      {tab === 'settings' && <Settings settings={snapshot.settings} snapshot={snapshot} busy={busy} run={run} />}
    </>}
    {editing && <ChannelEditor value={editing} error={error} busy={busy} close={() => setEditing(null)} onSave={async value => { const result = await run('save_channel', value, 'Đã lưu kênh tham khảo.'); if (result) setEditing(null); }} />}
     {dubVideo && <DubEditor video={dubVideo} jobs={snapshot?.jobs || []} error={error} busy={busy} close={() => setDubVideo(null)} onTranscribe={async (videoId, targetLanguage) => { const result = await run<{jobId:string}>('transcribe', {videoId, targetLanguage}, 'Đã xếp chép lời từ audio gốc. Model Whisper tải ở lần đầu nếu chưa có.'); return result?.jobId; }} onSave={async value => { const result = await run('dub', value, 'Đã xếp tác vụ OmniVoice. Model được tải khi chạy lần đầu.'); if (result) { setDubVideo(null); setTab('jobs'); } }} />}
  </main>;
}

function Empty({icon, text, detail}: {icon: string; text: string; detail: string}) {
  return <div className="dy-empty">{icon === 'bookmark' ? <Bookmark size={34} /> : <Video size={34} />}<h3>{text}</h3><p>{detail}</p></div>;
}

function ChannelCard({channel: c, busy, run, onEdit, onScan}: {channel: DouyinChannel; busy: boolean; run: Run; onEdit: () => void; onScan: () => void}) {
  const [interval, setIntervalValue] = useState(c.interval);
  const [remove, setRemove] = useState(false);
  return <article className="dy-channel"><div className="dy-section-heading"><span className="dy-avatar">{c.name.slice(0,1).toUpperCase()}</span><div className="dy-actions"><button className={`icon-button ${c.favorite ? 'dy-starred' : ''}`} aria-label={`Yêu thích ${c.name}`} aria-pressed={c.favorite} onClick={() => { void run('save_channel', {...c, favorite: !c.favorite}); }}><Star size={17} fill={c.favorite ? 'currentColor' : 'none'} /></button><button className="icon-button" aria-label={`Sửa ${c.name}`} onClick={onEdit}><Pencil size={16} /></button><button className="icon-button" aria-label={`Bỏ lưu ${c.name}`} onClick={() => setRemove(true)}><Trash2 size={16} /></button></div></div><h3>{c.name}</h3><a href={c.url} target="_blank" rel="noreferrer">{c.url}</a>{c.tags && <span className="dy-tags">{c.tags}</span>}<p className="dy-notes">{c.notes || 'Thêm ghi chú về ý tưởng bạn muốn tham khảo…'}</p><div className="dy-channel-meta"><span>{c.videoCount} video đã quét</span><span className={c.monitor ? 'dy-live' : ''}>{c.monitor ? '● Đang theo dõi' : 'Chưa theo dõi'}</span></div><div className="dy-monitor"><label>Kiểm tra mỗi<select aria-label={`Chu kỳ kiểm tra ${c.name}`} value={interval} onChange={e => setIntervalValue(Number(e.target.value))}>{[30,60,300,900,3600,86400].map(s => <option key={s} value={s}>{s < 60 ? `${s} giây` : s < 3600 ? `${s/60} phút` : `${s/3600} giờ`}</option>)}</select></label><button className={`button ${c.monitor ? 'secondary' : 'primary'}`} disabled={busy} onClick={() => { void run('monitor', {id:c.id, enabled:!c.monitor, interval}, c.monitor ? 'Đã tắt theo dõi.' : 'Đã bật theo dõi. Video đăng từ lúc bật sẽ tự tải khi phát hiện.'); }}><Radio size={14} />{c.monitor ? 'Tắt theo dõi' : 'Theo dõi mới'}</button></div>{c.monitor && interval !== c.interval && <button className="button secondary" disabled={busy} onClick={() => { void run('monitor', {id:c.id, enabled:true, interval}, 'Đã cập nhật chu kỳ.'); }}>Áp dụng chu kỳ</button>}<small>Kiểm tra gần nhất: {dateText(c.lastCheck)}</small>{c.monitor && <small>Lượt tiếp theo: {dateText(c.nextCheck)}</small>}{c.status && <small className={c.failures ? 'dy-warning' : ''}>{c.status}</small>}<div className="dy-actions"><button className="button secondary" onClick={onScan}><Search size={14} /> Quét / tải kênh</button><button className="icon-button" aria-label={`Mở kênh ${c.name}`} onClick={() => { void run('open_guest', {url:c.url}); }}><ExternalLink size={17} /></button></div>{remove && <div className="dy-remove"><p>Bỏ lưu kênh này? Video trên đĩa vẫn được giữ lại.</p><button className="button secondary" onClick={() => setRemove(false)}>Giữ lại</button><button className="button secondary" disabled={busy} onClick={() => { void run('remove_channel', {id:c.id}); }}>Bỏ lưu</button></div>}</article>;
}

function Dialog({title, close, children}: {title: string; close: () => void; children: React.ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-label={title} className="dy-dialog" onCancel={event => {event.preventDefault(); close();}}><div className="dy-section-heading"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Đóng"><X size={19} /></button></div>{children}</dialog>;
}

function ChannelEditor({value, error, busy, close, onSave}: {value: Partial<DouyinChannel>; error: string; busy: boolean; close: () => void; onSave: (value: Partial<DouyinChannel>) => Promise<void>}) {
  const [form, setForm] = useState(value);
  return <Dialog title={value.id ? 'Sửa kênh tham khảo' : 'Lưu kênh tham khảo'} close={close}><form className="dy-form" onSubmit={e => {e.preventDefault(); void onSave(form);}}><label>Tên gợi nhớ<input autoFocus required maxLength={120} value={form.name || ''} onChange={e => setForm({...form, name:e.target.value})} placeholder="Kênh nấu ăn, ý tưởng sản phẩm…" /></label><label>Link trang kênh hoặc link tham khảo<input required value={form.url || ''} onChange={e => setForm({...form, url:e.target.value})} placeholder="https://www.douyin.com/user/…" /></label><label>Chủ đề<input maxLength={300} value={form.tags || ''} onChange={e => setForm({...form, tags:e.target.value})} placeholder="Ẩm thực, review, cách dựng…" /></label><label>Ghi chú<textarea rows={4} maxLength={4000} value={form.notes || ''} onChange={e => setForm({...form, notes:e.target.value})} /></label><label className="dy-check"><input type="checkbox" checked={!!form.favorite} onChange={e => setForm({...form, favorite:e.target.checked})} /> Đánh dấu yêu thích</label><p className="dy-muted">Lưu tham khảo không yêu cầu đăng nhập. Để theo dõi tự động cần link trang kênh /user/.</p>{error && <p role="alert" className="dy-warning">{error}</p>}<button className="button primary" disabled={busy}><Check size={16} /> Lưu kênh</button></form></Dialog>;
}

export function DubEditor({video, jobs, error, busy, close, onTranscribe, onSave}: {video: DouyinVideo; jobs: MediaJob[]; error: string; busy: boolean; close: () => void; onTranscribe: (videoId: string, language: string) => Promise<string | undefined>; onSave: (value: unknown) => Promise<void>}) {
  const [sourceMode, setSourceMode] = useState<'audio' | 'script'>('audio');
  const [script, setScript] = useState('');
  const [voiceMode, setVoiceMode] = useState<'narration' | 'dub'>('narration');
  const [language, setLanguage] = useState('vi');
  const [refAudio, setRefAudio] = useState('');
  const [refText, setRefText] = useState('');
  const [originalVolume, setOriginalVolume] = useState(0.25);
  const [fast, setFast] = useState(false);
  const [fileError, setFileError] = useState('');
  const [transcriptionJobId, setTranscriptionJobId] = useState('');
  const [preparedJobId, setPreparedJobId] = useState('');
  const transcription = jobs.find(item => item.id === transcriptionJobId);
  const doneId = transcription?.state === 'done' ? transcription.id : '';
  const failedMessage = transcription && ['error','blocked','cancelled','interrupted'].includes(transcription.state) ? transcription.message : '';
  useEffect(() => {
    if (!doneId) return;
    let active = true;
    void mediaRequest<{transcript:string; referenceAudio:string; referenceText:string; subtitleFile:string}>('transcript_result', {id:doneId}).then(result => {
      if (!active) return;
      setScript(result.transcript); setRefAudio(result.referenceAudio); setRefText(result.referenceText);
      setPreparedJobId(doneId); setFileError('Đã tạo phụ đề từ audio và lưu SRT cạnh video. Có thể chỉnh lời trước khi tạo giọng.');
    }).catch(reason => { if (active) setFileError(errorText(reason)); }).finally(() => { if (active) setTranscriptionJobId(''); });
    return () => { active = false; };
  }, [doneId]);
  useEffect(() => { if (failedMessage) { setFileError(failedMessage); setTranscriptionJobId(''); } }, [failedMessage]);
  const prepare = async () => {
    setFileError('Đang nhận dạng audio và dịch phụ đề. Lần đầu sẽ tải model cần thiết.');
    const id = await onTranscribe(video.id, language);
    if (id) setTranscriptionJobId(id);
    else setFileError('Không xếp được tác vụ. Kiểm tra môi trường giọng tích hợp trong Cài đặt.');
  };
  return <Dialog title="Thuyết minh / lồng tiếng · OmniVoice" close={close}><form className="dy-form" onSubmit={event => {
    event.preventDefault();
    if (sourceMode === 'script' && (!script.trim() || !refAudio || !refText.trim())) { setFileError('Tạo phụ đề từ audio để lấy mẫu giọng trước khi dùng SRT tùy chỉnh.'); return; }
    void onSave({videoId:video.id, fromAudio:sourceMode === 'audio', subtitleJobId:preparedJobId || undefined, script, language, refAudio, refText, voiceMode, originalVolume:voiceMode === 'narration' ? originalVolume : 0, fast});
  }}>
    <p className="dy-muted">{video.title}</p>
    <label>Nội dung giọng đọc<select value={sourceMode} onChange={e => setSourceMode(e.target.value as 'audio' | 'script')}><option value="audio">Tự động từ audio gốc → dịch phụ đề → tạo giọng</option><option value="script">Dùng phụ đề đã chỉnh / nhập SRT</option></select></label>
    <div className="dy-form-grid"><label>Chế độ<select value={voiceMode} onChange={e => setVoiceMode(e.target.value as 'narration' | 'dub')}><option value="narration">Thuyết minh · giữ tiếng gốc nền</option><option value="dub">Lồng tiếng · thay tiếng gốc</option></select></label>
    <label>Ngôn ngữ giọng và phụ đề<select disabled={!!transcriptionJobId} value={language} onChange={e => { setLanguage(e.target.value); setPreparedJobId(''); setScript(''); setRefAudio(''); setRefText(''); }}><option value="vi">Tiếng Việt</option><option value="en">English</option><option value="zh">中文</option><option value="ja">日本語</option><option value="ko">한국어</option></select></label>
    {voiceMode === 'narration' && <label>Tiếng gốc bên dưới: {Math.round(originalVolume*100)}%<input type="range" min={0} max={0.6} step={0.05} value={originalVolume} onChange={e => setOriginalVolume(Number(e.target.value))} /></label>}</div>
    <p className="dy-muted">Mặc định tự chép audio của video, dịch sang tiếng Việt theo từng mốc phụ đề, rồi tạo giọng bằng mẫu tiếng trích từ chính video. Có thể bấm tạo ngay hoặc xem/sửa phụ đề trước.</p>
    <button type="button" className="button secondary" disabled={busy || !!transcriptionJobId} onClick={() => { void prepare(); }}><Mic2 size={15} /> Tạo / xem phụ đề từ audio</button>
    {transcription && <p role="status" className="dy-muted">{transcription.message}</p>}
    <label>Phụ đề / lời thoại<textarea required={sourceMode === 'script'} rows={7} maxLength={50000} value={script} onChange={e => setScript(e.target.value)} disabled={!!transcriptionJobId || (sourceMode === 'audio' && !preparedJobId)} placeholder="Tự tạo phụ đề từ audio khi bấm Tạo giọng. Muốn xem hoặc chỉnh trước, bấm Tạo / xem phụ đề từ audio." /></label>
    {sourceMode === 'script' && <label>Nhập SRT/TXT<input type="file" accept=".srt,.txt" onChange={e => { const file=e.target.files?.[0]; if (!file) return; if (file.size>200000) { setFileError('Tệp tối đa 200 KB.'); return; } void file.text().then(setScript).catch(reason => setFileError(errorText(reason))); }} /></label>}
    <label className="dy-check"><input type="checkbox" checked={fast} onChange={e => setFast(e.target.checked)} /> Chế độ nhanh: 16 bước (mặc định 32 bước)</label>
    <p className="dy-muted">SRT được lưu cạnh video. Model nhận dạng và dịch tải ở lần sử dụng đầu tiên. Hình ảnh được giữ nguyên chất lượng.</p>
    {(fileError || error) && <p className="dy-warning" role="status">{fileError || error}</p>}
    <button className="button primary" disabled={busy || !!transcriptionJobId}><Mic2 size={16} /> {sourceMode === 'audio' && !preparedJobId ? 'Audio → phụ đề → giọng & xuất video' : 'Tạo giọng & xuất video'}</button>
  </form></Dialog>;
}

export function Settings({settings, snapshot, busy, run}: {settings: MediaSettings; snapshot: MediaSnapshot; busy: boolean; run: Run}) {
  const [form, setForm] = useState(settings);
  const [fileError, setFileError] = useState('');
  useEffect(() => { setForm(settings); }, [settings.downloadDir, settings.device, settings.browserVisible]);
  const speech = snapshot.runtime.speech;
  const chooseDirectory = async () => {
    try { const path = await open({directory:true, multiple:false}); if(typeof path==='string') setForm(value => ({...value, downloadDir:path})); }
    catch(reason) { setFileError(errorText(reason)); }
  };
  return <div className="dy-settings-grid">
    <form className="dy-panel dy-form" onSubmit={event => { event.preventDefault(); void run('save_settings', form, 'Đã lưu cài đặt trên thiết bị.'); }}>
      <h2>Tệp & xử lý giọng</h2>
      <label>Thư mục lưu video<div className="dy-input-action"><input value={form.downloadDir} onChange={e => setForm({...form, downloadDir:e.target.value})} required /><button type="button" className="button secondary" onClick={() => { void chooseDirectory(); }}>Chọn</button></div></label>
      <h3>Môi trường giọng tích hợp</h3>
      <p className="dy-muted" role="status">{speech?.message || 'Python và OmniVoice được quản lý tự động trong app.'}</p>
      <p className="dy-muted">Không cần cài hay chọn Python. Bộ nhận dạng, dịch phụ đề và OmniVoice đi kèm app; các model tải khi dùng lần đầu. Chế độ tự động có thể tải thêm gói tăng tốc NVIDIA cho máy phù hợp.</p>
      <button type="button" className="button secondary" disabled={busy || speech?.supported === false} onClick={() => { void run('install_voice', {device:form.device}, 'Đã xếp kiểm tra và chuẩn bị môi trường giọng tích hợp.'); }}><Mic2 size={16} /> Kiểm tra / chuẩn bị giọng</button>
      <label>Thiết bị tính toán<select value={form.device} onChange={e => setForm({...form, device:e.target.value})}><option value="auto">Tự động (chuẩn bị tăng tốc khi có)</option><option value="cuda" disabled={speech?.cudaSupported === false}>NVIDIA CUDA · tự chuẩn bị lần đầu</option><option value="mps">Apple Silicon MPS</option><option value="cpu">CPU tích hợp · dùng ngay</option></select></label>
      <label>Chế độ Chromium<select value={form.browserVisible ? 'visible' : 'headless'} onChange={e => setForm({...form, browserVisible:e.target.value === 'visible'})}><option value="visible">Hiển thị cửa sổ</option><option value="headless">Chạy ngầm</option></select></label>
      {fileError && <p className="dy-warning" role="alert">{fileError}</p>}
      <button className="button primary" disabled={busy}><Check size={16} /> Lưu cài đặt</button>
    </form>
    <section className="dy-panel dy-form"><h2>Phiên khách Douyin</h2><p>Trình duyệt riêng lưu cookie khách tại thiết bị.</p><p>Trạng thái: <strong>{snapshot.runtime.browserInstalled ? 'Đã cài Chromium' : 'Đang chuẩn bị Chromium'}</strong></p>
      <button className="button secondary" disabled={busy} onClick={() => { void run('install_browser', {}, 'Đã thêm tác vụ cài/cập nhật trình duyệt.'); }}>Cài / cập nhật Chromium</button>
      <button className="button secondary" disabled={busy} onClick={() => { void run('open_guest', {}, 'Đã xếp tác vụ mở phiên khách.'); }}>Mở cửa sổ khách</button>
      <button className="button secondary" disabled={busy} onClick={() => { void run('close_guest', {}, 'Đã xếp tác vụ đóng cửa sổ khách.'); }}>Đóng cửa sổ khách</button>
      <p className="dy-muted">Khi Douyin yêu cầu CAPTCHA, mở cửa sổ khách để tự xác minh. Chế độ khách chỉ lấy được nội dung Douyin công khai.</p><small>Dữ liệu cục bộ: {snapshot.runtime.dataDir}</small>
      <a href="https://github.com/k2-fsa/OmniVoice" target="_blank" rel="noreferrer">OmniVoice · mã nguồn chính thức <ExternalLink size={13} /></a>
    </section>
  </div>;
}
