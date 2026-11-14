import { notFound } from 'next/navigation';
import { AdminSection } from '@/components/admin-sections';
const sections = ['enquiries', 'calendar', 'quotes', 'operations', 'rooms', 'finance', 'tasks', 'content', 'audit', 'settings'];
export function generateStaticParams() { return sections.map(section => ({ section })); }
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; if (!sections.includes(section)) notFound(); return <AdminSection section={section} />; }
