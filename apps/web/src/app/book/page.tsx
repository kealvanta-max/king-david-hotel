import { Suspense } from 'react';
import { BookingFlow } from '@/components/booking-flow';
export const metadata = { title: 'Plan your stay' };
export default function BookPage() { return <Suspense fallback={<div className="container section"><p>Preparing your stay…</p></div>}><BookingFlow /></Suspense>; }
