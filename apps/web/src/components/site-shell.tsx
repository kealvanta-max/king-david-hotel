'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ArrowUpRight, Crown, Menu, X, ArrowRight, MapPin } from 'lucide-react';
import { useDemo } from '@/lib/demo';

export function Brand({ light = false }: { light?: boolean }) { return <Link href="/" className={`brand ${light ? 'brand-light' : ''}`} aria-label="King David home"><Crown size={29} strokeWidth={1.25} aria-hidden="true" /><span><span className="brand-name">KING DAVID</span><span className="brand-sub">EVENT & GUESTHOUSE</span></span></Link>; }
const nav = [{ href: '/stay', label: 'Rooms & stays' }, { href: '/events', label: 'Events & gatherings' }, { href: '/experiences', label: 'The experience' }, { href: '/location', label: 'Find us' }];
export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { storageError } = useDemo();
  const admin = pathname.startsWith('/admin');
  if (admin) return <>{storageError && <div className="storage-alert" role="alert">{storageError}</div>}{children}</>;
  return <>
    <div className="preview-bar"><span><span className="preview-dot" /> Preview edition</span><span>Real hospitality starts with honest details. Property information is awaiting verification.</span><Link href="/admin">Explore the workspace <ArrowUpRight size={12} /></Link></div>
    <header className="site-header"><div className="header-inner"><Brand /><nav className="desktop-nav" aria-label="Main navigation">{nav.map(n => <Link key={n.href} href={n.href} className={pathname === n.href ? 'active' : ''}>{n.label}</Link>)}</nav><div className="header-actions"><Link href="/contact" className="contact-link">Get in touch</Link><Link className="button button-primary button-small" href="/book">Plan your stay <ArrowUpRight size={16} /></Link><button className="icon-button mobile-menu" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button></div></div>{open && <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">{[...nav, { href: '/contact', label: 'Get in touch' }, { href: '/book', label: 'Check demo availability' }, { href: '/guest', label: 'Your booking' }].map(n => <Link key={n.href} href={n.href} onClick={() => setOpen(false)}>{n.label}<ArrowUpRight size={17} /></Link>)}</nav>}</header>
    {storageError && <div className="storage-alert" role="alert">{storageError}</div>}
    <main id="main-content">{children}</main>
    <footer className="site-footer"><div className="footer-top"><div><Brand light /><p className="footer-tagline">Your comfort. Our priority.</p><p className="footer-place"><MapPin size={14} /> Gomoa, Ghana · exact location to be confirmed</p></div><div className="footer-links"><span>MAKE YOURSELF AT HOME</span><Link href="/stay">Rooms & stays</Link><Link href="/events">Events & gatherings</Link><Link href="/experiences">The experience</Link></div><div className="footer-links"><span>LET’S MAKE A PLAN</span><Link href="/book">Check demo availability</Link><Link href="/events#enquire">Plan an event</Link><Link href="/guest">Your booking</Link><Link href="/contact">Contact & enquiries</Link></div><div className="footer-note"><Crown size={25} strokeWidth={1} /><p>Room to rest.<br />Space to come together.</p><Link href="/admin">Staff workspace <ArrowRight size={15} /></Link></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} King David Event & Guesthouse</span><div><Link href="/policies">Policies & privacy</Link><span>GHS · English</span><span>Made with care, in Ghana.</span></div></div></footer>
  </>;
}
