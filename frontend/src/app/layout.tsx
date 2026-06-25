import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Radar de Notícias — Audax Capital',
  description: 'Monitoramento de notícias com impacto para a FIDC de recebíveis agro.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
