/**
 * Verificação dos filtros do digest — roda sem banco, sem rede e sem LLM.
 *
 *   cd backend && node --import tsx src/scripts/verify-filters.ts
 *
 * Os casos usam URLs e títulos REAIS dos digests de 29-31/07/2026, incluindo os
 * itens que vazaram (anúncio patrocinado, factoring português) e os que NÃO
 * podem cair. Cobre também os cenários de FALHA: classificação ausente,
 * parcial e repositório quebrado — em todos, a garantia é manter a notícia.
 */
import { DispatchTrackDigestUseCase } from '../application/DispatchTrackDigestUseCase.js';
import type { ClassificationRepository } from '../modules/classification/domain/repositories/ClassificationRepository.js';
import { ExecutiveSummaryBuilder } from '../modules/classification/domain/services/ExecutiveSummaryBuilder.js';
import type { ArticleRepository } from '../modules/collection/domain/repositories/ArticleRepository.js';
import { DeduplicationService } from '../modules/collection/domain/services/DeduplicationService.js';
import {
  DEFAULT_SPONSORED_URL_PATTERNS,
  hasBlockedHostSuffix,
  isSponsoredUrl,
} from '../modules/collection/domain/services/UrlPolicy.js';
import type { SummaryRepository } from '../modules/notification/domain/repositories/SummaryRepository.js';
import type { DispatchSummaryUseCase } from '../modules/notification/application/use-cases/DispatchSummaryUseCase.js';

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(` FALHA ${name}`);
    console.log(`         esperado ${JSON.stringify(want)}, obtido ${JSON.stringify(got)}`);
  }
}

const P = [...DEFAULT_SPONSORED_URL_PATTERNS];

console.log('\n== Conteúdo patrocinado (URLs reais) ==');
check(
  'anúncio que vazou no digest do CEO (/conteudo-patrocinado/)',
  isSponsoredUrl(
    'https://amp.campograndenews.com.br/conteudo-patrocinado/antecipacao-de-recebiveis-estrategia-que-fortalece-empresas',
    P,
  ),
  true,
);
check('com acento também casa', isSponsoredUrl('https://x.com.br/conteúdo-patrocinado/a', P), true);
check('maiúsculas também casam', isSponsoredUrl('https://X.com.br/PUBLIEDITORIAL/a', P), true);
check(
  'notícia legítima não cai (ofício ANBIMA)',
  isSponsoredUrl('https://www.anbima.com.br/pt_br/institucional/comunicados-oficiais/oficios/oficio.htm', P),
  false,
);
check(
  'notícia legítima não cai (CNN agro)',
  isSponsoredUrl('https://www.cnnbrasil.com.br/agro/brasil-amplia-area-de-soja-safra-2026-27/', P),
  false,
);
check('lista vazia desliga o filtro', isSponsoredUrl('https://x.com/conteudo-patrocinado/y', []), false);

console.log('\n== Mercado estrangeiro (trilha FIDC) ==');
check(
  'factoring português que vazou (sapo.pt)',
  hasBlockedHostSuffix('https://executivedigest.sapo.pt/factoring-a-ferramenta-invisivel/', ['pt']),
  true,
);
check('brasileiro não cai', hasBlockedHostSuffix('https://www.moneytimes.com.br/a/', ['pt']), false);
check('host .pt.br não cai', hasBlockedHostSuffix('https://algo.pt.br/n', ['pt']), false);
check('"pt" no path não cai', hasBlockedHostSuffix('https://esporte.com.br/pt/a', ['pt']), false);
check('URL inválida não bloqueia', hasBlockedHostSuffix('nao-e-url', ['pt']), false);
check('lista vazia desliga', hasBlockedHostSuffix('https://x.pt/a', []), false);

console.log('\n== Dedup entre trilhas ==');
const dedup = new DeduplicationService();
check(
  'título quase idêntico casa',
  dedup.isSameStoryAsAny('Recuperação judicial do agronegócio sobe 33% no trimestre', [
    'Recuperação judicial do agronegócio sobe 33% no trimestre, diz Serasa',
  ]),
  true,
);
// LIMITE CONHECIDO: reescrita radical não casa no comparador determinístico
// (conservador de propósito — fundir errado perde notícia). Estes dois são a
// MESMA história e saíram juntos no digest de 30/07 08h, ranks 1 e 2. Pegar
// este caso exigiria o dedup semântico via LLM também entre trilhas.
check(
  'título reescrito radicalmente NÃO casa (limite documentado)',
  dedup.isSameStoryAsAny('Recuperação judicial do agronegócio sobe 33% no trimestre', [
    'Recuperação judicial no agro dispara, pressiona crédito rural e eleva custos para produtores',
  ]),
  false,
);
check(
  'assuntos diferentes não casam',
  dedup.isSameStoryAsAny('Produtores de soja cortam investimentos na safra 2026/27', [
    'Taxas caem com quadro favorável para corte na Selic',
  ]),
  false,
);
check('lista de referência vazia não remove nada', dedup.isSameStoryAsAny('Qualquer título', []), false);

console.log('\n== Formato do digest de rota ==');
const builder = new ExecutiveSummaryBuilder();
const semClass = builder.buildTrackDigest('H', [
  { id: '1', title: 'Título A', url: 'https://a', publishedAt: null },
]);
check(
  'sem classificação mantém o formato antigo',
  semClass.includes('▪️ Título A') && !semClass.includes('undefined'),
  true,
);
check(
  'com classificação usa emoji + categoria',
  builder
    .buildTrackDigest('H', [
      {
        id: '1',
        title: 'Título A',
        url: 'https://a',
        publishedAt: null,
        category: 'Setor FIDC',
        impact: 'negativo',
      },
    ])
    .includes('⚠️ *Setor FIDC* — Título A'),
  true,
);

console.log('\n== Piso de relevância e cenários de falha ==');
const articles = [
  { id: 'a', title: 'Alta relevância', url: 'https://a', publishedAt: new Date('2026-07-30T10:00:00Z') },
  { id: 'b', title: 'Baixa relevância', url: 'https://b', publishedAt: new Date('2026-07-30T12:00:00Z') },
];
const fakeArticles = { findByIds: async () => articles } as unknown as ArticleRepository;
const fakeSummaries = { save: async (s: { content: string }) => ({ ...s, id: 'sum1' }) } as unknown as SummaryRepository;
const fakeDispatch = {
  execute: async () => ({ sent: 1, failed: 0, skipped: 0 }),
} as unknown as DispatchSummaryUseCase;

const repoWith = (entries: [string, { relevance: number; category: string; impact: string }][]) =>
  ({ findCurrentByArticleIds: async () => new Map(entries) }) as unknown as ClassificationRepository;

async function run(repo: ClassificationRepository | undefined, minRelevance: number) {
  const uc = new DispatchTrackDigestUseCase(fakeArticles, fakeSummaries, fakeDispatch, repo);
  return uc.execute('run1', 'pk', ['a', 'b'], 'Header', ['dest'], { minRelevance });
}

const alta = { relevance: 90, category: 'Setor FIDC', impact: 'negativo' };
const baixa = { relevance: 30, category: 'Outros', impact: 'neutro' };

check('sem classificação: mantém os 2 (piso ignorado)', (await run(undefined, 65)).articleIds, ['b', 'a']);
check(
  'com classificação: corta o de relevância 30',
  (await run(repoWith([['a', alta], ['b', baixa]]), 65)).articleIds,
  ['a'],
);
check(
  'item sem classificação é MANTIDO mesmo com piso alto',
  (await run(repoWith([['a', alta]]), 65)).articleIds?.slice().sort(),
  ['a', 'b'],
);
const quebrado = {
  findCurrentByArticleIds: async () => {
    throw new Error('DB caiu');
  },
} as unknown as ClassificationRepository;
check('repositório falhando: mantém os 2 e não lança', (await run(quebrado, 65)).articleIds, ['b', 'a']);
check('piso 0 não corta nada', (await run(repoWith([['a', alta], ['b', baixa]]), 0)).articleIds?.length, 2);
const todosBaixos = await run(repoWith([['a', baixa], ['b', baixa]]), 65);
check('todos abaixo do piso: nada enviado e nada marcado como surfado', [
  todosBaixos.sent,
  todosBaixos.articleIds,
], [0, []]);

console.log(`\n=========== ${pass} ok, ${fail} falha(s) ===========`);
process.exit(fail === 0 ? 0 : 1);
