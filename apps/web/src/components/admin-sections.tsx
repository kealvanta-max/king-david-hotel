'use client';
import { useDemo } from '@/lib/demo';
import { EnquiriesSection } from '@/components/admin-enquiries';
import { CalendarSection, RoomsSection } from '@/components/admin-inventory';
import { QuotesSection } from '@/components/admin-quotes';
import { OperationsSection } from '@/components/admin-operations';
import { FinanceSection } from '@/components/admin-finance';
import { TasksSection } from '@/components/admin-tasks';
import { ContentSection, SettingsSection, AuditSection } from '@/components/admin-settings';
export function AdminSection({ section }: { section: string }) {
  const { ready } = useDemo();
  if (!ready) return <div className="admin-loading">Preparing the demo workspace…</div>;
  switch (section) {
    case 'enquiries': return <EnquiriesSection />;
    case 'calendar': return <CalendarSection />;
    case 'quotes': return <QuotesSection />;
    case 'operations': return <OperationsSection />;
    case 'rooms': return <RoomsSection />;
    case 'finance': return <FinanceSection />;
    case 'tasks': return <TasksSection />;
    case 'content': return <ContentSection />;
    case 'audit': return <AuditSection />;
    case 'settings': return <SettingsSection />;
    default: return null;
  }
}
