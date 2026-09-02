import { Inter, Geist_Mono } from 'next/font/google';
import { Suspense } from 'react';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import NavProgress from '../components/NavProgress';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});

export const metadata = {
  title: 'Syncup Workspace',
  description: 'Team operations — the working day, tasks, attendance and leave in one place.',
};

// The product is built for laptops and tablets. Phones get a wall, not a layout.
export const viewport = {
  width: 1024,
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable}`}>
      <body className={inter.className}>
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <div className="phone-block">
          <div>
            <b>SYNCUP</b>
            <p>
              Syncup is built for laptops and tablets. Open it on a wider screen — there is no phone
              layout, by design.
            </p>
          </div>
        </div>
        {children}
        <Toaster />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
