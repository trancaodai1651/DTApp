import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, CircleHelp, LoaderCircle, Moon, Plus, ShieldCheck, Sun, Trash2, UserRound, Users, X } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addManagedUser, deleteManagedUser, readManagedUsers, updateManagedUser, type AppRole, type AppUserRecord } from './cloud';
import { supportsEdgeOAuth, type OAuthBrowser } from './desktop';

export function GoogleLoginPage({ loading, error, onGoogle, onRetry, language, appearance, onToggleLanguage, onToggleTheme, t }: {
  loading: boolean;
  error: string;
  onGoogle: (emailHint?: string, browser?: OAuthBrowser) => void;
  onRetry: (emailHint?: string, browser?: OAuthBrowser) => void;
  language: 'vi' | 'en';
  appearance: 'light' | 'dark';
  onToggleLanguage: () => void;
  onToggleTheme: () => void;
  t: (text: string) => string;
}) {
  const [emailHint, setEmailHint] = useState('');
  const [browser, setBrowser] = useState<OAuthBrowser>('default');
  return <main className="access-screen" lang={language} data-theme={appearance}><div className="access-tools"><button className="language-toggle" onClick={onToggleLanguage}>{language === 'vi' ? 'EN' : 'VI'}</button><button className="icon-button" onClick={onToggleTheme} aria-label={t(appearance === 'light' ? 'Chế độ tối' : 'Chế độ sáng')}>{appearance === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button></div>
    <section className="access-card">
      <div className="access-brand"><span className="logo-mark">D<span /></span><span>DT App</span></div>
      <span className="access-kicker"><ShieldCheck size={15} /> {t('KHÔNG GIAN CÓ KIỂM SOÁT')}</span>
      <h1>{t('Đăng nhập để tiếp tục')}</h1>
      <p>{t('Dùng tài khoản Google đã được DT App cấp quyền để mở công cụ, quản lý bio và đồng bộ dữ liệu.')}</p>
      <form className="access-login-form" onSubmit={event => { event.preventDefault(); onGoogle(emailHint.trim() || undefined, browser); }}>
      <label className="field-label" htmlFor="google-email-hint">{t('Email Google (tùy chọn)')}</label>
      <input id="google-email-hint" type="email" autoComplete="email" maxLength={254} value={emailHint} onChange={event => setEmailHint(event.target.value)} placeholder="you@gmail.com" />
      {supportsEdgeOAuth() && <><label className="field-label" htmlFor="google-browser">{t('Trình duyệt đăng nhập')}</label><select id="google-browser" value={browser} onChange={event => setBrowser(event.target.value === 'edge' ? 'edge' : 'default')}><option value="default">{t('Trình duyệt mặc định')}</option><option value="edge">Microsoft Edge</option></select><p>{t('Nếu Chrome bị treo, chọn Microsoft Edge rồi đăng nhập lại. Không thay đổi trình duyệt mặc định của máy.')}</p></>}
      <button type="submit" className="button primary access-google-button" disabled={loading}>
        {loading ? <LoaderCircle className="spin" size={18} /> : <GoogleMark />}
        {loading ? t('Đang chờ Google…') : t('Tiếp tục với Google')}
      </button>
      </form>
      {loading && <><p>{t('Hoàn tất đăng nhập trong trình duyệt, sau đó mở lại DT App. Nếu trang chọn tài khoản bị kẹt, thử lại và điền email ở trên.')}</p><button className="button secondary full" onClick={() => onRetry(emailHint.trim() || undefined, browser)}>{t('Thử đăng nhập lại')}</button></>}
      {error && <p className="access-error" role="alert">{error}</p>}
      <div className="access-footnote"><CircleHelp size={15} /><span>{t('Tài khoản đầu tiên có quyền quản trị là trancaodai1651@gmail.com. Quản trị viên có thể cấp quyền cho người dùng khác.')}</span></div>
    </section>
  </main>;
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" width="19" height="19"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4 6.2v5h6.5c3.8-3.5 6.1-8.6 6.1-14.9Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.5-5c-1.8 1.2-4.1 2-7 2-5.4 0-10-3.7-11.6-8.7H5.7v5.2A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.4 27.5a12 12 0 0 1 0-7V15H5.7a20 20 0 0 0 0 18l6.7-5.5Z"/><path fill="#EA4335" d="M24 11.8c3 0 5.6 1 7.7 3l5.8-5.8A19.4 19.4 0 0 0 24 4 20 20 0 0 0 5.7 15l6.7 5.5c1.6-5 6.2-8.7 11.6-8.7Z"/></svg>;
}

export function AccessDeniedPage({ email, error, loading, onRetry, onSignOut, language, appearance, onToggleLanguage, onToggleTheme, t }: {
  email: string;
  error: string;
  loading: boolean;
  onRetry: () => void;
  onSignOut: () => void;
  language: 'vi' | 'en';
  appearance: 'light' | 'dark';
  onToggleLanguage: () => void;
  onToggleTheme: () => void;
  t: (text: string) => string;
}) {
  return <main className="access-screen" lang={language} data-theme={appearance}><div className="access-tools"><button className="language-toggle" onClick={onToggleLanguage}>{language === 'vi' ? 'EN' : 'VI'}</button><button className="icon-button" onClick={onToggleTheme} aria-label={t(appearance === 'light' ? 'Chế độ tối' : 'Chế độ sáng')}>{appearance === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button></div><section className="access-card access-denied-card">
    <div className="access-icon access-icon-denied"><X size={23} /></div>
    <h1>{loading ? t('Đang kiểm tra quyền truy cập…') : t('Tài khoản chưa được cấp quyền')}</h1>
    <p>{email ? <>{t('Tài khoản')} <strong>{email}</strong> {t('chưa nằm trong danh sách được phép dùng DT App.')}</> : t('Phiên hiện tại không có email Google hợp lệ.')}</p>
    {error && <p className="access-error" role="alert">{error}</p>}
    <div className="access-actions"><button className="button primary" onClick={onRetry} disabled={loading}><UserRound size={17} /> {t('Kiểm tra lại quyền')}</button><button className="button secondary" onClick={onSignOut}>{t('Đăng xuất / đổi tài khoản')}</button></div>
  </section></main>;
}

export function UsersPage({ client, currentEmail, t, notify }: {
  client: SupabaseClient;
  currentEmail: string;
  t: (text: string) => string;
  notify: (message: string, error?: boolean) => void;
}) {
  const [users, setUsers] = useState<AppUserRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AppUserRecord>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<AppRole>('editor');
  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await readManagedUsers(client)); setDrafts({}); }
    catch (error) { notify(error instanceof Error ? error.message : t('Không tải được danh sách người dùng.'), true); }
    finally { setLoading(false); }
  }, [client, notify, t]);
  useEffect(() => { void load(); }, [load]);
  const change = (email: string, patch: Partial<AppUserRecord>) => {
    setDrafts(value => {
      const base = value[email] || users.find(user => user.email === email)!;
      return { ...value, [email]: { ...base, ...patch } };
    });
  };
  const add = async (event: FormEvent) => {
    event.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { notify(t('Hãy nhập địa chỉ email hợp lệ.'), true); return; }
    setSaving('new');
    try {
      await addManagedUser(client, { email, displayName: newName, role: newRole });
      setNewEmail(''); setNewName(''); setNewRole('editor'); await load(); notify(t('Đã cấp quyền. Người dùng có thể đăng nhập bằng Google với email này.'));
    } catch (error) { notify(error instanceof Error ? error.message : t('Không thêm được người dùng.'), true); }
    finally { setSaving(''); }
  };
  const save = async (email: string) => {
    const item = drafts[email]; if (!item) return;
    setSaving(email);
    try { await updateManagedUser(client, item); await load(); notify(t('Đã cập nhật quyền người dùng.')); }
    catch (error) { notify(error instanceof Error ? error.message : t('Không cập nhật được người dùng.'), true); }
    finally { setSaving(''); }
  };
  const remove = async (email: string) => {
    if (!window.confirm(`${t('Gỡ quyền truy cập của')} ${email}?`)) return;
    setSaving(email);
    try { await deleteManagedUser(client, email); await load(); notify(t('Đã gỡ quyền truy cập người dùng.')); }
    catch (error) { notify(error instanceof Error ? error.message : t('Không gỡ được quyền người dùng.'), true); }
    finally { setSaving(''); }
  };
  const roleLabel = (role: AppRole) => role === 'admin' ? t('Quản trị viên') : t('Biên tập viên');
  return <main className="users-page">
    <div className="page-title"><div><div className="eyebrow"><span /> {t('QUẢN TRỊ DT APP')}</div><h1>{t('Người dùng & quyền truy cập')}<span>.</span></h1><p>{t('Cấp quyền theo email Google. Người dùng chỉ xem và sửa bio, thiết kế của chính họ.')}</p></div></div>
    <form className="panel user-add-form" onSubmit={add}>
      <div className="user-form-heading"><span className="user-page-icon"><Plus size={18} /></span><div><h2>{t('Thêm người dùng')}</h2><p>{t('Người dùng cần đăng nhập Google bằng đúng địa chỉ email được cấp.')}</p></div></div>
      <div className="user-add-fields"><label><span>{t('Email Google')}</span><input type="email" required value={newEmail} onChange={event => setNewEmail(event.target.value)} placeholder="name@gmail.com" /></label><label><span>{t('Tên hiển thị')}</span><input maxLength={80} value={newName} onChange={event => setNewName(event.target.value)} placeholder={t('Tên người dùng')} /></label><label><span>{t('Vai trò')}</span><select value={newRole} onChange={event => setNewRole(event.target.value as AppRole)}><option value="editor">{t('Biên tập viên')}</option><option value="admin">{t('Quản trị viên')}</option></select></label><button className="button primary" disabled={saving === 'new'}><Plus size={16} /> {t('Cấp quyền')}</button></div>
    </form>
    <section className="panel users-list-panel"><div className="users-list-heading"><div><h2><Users size={19} /> {t('Danh sách người dùng')}</h2><p>{users.length} {t('tài khoản được cấp quyền')}</p></div>{loading && <LoaderCircle className="spin" size={19} />}</div>
      {loading ? <div className="users-empty">{t('Đang tải danh sách…')}</div> : users.length === 0 ? <div className="users-empty">{t('Chưa có người dùng nào.')}</div> : <div className="managed-users">{users.map(user => {
        const item = drafts[user.email] || user;
        const dirty = !!drafts[user.email];
        const isOwner = user.email === 'trancaodai1651@gmail.com';
        return <article className="managed-user-row" key={user.email}>
          <div className="managed-user-avatar">{(item.displayName || item.email).slice(0, 1).toUpperCase()}</div>
          <div className="managed-user-fields"><label><span>{t('Email Google')}</span><input value={item.email} readOnly aria-label={`${t('Email Google')} ${item.email}`} /></label><label><span>{t('Tên hiển thị')}</span><input value={item.displayName} maxLength={80} onChange={event => change(user.email, { displayName: event.target.value })} /></label><label><span>{t('Vai trò')}</span><select value={item.role} disabled={isOwner} onChange={event => change(user.email, { role: event.target.value as AppRole })}><option value="editor">{t('Biên tập viên')}</option><option value="admin">{t('Quản trị viên')}</option></select></label><label className="user-active-toggle"><input type="checkbox" checked={item.isActive} disabled={isOwner} onChange={event => change(user.email, { isActive: event.target.checked })} /><span>{t(item.isActive ? 'Đang hoạt động' : 'Đã tạm khoá')}</span></label></div>
          <div className="managed-user-actions"><small className={`role-pill ${item.role}`}>{roleLabel(item.role)}</small>{user.email === currentEmail && <small className="current-user-pill">{t('Bạn')}</small>}<button className="button secondary compact" onClick={() => void save(user.email)} disabled={!dirty || !!saving}><Check size={15} /> {t('Lưu')}</button><button className="icon-button danger-icon" title={t('Gỡ quyền truy cập')} aria-label={`${t('Gỡ quyền truy cập')} ${user.email}`} onClick={() => void remove(user.email)} disabled={isOwner || !!saving}><Trash2 size={16} /></button>{isOwner && <small className="owner-note">{t('Chủ sở hữu')}</small>}</div>
        </article>;
      })}</div>}
    </section>
    <p className="users-security-note"><ShieldCheck size={17} /> {t('Gỡ quyền sẽ chặn đăng nhập và truy cập dữ liệu của người dùng. Dữ liệu đã tạo vẫn nằm trong Supabase để quản trị viên quyết định sau.')}</p>
  </main>;
}
