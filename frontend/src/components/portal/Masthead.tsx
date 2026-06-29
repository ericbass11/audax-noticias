import Link from 'next/link';

const SECTIONS = ['Macroeconomia', 'Agronegócio', 'Crédito/Inadimplência', 'Regulação', 'Setor FIDC'];

/** Cabeçalho do portal (estilo veículo de notícias). */
export function Masthead() {
  const hoje = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <header className="border-b border-border bg-white">
      <div className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="rounded bg-primary-foreground px-2 py-0.5 text-lg font-extrabold tracking-tight text-primary">
              AUDAX
            </span>
            <span className="text-lg font-semibold tracking-tight">Notícias</span>
          </Link>
          <span className="hidden text-xs/relaxed opacity-90 first-letter:uppercase sm:block">
            {hoje}
          </span>
        </div>
      </div>

      <nav className="mx-auto max-w-6xl px-4">
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 py-2 text-sm font-medium text-foreground/80">
          <li>
            <Link href="/" className="hover:text-primary">
              Início
            </Link>
          </li>
          {SECTIONS.map((s) => (
            <li key={s}>
              <Link
                href={`/?categoria=${encodeURIComponent(s)}`}
                className="hover:text-primary"
              >
                {s}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/alertas" className="font-semibold text-red-700 hover:underline">
              ⚠️ Alertas ANVISA
            </Link>
          </li>
          <li className="ml-auto">
            <Link href="/painel" className="text-muted-foreground hover:text-primary">
              Painel
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}

export function PortalFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">
        <p className="font-semibold text-foreground">Audax Capital — Notícias</p>
        <p className="mt-1 max-w-2xl">
          Curadoria e análise automatizada de notícias com impacto para a FIDC de recebíveis do
          agronegócio. As análises por área são geradas por IA a partir das fontes citadas e têm
          caráter informativo.
        </p>
      </div>
    </footer>
  );
}
