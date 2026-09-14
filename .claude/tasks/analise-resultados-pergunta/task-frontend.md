# Task: Módulo Análise — tela "Resultados por Pergunta" — Frontend

Demanda 100% frontend (`frontend/`, equivalente a `apps/web` na nomenclatura dos
agentes/skills — usar sempre os caminhos reais `frontend/**` neste plano). Não
toca `backend/`. Base obrigatória, lida por completo antes deste plano:
`.claude/tasks/analise-resultados-pergunta/spec.md` (seções 4, 5, 8, 10) e
`.claude/tasks/analise-resultados-pergunta/task-backend.md` (seção "Decisões de
modelagem", passo 1 — tipos/interfaces exatos do payload). Este plano traduz o
contrato já fechado pelo backend em tipos/serviço/componentes/página — **não
reabre nomes de campo**, só traduz para TS do lado do frontend.

Contrato consumido: `GET /api/analise/resultados-pergunta?de=&ate=&cicloId=`
(ver task-backend.md passo 1 para os tipos completos, replicados na seção
"Decisões de modelagem" abaixo).

---

## LEMBRETE DA REGRA MAIS SENSÍVEL DO PROJETO — leia antes de qualquer linha de código

- **Esta é a tela MAIS ESTRITA do módulo `analise` até aqui**: o payload nunca
  expõe `totalRespondentes`/`minimoNecessario` (diferente de "Avaliações") —
  só `liberado: boolean` + `motivo?: 'aguardando_minimo_respondentes'`. Nenhum
  tipo TS novo em `types/analise.ts` pode ter campo numérico de contagem de
  respondentes/membros, em nenhuma condição — e nenhum componente novo pode
  **inventar, estimar ou somar** esse número a partir da distribuição exposta
  (mesmo que pareça "só um detalhe visual").
- `distribuicao`/`competencias` só existem quando `liberado === true` (ver os
  tipos abaixo — campo opcional, ausente quando bloqueado). Todo componente
  que renderiza uma dessas listas precisa checar `liberado` **antes** de ler
  `distribuicao`, nunca usar `distribuicao ?? []` como forma de "esconder" a
  checagem de `liberado` (uma lista vazia por `liberado === true` sem nenhuma
  resposta não deveria acontecer dado o desenho do backend, mas o componente
  não deve depender disso — sempre checar o booleano primeiro).
- **Zero-fill é feito pelo backend, nunca pelo frontend**: `distribuicao`
  já vem com todos os níveis `1..niveis` (mesmo com `contagem: 0`) ou todas as
  `opcoesDisponiveis` configuradas — os componentes de tabela só **exibem** o
  array na ordem recebida, nunca reordenam (alfabético, por contagem, etc.),
  nunca completam níveis/opções ausentes, nunca filtram itens com
  `contagem: 0`.
- **Ordem de `porTipoRelacionamento` também não é reordenada no frontend** —
  já vem na ordem fixa do backend (`autoavaliacao, gestor, pares, subordinado,
  externo`). Nenhum `.sort()` em nenhum componente novo desta feature.
- Reaproveitar `RankingDadosInsuficientesTag` (Chip sem nenhuma prop numérica)
  para todo estado `liberado === false` — **nunca** `EstadoAguardandoMinimo`
  (exige `totalRespondentes`/`minimoNecessario`, incompatível com este
  payload).
- Nenhuma regra de agregação/anonimização é calculada no frontend — tudo já
  vem pronto da API.

---

## Estado atual verificado (antes do plano)

Lido por completo antes deste plano:

- `frontend/src/pages/AnaliseAvaliacoesPage/AnaliseAvaliacoesPage.tsx` (+
  `agrupamento.ts`, `formatadores.ts`) — esqueleto de referência mais próximo:
  `useSearchParams`, período controlado (`de`/`ate`/`cicloId` em state +
  querystring), `executarBusca` com overrides, `Skeleton` (3× `rounded`
  height 120) enquanto carrega, `Alert severity="info"` para vazio, `Alert`+
  botão "Tentar novamente" para erro, `Accordion` por ciclo com
  `key={`${resultadoVersao}-${cicloId}`}` para forçar remonte a cada nova
  busca, `defaultExpanded={Boolean(cicloId)}`.
- `frontend/src/services/analiseService.ts` — convenção confirmada: toda
  função exportada tem sufixo `Analise` (`buscarVisaoGeralAnalise`,
  `buscarAvaliacoesAnalise`, `buscarRankingAnalise`,
  `buscarNuvemPalavrasAnalise`), interface `Buscar<Nome>AnaliseParams` ao
  lado, JSDoc curto descrevendo o que o payload identifica/anonimiza. A nova
  função segue esse padrão: `buscarResultadosPerguntaAnalise` (não
  `buscarResultadosPergunta` — esse é o nome do *service* do backend; o
  frontend usa o padrão já estabelecido de sufixar `Analise`).
- `frontend/src/types/analise.ts` — um bloco de comentário + tipos por tela,
  nesta ordem: Visão Geral, Avaliações, Ranking, Nuvem de Palavras. Novo bloco
  "Resultados por Pergunta" entra ao final, mesmo estilo de comentário
  explicando o que é seguro/inseguro expor.
- `frontend/src/components/analise/rotulosRelacionamento.ts` — `Record` com
  as 5 chaves (`autoavaliacao`, `gestor`, `externo`, `pares`, `subordinado`) e
  `rotuloTipoRelacionamento(tipo)`. Reaproveitado tal qual — a união de tipos
  de relacionamento desta feature usa os mesmos 5 valores, já cobertos.
- `frontend/src/components/analise/RankingDadosInsuficientesTag/RankingDadosInsuficientesTag.tsx`
  — `Chip` + `Tooltip`, **sem nenhuma prop**. Reaproveitado tal qual.
- `frontend/src/components/analise/SeletorCiclo/SeletorCiclo.tsx` — filtro de
  ciclo opcional (`cicloId: string | null`, `onChange`), busca ciclos
  `ativo`/`encerrado` via `listarCiclos()`. Reaproveitado tal qual.
- `frontend/src/components/analise/RankingTabela/RankingTabela.tsx` —
  referência de tabela MUI "burra" (`Table`/`TableHead`/`TableBody` `size="small"`,
  formatação via `Intl.NumberFormat('pt-BR')`, nenhum recálculo de dado
  sensível no componente).
- `frontend/src/App.tsx` (linhas 17-20 imports, 47-50 rotas) — 4 rotas
  `/analise/*` dentro do mesmo bloco `<Route element={<RotaProtegida
  papeis={['admin', 'gestor_rh']} />}><Route element={<PainelAdminLayout />}>`.
  Nova rota entra no mesmo bloco.
- `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx` (linhas
  63-87, `GRUPOS`) — grupo `analises` → submenu `quantitativa` já tem "Visão
  Geral" (`BarChartIcon`) e "Ranking" (`LeaderboardIcon`); submenu
  `qualitativa` tem "Avaliações"/"Nuvem de Palavras". "Resultados por
  Pergunta" entra como 3ª opção do submenu `quantitativa`.
- `frontend/src/lib/apiClient.ts` — `apiFetch<T>` + `ApiError` (com `.codigo`,
  usado em `AnaliseAvaliacoesPage` para tratar `CICLO_NAO_ENCONTRADO` com
  mensagem amigável — mesmo tratamento aplicado aqui).
- `frontend/src/components/analise/AvisoLimitacaoAnonimizacao/AvisoLimitacaoAnonimizacao.tsx`
  — aviso sobre texto identificável por conteúdo/estilo de escrita.
  **Não reaproveitado nesta tela** — não há texto livre aqui, só contagens
  numéricas, o aviso não se aplica.

---

## Decisões de modelagem

### 1. Tipos novos em `frontend/src/types/analise.ts` (ao final do arquivo)

Tradução literal dos tipos do passo 1 de `task-backend.md` (mesmos nomes de
campo, sem alterar nada):

```ts
// ---- "Resultados por Pergunta" (GET /api/analise/resultados-pergunta) ----
// Tela MAIS ESTRITA do módulo até aqui: nunca expõe totalRespondentes/
// minimoNecessario (diferente de AvaliacoesAnalise) — só liberado/motivo.
// `distribuicao`/`competencias` só existem quando liberado === true.
// `distribuicao` já vem zero-preenchida (todos os níveis 1..niveis / todas
// as opcoesDisponiveis, mesmo com contagem 0) e ORDENADA pelo backend —
// nunca reordenar/completar/filtrar no frontend. `porTipoRelacionamento`
// também já vem em ordem fixa (autoavaliacao, gestor, pares, subordinado,
// externo) — não reordenar.

export interface ContagemNivel {
  nivel: number
  contagem: number
}

export interface ContagemOpcao {
  opcao: string
  contagem: number
}

export type TipoRelacionamentoTodos = TipoRelacionamentoIdentificado | TipoRelacionamentoAnonimizado

export type TipoPerguntaEstruturada = 'likert' | 'matriz' | 'caixa_selecao'

export interface DistribuicaoTipoRelacionamento {
  tipoRelacionamento: TipoRelacionamentoTodos
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  distribuicao?: ContagemNivel[] // ausente quando liberado === false
}

export interface DistribuicaoOpcaoTipoRelacionamento {
  tipoRelacionamento: TipoRelacionamentoTodos
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
  distribuicao?: ContagemOpcao[] // ausente quando liberado === false
}

export interface CompetenciaDistribuicao {
  competenciaId: string
  competenciaNome: string
  porTipoRelacionamento: DistribuicaoTipoRelacionamento[]
}

interface ResultadoPerguntaBase360 {
  perguntaId: string
  perguntaEnunciado: string
  cicloId: string
  nomeCiclo: string
}

export interface ResultadoPerguntaLikert360 extends ResultadoPerguntaBase360 {
  tipo: 'likert'
  niveis: number
  porTipoRelacionamento: DistribuicaoTipoRelacionamento[]
}

export interface ResultadoPerguntaMatriz360 extends ResultadoPerguntaBase360 {
  tipo: 'matriz'
  niveis: number
  competencias: CompetenciaDistribuicao[] // distribuição SEPARADA por competência
}

export interface ResultadoPerguntaCaixaSelecao360 extends ResultadoPerguntaBase360 {
  tipo: 'caixa_selecao'
  opcoesDisponiveis: string[]
  porTipoRelacionamento: DistribuicaoOpcaoTipoRelacionamento[]
}

export type ResultadoPergunta360 =
  | ResultadoPerguntaLikert360
  | ResultadoPerguntaMatriz360
  | ResultadoPerguntaCaixaSelecao360

interface ResultadoPerguntaBaseClima {
  perguntaId: string
  perguntaEnunciado: string
  cicloId: string
  nomeCiclo: string
  liberado: boolean
  motivo?: 'aguardando_minimo_respondentes'
}

export interface ResultadoPerguntaLikertClima extends ResultadoPerguntaBaseClima {
  tipo: 'likert'
  niveis: number
  distribuicao?: ContagemNivel[]
}

export interface ResultadoPerguntaMatrizClima extends ResultadoPerguntaBaseClima {
  tipo: 'matriz'
  niveis: number
  competencias?: Array<{ competenciaId: string; competenciaNome: string; distribuicao: ContagemNivel[] }>
}

export interface ResultadoPerguntaCaixaSelecaoClima extends ResultadoPerguntaBaseClima {
  tipo: 'caixa_selecao'
  opcoesDisponiveis: string[]
  distribuicao?: ContagemOpcao[]
}

export type ResultadoPerguntaClima =
  | ResultadoPerguntaLikertClima
  | ResultadoPerguntaMatrizClima
  | ResultadoPerguntaCaixaSelecaoClima

export interface ResultadosPerguntaAnalise {
  periodo: { de: string; ate: string }
  cicloId: string | null
  avaliacao360: ResultadoPergunta360[]
  climaGeral: ResultadoPerguntaClima[]
}
```

`TipoRelacionamentoTodos` é só a união dos dois tipos já existentes no
arquivo (`TipoRelacionamentoIdentificado | TipoRelacionamentoAnonimizado`,
definidos na seção "Avaliações" mais acima) — não duplicar os 5 literais.

### 2. `frontend/src/services/analiseService.ts` — nova função

Ao final do arquivo, mesmo padrão das 4 existentes:

```ts
export interface BuscarResultadosPerguntaAnaliseParams {
  de: string // 'YYYY-MM-DD'
  ate: string // 'YYYY-MM-DD'
  cicloId?: string
}

/**
 * `GET /api/analise/resultados-pergunta` — distribuição de contagens por
 * nível (likert/matriz) ou opção (caixa_selecao), por pergunta. Tela MAIS
 * ESTRITA do módulo: nunca expõe totalRespondentes/minimoNecessario, só
 * `liberado`/`motivo`. `distribuicao`/`competencias` já vem zero-preenchida
 * e ordenada pelo backend — esta função só transporta, não reordena/completa.
 */
export function buscarResultadosPerguntaAnalise(
  params: BuscarResultadosPerguntaAnaliseParams,
): Promise<ResultadosPerguntaAnalise> {
  const query = new URLSearchParams({ de: params.de, ate: params.ate })
  if (params.cicloId) query.set('cicloId', params.cicloId)
  return apiFetch<ResultadosPerguntaAnalise>(`/api/analise/resultados-pergunta?${query.toString()}`)
}
```

Adicionar `ResultadosPerguntaAnalise` ao `import type { ... } from '../types/analise'` no topo do arquivo.

### 3. Novo arquivo `frontend/src/components/analise/rotulosTipoPergunta.ts`

Mesmo padrão de `rotulosRelacionamento.ts` — rótulo de exibição do tipo de
pergunta (Chip no card), usado pelos dois componentes de card do passo 5:

```ts
import type { TipoPerguntaEstruturada } from '../../types/analise'

const ROTULOS: Record<TipoPerguntaEstruturada, string> = {
  likert: 'Likert',
  matriz: 'Matriz',
  caixa_selecao: 'Caixa de seleção',
}

export function rotuloTipoPergunta(tipo: TipoPerguntaEstruturada): string {
  return ROTULOS[tipo]
}
```

### 4. Componentes de tabela — `frontend/src/components/analise/`

**`DistribuicaoNivelTabela/DistribuicaoNivelTabela.tsx`** — props
`{ distribuicao: ContagemNivel[] }`. Tabela MUI `size="small"`, colunas
"Nível" / "Respostas", uma linha por item, **na ordem recebida** (nunca
`.sort()`), `key={item.nivel}`. Sem cabeçalho de rótulo textual de nível (o
payload não traz `rotulos` configurados, só o número) — exibir `item.nivel`
literalmente. Formatar `contagem` com `Intl.NumberFormat('pt-BR')` (mesmo
padrão de `RankingTabela`).

**`DistribuicaoOpcaoTabela/DistribuicaoOpcaoTabela.tsx`** — props
`{ distribuicao: ContagemOpcao[] }`. Mesma estrutura, colunas "Opção" /
"Respostas", `key={item.opcao}`, **na ordem recebida** (a ordem já reflete
`perguntas.configuracao.opcoes`, nunca reordenar alfabeticamente nem por
contagem).

Ambas são componentes "burros": só leem a prop e renderizam, nenhum estado,
nenhum cálculo.

### 5. Componente `DistribuicaoPorTipoRelacionamento` — `frontend/src/components/analise/DistribuicaoPorTipoRelacionamento/DistribuicaoPorTipoRelacionamento.tsx`

Reaproveitado pelos dois tipos de pergunta 360 que têm `porTipoRelacionamento`
(likert e caixa_selecao). Prop discriminada por `variante` para manter o
narrowing de TS sem `as`:

```tsx
type DistribuicaoPorTipoRelacionamentoProps =
  | { variante: 'nivel'; itens: DistribuicaoTipoRelacionamento[] }
  | { variante: 'opcao'; itens: DistribuicaoOpcaoTipoRelacionamento[] }

export function DistribuicaoPorTipoRelacionamento(props: DistribuicaoPorTipoRelacionamentoProps) {
  if (props.variante === 'nivel') {
    return (
      <div className="flex flex-col gap-3">
        {props.itens.map((item) => (
          <div key={item.tipoRelacionamento} className="flex flex-col gap-1">
            <Chip size="small" label={rotuloTipoRelacionamento(item.tipoRelacionamento)} sx={{ alignSelf: 'flex-start' }} />
            {item.liberado ? <DistribuicaoNivelTabela distribuicao={item.distribuicao ?? []} /> : <RankingDadosInsuficientesTag />}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {props.itens.map((item) => (
        <div key={item.tipoRelacionamento} className="flex flex-col gap-1">
          <Chip size="small" label={rotuloTipoRelacionamento(item.tipoRelacionamento)} sx={{ alignSelf: 'flex-start' }} />
          {item.liberado ? <DistribuicaoOpcaoTabela distribuicao={item.distribuicao ?? []} /> : <RankingDadosInsuficientesTag />}
        </div>
      ))}
    </div>
  )
}
```

`item.liberado` é checado **antes** de ler `item.distribuicao` em ambos os
ramos (regra sensível da seção anterior).

### 6. Cards de pergunta — decisão sobre matriz (competências) sem poluir a tela

**Problema**: `matriz` tem `competencias[]`, cada uma com seu próprio
`porTipoRelacionamento` (360) ou `distribuicao` (clima) — empilhar
`Accordion` dentro de `Accordion` (Ciclo → Pergunta → Competência) fica
visualmente pesado e de navegação lenta com muitas competências.

**Decisão**: usar `Tabs` do MUI por competência **dentro do card da
pergunta matriz** (`variant="scrollable" scrollButtons="auto"`, um `Tab` por
competência, conteúdo da aba selecionada mostra a distribuição daquela
competência). Justificativa: evita o 3º nível de Accordion aninhado, mantém
o card com altura previsível (não cresce linearmente com o número de
competências — só a lista de Tabs cresce horizontalmente, com scroll), e
segue o mesmo princípio de "um elemento selecionável por vez" já usado por
`RankingTabela` (ordenar por métrica via clique) — familiar ao usuário deste
módulo.

**`ResultadoPergunta360Card/ResultadoPergunta360Card.tsx`** — props
`{ resultado: ResultadoPergunta360 }`:
- Header: `perguntaEnunciado` (negrito, `overflowWrap`/`wordBreak` como em
  `AvaliacaoIdentificadaCard`/cards existentes) + `Chip variant="outlined"`
  com `rotuloTipoPergunta(resultado.tipo)`.
- `tipo === 'likert'`: `<DistribuicaoPorTipoRelacionamento variante="nivel" itens={resultado.porTipoRelacionamento} />`.
- `tipo === 'caixa_selecao'`: `<DistribuicaoPorTipoRelacionamento variante="opcao" itens={resultado.porTipoRelacionamento} />`.
- `tipo === 'matriz'`: `useState(0)` para aba selecionada (`abaCompetencia`),
  `Tabs` com um `Tab key={c.competenciaId} label={c.competenciaNome}` por
  competência (ordem recebida, já ordenada pt-BR pelo backend — não
  reordenar), abaixo `<DistribuicaoPorTipoRelacionamento variante="nivel" itens={resultado.competencias[abaCompetencia].porTipoRelacionamento} />`
  guardado por `resultado.competencias[abaCompetencia] &&`.

**`ResultadoPerguntaClimaCard/ResultadoPerguntaClimaCard.tsx`** — props
`{ resultado: ResultadoPerguntaClima }`. Sem separação por tipo de
relacionamento (gate por ciclo inteiro):
- Mesmo header do card 360.
- `!resultado.liberado` → `<RankingDadosInsuficientesTag />` (uma vez, para a
  pergunta inteira — nunca por competência, o gate de clima não é por
  competência).
- `resultado.liberado && tipo === 'likert'` →
  `<DistribuicaoNivelTabela distribuicao={resultado.distribuicao ?? []} />`.
- `resultado.liberado && tipo === 'caixa_selecao'` →
  `<DistribuicaoOpcaoTabela distribuicao={resultado.distribuicao ?? []} />`.
- `resultado.liberado && tipo === 'matriz'` → mesmo padrão de `Tabs` por
  competência do card 360, mas cada aba renderiza
  `<DistribuicaoNivelTabela distribuicao={resultado.competencias[abaCompetencia].distribuicao} />`
  diretamente (sem `DistribuicaoPorTipoRelacionamento` — não há
  `porTipoRelacionamento` aqui, já é `liberado === true` para a pergunta
  inteira).

Ambos os cards usam `Paper variant="outlined" className="flex flex-col gap-3 p-3"`
(mesmo padrão visual de `GrupoParesSubordinadoCard`/`GrupoClimaCard`).

### 7. Página `frontend/src/pages/AnaliseResultadosPerguntaPage/`

Três arquivos, mesmo padrão de pasta das 4 páginas existentes:

**`formatadores.ts`** — duplicar `hojeYMD`/`inicioAnoCorrenteYMD` tal qual
existem em `AnaliseAvaliacoesPage/formatadores.ts` (convenção já
estabelecida: cada página do módulo tem sua própria cópia, não importa de
outra pasta de página — ver `AnaliseVisaoGeralPage/formatadores.ts` e
`AnaliseNuvemPalavrasPage/formatadores.ts`, ambos também duplicados).

**`agrupamento.ts`** — diferente de `AnaliseAvaliacoesPage/agrupamento.ts`
(que agrupa 3 listas aninhadas de um objeto), aqui os dois arrays do payload
(`avaliacao360`/`climaGeral`) já são **planos**, cada item carregando
`cicloId`/`nomeCiclo` — o agrupamento por ciclo é mais simples:

```ts
import type { ResultadoPergunta360, ResultadoPerguntaClima, ResultadosPerguntaAnalise } from '../../types/analise'

export interface GrupoCicloResultados {
  cicloId: string
  nomeCiclo: string
  avaliacao360: ResultadoPergunta360[]
  climaGeral: ResultadoPerguntaClima[]
}

/**
 * Só agrupa visualmente — não reordena. `avaliacao360`/`climaGeral` já
 * chegam do backend ordenados por nomeCiclo e depois pergunta.ordem; a ordem
 * de inserção no Map (primeiro ciclo encontrado = primeira chave) preserva
 * essa ordenação.
 */
export function agruparPorCiclo(dados: ResultadosPerguntaAnalise): GrupoCicloResultados[] {
  const mapa = new Map<string, GrupoCicloResultados>()

  function garantir(cicloId: string, nomeCiclo: string): GrupoCicloResultados {
    let grupo = mapa.get(cicloId)
    if (!grupo) {
      grupo = { cicloId, nomeCiclo, avaliacao360: [], climaGeral: [] }
      mapa.set(cicloId, grupo)
    }
    return grupo
  }

  for (const item of dados.avaliacao360) garantir(item.cicloId, item.nomeCiclo).avaliacao360.push(item)
  for (const item of dados.climaGeral) garantir(item.cicloId, item.nomeCiclo).climaGeral.push(item)

  return Array.from(mapa.values())
}
```

**`AnaliseResultadosPerguntaPage.tsx`** — esqueleto idêntico ao de
`AnaliseAvaliacoesPage.tsx` (copiar a estrutura de state/handlers
`de`/`ate`/`cicloId`/`executarBusca`/`handleSubmit`/`handleCicloChange`/
`handleLimparFiltro`/`resultadoVersao`, adaptando só o tipo de dado e a
função de busca):

```tsx
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Paper, Skeleton, TextField, Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useSearchParams } from 'react-router-dom'
import { ResultadoPergunta360Card } from '../../components/analise/ResultadoPergunta360Card/ResultadoPergunta360Card'
import { ResultadoPerguntaClimaCard } from '../../components/analise/ResultadoPerguntaClimaCard/ResultadoPerguntaClimaCard'
import { SeletorCiclo } from '../../components/analise/SeletorCiclo/SeletorCiclo'
import { ApiError } from '../../lib/apiClient'
import { buscarResultadosPerguntaAnalise } from '../../services/analiseService'
import type { ResultadosPerguntaAnalise } from '../../types/analise'
import { agruparPorCiclo } from './agrupamento'
import { hojeYMD, inicioAnoCorrenteYMD } from './formatadores'

export function AnaliseResultadosPerguntaPage() {
  // state/handlers idênticos a AnaliseAvaliacoesPage, trocando
  // AvaliacoesAnalise -> ResultadosPerguntaAnalise e
  // buscarAvaliacoesAnalise -> buscarResultadosPerguntaAnalise.
  // Mensagem de erro genérica: 'Não foi possível carregar os resultados.'
  // (mesmo padrão de mensagem específica por tela das 4 existentes).

  const gruposPorCiclo = useMemo(() => (dados ? agruparPorCiclo(dados) : []), [dados])
  const vazio = !!dados && dados.avaliacao360.length === 0 && dados.climaGeral.length === 0

  return (
    <div className="flex flex-col gap-4">
      <Typography variant="h5" component="h1">Resultados por Pergunta</Typography>

      <Paper component="form" onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3 p-4">
        {/* TextField De / Até / SeletorCiclo / Aplicar filtro / Limpar filtro — idêntico a AnaliseAvaliacoesPage */}
      </Paper>

      {carregando && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="rounded" height={120} />)}
        </div>
      )}

      {!carregando && erro && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <Typography role="alert" color="error">{erro}</Typography>
          <Button variant="contained" color="primary" onClick={() => executarBusca()}>Tentar novamente</Button>
        </div>
      )}

      {!carregando && !erro && vazio && (
        <Alert severity="info">
          Nenhuma pergunta likert, matriz ou caixa de seleção com respostas encontrada para o período/filtro selecionado.
        </Alert>
      )}

      {!carregando && !erro && dados && !vazio && (
        <div className="flex flex-col gap-3">
          {gruposPorCiclo.map((grupo) => (
            <Accordion key={`${resultadoVersao}-${grupo.cicloId}`} defaultExpanded={Boolean(cicloId)}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                  {grupo.nomeCiclo}
                </Typography>
              </AccordionSummary>
              <AccordionDetails className="flex flex-col gap-6">
                {grupo.avaliacao360.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <Typography variant="subtitle2">Avaliação 360</Typography>
                    <Box sx={{ maxHeight: 600, overflowY: 'auto' }} className="flex flex-col gap-3">
                      {grupo.avaliacao360.map((r) => (
                        <ResultadoPergunta360Card key={r.perguntaId} resultado={r} />
                      ))}
                    </Box>
                  </div>
                )}
                {grupo.climaGeral.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <Typography variant="subtitle2">Clima e Satisfação</Typography>
                    <Box sx={{ maxHeight: 600, overflowY: 'auto' }} className="flex flex-col gap-3">
                      {grupo.climaGeral.map((r) => (
                        <ResultadoPerguntaClimaCard key={r.perguntaId} resultado={r} />
                      ))}
                    </Box>
                  </div>
                )}
              </AccordionDetails>
            </Accordion>
          ))}
        </div>
      )}
    </div>
  )
}
```

Tratamento de erro `ApiError`/`CICLO_NAO_ENCONTRADO`: mesmo `if
(err instanceof ApiError && err.codigo === 'CICLO_NAO_ENCONTRADO')` de
`AnaliseAvaliacoesPage`, mensagem "O ciclo filtrado não foi encontrado.
Remova o filtro de ciclo e tente novamente."

Papéis com acesso: `admin`, `gestor_rh` — idêntico às outras 4 telas do
módulo (`RotaProtegida papeis={['admin', 'gestor_rh']}` em `App.tsx`, não há
diferença de conteúdo por papel dentro dos dois — ambos veem o mesmo payload,
já que `garantirPapel` no backend não distingue os dois papéis para este
endpoint).

### 8. Rota — `frontend/src/App.tsx`

Import (junto aos outros 4, linha ~20):
```ts
import { AnaliseResultadosPerguntaPage } from './pages/AnaliseResultadosPerguntaPage/AnaliseResultadosPerguntaPage'
```

Rota (junto às outras 4 `/analise/*`, dentro do mesmo bloco
`RotaProtegida papeis={['admin', 'gestor_rh']}` → `PainelAdminLayout`):
```tsx
<Route path="/analise/resultados-pergunta" element={<AnaliseResultadosPerguntaPage />} />
```

### 9. Menu — `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`

Ícone escolhido: `TableChartOutlinedIcon` (`@mui/icons-material/TableChartOutlined`)
— coerente com o conteúdo da tela (tabelas de contagem), distinto dos ícones
já usados no submenu (`BarChartIcon`, `LeaderboardIcon`).

Import (junto aos outros ícones de `Análises`, linha ~31-34):
```ts
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined'
```

Entrada no submenu `quantitativa` (`GRUPOS`, como 3ª opção, depois de
"Ranking"):
```tsx
{
  key: 'quantitativa',
  label: 'Quantitativa',
  opcoes: [
    { label: 'Visão Geral', to: '/analise/visao-geral', icon: <BarChartIcon fontSize="small" /> },
    { label: 'Ranking', to: '/analise/ranking', icon: <LeaderboardIcon fontSize="small" /> },
    { label: 'Resultados por Pergunta', to: '/analise/resultados-pergunta', icon: <TableChartOutlinedIcon fontSize="small" /> },
  ],
},
```

---

## Plano — Frontend

### 1. frontend-developer — CONCLUÍDO

Implementado exatamente conforme o plano. Resumo:

- Tipos novos ao final de `frontend/src/types/analise.ts`
  (`ContagemNivel`, `ContagemOpcao`, `TipoRelacionamentoTodos`,
  `TipoPerguntaEstruturada`, `DistribuicaoTipoRelacionamento`,
  `DistribuicaoOpcaoTipoRelacionamento`, `CompetenciaDistribuicao`,
  `ResultadoPergunta360*`/`ResultadoPergunta360`,
  `ResultadoPerguntaClima*`/`ResultadoPerguntaClima`,
  `ResultadosPerguntaAnalise`) — sem nenhum campo de contagem de
  respondentes/membros.
- `buscarResultadosPerguntaAnalise` + `BuscarResultadosPerguntaAnaliseParams`
  adicionados ao final de `frontend/src/services/analiseService.ts`.
- Novo `frontend/src/components/analise/rotulosTipoPergunta.ts`.
- Novos componentes "burros" `DistribuicaoNivelTabela` e
  `DistribuicaoOpcaoTabela` em `frontend/src/components/analise/` — sem
  `.sort()`, sem filtro de `contagem: 0`, renderizam a ordem recebida.
- Novo `DistribuicaoPorTipoRelacionamento` (union discriminada por
  `variante`), checando `item.liberado` antes de ler `item.distribuicao` em
  ambos os ramos, usando `RankingDadosInsuficientesTag` quando bloqueado.
- Novos `ResultadoPergunta360Card` e `ResultadoPerguntaClimaCard` —
  `Tabs` por competência só para `tipo === 'matriz'`, sem reordenar
  `competencias`/`porTipoRelacionamento`; card de clima nunca importa
  `DistribuicaoPorTipoRelacionamento`/`rotuloTipoRelacionamento`.
- Nova pasta `frontend/src/pages/AnaliseResultadosPerguntaPage/`
  (`formatadores.ts`, `agrupamento.ts`, `AnaliseResultadosPerguntaPage.tsx`)
  replicando o esqueleto de `AnaliseAvaliacoesPage` (período + `SeletorCiclo`,
  `Skeleton`, `Alert` de vazio/erro, tratamento de `CICLO_NAO_ENCONTRADO`,
  `Accordion` por ciclo com `overflow-y: auto`/`maxHeight: 600` por bloco).
- Rota `/analise/resultados-pergunta` registrada em `frontend/src/App.tsx`
  dentro do bloco `RotaProtegida papeis={['admin', 'gestor_rh']}` existente.
- Entrada de menu "Resultados por Pergunta" (`TableChartOutlinedIcon`)
  adicionada como 3ª opção do submenu `quantitativa` em
  `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`.
- `npm run build` (`tsc -b && vite build`) limpo, sem erros de tipo.
  `npm run lint`: nenhum problema novo além de uma instância adicional do
  padrão pré-existente `react-hooks/set-state-in-effect` no `useEffect` de
  busca inicial — o mesmo padrão já existe identicamente nas outras 4
  páginas do módulo Análise, replicado aqui por instrução explícita do
  plano ("esqueleto idêntico").
- Nenhum arquivo `.css` novo, nenhum `style={{}}` inline grande.

Antes de codar: reler o "LEMBRETE DA REGRA MAIS SENSÍVEL" no topo deste
documento.

1. Adicionar os tipos novos ao final de `frontend/src/types/analise.ts`
   (seção "Decisões de modelagem", passo 1) — conferir que
   `TipoRelacionamentoIdentificado`/`TipoRelacionamentoAnonimizado` já
   existentes no arquivo cobrem os 5 valores usados por
   `TipoRelacionamentoTodos` antes de declarar qualquer literal novo.
2. Adicionar `buscarResultadosPerguntaAnalise` + `BuscarResultadosPerguntaAnaliseParams`
   ao final de `frontend/src/services/analiseService.ts` (passo 2), incluindo
   `ResultadosPerguntaAnalise` no import de tipos do topo do arquivo.
3. Criar `frontend/src/components/analise/rotulosTipoPergunta.ts` (passo 3).
4. Criar `frontend/src/components/analise/DistribuicaoNivelTabela/DistribuicaoNivelTabela.tsx`
   e `frontend/src/components/analise/DistribuicaoOpcaoTabela/DistribuicaoOpcaoTabela.tsx`
   (passo 4) — componentes "burros", sem estado, sem `.sort()`.
5. Criar `frontend/src/components/analise/DistribuicaoPorTipoRelacionamento/DistribuicaoPorTipoRelacionamento.tsx`
   (passo 5) — checar `item.liberado` antes de ler `item.distribuicao` em
   ambos os ramos (`variante === 'nivel'` / `'opcao'`).
6. Criar `frontend/src/components/analise/ResultadoPergunta360Card/ResultadoPergunta360Card.tsx`
   e `frontend/src/components/analise/ResultadoPerguntaClimaCard/ResultadoPerguntaClimaCard.tsx`
   (passo 6) — `Tabs` por competência só para `tipo === 'matriz'`, nunca
   reordenar `competencias`/`porTipoRelacionamento` recebidos.
7. Criar a pasta `frontend/src/pages/AnaliseResultadosPerguntaPage/` com
   `formatadores.ts`, `agrupamento.ts` e `AnaliseResultadosPerguntaPage.tsx`
   (passo 7) — reutilizar literalmente a estrutura de state/handlers de
   `AnaliseAvaliacoesPage.tsx` (período controlado + querystring de
   `cicloId`, `Skeleton` de carregamento, tratamento de `ApiError`/
   `CICLO_NAO_ENCONTRADO`, `Alert` de vazio/erro, `Accordion` por ciclo com
   `key` baseada em `resultadoVersao`).
8. Registrar a rota em `frontend/src/App.tsx` (passo 8) — import + `<Route>`
   dentro do bloco protegido existente, junto às outras 4 rotas `/analise/*`.
9. Registrar a entrada de menu em
   `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx` (passo 9) —
   import do ícone + nova opção no submenu `quantitativa`.
10. Rodar `npm run lint` e `npm run build` (`tsc -b && vite build`) em
    `frontend/` — nenhum erro novo de tipo (em especial, checar que o
    discriminated union de `DistribuicaoPorTipoRelacionamentoProps` narrowa
    sem exigir `as`, e que os `tipo` literais de `ResultadoPergunta360`/
    `ResultadoPerguntaClima` narrowam corretamente nos dois cards).
11. Nenhum arquivo `.css` novo, nenhum `style={{}}` inline grande — só
    Tailwind (layout/espaçamento) + MUI (`sx`, componentes).

### 2. frontend-codereviewer

Checklist específico desta tela (além do checklist padrão do módulo):

1. **Nenhum número de respondentes inventado/calculado no frontend** — grep
   em todos os arquivos novos por `totalRespondentes`/`minimoNecessario`/
   qualquer soma manual de `contagem` para exibir como "quantas pessoas
   responderam". Nenhuma interface nova em `types/analise.ts` para esta tela
   pode ter esses campos (diferente de `GrupoParesSubordinado`/
   `GrupoClimaGeral`, que os têm de propósito — não copiar esse padrão aqui).
2. **`distribuicao`/`competencias` só renderizados quando `liberado === true`**
   — conferir `DistribuicaoPorTipoRelacionamento`,
   `ResultadoPergunta360Card` e `ResultadoPerguntaClimaCard`: todo acesso a
   `item.distribuicao`/`resultado.distribuicao`/`resultado.competencias`
   deve estar atrás de uma checagem de `liberado` (seja `item.liberado ?
   <Tabela .../> : <RankingDadosInsuficientesTag />`, seja
   `resultado.liberado && ...`). Nenhum `distribuicao ?? []` usado como
   substituto dessa checagem.
3. **Zero-fill do backend respeitado sem reordenação client-side** — grep por
   `.sort(` em `DistribuicaoNivelTabela`, `DistribuicaoOpcaoTabela`,
   `DistribuicaoPorTipoRelacionamento`, `ResultadoPergunta360Card`,
   `ResultadoPerguntaClimaCard`, `agrupamento.ts` — qualquer ocorrência é
   achado crítico (a única ordenação aceitável já vem pronta da API). Também
   conferir que nenhum componente filtra itens com `contagem: 0` (isso
   quebraria o zero-fill visual).
4. **`RankingDadosInsuficientesTag` sem props numéricas** — confirmar que
   nenhum uso do componente nesta feature tenta passar
   `totalRespondentes`/`minimoNecessario` (o componente nem aceita props,
   mas confirmar que ninguém o substituiu por `EstadoAguardandoMinimo` por
   engano em algum dos dois cards).
5. **`porTipoRelacionamento` só para avaliação 360** — confirmar que
   `ResultadoPerguntaClimaCard` nunca importa/renderiza
   `DistribuicaoPorTipoRelacionamento` nem `rotuloTipoRelacionamento` (clima
   não tem tipo de relacionamento, é `liberado`/`motivo` no nível da
   pergunta).
6. **Matriz — competência não agregada** — confirmar visualmente (ou por
   leitura do JSX) que `resultado.competencias[abaCompetencia]` é a única
   fonte de dado exibida na aba ativa, nunca uma soma/combinação de mais de
   uma competência.
7. **Estilo**: sem arquivos `.css` novos, sem `style={{}}` inline grande;
   conflitos MUI×Tailwind resolvidos via `sx`/`theme` (checar principalmente
   os dois cards e as duas tabelas, que são os componentes com mais
   customização visual desta feature).
8. **Papéis**: rota registrada só dentro do bloco `RotaProtegida
   papeis={['admin', 'gestor_rh']}` em `App.tsx` — mesmo grupo das outras 4
   telas de Análise, sem exceção para `colaborador`.
9. **Nomenclatura**: `buscarResultadosPerguntaAnalise` (não
   `buscarResultadosPergunta`) em `analiseService.ts`, consistente com as
   outras 4 funções do arquivo.

## Revisão

Revisão de todos os arquivos criados/alterados pela etapa 1, contra o
checklist específico da task (acima) e o checklist padrão do
`frontend-codereviewer`. Arquivos lidos por completo:
`frontend/src/types/analise.ts` (bloco novo), `frontend/src/services/analiseService.ts`
(função nova), `frontend/src/components/analise/rotulosTipoPergunta.ts`,
`DistribuicaoNivelTabela/DistribuicaoNivelTabela.tsx`,
`DistribuicaoOpcaoTabela/DistribuicaoOpcaoTabela.tsx`,
`DistribuicaoPorTipoRelacionamento/DistribuicaoPorTipoRelacionamento.tsx`,
`ResultadoPergunta360Card/ResultadoPergunta360Card.tsx`,
`ResultadoPerguntaClimaCard/ResultadoPerguntaClimaCard.tsx`,
`RankingDadosInsuficientesTag/RankingDadosInsuficientesTag.tsx` (reaproveitado,
conferido sem props), `frontend/src/pages/AnaliseResultadosPerguntaPage/`
(`AnaliseResultadosPerguntaPage.tsx`, `agrupamento.ts`, `formatadores.ts`),
`frontend/src/App.tsx` (import + rota), `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`
(import de ícone + entrada de menu).

### Crítico

Nenhum achado crítico.

### Deveria corrigir

Nenhum achado.

### Sugestão

Nenhuma sugestão relevante — implementação segue o plano linha a linha, sem
desvio identificado.

### Detalhamento por item do checklist específico

1. **Nenhum número de respondentes inventado/calculado no frontend** — OK.
   Grep por `totalRespondentes`/`minimoNecessario` em todos os arquivos novos
   desta feature não retornou nenhuma ocorrência (as únicas ocorrências no
   diretório `components/analise/` são em `EstadoAguardandoMinimo`,
   `GrupoClimaCard`, `GrupoParesSubordinadoCard` e no comentário de
   `RankingDadosInsuficientesTag` explicando por que ele não é usado aqui —
   todos pré-existentes da feature "Avaliações", não tocados por esta etapa).
   Nenhuma interface nova em `types/analise.ts` (bloco "Resultados por
   Pergunta") tem campo numérico de contagem de respondentes/membros.
2. **`distribuicao`/`competencias` só renderizados quando `liberado === true`**
   — OK. `DistribuicaoPorTipoRelacionamento` checa `item.liberado ? <Tabela
   .../> : <RankingDadosInsuficientesTag />` nos dois ramos (`variante`
   `'nivel'`/`'opcao'`) antes de qualquer leitura de `item.distribuicao`.
   `ResultadoPerguntaClimaCard` usa `resultado.liberado && tipo === '...'`
   como guarda em todos os três ramos (`likert`/`caixa_selecao`/`matriz`),
   incluindo o acesso a `resultado.competencias`. Os únicos usos de
   `distribuicao ?? []` aparecem sempre dentro do ramo já guardado por
   `liberado` (nunca como substituto da checagem) — código morto inofensivo,
   não uma violação da regra.
3. **Zero-fill do backend respeitado sem reordenação client-side** — OK. Grep
   por `.sort(` nos 5 componentes + `agrupamento.ts` só retorna a menção em
   comentário de `DistribuicaoNivelTabela.tsx` ("nunca `.sort()` aqui"),
   nenhuma chamada real. Nenhum componente filtra itens com `contagem: 0`
   (ambas as tabelas de distribuição mapeiam o array recebido diretamente,
   sem `.filter()`).
4. **`RankingDadosInsuficientesTag` sem props numéricas** — OK. Todos os 3
   usos na feature (`DistribuicaoPorTipoRelacionamento` ×2,
   `ResultadoPerguntaClimaCard` ×1) chamam o componente sem nenhuma prop.
   Nenhum uso de `EstadoAguardandoMinimo` em nenhum arquivo novo.
5. **`porTipoRelacionamento` só para avaliação 360** — OK.
   `ResultadoPerguntaClimaCard.tsx` importa só `DistribuicaoNivelTabela`,
   `DistribuicaoOpcaoTabela`, `RankingDadosInsuficientesTag` e
   `rotuloTipoPergunta` — nunca `DistribuicaoPorTipoRelacionamento` nem
   `rotuloTipoRelacionamento`.
6. **Matriz — competência não agregada** — OK. Em ambos os cards, a única
   fonte de dado exibida na aba ativa é `resultado.competencias[abaCompetencia]`
   (360) / `resultado.competencias?.[abaCompetencia]` (clima) — nenhuma
   soma/combinação entre competências, `useState(0)` isolado por instância de
   card.
7. **Estilo** — OK. Nenhum arquivo `.css` novo (`Glob **/*.css` vazio nos
   diretórios tocados), nenhum `style={{}}` inline nos arquivos novos (grep
   vazio). Uso de `sx` para propriedades que colidiriam com utilitário
   Tailwind (`overflowWrap`/`wordBreak`, `alignSelf`, `maxHeight`/`overflowY`)
   e classes Tailwind só para layout/espaçamento (`flex`, `gap`, `p-3`) — sem
   sobreposição MUI×Tailwind na mesma propriedade.
8. **Papéis** — OK. Rota `/analise/resultados-pergunta` registrada dentro do
   mesmo bloco `<Route element={<RotaProtegida papeis={['admin',
   'gestor_rh']} />}><Route element={<PainelAdminLayout />}>` das outras 4
   rotas `/analise/*` em `App.tsx` — nenhum bloco novo, nenhuma exceção para
   `colaborador`.
9. **Nomenclatura** — OK. `buscarResultadosPerguntaAnalise` +
   `BuscarResultadosPerguntaAnaliseParams`, mesmo padrão de sufixo `Analise`
   das outras 4 funções de `analiseService.ts`.

### Observações adicionais (checklist padrão do módulo)

- Tipos em `types/analise.ts` são tradução literal do contrato do backend
  (mesmos nomes de campo), com o bloco de comentário no mesmo estilo dos
  blocos anteriores — nenhum campo renomeado/inventado.
- `formatadores.ts` da nova página é idêntico (byte a byte) ao de
  `AnaliseAvaliacoesPage/formatadores.ts` — segue a convenção já registrada
  de duplicar em vez de importar entre pastas de página.
- `agrupamento.ts` não reordena (só agrupa por chave de inserção,
  preservando a ordem já entregue pelo backend), conforme comentário no
  próprio arquivo.
- Página segue o esqueleto de `AnaliseAvaliacoesPage` (state/handlers,
  `Skeleton`, tratamento de erro/`CICLO_NAO_ENCONTRADO`, `Accordion` por
  ciclo com `key` baseada em `resultadoVersao`, `Box` com
  `maxHeight: 600`/`overflowY: 'auto'` por bloco de cards) — consistente com
  as 4 telas já existentes do módulo.
- Não foi possível re-executar `npm run lint`/`npm run build` a partir desta
  ferramenta de revisão (acesso restrito a Read/Grep/Glob/Edit); a
  verificação foi feita por leitura estática dos arquivos e não encontrou
  nenhum erro óbvio de tipo (discriminated unions narrowam sem `as` nos dois
  cards e em `DistribuicaoPorTipoRelacionamento`, pelo que foi possível
  inspecionar visualmente).

**Conclusão**: nenhum achado crítico. A etapa pode prosseguir para
`test-engineer`.
