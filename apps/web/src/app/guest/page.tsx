import { Suspense } from 'react';
import { GuestPortal } from '@/components/guest-portal';
export const metadata = { title: 'Your booking', robots: { index: false, follow: false } };
export default function GuestPage() { return <Suspense fallback={<div className="container section">Loading your plans…</div>}><GuestPortal /></Suspense>; }
