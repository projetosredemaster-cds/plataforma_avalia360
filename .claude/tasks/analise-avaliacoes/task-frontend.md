# Task: Módulo Análise — tela "Avaliações" — Frontend

Demanda 100% frontend (`frontend/`, equivalente a `apps/web` na nomenclatura dos
agentes/skills — usar sempre os caminhos reais `frontend/**` neste plano). Não
toca `backend/`. Base obrigatória, lida por completo antes deste plano:
`.claude/tasks/analise-avaliacoes/spec.md` (seções 1–3, especialmente a
DECISÃO CRÍTICA da seção 2) e `.claude/tasks/analise-avaliacoes/task-backend.md`
(seção "2. Contrato final do endpoint"). O contrato de
`GET /api/analise/avaliacoes` está **FECHADO** — este plano só o consome, não
o reabre. `.claude/tasks/analise-visao-geral/task-frontend.md` (primeira tela
do módulo, já implementada e revisada) é o precedente de padrão de código —
reaproveitado explicitamente onde citado abaixo.

## Estado atual verificado (antes do plano)

Todo o código abaixo foi lido por completo antes deste plano.

- `frontend/src/types/analise.ts` (existente): só `VisaoGeralAnalise` e tipos
  irmãos, com o comentário de topo "Payload 100% agregado — nenhum campo
  identifica avaliador/avaliado/tipo de relacionamento. Nunca combinar com
  `types/ciclo.ts`..." — este arquivo recebe as interfaces novas desta
  feature, com um segundo comentário de topo específico (ver 1.1), porque o
  payload de "Avaliações" é **misto** (identificado para 3 tipos, agregado
  para os outros 2) — o comentário existente não descreve esse payload
  corretamente sozinho.
- `frontend/src/services/analiseService.ts` (existente): função solta
  `buscarVisaoGeralAnalise(params)` sobre `apiFetch<T>`,
  `URLSearchParams({ de, ate })` + `cicloId` condicional via `query.set`. Novo
  arquivo não é necessário — `buscarAvaliacoesAnalise` entra no mesmo arquivo,
  mesmo estilo.
- `frontend/src/components/analise/MetricaCard/MetricaCard.tsx` (existente):
  "stat tile" de número único — não serve para lista de textos, confirmado
  (não reaproveitado nesta feature).
- `frontend/src/pages/AnaliseVisaoGeralPage/AnaliseVisaoGeralPage.tsx` +
  `formatadores.ts` (existentes): padrão de página a reaproveitar quase
  literalmente — `useSearchParams()` para `cicloId` lido uma vez no mount,
  `de`/`ate` em `useState` local inicializados via `inicioAnoCorrenteYMD()`/
  `hojeYMD()`, busca disparada por `<Paper component="form" onSubmit>` +
  botão "Aplicar filtro" (nunca a cada tecla), `executarBusca(overrides?: {
  cicloId?: string | null })` para o fluxo de "remover filtro de ciclo" sem
  depender do timing de `setState`, chip "Filtrado por ciclo: {nomeCiclo ??
  cicloId}" com `onDelete`, nome do ciclo buscado best-effort via
  `ciclosService.buscarCiclo(cicloId)` (não-bloqueante, `try/catch`
  silencioso), trio `dados`/`carregando`/`erro`, mapeamento de
  `err.codigo === 'CICLO_NAO_ENCONTRADO'` para mensagem amigável. Reaproveitado
  quase 1:1 nesta página nova — as únicas diferenças são o conteúdo renderizado
  (lista de blocos de texto em vez de grade de `MetricaCard`) e a definição de
  "vazio" (ver decisão 4).
- **Nota de correção já registrada na revisão da task anterior** (seção
  "Sugestão" de `analise-visao-geral/task-frontend.md`): usar
  `import { type FormEvent } from 'react'` + `FormEvent<HTMLFormElement>`
  desde o início nesta página nova, em vez de `React.FormEvent` sem import
  explícito (padrão já predominante em `ColaboradorFormPage`, `CicloFormPage`,
  `LoginPage`, `DefinirSenhaPage`, `EsqueciSenhaModal`).
- `frontend/src/pages/CiclosListPage/CiclosListPage.tsx`: `CardActions`
  (linhas ~277–283 hoje) já tem "Ver detalhes" e "Visão Geral" (nenhum ícone
  em nenhum dos dois hoje), ambos **fora** do bloco condicional
  `ciclo.status === 'rascunho'`. Botão "Avaliações" entra ao lado, mesmo
  critério (fora do condicional, visível em qualquer status).
- `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`: `SubmenuOpcao`
  já tem `to?: string` (aditivo, da task anterior);
  `GRUPOS.analises.submenus` já tem `quantitativa` com a opção real "Visão
  Geral" e `qualitativa` ainda placeholder
  (`opcoes: [{ label: 'Em breve', disabled: true }]`). `grupoAtivo(pathname)`
  já cobre grupos `tipo === 'submenus'` genericamente (itera
  `submenu.opcoes.some((opcao) => opcao.to && pathname.startsWith(opcao.to))`)
  — **nenhuma mudança extra é necessária nessa função** para esta task, ela já
  reconhece qualquer `to` novo adicionado em `qualitativa` automaticamente.
- `frontend/src/App.tsx`: grupo protegido único
  (`RotaProtegida papeis={['admin','gestor_rh']}` → `PainelAdminLayout`) já
  contém `/analise/visao-geral`. A rota nova entra no mesmo nível.
- `@mui/icons-material` (`^9.4.0`) já instalado. `PainelAdminLayout.tsx` usa
  `AssessmentOutlinedIcon` para o item de menu "Análises" — os ícones dos
  botões do card de Ciclo precisam ser visualmente distintos desse.
- `frontend/src/lib/apiClient.ts` (`ApiError`, `apiFetch`): `codigo` tipado
  opcional, usado para diferenciar `CICLO_NAO_ENCONTRADO` de outros erros —
  mesmo padrão já usado em "Visão Geral".
- Nenhum componente de lista de texto/anonimização existe hoje sob
  `frontend/src/components/analise/` (confirmado por leitura direta do
  diretório — só `MetricaCard/`) — todos os componentes desta seção 3 do
  pedido são novos.

## Contrato de API a consumir (fechado por `task-backend.md`, seção 2 — não reabrir)

`GET /api/analise/avaliacoes` — mesmo módulo `/api/analise`, mesma proteção
(`autenticar` + `admin`/`gestor_rh`, mesmo grupo de `RotaProtegida` já usado
no resto do painel). Query: `de`/`ate` (`YYYY-MM-DD`, obrigatórios), `cicloId`
(uuid, opcional).

Resposta 200 (`AvaliacoesAnalise`) — ver shape completo na tarefa do usuário /
`task-backend.md` seção 2. Resumo do que a UI precisa saber:

- `avaliacao360.identificadas`: array plano de `AvaliacaoIdentificada`
  (`autoavaliacao`/`gestor`/`externo`) — **sempre** identificado
  (`avaliadoNome` + `avaliadorNome` + `texto`), sem gate, sem aviso de
  bloqueio.
- `avaliacao360.paresSubordinado`: array de `GrupoParesSubordinado`, um item
  por `avaliadoId` + `cicloId` + `tipoRelacionamento` (`pares`/`subordinado`).
  Todo grupo (liberado ou não) aparece no array — bloqueio nunca é omissão.
  `liberado === true` → `textos` presente (já embaralhado pelo backend a cada
  chamada); `liberado === false` → `motivo: 'aguardando_minimo_respondentes'`,
  sem `textos`.
- `climaGeral`: array de `GrupoClimaGeral`, um item por `cicloId` (não por
  pessoa — clima é estruturalmente anônimo). Mesma lógica liberado/bloqueado;
  quando liberado, `textos` é uma lista solta **sem nenhuma atribuição**, nem
  agregada.
- Erros: `422 CAMPO_INVALIDO`, `422 PERIODO_INVALIDO`, `404
  CICLO_NAO_ENCONTRADO`, `403 PAPEL_NAO_AUTORIZADO` — mesmos códigos e mesmo
  tratamento já usado em "Visão Geral".

## Decisões (com justificativa)

1. **Um único arquivo de tipos, um único arquivo de service** — `types/analise.ts`
   e `services/analiseService.ts` existentes ganham as peças novas desta
   feature (interfaces + `buscarAvaliacoesAnalise`), não arquivos separados.
   Mesmo raciocínio já usado no módulo `analise` do backend para agrupar sob
   o mesmo prefixo/local — aqui não há o mesmo argumento de "guard rail
   estruturalmente diferente por arquivo" que justificou separar
   `analise-avaliacoes.service.ts` no backend, porque o frontend não escreve
   nenhuma lógica de gate/anonimização — só tipos e uma função de transporte
   HTTP.
2. **`admin`/`gestor_rh` idênticos, sem nenhuma renderização condicional por
   papel** — mesmo princípio já fechado na spec (seção "DECISÃO CRÍTICA") e
   já aplicado em "Visão Geral". A única checagem de papel nesta feature
   continua sendo `RotaProtegida`, no nível de rota. Nenhum
   `colaborador?.papel`/`useAuth()` é lido dentro de `AnaliseAvaliacoesPage`
   nem de nenhum componente novo em `components/analise/`.
3. **Nenhum botão/link/estado "ver mesmo assim" para grupos bloqueados, em
   nenhuma circunstância.** O componente de estado bloqueado
   (`EstadoAguardandoMinimo`, ver 3.4) é deliberadamente "burro" — só recebe
   `totalRespondentes`/`minimoNecessario` e renderiza a mensagem fixa, sem
   nenhuma prop de callback/toggle que pudesse, no futuro, virar um jeito de
   "forçar exibir". Isso é o guard rail mais importante de toda a tela — ver
   também "Guard rails obrigatórios" abaixo.
4. **Definição de "vazio" desta tela**: `identificadas.length === 0 &&
   paresSubordinado.length === 0 && climaGeral.length === 0` → `Alert
   severity="info"` "Nenhuma resposta de texto aberto encontrada para o
   período/filtro selecionado.", substituindo toda a área de conteúdo — mesmo
   padrão de "Visão Geral" (`totalCiclos === 0`), adaptado ao shape desta
   tela. **Importante**: um `GrupoParesSubordinado`/`GrupoClimaGeral`
   presente mas com `liberado: false` **não** conta como "vazio" — o array
   tem um item, só que bloqueado; a seção correspondente é renderizada
   normalmente, mostrando o card com `EstadoAguardandoMinimo` dentro. "Vazio"
   é estritamente "nenhum item em nenhum dos três arrays", nunca "todo item
   presente está bloqueado".
5. **Aviso de limitação (`AvisoLimitacaoAnonimizacao`, seção 4 do pedido)
   aparece uma única vez, no topo da tela** (abaixo do formulário de filtro,
   acima das seções de conteúdo), condicionado a
   `paresSubordinado.some(g => g.liberado) || climaGeral.some(g => g.liberado)`
   — nunca condicionado a papel, nunca ocultável pelo usuário (sem `onClose`/
   botão de dispensar). `identificadas` não entra nessa condição: esses
   textos já são identificados por design (sem pretensão de anonimato a
   avisar sobre).
6. **Agrupamento visual de `identificadas` por `tipoRelacionamento`**
   (`Autoavaliação`/`Gestor`/`Externo`, só subseções com pelo menos 1 item) —
   é filtragem/organização visual sobre dado já 100% identificado vindo do
   backend, não uma agregação sensível (não há nenhum cálculo de contagem/
   média/gate envolvido, diferente do que seria proibido pelo guard rail de
   "nenhuma regra de negócio sensível no frontend"). Facilita a leitura sem
   inventar nenhuma informação nova.
7. **`cicloId` de cada `GrupoParesSubordinado`/`GrupoClimaGeral` não é
   exibido nos cards individuais nesta primeira versão** — só o chip
   "Filtrado por ciclo" no topo da tela (quando aplicado) identifica o ciclo
   em jogo. Justificativa: o caminho principal de uso desta tela é o deep
   link a partir do card de Ciclo (`?cicloId=`, decisão 3.7 da spec), que já
   restringe a resposta a um único ciclo; sem filtro, a resposta pode
   misturar mais de um ciclo, mas resolver isso exigiria buscar o **nome** de
   cada `cicloId` distinto presente nos arrays (N chamadas adicionais a
   `buscarCiclo`, sem precedente nem pedido explícito nesta task) — fora de
   escopo, registrado aqui como limitação conhecida e não como omissão
   silenciosa. Se isso incomodar na prática, é candidato natural a uma
   iteração futura pequena e isolada (ex.: badge com o uuid cru, ou um
   `Map<cicloId, nome>` resolvido em lote) — não implementado agora para não
   inflar esta task com uma chamada em lote não pedida.
8. **`textos`/`identificadas`/`paresSubordinado`/`climaGeral` nunca são
   reordenados no frontend** — nenhum `.sort()`/`.reverse()` em nenhum lugar
   desta feature sobre os arrays vindos da API. `paresSubordinado`/
   `climaGeral` já vêm em uma ordem estável (não é segredo, spec seção 3.5 do
   `task-backend.md`) e são renderizados na ordem recebida; `textos` dentro
   de cada grupo liberado já vem embaralhado pelo backend a cada chamada —
   idem, renderizado na ordem recebida, sem numeração (`key` do React usa
   índice + `perguntaId` só como identificador técnico de lista, nunca
   exibido na UI).
9. **Ícone do botão "Avaliações"**: `ForumIcon`
   (`@mui/icons-material/Forum`), não `ChatBubbleOutlineIcon`. As duas opções
   eram aceitáveis pela spec (seção 3.9 do pedido do usuário); `ForumIcon`
   (duas bolhas de fala sobrepostas) é visualmente mais distinto de
   `AssessmentOutlinedIcon` (usado no item de menu "Análises") e comunica
   melhor "várias respostas de texto" do que uma única bolha de chat.
   "Visão Geral" usa `BarChartIcon` (`@mui/icons-material/BarChart`), exigido
   literalmente pela spec.
10. **Submenu "Qualitativa" — substituição direta do placeholder**, mesmo
    mecanismo já usado por "Quantitativa" (`SubmenuOpcao.to`, sem nenhuma
    mudança de tipo): `{ label: 'Em breve', disabled: true }` vira
    `{ label: 'Avaliações', to: '/analise/avaliacoes' }`. `grupoAtivo` já
    reconhece isso sem alteração (ver "Estado atual verificado").
11. **`de`/`ate` reaproveitam a mesma sugestão inicial de UX** (início do ano
    corrente até hoje) — helpers duplicados localmente em
    `pages/AnaliseAvaliacoesPage/formatadores.ts` (só
    `inicioAnoCorrenteYMD`/`hojeYMD`; esta tela não formata número/percentual/
    hora, então não duplica `formatarInteiro`/`formatarPercentual`/
    `formatarHoras`). Duplicação pequena e deliberada, mesmo padrão já aceito
    no projeto para helpers locais-à-página (ex.
    `ResponderPesquisaPage/mensagensErroPublico.ts`) em vez de extrair um
    util genérico prematuramente para 2 funções de 3 linhas.
12. **Sem nova dependência** — mesmos componentes MUI já usados em "Visão
    Geral" (`TextField type="date"`, `Paper`, `Alert`, `Chip`, `Skeleton`,
    `Button`, `Typography`) mais `@mui/icons-material` (já instalado). Nenhum
    `@mui/x-date-pickers`/`dayjs`.

## Guard rails obrigatórios (frontend-developer e revisor)

- **Nenhuma regra de anonimização/gate calculada no frontend.** O estado
  `liberado`/`motivo`/a presença de `textos` já vêm prontos da API — a tela
  só lê `grupo.liberado` para decidir qual dos dois sub-componentes
  renderizar (`TextoAbertoLista` vs. `EstadoAguardandoMinimo`), nunca
  recalcula `totalRespondentes >= minimoNecessario` nem nenhuma variação
  disso.
- **Nenhum bypass, botão "ver mesmo assim", toggle ou renderização condicional
  por papel para grupos bloqueados** — nem para `admin`, nem para
  `gestor_rh`. `EstadoAguardandoMinimo` não aceita nenhuma prop de
  ação/callback.
- **Nenhuma numeração/rótulo de posição** nos textos liberados (nunca
  "Resposta 1 de N") e nenhum `.sort()`/reordenação de `textos` no cliente.
- **`climaGeral.textos` nunca ganha nenhuma atribuição**, nem "Respondente
  1", nem agrupamento por qualquer pseudo-identidade — só lista solta.
- **Nenhuma chamada a endpoint identificado além de `buscarCiclo`** (metadados
  administrativos do ciclo, sem identidade de avaliador/avaliado) —
  em particular, nenhuma chamada a `ciclosService.listarRelacionamentos`
  dentro desta feature.
- **Papéis**: `admin`/`gestor_rh` idênticos, sem `if (colaborador.papel ===
  ...)` em nenhum arquivo novo desta feature.
- **Estilo**: Tailwind só para layout/grid/espaçamento; MUI para os controles.
  Nenhum `.css` novo, nenhum `style={{}}` extenso. Todo `Typography` com peso
  de fonte usa `sx={{ fontWeight: ... }}`, nunca a prop solta `fontWeight={...}`
  (erro de tipagem já visto numa task anterior, ver nota em
  `analise-visao-geral/task-frontend.md`).
- **Import de ícone default por arquivo individual**
  (`import XIcon from '@mui/icons-material/X'`), nunca do barrel.

## Plano — Frontend

### 1. frontend-developer — CONCLUÍDO

Implementado literalmente conforme o plano 1.1–1.8, sem nenhum desvio de
design:

- `frontend/src/types/analise.ts`: bloco `AvaliacoesAnalise` acrescentado ao
  final (1.1), nomes de campo idênticos ao contrato.
- `frontend/src/services/analiseService.ts`: `buscarAvaliacoesAnalise`
  acrescentada (1.2), mesmo estilo de `buscarVisaoGeralAnalise`.
- `frontend/src/components/analise/`: seis peças novas criadas
  (`rotulosRelacionamento.ts`, `TextoAbertoLista`,
  `AvaliacaoIdentificadaCard`, `EstadoAguardandoMinimo`,
  `GrupoParesSubordinadoCard`, `GrupoClimaCard`,
  `AvisoLimitacaoAnonimizacao`) — `EstadoAguardandoMinimo` permanece
  deliberadamente sem nenhuma prop de callback/ação (1.3).
- `frontend/src/pages/AnaliseAvaliacoesPage/` (novo): `formatadores.ts` (1.4)
  + `AnaliseAvaliacoesPage.tsx` (1.5), reaproveitando quase 1:1 o padrão de
  `AnaliseVisaoGeralPage` (`executarBusca(overrides?)`, chip de ciclo,
  `FormEvent<HTMLFormElement>` importado explicitamente de `'react'`).
- `frontend/src/App.tsx`: rota `/analise/avaliacoes` adicionada dentro do
  grupo protegido `admin`/`gestor_rh` (1.6).
- `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`: placeholder
  de `qualitativa` substituído por `{ label: 'Avaliações', to:
  '/analise/avaliacoes' }` (1.7) — única linha alterada.
- `frontend/src/pages/CiclosListPage/CiclosListPage.tsx`: import de
  `BarChartIcon`/`ForumIcon`; botão "Visão Geral" ganhou `startIcon`; botão
  novo "Avaliações" adicionado ao lado, fora do bloco condicional
  `ciclo.status === 'rascunho'` (1.8).

Guard rails conferidos por leitura + grep antes de finalizar: nenhum
`.sort()`/`.reverse()` em nenhum arquivo novo; nenhuma checagem de
`papel`/`colaborador?.papel` fora de `RotaProtegida`; `avaliadorId`/
`avaliadorNome` só aparecem em `AvaliacaoIdentificadaCard`/
`AvaliacaoIdentificada` (nunca em `paresSubordinado`/`climaGeral`);
`EstadoAguardandoMinimo` sem nenhuma prop de callback/ação; definição de
"vazio" estritamente `identificadas.length === 0 && paresSubordinado.length
=== 0 && climaGeral.length === 0`, um grupo `liberado: false` renderiza
normalmente (nunca é tratado como vazio).

`npm run build` (`tsc -b && vite build`) e `npm run lint` (`eslint .`)
rodados dentro de `frontend/` — ambos passaram sem erros/avisos novos (o
único aviso do build é o de chunk size > 500kB, pré-existente e não
relacionado a esta mudança).

**Contrato consumido**: `backend/src/modules/analise/` ainda não tinha
`analise-avaliacoes.service.ts`/rota `/api/analise/avaliacoes` em disco no
momento desta implementação (só o plano em `task-backend.md`) — o frontend
consumiu o contrato exatamente como fechado na seção "Contrato de API a
consumir" deste documento (nomes de campo de `AvaliacoesAnalise`, códigos de
erro `CAMPO_INVALIDO`/`PERIODO_INVALIDO`/`CICLO_NAO_ENCONTRADO`/
`PAPEL_NAO_AUTORIZADO`), sem nenhuma suposição além do que está escrito nas
duas tasks. Quando o backend estiver implementado, vale uma verificação de
integração (fora do escopo desta etapa) para confirmar que os nomes batem
literalmente.

### 1. frontend-developer (plano original)

#### 1.1 `frontend/src/types/analise.ts` (editado — acréscimo)

Adicionar ao final do arquivo existente, com um comentário de topo próprio
(a feature tem um payload misto, diferente do 100%-agregado de "Visão
Geral" — o comentário existente no topo do arquivo não descreve isso
corretamente sozinho):

```ts
// ---- "Avaliações" (GET /api/analise/avaliacoes) ----
// Payload MISTO, ao contrário de VisaoGeralAnalise acima:
// - `avaliacao360.identificadas` traz identidade completa (avaliadorId +
//   avaliadorNome) — CORRETO e esperado para autoavaliacao/gestor/externo,
//   que não têm terceiro a proteger (spec `analise-avaliacoes`, seção 3.2).
// - `avaliacao360.paresSubordinado` e `climaGeral` NUNCA trazem
//   avaliadorId/avaliadorNome nem nenhum campo de identidade do avaliador —
//   só saem quando `liberado === true`, já agregados/reembaralhados pelo
//   backend. `liberado === false` é um estado FINAL de bloqueio para
//   QUALQUER papel (nenhum bypass para admin/gestor_rh) — nunca modelar como
//   array vazio nem tratar como algo "contornável" na UI.
// - `textos` dentro de um grupo liberado já vem embaralhado pelo backend A
//   CADA CHAMADA — nunca reordenar no frontend, nunca exibir número de
//   posição.

export interface TextoAbertoItem {
  perguntaId: string
  perguntaEnunciado: string
  texto: string
}

export type TipoRelacionamentoIdentificado = 'autoavaliacao' | 'gestor' | 'externo'
export type TipoRelacionamentoAnonimizado = 'pares' | 'subordinado'

export interface AvaliacaoIdentificada {
  tipoRelacionamento: TipoRelacionamentoIdentificado
  cicloId: string
  avaliadoId: string
  avaliadoNome: string
  avaliadorId: string
  avaliadorNome: string
  perguntaId: string
  perguntaEnunciado: string
  texto: string
}

export interface GrupoParesSubordinado {
  cicloId: string
  avaliadoId: string
  avaliadoNome: string
  tipoRelacionamento: TipoRelacionamentoAnonimizado
  totalRespondentes: number
  minimoNecessario: number
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  textos?: TextoAbertoItem[]
}

export interface GrupoClimaGeral {
  cicloId: string
  totalRespondentes: number
  minimoNecessario: number
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  textos?: TextoAbertoItem[]
}

export interface AvaliacoesAnalise {
  periodo: { de: string; ate: string }
  cicloId: string | null
  avaliacao360: {
    identificadas: AvaliacaoIdentificada[]
    paresSubordinado: GrupoParesSubordinado[]
  }
  climaGeral: GrupoClimaGeral[]
}
```

Nomes de campo idênticos ao contrato fechado em `task-backend.md` seção 2 —
nenhuma tradução, nenhum campo renomeado.

#### 1.2 `frontend/src/services/analiseService.ts` (editado — acréscimo)

Adicionar ao final do arquivo existente (import de `AvaliacoesAnalise`
acrescentado ao `import type` já existente no topo):

```ts
import type { AvaliacoesAnalise, VisaoGeralAnalise } from '../types/analise'

// ... (buscarVisaoGeralAnalise já existente, inalterado)

export interface BuscarAvaliacoesAnaliseParams {
  de: string // 'YYYY-MM-DD'
  ate: string // 'YYYY-MM-DD'
  cicloId?: string
}

/**
 * `GET /api/analise/avaliacoes` — payload MISTO (ver comentário em
 * `types/analise.ts`): identidade completa para autoavaliacao/gestor/externo,
 * agregado/reembaralhado (ou bloqueio explícito, sem bypass para nenhum
 * papel) para pares/subordinado/clima.
 */
export function buscarAvaliacoesAnalise(params: BuscarAvaliacoesAnaliseParams): Promise<AvaliacoesAnalise> {
  const query = new URLSearchParams({ de: params.de, ate: params.ate })
  if (params.cicloId) query.set('cicloId', params.cicloId)
  return apiFetch<AvaliacoesAnalise>(`/api/analise/avaliacoes?${query.toString()}`)
}
```

#### 1.3 Componentes novos em `frontend/src/components/analise/`

Seis peças novas, cada uma "burra" (só formata/exibe, nenhuma decisão de
gate/identidade):

##### 1.3.1 `components/analise/rotulosRelacionamento.ts` (novo, util — não é componente)

```ts
import type { TipoRelacionamentoAnonimizado, TipoRelacionamentoIdentificado } from '../../types/analise'

const ROTULOS: Record<TipoRelacionamentoIdentificado | TipoRelacionamentoAnonimizado, string> = {
  autoavaliacao: 'Autoavaliação',
  gestor: 'Gestor',
  externo: 'Externo',
  pares: 'Pares',
  subordinado: 'Subordinados',
}

export function rotuloTipoRelacionamento(tipo: keyof typeof ROTULOS): string {
  return ROTULOS[tipo]
}
```

##### 1.3.2 `components/analise/TextoAbertoLista/TextoAbertoLista.tsx` (novo)

```tsx
import { Paper, Typography } from '@mui/material'
import type { TextoAbertoItem } from '../../../types/analise'

interface TextoAbertoListaProps {
  textos: TextoAbertoItem[]
}

/**
 * Lista solta de textos de perguntas `texto_aberto`, SEM numeração/rótulo de
 * posição — a ordem já vem embaralhada do backend a cada chamada, nunca
 * reordenar aqui (nenhum `.sort()`/`.reverse()`) — e SEM qualquer atribuição
 * de autoria por item; quem chama decide se/como identificar o GRUPO
 * (avaliado, ciclo), nunca o texto individual.
 */
export function TextoAbertoLista({ textos }: TextoAbertoListaProps) {
  return (
    <div className="flex flex-col gap-2">
      {textos.map((item, indice) => (
        // key por índice + perguntaId: TextoAbertoItem não tem id próprio (a
        // mesma pergunta pode se repetir entre textos de respondentes
        // diferentes) e a ordem do array não é estável entre carregamentos —
        // é só um identificador técnico de lista, nunca exibido na UI.
        <Paper key={`${item.perguntaId}-${indice}`} variant="outlined" className="flex flex-col gap-1 p-3">
          <Typography variant="caption" color="text.secondary">
            {item.perguntaEnunciado}
          </Typography>
          <Typography variant="body2">{item.texto}</Typography>
        </Paper>
      ))}
    </div>
  )
}
```

##### 1.3.3 `components/analise/AvaliacaoIdentificadaCard/AvaliacaoIdentificadaCard.tsx` (novo)

```tsx
import { Chip, Paper, Typography } from '@mui/material'
import type { AvaliacaoIdentificada } from '../../../types/analise'
import { rotuloTipoRelacionamento } from '../rotulosRelacionamento'

interface AvaliacaoIdentificadaCardProps {
  item: AvaliacaoIdentificada
}

/**
 * Item identificado (`autoavaliacao`/`gestor`/`externo`) — não há terceiro a
 * proteger nessas relações (spec, seção 3.2), então nome do avaliado + nome
 * do avaliador saem normalmente, sem nenhum aviso de bloqueio/anonimização.
 */
export function AvaliacaoIdentificadaCard({ item }: AvaliacaoIdentificadaCardProps) {
  return (
    <Paper variant="outlined" className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="body2">
          <strong>{item.avaliadoNome}</strong> avaliado por <strong>{item.avaliadorNome}</strong>
        </Typography>
        <Chip size="small" label={rotuloTipoRelacionamento(item.tipoRelacionamento)} />
      </div>
      <Typography variant="caption" color="text.secondary">
        {item.perguntaEnunciado}
      </Typography>
      <Typography variant="body2">{item.texto}</Typography>
    </Paper>
  )
}
```

##### 1.3.4 `components/analise/EstadoAguardandoMinimo/EstadoAguardandoMinimo.tsx` (novo)

```tsx
import { Alert } from '@mui/material'

interface EstadoAguardandoMinimoProps {
  totalRespondentes: number
  minimoNecessario: number
}

/**
 * Estado de bloqueio FINAL — nenhum papel (nem admin/gestor_rh) tem bypass
 * deste limiar (spec, seção 2, "DECISÃO CRÍTICA"). Deliberadamente sem
 * nenhuma prop de callback/ação: não deve ser possível, hoje nem numa
 * mudança futura descuidada, pendurar um botão/link "ver mesmo assim" aqui.
 */
export function EstadoAguardandoMinimo({ totalRespondentes, minimoNecessario }: EstadoAguardandoMinimoProps) {
  return (
    <Alert severity="info" variant="outlined">
      Aguardando mínimo de respondentes ({totalRespondentes} de {minimoNecessario}).
    </Alert>
  )
}
```

##### 1.3.5 `components/analise/GrupoParesSubordinadoCard/GrupoParesSubordinadoCard.tsx` (novo)

```tsx
import { Chip, Paper, Typography } from '@mui/material'
import type { GrupoParesSubordinado } from '../../../types/analise'
import { rotuloTipoRelacionamento } from '../rotulosRelacionamento'
import { TextoAbertoLista } from '../TextoAbertoLista/TextoAbertoLista'
import { EstadoAguardandoMinimo } from '../EstadoAguardandoMinimo/EstadoAguardandoMinimo'

interface GrupoParesSubordinadoCardProps {
  grupo: GrupoParesSubordinado
}

/**
 * Um bloco por avaliado + tipo de relacionamento (`pares`/`subordinado`).
 * `liberado`/`motivo`/`textos` já vêm prontos do backend — este componente
 * só lê `grupo.liberado` para decidir qual sub-estado renderizar, nunca
 * recalcula o gate.
 */
export function GrupoParesSubordinadoCard({ grupo }: GrupoParesSubordinadoCardProps) {
  return (
    <Paper variant="outlined" className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="body2">
          <strong>{grupo.avaliadoNome}</strong>
        </Typography>
        <Chip size="small" label={rotuloTipoRelacionamento(grupo.tipoRelacionamento)} />
      </div>
      {grupo.liberado ? (
        <TextoAbertoLista textos={grupo.textos ?? []} />
      ) : (
        <EstadoAguardandoMinimo totalRespondentes={grupo.totalRespondentes} minimoNecessario={grupo.minimoNecessario} />
      )}
    </Paper>
  )
}
```

##### 1.3.6 `components/analise/GrupoClimaCard/GrupoClimaCard.tsx` (novo)

```tsx
import { Paper } from '@mui/material'
import type { GrupoClimaGeral } from '../../../types/analise'
import { TextoAbertoLista } from '../TextoAbertoLista/TextoAbertoLista'
import { EstadoAguardandoMinimo } from '../EstadoAguardandoMinimo/EstadoAguardandoMinimo'

interface GrupoClimaCardProps {
  grupo: GrupoClimaGeral
}

/**
 * Um bloco por ciclo de clima. `respostas_clima`/`itens_resposta_clima` são
 * estruturalmente anônimas (sem nenhuma FK de identidade) — os textos
 * liberados NUNCA têm nenhuma atribuição, nem agregada por pessoa (nada de
 * "Respondente 1"). Sem cabeçalho de avaliado (não existe, ao contrário de
 * `GrupoParesSubordinadoCard`).
 */
export function GrupoClimaCard({ grupo }: GrupoClimaCardProps) {
  return (
    <Paper variant="outlined" className="flex flex-col gap-2 p-3">
      {grupo.liberado ? (
        <TextoAbertoLista textos={grupo.textos ?? []} />
      ) : (
        <EstadoAguardandoMinimo totalRespondentes={grupo.totalRespondentes} minimoNecessario={grupo.minimoNecessario} />
      )}
    </Paper>
  )
}
```

##### 1.3.7 `components/analise/AvisoLimitacaoAnonimizacao/AvisoLimitacaoAnonimizacao.tsx` (novo)

```tsx
import { Alert } from '@mui/material'

/**
 * Aviso fixo de limitação conhecida (spec, seção 3.6): mesmo com o mínimo de
 * respondentes atingido, o texto em si pode ser identificável por conteúdo
 * ou estilo de escrita — sem solução automática nesta versão. Renderizado
 * pela página só quando existe pelo menos um grupo LIBERADO de
 * pares/subordinado/clima na resposta (decisão 5) — sem `onClose`/botão de
 * dispensar, sem condição de papel.
 */
export function AvisoLimitacaoAnonimizacao() {
  return (
    <Alert severity="warning">
      Mesmo quando o número mínimo de respondentes é atingido, o texto em si
      pode ser identificável por conteúdo ou estilo de escrita. Esta é uma
      limitação conhecida, sem solução automática nesta versão.
    </Alert>
  )
}
```

#### 1.4 `frontend/src/pages/AnaliseAvaliacoesPage/formatadores.ts` (novo, local à página)

```ts
/** `'YYYY-MM-DD'` do primeiro dia do ano corrente — sugestão inicial de UX, nunca um default do backend. */
export function inicioAnoCorrenteYMD(): string {
  return `${new Date().getFullYear()}-01-01`
}

/** `'YYYY-MM-DD'` de hoje, fuso local — sugestão inicial de UX. */
export function hojeYMD(): string {
  const hoje = new Date()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')
  return `${hoje.getFullYear()}-${mes}-${dia}`
}
```

Duplicação deliberada de `AnaliseVisaoGeralPage/formatadores.ts` (decisão
11) — só estas duas funções, sem `formatarInteiro`/`formatarPercentual`/
`formatarHoras` (não usadas nesta tela).

#### 1.5 `frontend/src/pages/AnaliseAvaliacoesPage/AnaliseAvaliacoesPage.tsx` (novo)

Rota `/analise/avaliacoes`, dentro do grupo protegido existente
(`admin`/`gestor_rh`, `PainelAdminLayout`).

**Estado local** (mesmo trio/padrão de `AnaliseVisaoGeralPage`, ver "Estado
atual verificado"): `de`/`ate` (`useState` inicial via
`inicioAnoCorrenteYMD()`/`hojeYMD()`), `cicloId: string | null` (lido de
`useSearchParams()` no mount), `nomeCiclo: string | null` (best-effort via
`buscarCiclo`), `dados: AvaliacoesAnalise | null`, `carregando: boolean`,
`erro: string | null`.

**Fluxo**: idêntico a `AnaliseVisaoGeralPage` (`executarBusca(overrides?)`,
`useEffect` inicial, `useEffect` de `nomeCiclo`, `handleSubmit`,
`handleRemoverFiltroCiclo`) — só troca `buscarVisaoGeralAnalise` por
`buscarAvaliacoesAnalise` e a mensagem genérica de erro para "Não foi
possível carregar as avaliações."

**Derivados** (`useMemo`/consts simples, sem lógica de gate):
- `identificadasPorTipo`: agrupamento client-side por `tipoRelacionamento`
  (decisão 6) — só filtragem, não agregação sensível.
- `vazio`: `identificadas.length === 0 && paresSubordinado.length === 0 &&
  climaGeral.length === 0` (decisão 4).
- `existeGrupoLiberado`: `paresSubordinado.some(g => g.liberado) ||
  climaGeral.some(g => g.liberado)` (decisão 5, controla
  `AvisoLimitacaoAnonimizacao`).

**Implementação completa**:

```tsx
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Alert, Button, Chip, Paper, Skeleton, TextField, Typography } from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import { AvaliacaoIdentificadaCard } from '../../components/analise/AvaliacaoIdentificadaCard/AvaliacaoIdentificadaCard'
import { AvisoLimitacaoAnonimizacao } from '../../components/analise/AvisoLimitacaoAnonimizacao/AvisoLimitacaoAnonimizacao'
import { GrupoClimaCard } from '../../components/analise/GrupoClimaCard/GrupoClimaCard'
import { GrupoParesSubordinadoCard } from '../../components/analise/GrupoParesSubordinadoCard/GrupoParesSubordinadoCard'
import { ApiError } from '../../lib/apiClient'
import { buscarCiclo } from '../../services/ciclosService'
import { buscarAvaliacoesAnalise } from '../../services/analiseService'
import type { AvaliacaoIdentificada, AvaliacoesAnalise, TipoRelacionamentoIdentificado } from '../../types/analise'
import { hojeYMD, inicioAnoCorrenteYMD } from './formatadores'

const SECOES_IDENTIFICADAS: { tipo: TipoRelacionamentoIdentificado; titulo: string }[] = [
  { tipo: 'autoavaliacao', titulo: 'Autoavaliação' },
  { tipo: 'gestor', titulo: 'Gestor' },
  { tipo: 'externo', titulo: 'Externo' },
]

function agruparPorTipo(itens: AvaliacaoIdentificada[]): Record<TipoRelacionamentoIdentificado, AvaliacaoIdentificada[]> {
  return {
    autoavaliacao: itens.filter((i) => i.tipoRelacionamento === 'autoavaliacao'),
    gestor: itens.filter((i) => i.tipoRelacionamento === 'gestor'),
    externo: itens.filter((i) => i.tipoRelacionamento === 'externo'),
  }
}

/**
 * Lista de respostas individuais de perguntas `texto_aberto` (avaliação 360 +
 * clima organizacional). `autoavaliacao`/`gestor`/`externo` saem sempre
 * identificados (sem terceiro a proteger). `pares`/`subordinado`/clima só
 * saem quando o grupo atinge `minimoNecessario` respondentes — ESTE LIMIAR
 * NÃO TEM BYPASS PARA NENHUM PAPEL, nem admin/gestor_rh (spec, seção 2).
 * Todo estado liberado/bloqueado, a ordem dos textos e a presença/ausência de
 * identidade já vêm prontos da API — esta página só formata/exibe.
 */
export function AnaliseAvaliacoesPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [de, setDe] = useState(() => inicioAnoCorrenteYMD())
  const [ate, setAte] = useState(() => hojeYMD())
  const [cicloId, setCicloId] = useState<string | null>(() => searchParams.get('cicloId'))
  const [nomeCiclo, setNomeCiclo] = useState<string | null>(null)

  const [dados, setDados] = useState<AvaliacoesAnalise | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const periodoInvalido = ate < de

  const executarBusca = useCallback(
    async (overrides?: { cicloId?: string | null }) => {
      const cicloIdAtual = overrides?.cicloId !== undefined ? overrides.cicloId : cicloId

      if (ate < de) return

      setCarregando(true)
      setErro(null)
      try {
        const resultado = await buscarAvaliacoesAnalise({ de, ate, cicloId: cicloIdAtual ?? undefined })
        setDados(resultado)
      } catch (err) {
        if (err instanceof ApiError && err.codigo === 'CICLO_NAO_ENCONTRADO') {
          setErro('O ciclo filtrado não foi encontrado. Remova o filtro de ciclo e tente novamente.')
        } else {
          setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar as avaliações.')
        }
      } finally {
        setCarregando(false)
      }
    },
    [de, ate, cicloId],
  )

  useEffect(() => {
    // Carga inicial via API — não é dado derivável durante a renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    executarBusca()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!cicloId) return
    let cancelado = false
    buscarCiclo(cicloId)
      .then((ciclo) => {
        if (!cancelado) setNomeCiclo(ciclo.nome)
      })
      .catch(() => {
        // Best-effort — falha aqui nunca vira o `erro` principal da página,
        // mesmo padrão de AnaliseVisaoGeralPage.
      })
    return () => {
      cancelado = true
    }
  }, [cicloId])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    executarBusca()
  }

  function handleRemoverFiltroCiclo() {
    setCicloId(null)
    setNomeCiclo(null)
    setSearchParams({}, { replace: true })
    executarBusca({ cicloId: null })
  }

  const identificadasPorTipo = useMemo(
    () => (dados ? agruparPorTipo(dados.avaliacao360.identificadas) : null),
    [dados],
  )

  const vazio =
    !!dados &&
    dados.avaliacao360.identificadas.length === 0 &&
    dados.avaliacao360.paresSubordinado.length === 0 &&
    dados.climaGeral.length === 0

  const existeGrupoLiberado =
    !!dados &&
    (dados.avaliacao360.paresSubordinado.some((g) => g.liberado) || dados.climaGeral.some((g) => g.liberado))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Typography variant="h5" component="h1">
            Avaliações
          </Typography>
          {cicloId && (
            <Chip
              label={`Filtrado por ciclo: ${nomeCiclo ?? cicloId}`}
              onDelete={handleRemoverFiltroCiclo}
              size="small"
            />
          )}
        </div>
      </div>

      <Paper component="form" onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 p-4">
        <TextField
          label="De"
          type="date"
          size="small"
          value={de}
          onChange={(e) => setDe(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Até"
          type="date"
          size="small"
          value={ate}
          onChange={(e) => setAte(e.target.value)}
          error={periodoInvalido}
          helperText={periodoInvalido ? 'A data final não pode ser anterior à data inicial.' : ' '}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button type="submit" variant="contained" disabled={periodoInvalido || carregando}>
          Aplicar filtro
        </Button>
      </Paper>

      {!carregando && !erro && existeGrupoLiberado && <AvisoLimitacaoAnonimizacao />}

      {carregando && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, indice) => (
            <Skeleton key={indice} variant="rounded" height={120} />
          ))}
        </div>
      )}

      {!carregando && erro && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <Typography role="alert" color="error">
            {erro}
          </Typography>
          <Button variant="contained" color="primary" onClick={() => executarBusca()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {!carregando && !erro && vazio && (
        <Alert severity="info">Nenhuma resposta de texto aberto encontrada para o período/filtro selecionado.</Alert>
      )}

      {!carregando && !erro && dados && !vazio && (
        <div className="flex flex-col gap-6">
          {identificadasPorTipo && dados.avaliacao360.identificadas.length > 0 && (
            <div className="flex flex-col gap-3">
              <Typography variant="subtitle1">Avaliação 360 — respostas identificadas</Typography>
              {SECOES_IDENTIFICADAS.map(
                ({ tipo, titulo }) =>
                  identificadasPorTipo[tipo].length > 0 && (
                    <div key={tipo} className="flex flex-col gap-2">
                      <Typography variant="subtitle2" color="text.secondary">
                        {titulo}
                      </Typography>
                      <div className="flex flex-col gap-2">
                        {identificadasPorTipo[tipo].map((item, indice) => (
                          <AvaliacaoIdentificadaCard
                            key={`${item.avaliadoId}-${item.avaliadorId}-${item.perguntaId}-${indice}`}
                            item={item}
                          />
                        ))}
                      </div>
                    </div>
                  ),
              )}
            </div>
          )}

          {dados.avaliacao360.paresSubordinado.length > 0 && (
            <div className="flex flex-col gap-3">
              <Typography variant="subtitle1">Avaliação 360 — pares e subordinados</Typography>
              <div className="flex flex-col gap-2">
                {dados.avaliacao360.paresSubordinado.map((grupo, indice) => (
                  <GrupoParesSubordinadoCard
                    key={`${grupo.avaliadoId}-${grupo.cicloId}-${grupo.tipoRelacionamento}-${indice}`}
                    grupo={grupo}
                  />
                ))}
              </div>
            </div>
          )}

          {dados.climaGeral.length > 0 && (
            <div className="flex flex-col gap-3">
              <Typography variant="subtitle1">Clima e Satisfação</Typography>
              <div className="flex flex-col gap-2">
                {dados.climaGeral.map((grupo, indice) => (
                  <GrupoClimaCard key={`${grupo.cicloId}-${indice}`} grupo={grupo} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

**Papéis com acesso**: `admin`, `gestor_rh` — idênticos, sem nenhuma
renderização condicional por papel dentro da página. `colaborador` nunca
alcança esta rota (barrado por `RotaProtegida`).

**Fonte dos dados (identificado vs. agregado)**: mista, ver contrato acima —
`avaliacao360.identificadas` é identificado (esperado); `paresSubordinado`/
`climaGeral` são agregados/gated pelo backend, a página só formata o
resultado já pronto. `buscarCiclo(cicloId)` só lê metadados administrativos
do ciclo (nome), nunca identidade de avaliador/avaliado.

**Estados tratados**: carregando (skeleton) / vazio (nenhum item em nenhum
dos três arrays → `Alert` informativo, distinto de erro e distinto de "todo
item bloqueado") / erro (`ApiError`/mensagem genérica + "Tentar novamente",
incluindo mapeamento específico para `CICLO_NAO_ENCONTRADO`) / sucesso, com
cada grupo bloqueado renderizado inline via `EstadoAguardandoMinimo` (nunca
omitido do array, nunca com ação de bypass).

#### 1.6 `frontend/src/App.tsx` (editado)

Import de `AnaliseAvaliacoesPage` +
`<Route path="/analise/avaliacoes" element={<AnaliseAvaliacoesPage />} />`
dentro do `<Route element={<PainelAdminLayout />}>` já existente, mesmo
nível de `/analise/visao-geral`. Nenhuma outra linha de `App.tsx` muda.

#### 1.7 `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx` (editado)

Única mudança: a entrada `qualitativa` em `GRUPOS` troca o placeholder pela
opção real —

```ts
{ key: 'qualitativa', label: 'Qualitativa', opcoes: [{ label: 'Avaliações', to: '/analise/avaliacoes' }] },
```

Nenhuma outra linha do arquivo muda — `SubmenuOpcao` já tem `to?: string`,
`grupoAtivo` já reconhece `opcoes[].to` de qualquer grupo `tipo ===
'submenus'` (ver "Estado atual verificado"), a renderização de
`submenu.opcoes.map` já trata `opcao.to` presente/ausente genericamente.

#### 1.8 `frontend/src/pages/CiclosListPage/CiclosListPage.tsx` (editado)

Dois ajustes no mesmo bloco `CardActions` (linhas ~277–283 hoje):

1. Import de ícones no topo do arquivo:
   ```ts
   import BarChartIcon from '@mui/icons-material/BarChart'
   import ForumIcon from '@mui/icons-material/Forum'
   ```
2. Botão "Visão Geral" ganha `startIcon`; botão novo "Avaliações" entra logo
   depois, também **fora** do bloco condicional `ciclo.status === 'rascunho'`:
   ```tsx
   <Button size="small" onClick={() => navigate(`/ciclos/${ciclo.id}`)}>
     Ver detalhes
   </Button>
   <Button
     size="small"
     startIcon={<BarChartIcon fontSize="small" />}
     onClick={() => navigate(`/analise/visao-geral?cicloId=${ciclo.id}`)}
   >
     Visão Geral
   </Button>
   <Button
     size="small"
     startIcon={<ForumIcon fontSize="small" />}
     onClick={() => navigate(`/analise/avaliacoes?cicloId=${ciclo.id}`)}
   >
     Avaliações
   </Button>
   {ciclo.status === 'rascunho' && (
     ...
   )}
   ```

Nenhuma outra linha de `CiclosListPage.tsx` muda.

---

Ao terminar: rodar `npm run build` (`tsc -b && vite build`) e `npm run lint`
(`eslint .`) dentro de `frontend/`, confirmar que ambos passam sem
erros/avisos novos. Registrar no resumo da etapa se o contrato consumido
bateu literalmente contra `task-backend.md` (nomes de campo, códigos de
erro) — o módulo `backend/src/modules/analise/analise-avaliacoes.service.ts`
pode ainda não existir em disco no momento desta implementação (só o plano
em `task-backend.md`); se assim for, consumir o contrato tal como fechado no
documento, sem suposição além do que está escrito nas duas tasks, e registrar
essa condição no resumo.

### 2. frontend-codereviewer

Pontos de atenção específicos para o revisor conferir (além do checklist
padrão já usado em "Visão Geral"):

1. **Nenhum bypass/toggle/"ver mesmo assim" para grupo bloqueado, para
   nenhum papel** — `EstadoAguardandoMinimo` não recebe nenhuma prop de
   callback/ação; grep por `admin`/`gestor_rh`/`colaborador?.papel` dentro de
   `AnaliseAvaliacoesPage.tsx` e de todo `components/analise/**` novo desta
   task não deveria retornar nada (a única checagem de papel é
   `RotaProtegida`, no nível de rota) — achado **crítico** se encontrado.
2. **Nenhum recálculo de gate no cliente** — grep por comparações do tipo
   `totalRespondentes >=`/`totalRespondentes <` fora de dentro do próprio
   payload já recebido (ex.: não deveria haver nenhuma lógica que decida
   `liberado` a partir de `totalRespondentes`/`minimoNecessario`; a página só
   lê o campo `liberado` já pronto) — achado crítico se encontrado.
3. **Nenhuma reordenação de `textos`/`paresSubordinado`/`climaGeral`/
   `identificadas`** — grep por `.sort(`/`.reverse(` em
   `AnaliseAvaliacoesPage.tsx` e em todo componente novo de
   `components/analise/` não deveria retornar nada. Nenhum número de posição
   ("1 de N", "Resposta X") renderizado ao lado de nenhum item de
   `TextoAbertoLista`.
4. **`climaGeral` sem nenhuma atribuição** — `GrupoClimaCard` não renderiza
   nenhum rótulo por texto individual (nem "Respondente 1"); confirmar que
   `GrupoClimaCard` não recebe nem usa nenhum campo de identidade (não
   existe no tipo `GrupoClimaGeral`, mas confirmar que nenhum código novo
   tenta inferir/combinar identidade de outra fonte).
5. **Definição de "vazio" correta** (decisão 4): confirmar que um grupo
   presente mas com `liberado: false` não é tratado como "vazio" — a seção
   correspondente deve renderizar o card com `EstadoAguardandoMinimo`
   normalmente, nunca ser omitida pela lógica de `vazio`.
6. **`AvisoLimitacaoAnonimizacao` condicionado só a
   `paresSubordinado.some(liberado) || climaGeral.some(liberado)`**, sem
   nenhuma condição de papel, sem `onClose`/estado de "dispensado" — deveria
   aparecer sempre que essa condição for verdadeira, em qualquer sessão nova.
7. **Nenhum campo de identidade tratado incorretamente** —
   `avaliacao360.identificadas` (que TEM `avaliadorId`/`avaliadorNome`) é o
   único lugar onde esses campos devem aparecer; confirmar que nenhum
   componente de `paresSubordinado`/`climaGeral` tenta ler
   `avaliadorId`/`avaliadorNome` (esses campos nem existem em
   `GrupoParesSubordinado`/`GrupoClimaGeral`, mas confirmar que nenhum `as
   any`/cast contorna isso).
8. **`cicloId` combinável com `de`/`ate`, não mutuamente exclusivo** (mesmo
   padrão de "Visão Geral") — trocar o período mantém o filtro de ciclo já
   aplicado; só "Remover filtro de ciclo" o limpa (state + URL via
   `setSearchParams`).
9. **`buscarCiclo(cicloId)` é best-effort e não-bloqueante** — sua falha
   nunca vira o `erro` principal da página.
10. **Ícones**: import default por arquivo individual
    (`@mui/icons-material/BarChart`, `@mui/icons-material/Forum`), nunca do
    barrel; ambos os botões ("Visão Geral" e "Avaliações") ficam **fora** do
    bloco condicional `ciclo.status === 'rascunho'` em `CiclosListPage.tsx`
    — confirmar que "Avaliações" não ficou preso dentro do bloco por engano
    (o mesmo erro seria fácil de cometer copiando "Ativar ciclo" por perto).
11. **Submenu "Qualitativa"**: mudança estritamente aditiva/substitutiva —
    `{ label: 'Avaliações', to: '/analise/avaliacoes' }` no lugar do
    placeholder, sem alterar `SubmenuOpcao`/`grupoAtivo`/nenhuma outra rota
    existente.
12. **Sem nova dependência** (`@mui/x-date-pickers`/`dayjs`) — conferir
    `package.json` sem diffs nessas libs.
13. **`sx={{ fontWeight: ... }}`** em vez de `fontWeight={...}` como prop
    solta em todo `Typography` novo desta feature.
14. **`FormEvent<HTMLFormElement>` importado explicitamente** de `'react'`
    em `AnaliseAvaliacoesPage.tsx` (não `React.FormEvent` implícito) — nota
    de consistência já registrada na revisão de "Visão Geral".
15. Confirmar `npm run build`/`npm run lint` sem novas falhas antes de
    aprovar.

## Revisão

Revisor: `frontend-codereviewer`. Arquivos conferidos por leitura completa:
`types/analise.ts`, `services/analiseService.ts`,
`components/analise/rotulosRelacionamento.ts`,
`components/analise/TextoAbertoLista/TextoAbertoLista.tsx`,
`components/analise/AvaliacaoIdentificadaCard/AvaliacaoIdentificadaCard.tsx`,
`components/analise/EstadoAguardandoMinimo/EstadoAguardandoMinimo.tsx`,
`components/analise/GrupoParesSubordinadoCard/GrupoParesSubordinadoCard.tsx`,
`components/analise/GrupoClimaCard/GrupoClimaCard.tsx`,
`components/analise/AvisoLimitacaoAnonimizacao/AvisoLimitacaoAnonimizacao.tsx`,
`pages/AnaliseAvaliacoesPage/AnaliseAvaliacoesPage.tsx`,
`pages/AnaliseAvaliacoesPage/formatadores.ts`, `App.tsx`,
`layouts/PainelAdminLayout/PainelAdminLayout.tsx`,
`pages/CiclosListPage/CiclosListPage.tsx`. Também lido, para checagem de
contrato, `backend/src/modules/analise/analise-avaliacoes.service.ts`,
`analise.controller.ts`, `analise.module.ts` e `analise-comum.ts`.

**Nenhum achado crítico.** Os pontos mais sensíveis do checklist (1–7 da
seção acima) foram conferidos e estão corretos:

1. **Sem bypass/toggle/"ver mesmo assim"**: grep por
   `admin`/`gestor_rh`/`colaborador?.papel`/`colaborador.papel` em
   `AnaliseAvaliacoesPage.tsx` e em todo `components/analise/**` só retorna
   ocorrências dentro de comentários JSDoc (explicando a ausência de bypass),
   nunca em código executável. `EstadoAguardandoMinimo` recebe só
   `totalRespondentes`/`minimoNecessario`, sem nenhuma prop de
   callback/ação/toggle. A única checagem de papel de toda a feature
   continua sendo `RotaProtegida papeis={['admin','gestor_rh']}` em
   `App.tsx`, no mesmo grupo de rota já usado por "Visão Geral".
2. **Sem recálculo de gate no cliente**: grep por
   `totalRespondentes\s*(>=|<)` em todo `frontend/src` não retorna nada. A
   página e os cards só leem `grupo.liberado` (já pronto do payload) para
   decidir entre `TextoAbertoLista` e `EstadoAguardandoMinimo` — nenhuma
   comparação de limiar é refeita no frontend.
3. **Sem reordenação/numeração**: grep por `.sort(`/`.reverse(` em
   `AnaliseAvaliacoesPage.tsx` e em todo `components/analise/**` não retorna
   nada em código (só uma menção em comentário JSDoc de
   `TextoAbertoLista.tsx` explicando a proibição). Nenhum número de posição
   ("1 de N", "Resposta X") é renderizado — as `key`s de lista
   (`${item.perguntaId}-${indice}` etc.) são só identificadores técnicos do
   React, nunca exibidos na UI.
4. **`climaGeral` sem nenhuma atribuição por pessoa**: `GrupoClimaCard` não
   tem cabeçalho de avaliado (diferente de `GrupoParesSubordinadoCard`), não
   lê nem tenta inferir nenhum campo de identidade — `GrupoClimaGeral` (tipo)
   nem tem `avaliadorId`/`avaliadorNome`. Grep por `avaliadorId`/
   `avaliadorNome`/`as any` em `GrupoClimaCard.tsx` e
   `GrupoParesSubordinadoCard.tsx` não retorna nada — esses dois campos só
   existem em `AvaliacaoIdentificada`/`AvaliacaoIdentificadaCard`, onde são
   esperados e corretos (autoavaliação/gestor/externo não têm terceiro a
   proteger).
5. **Definição de "vazio" correta**: `vazio` em
   `AnaliseAvaliacoesPage.tsx` é estritamente
   `identificadas.length === 0 && paresSubordinado.length === 0 &&
   climaGeral.length === 0` — idêntico à decisão 4 do plano. Um
   `GrupoParesSubordinado`/`GrupoClimaGeral` presente mas com
   `liberado: false` não zera nenhum desses `.length`, então a seção
   correspondente é renderizada normalmente (`.length > 0` continua
   verdadeiro), mostrando o card com `EstadoAguardandoMinimo` dentro — nunca
   tratado como omissão.
6. **`AvisoLimitacaoAnonimizacao` sem condição de papel/`onClose`**: o
   componente não recebe nenhuma prop, não tem estado interno de
   "dispensado", sem botão de fechar. É renderizado pela página só sob
   `existeGrupoLiberado` (`paresSubordinado.some(liberado) ||
   climaGeral.some(liberado)`), exatamente a decisão 5 do plano — sem
   nenhuma referência a `colaborador`/papel.
7. **Nenhum campo de identidade tratado incorretamente**: confirmado acima
   (item 4); reforçado por leitura de `types/analise.ts` — `GrupoParesSubordinado`
   e `GrupoClimaGeral` não declaram `avaliadorId`/`avaliadorNome`.

Demais pontos do checklist (8–15) também conferem:

- **`cicloId` combinável com `de`/`ate`**: `executarBusca` sempre usa o
  `cicloId` do state (ou `overrides.cicloId`), nunca o limpa implicitamente
  ao trocar `de`/`ate`; só `handleRemoverFiltroCiclo` zera `cicloId` e a URL
  via `setSearchParams({}, { replace: true })`.
- **`buscarCiclo(cicloId)` best-effort**: `useEffect` isolado com
  `try/catch` (`.catch(() => {})`) — falha nunca vira `erro` principal nem
  bloqueia `buscarAvaliacoesAnalise`.
- **Ícones**: `import BarChartIcon from '@mui/icons-material/BarChart'` e
  `import ForumIcon from '@mui/icons-material/Forum'` em
  `CiclosListPage.tsx` — import default por arquivo individual, não do
  barrel. Confirmado por leitura direta do `CardActions` (linhas ~279–327)
  que "Visão Geral" e "Avaliações" estão os dois **fora** do bloco
  `ciclo.status === 'rascunho'` — não caíram por engano dentro do bloco
  condicional que contém "Ativar ciclo"/"Excluir".
- **Submenu "Qualitativa"**: única linha alterada em
  `PainelAdminLayout.tsx` —
  `{ key: 'qualitativa', label: 'Qualitativa', opcoes: [{ label:
  'Avaliações', to: '/analise/avaliacoes' }] }`, substituição direta do
  placeholder `{ label: 'Em breve', disabled: true }`, sem tocar
  `SubmenuOpcao`/`grupoAtivo`/nenhuma outra rota.
- **Sem nova dependência**: `frontend/package.json` sem `dayjs`/
  `@mui/x-date-pickers`.
- **`sx={{ fontWeight: ... }}`**: grep por `fontWeight={` (prop solta) em
  `AnaliseAvaliacoesPage.tsx` e em todo `components/analise/**` não retorna
  nada — nenhum `Typography` novo usa a prop solta.
- **`FormEvent<HTMLFormElement>` importado explicitamente**: `import {
  useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'`
  no topo de `AnaliseAvaliacoesPage.tsx`, `handleSubmit(event:
  FormEvent<HTMLFormElement>)` — a sugestão registrada na revisão de "Visão
  Geral" foi incorporada desde o início nesta task, como o próprio plano já
  previa.
- **Estilo**: só Tailwind para layout/espaçamento (`className`) + MUI para
  controles; nenhum `.css` novo sob `components/analise/**` (confirmado por
  `Glob`), nenhum `style={{}}` inline em nenhum arquivo novo/editado desta
  task.

**Verificação de contrato contra o backend real** (o
`frontend-developer` só teve o plano disponível no momento da
implementação; `backend/src/modules/analise/analise-avaliacoes.service.ts`
já existe agora): os nomes de campo batem **literalmente**, um a um, entre
`types/analise.ts` (frontend) e as interfaces exportadas de
`analise-avaliacoes.service.ts` (backend) — `TextoAbertoItem`
(`perguntaId`/`perguntaEnunciado`/`texto`), `AvaliacaoIdentificada`
(`tipoRelacionamento`/`cicloId`/`avaliadoId`/`avaliadoNome`/`avaliadorId`/
`avaliadorNome`/`perguntaId`/`perguntaEnunciado`/`texto`),
`GrupoParesSubordinado`
(`cicloId`/`avaliadoId`/`avaliadoNome`/`tipoRelacionamento`/
`totalRespondentes`/`minimoNecessario`/`liberado`/`motivo?`/`textos?`),
`GrupoClimaGeral`
(`cicloId`/`totalRespondentes`/`minimoNecessario`/`liberado`/`motivo?`/
`textos?`) e o envelope `AvaliacoesAnalise`
(`periodo`/`cicloId`/`avaliacao360.{identificadas,paresSubordinado}`/
`climaGeral`) são idênticos campo a campo dos dois lados, inclusive o valor
literal do `motivo` (`'aguardando_minimo_respondentes'`). A rota é montada
em `analise.module.ts` como `router.get('/avaliacoes', ...)` sob
`router.use(autenticar)`, dentro do mesmo módulo `/api/analise` de
"visão-geral" — bate com o `apiFetch('/api/analise/avaliacoes?...')` usado
em `analiseService.ts`. Os códigos de erro usados pelo frontend
(`CICLO_NAO_ENCONTRADO` tratado especificamente; `CAMPO_INVALIDO`/
`PERIODO_INVALIDO`/`PAPEL_NAO_AUTORIZADO` cobertos genericamente via
`err.message`) também batem com o que `buscarAvaliacoes`
(`analise-avaliacoes.service.ts`) e `analise-comum.ts`
(`validarDataQuery`) lançam. **Nenhuma divergência de contrato encontrada.**

### Crítico

Nenhum.

### Deveria corrigir

Nenhum.

### Sugestão

Nenhuma sugestão nova — a única sugestão pendente da revisão anterior
("Visão Geral", `React.FormEvent` sem import explícito) já foi incorporada
por padrão nesta task desde a primeira implementação.

**Conclusão**: sem achados críticos nem "deveria corrigir" — a task pode
seguir para a etapa de `test-engineer`.

## Testes

Confirmado, por leitura direta de `frontend/package.json`, que o projeto
continua **sem nenhum framework/precedente de teste de componente/página**
(sem `vitest`, `jest`, `@testing-library/*` ou qualquer variante — mesma
constatação já registrada em `.claude/tasks/analise-visao-geral/`, ainda
válida). Por instrução explícita do escopo desta rodada, **não introduzi
nenhum framework novo** — só documento a constatação, como já era o padrão
do projeto.

Nenhum teste automatizado de frontend foi escrito para esta feature. A
cobertura de anonimização/controle de acesso desta feature (a prioridade
real) está inteiramente no backend, coberta em
`backend/src/modules/analise/analise-avaliacoes.service.spec.ts` — o
frontend, por decisão de design já registrada acima ("Guard rails
obrigatórios"), não calcula nenhuma regra de gate/anonimização própria (só
lê `grupo.liberado`/`grupo.textos` já prontos da API), então não há lógica de
negócio sensível aqui para uma suíte de frontend cobrir além do que já foi
verificado por leitura/grep na revisão (nenhum `if (papel === ...)`, nenhuma
prop de bypass em `EstadoAguardandoMinimo`, nenhum `.sort()`/reordenação de
`textos`).

Se/quando o projeto adotar um framework de teste de componente (Vitest +
Testing Library seria o candidato natural, dado que o backend já usa
Vitest), os candidatos a teste desta tela, em ordem de prioridade, seriam:
`EstadoAguardandoMinimo` nunca renderizar nenhum elemento interativo (guard
rail "sem bypass"), `AnaliseAvaliacoesPage` nunca reordenar `textos`/grupos
recebidos da API, e a definição de "vazio" (decisão 4) distinguir
corretamente "nenhum item" de "todo item bloqueado".
