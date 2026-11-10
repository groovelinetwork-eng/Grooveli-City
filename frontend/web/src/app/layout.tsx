import type { Metadata, Viewport } from 'next';
import { APP_NAME } from '@grooveli/shared';
import '@grooveli/frontend-domain/tokens.css';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — careers, workplaces and a living city`, template: `%s · ${APP_NAME}` },
  description:
    'Grooveli is a career and workplace ecosystem experienced through a living virtual city. Demo build with synthetic data.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#070d1f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
