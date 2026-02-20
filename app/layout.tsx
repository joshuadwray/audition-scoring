import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Dance Audition Scoring',
  description: 'Real-time dance audition scoring system',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Inject Supabase config at runtime so client-side code works even if
  // NEXT_PUBLIC_* env vars weren't inlined during the build step.
  const supabaseConfig = JSON.stringify({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  });

  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__SUPABASE_CONFIG__=${supabaseConfig};`,
          }}
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
