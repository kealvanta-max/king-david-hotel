import type { Metadata, Viewport } from 'next';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import './globals.css';
import { DemoProvider } from '@/lib/demo';
import { SiteShell } from '@/components/site-shell';

export const metadata: Metadata = { title: { default: 'King David — Stay. Relax. Celebrate.', template: '%s · King David' }, description: 'A considered guesthouse and events experience in Gomoa, Ghana. Explore stays, plan a gathering, and make your enquiry. Preview edition — property details awaiting verification.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#183f34' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" data-scroll-behavior="smooth"><body><a className="skip-link" href="#main-content">Skip to content</a><DemoProvider><SiteShell>{children}</SiteShell></DemoProvider></body></html>;
}
