import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
export default function NotFound() { return <div className="not-found"><div className="eyebrow" style={{ justifyContent: 'center' }}>A SMALL DETOUR</div><h1>Let’s get you back.</h1><p>This page isn’t part of the stay. Try the homepage or your booking portal.</p><Link href="/" className="button button-primary">Back to King David <ArrowRight size={16} /></Link></div>; }
