import type { Metadata, Viewport } from 'next';
import { CursorDot } from '../components/CursorDot';
import './globals.css';

export const metadata: Metadata = {
  title: 'LeadZap | malp',
  description: 'Envio rápido e direto de mensagens para novos leads no WhatsApp.',
};

export const viewport: Viewport = {
  themeColor: '#0e0e0c',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <CursorDot />
      </body>
    </html>
  );
}
