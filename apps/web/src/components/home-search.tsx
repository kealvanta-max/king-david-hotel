'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Users, ArrowUpRight, BedDouble } from 'lucide-react';
export function HomeSearch() {
  const router = useRouter();
  const [start, setStart] = useState(''); const [end, setEnd] = useState(''); const [guests, setGuests] = useState('2');
  const today = new Date().toISOString().slice(0, 10);
  return <form className="booking-search" onSubmit={e => { e.preventDefault(); const params = new URLSearchParams({ start, end, guests }); router.push(`/book?${params}`); }}><div className="search-intro"><h3>Your next chapter</h3><p>Start with a few details.</p></div><div className="search-field"><label htmlFor="home-arrival"><CalendarDays size={12} />Arrival</label><input id="home-arrival" type="date" required min={today} value={start} onChange={e => { setStart(e.target.value); if (end <= e.target.value) setEnd(''); }} /></div><div className="search-field"><label htmlFor="home-departure"><CalendarDays size={12} />Departure</label><input id="home-departure" type="date" required min={start ? new Date(Date.parse(start) + 86400000).toISOString().slice(0, 10) : today} value={end} onChange={e => setEnd(e.target.value)} /></div><div className="search-field"><label htmlFor="home-guests"><Users size={12} />Guests</label><select id="home-guests" value={guests} onChange={e => setGuests(e.target.value)}>{[1,2,3,4,5,6,8].map(n => <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>)}</select></div><button className="button button-primary" type="submit">Check availability <ArrowUpRight size={16} /></button></form>;
}
