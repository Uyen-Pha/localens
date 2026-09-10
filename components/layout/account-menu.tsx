'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { UserRound, LogOut, Tickets } from 'lucide-react';
import { loadPortalSurfaceComposition } from '@/components/portals/portal-session';
import type { PortalIdentity } from '@/lib/application/portal/contracts';
import type { Locale } from '@/lib/i18n/config';
import styles from './account-menu.module.css';

export function AccountMenu({ locale, signIn }: { locale: Locale; signIn: string }) {
  const [identity, setIdentity] = useState<Pick<PortalIdentity, 'displayName' | 'email' | 'role'> | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const vi = locale === 'vi';
  useEffect(() => {
    let alive = true;
    const refresh = () => { void loadPortalSurfaceComposition().then(async shell => { await shell.initialized; const next = await shell.session.getSession(); if (alive) setIdentity(next); }).catch(() => { if (alive) setIdentity(null); }); };
    refresh(); setOpen(false);
    window.addEventListener('localens-account-changed', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => { alive = false; window.removeEventListener('localens-account-changed', refresh); window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh); };
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    function pointer(e: PointerEvent) { if (!wrapper.current?.contains(e.target as Node)) setOpen(false); }
    function key(e: KeyboardEvent) { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } }
    document.addEventListener('pointerdown', pointer); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', key); };
  }, [open]);
  if (!identity) return <Link className="site-header__cta" href={`/${locale}/sign-in/`}>{signIn}</Link>;
  const initials = identity.displayName.trim().split(/\s+/).map(s => Array.from(s)[0]).slice(-2).join('').toUpperCase();
  const destination = `/${locale}/${identity.role === 'customer' ? 'account' : identity.role}/`;
  return <div className={styles.wrapper} ref={wrapper}>
    <button ref={trigger} className={styles.avatar} aria-label={vi ? 'Mở menu tài khoản' : 'Open account menu'} aria-expanded={open} aria-controls="account-menu" onClick={() => setOpen(v => !v)}>{initials || <UserRound size={22}/>}</button>
    {open && <div id="account-menu" className={styles.dropdown}>
      <p className={styles.name}>{identity.displayName}</p><p className={styles.email}>{identity.email}</p>
      <nav aria-label={vi ? 'Tài khoản' : 'Account'}>{identity.role === 'customer' && <Link href={`/${locale}/bookings/`} onClick={() => setOpen(false)}><Tickets size={20}/>{vi ? 'Đơn đặt tour' : 'Bookings'}</Link>}<Link href={destination} onClick={() => setOpen(false)}><UserRound size={20}/>{vi ? 'Quản lý tài khoản' : 'My profile'}</Link></nav>
      <button className={styles.logout} disabled={busy} onClick={async () => { setBusy(true); setError(false); try { const shell = await loadPortalSurfaceComposition(); await shell.session.signOut(); setIdentity(null); setOpen(false); router.replace(`/${locale}/sign-in/`); } catch { setError(true); } finally { setBusy(false); } }}><LogOut size={19}/>{vi ? 'Đăng xuất' : 'Log out'}</button>
      {error && <p role="alert">{vi ? 'Chưa thể đăng xuất. Vui lòng thử lại.' : 'Unable to log out. Please try again.'}</p>}
    </div>}
  </div>;
}
