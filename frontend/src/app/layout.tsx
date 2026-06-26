import type { Metadata } from 'next';
import './globals.css';
import { Masthead, PortalFooter } from '@/components/portal/Masthead';

export const metadata: Metadata = {
  title: 'Audax Notícias — Agro & Crédito',
  description:
    'Curadoria e análise de notícias com impacto para a FIDC de recebíveis do agronegócio da Audax Capital.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-screen flex-col antialiased">
        <Masthead />
        <div className="flex-1">{children}</div>
        <PortalFooter />
      </body>
    </html>
  );
}
