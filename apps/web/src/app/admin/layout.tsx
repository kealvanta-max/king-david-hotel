import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin-shell';
export const metadata: Metadata = { title: { default: 'Staff workspace', template: '%s · King David workspace' }, robots: { index: false, follow: false } };
export default function AdminLayout({ children }: { children: React.ReactNode }) { return <AdminShell>{children}</AdminShell>; }
