# Task: Módulo Análise — tela "Visão Geral" — Frontend

Demanda 100% frontend (`frontend/`, equivalente a `apps/web` na nomenclatura dos
agentes/skills — usar sempre os caminhos reais `frontend/**` neste plano). Não
toca `backend/`. Base obrigatória, lida por completo antes deste plano:
`.claude/tasks/analise-visao-geral/spec.md` e
`.claude/tasks/analise-visao-geral/task-backend.md`. O contrato de
`GET /api/analise/visao-geral` está FECHADO na seção 1.2 de `task-backend.md`
— este plano só o consome, não o reabre.

Nada deste módulo existe hoje no frontend — nem página, nem service, nem tipo,
nem componente (confirmado por `Glob`: nenhum arquivo sob
`frontend/src/**/analise*`/`Analise*`).

## Estado atual verificado (antes do plano)

- `frontend/src/services/ciclosService.ts`: padrão de funções soltas
  chamando `apiFetch<T>` (não uma classe/objeto agrupador) — `analiseService.ts`
  segue o mesmo estilo.
- `frontend/src/types/ciclo.ts`: interfaces simples, datas como string
  `'YYYY-MM-DD'` — `types/analise.ts` segue o mesmo estilo, espelhando os
  nomes de campo do contrato ao pé da letra (sem tradução).
- `frontend/src/lib/apiClient.ts` (`apiFetch`): injeta `Authorization`
  automaticamente quando há sessão Supabase ativa (comportamento default,
  sem passar `semAutenticacao`) — correto aqui, pois `/api/analise/visao-geral`
  é uma rota protegida comum (`autenticar` + `admin`/`gestor_rh`), não pública.
- `frontend/src/App.tsx`: hoje um único grupo protegido,
  `<Route element={<RotaProtegida papeis={['admin','gestor_rh']}/>}><Route
  element={<PainelAdminLayout/>}>...</Route></Route>`, envolvendo
  `/colaboradores`, `/equipes`, `/pesquisas*`, `/ciclos*`. A rota nova entra
  dentro desse mesmo grupo, sem novo `RotaProtegida`.
- `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`: grupo
  `analises` já existe (`tipo: 'submenus'`), com dois submenus
  (`quantitativa`/`qualitativa`), cada um hoje só com
  `opcoes: [{ label: 'Em breve', disabled: true }]`. Tipo `SubmenuOpcao`
  (linha ~41) não tem campo de rota. `grupoAtivo(pathname)` (linha ~89) só
  cobre grupos `tipo === 'links'` — grupos `tipo === 'submenus'` nunca
  auto-expandem pela rota atual.
- `frontend/src/pages/CiclosListPage/CiclosListPage.tsx`: `CardActions`
  (linhas ~277–311) tem sempre o botão "Ver detalhes", seguido de um bloco
  condicional `ciclo.status === 'rascunho'` com "Ativar ciclo"/"Excluir". O
  botão novo "Visão Geral" fica **fora** desse condicional, ao lado de "Ver
  detalhes", visível para qualquer `status`.
- `frontend/src/components/pesquisas/TipoPesquisaChip/TipoPesquisaChip.tsx`:
  já define os rótulos em português canônicos dos dois tipos de pesquisa —
  `avaliacao_360` → `"Avaliação 360"`, `clima_geral` → `"Clima e
  Satisfação"`. A tela nova reaproveita literalmente esses dois textos (não
  inventa "Clima organizacional" nem nenhuma outra variação) para os
  cabeçalhos da seção "Distribuição por tipo de pesquisa", garantindo
  consistência com o resto do produto.
- `frontend/src/styles/theme.ts`: paleta "Coastal Citrus" já global via
  `ThemeProvider` (`main.tsx`) — `shape.borderRadius: 18`, botões em pílula,
  `MuiChip` com variantes por cor. Nenhum tema novo é necessário; a tela usa
  `Card`/`CardContent`/`Typography`/`TextField`/`Button`/`Chip`/`Alert`/
  `Skeleton` do MUI + Tailwind só para grid/espaçamento.
- Nenhum componente "stat tile"/KPI card reutilizável existe hoje
  (confirmado por `Glob` em `frontend/src/components/**`) — precisa ser
  criado.
- Nota de risco já documentada em `.claude/tasks/coleta-respostas-publica/task-frontend.md`
  (passo 1, resumo da implementação): a prop `fontWeight` direto em
  `Typography` do MUI já causou erro de tipagem numa task anterior — usar
  sempre `sx={{ fontWeight: ... }}` em vez de `fontWeight={...}` como prop
  solta.
- `frontend/src/services/ciclosService.ts` (`buscarCiclo`): já existe e é
  usado por `CicloDetalhePage` para admin/gestor_rh — dado puramente
  administrativo (`nome`, `status`, datas etc.), sem nenhuma informação de
  identidade de avaliador/avaliado. Pode ser reaproveitado aqui só para
  exibir o **nome** do ciclo filtrado via deep link (UX), sem violar nenhuma
  regra de anonimização.

## Contrato de API a consumir (fechado por `task-backend.md`, seção 1.2 — não reabrir)

`GET /api/analise/visao-geral` — atrás de `autenticar`, papéis
`admin`/`gestor_rh` (mesmo grupo de `RotaProtegida` já usado no resto do
painel).

Query: `de` (string `YYYY-MM-DD`, obrigatório), `ate` (idem, obrigatório),
`cicloId` (uuid, opcional).

Resposta 200 (`VisaoGeralAnalise`, ver shape completo na task do usuário /
`task-backend.md` 1.2) — todos os campos são **contagens e médias
agregadas**: nenhum campo identifica avaliador, avaliado ou tipo de
relacionamento (`pares`/`subordinado`/etc. nunca aparecem no payload). Não há
diferença nenhuma de conteúdo entre `admin` e `gestor_rh` — os dois papéis
recebem exatamente o mesmo payload para os mesmos parâmetros; a única
distinção de papel nesta feature é o guard binário "está no grupo
`admin`/`gestor_rh`" vs. "não está" (colaborador nunca alcança esta tela,
barrado pelo mesmo `RotaProtegida` já em uso).

Erros: `422 CAMPO_INVALIDO` (`de`/`ate` ausentes/malformados, `cicloId`
malformado), `422 PERIODO_INVALIDO` (`ate < de`), `404
CICLO_NAO_ENCONTRADO` (`cicloId` não existe), `403 PAPEL_NAO_AUTORIZADO`
(defensivo — não deveria ser alcançável na prática, já barrado por
`RotaProtegida`, mas tratado como erro genérico caso ocorra).

`tempoMedioResposta.*.horas` vem em HORAS cruas — formatação de
unidade (horas vs dias) é responsabilidade desta tela (ver 1.4).

## Decisões (com justificativa)

1. **Sem regra de negócio sensível no frontend.** A tela só formata/exibe os
   números já prontos da API. Nenhum cálculo de agregação, percentual ou
   média é refeito no cliente — `taxaRespostaMedia` e `tempoMedioResposta`
   são usados tal como vêm. Nenhuma tentativa de combinar
   `distribuicaoPorTipo`/`tempoMedioResposta` com qualquer outro dado para
   inferir algo sobre um avaliador/avaliado específico (não há, aliás,
   nenhum campo no payload que permitiria isso).
2. **Filtro de período sem sincronizar com a URL** (diferente do `cicloId`,
   que precisa vir da URL para o deep link funcionar). `de`/`ate` vivem só
   em `useState` local, pré-preenchidos no mount com uma sugestão de UX
   (início do ano corrente até hoje) — nunca dependem de um default do
   backend (que não existe, `de`/`ate` são obrigatórios). Escopo mínimo:
   nada no pedido exige que o período seja compartilhável por link.
3. **Busca disparada por botão explícito ("Aplicar filtro"), não a cada
   keystroke.** Diferente da busca client-side de `CiclosListPage`
   (filtragem em memória sobre uma lista já carregada), aqui cada mudança de
   filtro é uma chamada de rede nova — disparar a cada tecla digitada num
   campo de data seria ineficiente e, pior, geraria round-trips com datas
   incompletas/inválidas no meio da digitação. Envio também ocorre ao
   pressionar Enter em qualquer um dos dois campos (`<form onSubmit>`).
4. **Validação client-side de `ate < de` como gate de UX, nunca
   autoritativa** (mesmo princípio já usado em `cpf.ts`/`ResponderPesquisaPage`):
   o botão "Aplicar filtro" fica desabilitado e um `FormHelperText`/`Alert`
   inline explica o problema quando `ate < de`, mas a chamada real ainda
   trata `422 PERIODO_INVALIDO` vindo do backend como um erro normal
   (defensivo, para o caso — hoje inatingível pela UI, mas não assumido como
   impossível — de os dois campos ficarem num estado inconsistente).
5. **Deep link (`?cicloId=`) lido uma única vez no mount via
   `useSearchParams()`, não reescrito continuamente na URL a cada nova busca.**
   Ao entrar pela URL com `?cicloId=<id>`, o filtro é aplicado à primeira
   busca automaticamente; o usuário pode limpá-lo (chip com botão "Remover
   filtro de ciclo", que tira `cicloId` do estado e da URL via
   `setSearchParams({}, { replace: true })` e dispara uma nova busca sem
   ele) — mas trocar `de`/`ate` e clicar "Aplicar filtro" novamente
   **mantém** o `cicloId` já aplicado (filtros combináveis, não mutuamente
   exclusivos), até que o usuário o remova explicitamente.
6. **Nome do ciclo filtrado é buscado via `ciclosService.buscarCiclo(cicloId)`
   à parte da chamada principal**, só para exibir um chip amigável
   ("Filtrado por ciclo: <nome>" em vez de expor o uuid cru). Chamada
   independente e não-bloqueante: se falhar (ex.: ciclo removido depois de o
   link ter sido salvo/compartilhado), a tela não quebra — cai para exibir
   o uuid cru no chip, e a chamada principal (`buscarVisaoGeralAnalise`)
   segue seu próprio fluxo de erro/sucesso normalmente (ela já trata
   `404 CICLO_NAO_ENCONTRADO` por conta própria).
7. **Componente `MetricaCard` genérico**, com `titulo`, `valor` (string já
   formatada), `descricao?` (string curta abaixo do valor principal) e
   `detalhes?: { rotulo: string; valor: string }[]` (lista secundária de
   pares rótulo/valor, renderizada como linhas compactas abaixo de uma
   divisória). Composição das 4 métricas em 5 instâncias desse componente
   (ver 1.5) — nenhuma delas embute lógica de cálculo, todas recebem valores
   já formatados pela página.
8. **Formatação de `tempoMedioResposta` decidida no frontend** (função local
   `formatarHoras`, ver 1.4): `< 24h` exibe em horas (`"30,1 h"`), `>= 24h`
   exibe em dias (`horas / 24`, `"1,5 d"`) — 1 casa decimal, separador
   decimal `,` (`Intl.NumberFormat('pt-BR')`). `0` (sem amostras) exibe
   `"—"` em vez de `"0,0 h"`, para não sugerir uma média real sobre zero
   amostras.
9. **`SubmenuOpcao` ganha um campo opcional `to?: string`** (aditivo, não
   quebra o submenu "Qualitativa", que continua com `{ label: 'Em breve',
   disabled: true }` sem `to`). Quando `to` está presente, a opção vira um
   link real (`MuiMenuItem` com `component={NavLink}`); quando ausente,
   continua o comportamento atual (`disabled` estático).
10. **`grupoAtivo(pathname)` estendido para também cobrir grupos
    `tipo === 'submenus'`**, verificando `opcoes[].to` além de
    `items[].to` dos grupos `tipo === 'links'`. Justificativa: sem essa
    extensão, navegar para `/analise/visao-geral` (via menu ou via deep
    link do card de ciclo) deixaria o grupo "Análises" fechado no drawer,
    uma regressão de UX perceptível logo na primeira tela deste grupo a
    ganhar uma rota real. Baixo custo (uma condicional a mais na mesma
    função), decidido em vez de documentado como limitação.
11. **Botão "Avaliações" citado no brief NÃO é implementado nesta task** —
    é outra tela do módulo Análise, ainda não planejada/especificada.
    Nenhum placeholder, nenhum botão desabilitado, nenhum comentário morto
    é adicionado ao `CardActions` de `CiclosListPage` para ele; quando essa
    tela futura for planejada, seu próprio `task-frontend.md` decide onde e
    como adicionar esse botão.
12. **Estado "vazio" (`totalCiclos === 0` na resposta 200) é distinto de
    erro.** O backend retorna 200 com todas as métricas zeradas quando
    nenhum ciclo cai no corte de período (comportamento documentado, não uma
    falha) — a tela reconhece esse caso e substitui a grade de
    `MetricaCard`s por um `Alert severity="info"` ("Nenhum ciclo encontrado
    no período selecionado.") em vez de renderizar 5 cards zerados, que
    seriam ruído visual sem informação útil.

## Guard rails obrigatórios (frontend-developer e revisor)

- **Nenhum cálculo de agregação/anonimização no frontend** — todo número
  exibido vem literalmente de campos do payload de
  `GET /api/analise/visao-geral`, sem soma/média/porcentagem recalculada no
  cliente (a única "matemática" client-side permitida é `horas / 24` para
  trocar a unidade de exibição, decisão 8 — não é uma agregação de dados
  sensíveis, é só conversão de unidade sobre um número já agregado pelo
  backend).
- **Nenhum campo de identidade em nenhum lugar desta tela** — o payload do
  contrato já não contém `avaliadorId`/`avaliadoId`/`tipoRelacionamento` em
  nenhum nível; a tela não tenta obter esses dados de nenhuma outra chamada
  (ex.: não chama `listarRelacionamentos` de `ciclosService.ts`, que é
  IDENTIFICADO e pertence só a `CicloDetalhePage`) nem cruza o resultado
  desta tela com qualquer outro endpoint para tentar deduzir quem respondeu
  o quê.
- **Papéis**: `admin` e `gestor_rh` veem exatamente a mesma tela, mesmos
  dados, sem nenhuma renderização condicional por papel dentro da página —
  a única checagem de papel é a já existente em `RotaProtegida`. `colaborador`
  nunca alcança `/analise/visao-geral` nem o item de menu correspondente
  (barrado pelo mesmo guard do resto do `PainelAdminLayout`).
- **Estilo**: Tailwind só para layout/grid/espaçamento; MUI para os
  controles (`Card`, `TextField type="date"`, `Button`, `Alert`, `Chip`,
  `Skeleton`). Nenhum `.css` novo, nenhum `style={{}}` extenso. `theme.ts`
  reaproveitado como está — nenhuma paleta/tema novo é necessário para esta
  tela.
- **Sem nova dependência** — em particular, sem `@mui/x-date-pickers`/`dayjs`
  (decisão já fechada, `TextField type="date"` nativo).

## Plano — Frontend

### 1. frontend-developer

**Status: concluído.**

Resumo da implementação (subitens 1.1–1.8 aplicados literalmente conforme o
plano; 1.9 é escopo explicitamente não implementado, confirmado como tal):

- Contrato de `GET /api/analise/visao-geral` conferido linha a linha contra
  `task-backend.md` (seção 1.2, `VisaoGeralAnalise`) — bateu exatamente:
  mesmos nomes de campo (`periodo`, `cicloId`, `totalCiclos`,
  `totalRespostas`, `distribuicaoPorTipo.{avaliacao_360,clima_geral}`,
  `taxaRespostaMedia`, `tempoMedioResposta.{geral,avaliacao_360,clima_geral}`
  com `{ horas, amostras }` inclusive em `geral`), mesma query string
  (`de`/`ate` obrigatórios, `cicloId` opcional) e os mesmos 4 códigos de erro
  (`422 CAMPO_INVALIDO`, `422 PERIODO_INVALIDO`, `404
  CICLO_NAO_ENCONTRADO`, `403 PAPEL_NAO_AUTORIZADO`). Nenhum ajuste de nome
  foi necessário. O módulo `backend/src/modules/analise/` ainda não existe
  em disco no momento desta implementação (só o plano em
  `task-backend.md`) — o frontend consome o contrato tal como fechado no
  documento, sem poder validar contra um servidor real rodando; nenhuma
  suposição foi feita além do que está escrito nas duas tasks.
- `types/analise.ts`, `services/analiseService.ts`,
  `components/analise/MetricaCard/MetricaCard.tsx` e
  `pages/AnaliseVisaoGeralPage/formatadores.ts` implementados exatamente
  como especificado em 1.1–1.4 (mesmos nomes de função/campo, mesmo
  comentário de guard rail no topo de `types/analise.ts`).
- `pages/AnaliseVisaoGeralPage/AnaliseVisaoGeralPage.tsx` (1.5) segue o
  fluxo descrito, com um pequeno ajuste de implementação (não estrutural):
  `executarBusca` aceita um parâmetro opcional `overrides?: { cicloId?:
  string | null }` em vez de depender só do state fechado por closure — o
  fluxo "Remover filtro de ciclo" (`setCicloId(null)` seguido de disparar a
  busca "com `cicloId: undefined`", como o plano descreve em 1.5) precisa do
  valor novo imediatamente, e o state do React não está garantidamente
  atualizado no mesmo tick em que a função é chamada logo em seguida. Todos
  os outros pontos do fluxo (validação `ate < de` como gate de UX,
  mapeamento de `CICLO_NAO_ENCONTRADO`, busca best-effort de `nomeCiclo` via
  `buscarCiclo`, estados carregando/vazio/erro/sucesso) seguem o plano à
  risca.
- `App.tsx` (1.6): rota `/analise/visao-geral` adicionada dentro do grupo
  protegido já existente, mesmo nível de `/ciclos/:id`.
- `PainelAdminLayout.tsx` (1.7): `SubmenuOpcao` ganhou `to?: string`;
  submenu "Quantitativa" passou a ter a opção real "Visão Geral" (link,
  `component={NavLink}`); submenu "Qualitativa" inalterado
  (`disabled: true`, sem `to`); `grupoAtivo` estendido para reconhecer
  `opcoes[].to` de grupos `tipo === 'submenus'`, sem alterar o
  comportamento para nenhum grupo `tipo === 'links'` existente.
- `CiclosListPage.tsx` (1.8): botão "Visão Geral" adicionado ao
  `CardActions`, ao lado de "Ver detalhes", **fora** do bloco condicional
  `status === 'rascunho'` — visível para qualquer status, navegando para
  `/analise/visao-geral?cicloId=<id>`. Nenhum botão "Avaliações" adicionado
  (1.9, fora de escopo, confirmado não implementado).
- Guard rails de anonimização conferidos: nenhum campo de identidade
  (`avaliadorId`/`avaliadoId`/`tipoRelacionamento`) em
  `types/analise.ts`/`analiseService.ts`/`AnaliseVisaoGeralPage.tsx`;
  nenhuma chamada a `ciclosService.listarRelacionamentos`; nenhum cálculo de
  agregação client-side além da conversão de unidade `horas / 24` em
  `formatarHoras`; nenhuma renderização condicional por papel dentro da
  página.
- `npm run build` (`tsc -b && vite build`) e `npm run lint` (`eslint .`)
  rodados dentro de `frontend/` ao final — ambos passaram sem erros/avisos
  novos.

#### 1.1 `frontend/src/types/analise.ts` (novo)

Espelha o payload do endpoint literalmente, mesmos nomes de campo do
contrato (sem tradução):

```ts
export interface DistribuicaoTipoMetrica {
  totalCiclos: number
  totalRespostas: number
}

export interface TempoMedioComponente {
  horas: number
  amostras: number
}

export interface VisaoGeralAnalise {
  periodo: { de: string; ate: string } // 'YYYY-MM-DD'
  cicloId: string | null
  totalCiclos: number
  totalRespostas: number
  distribuicaoPorTipo: {
    avaliacao_360: DistribuicaoTipoMetrica
    clima_geral: DistribuicaoTipoMetrica
  }
  taxaRespostaMedia: number // percentual, já ponderado, 1 casa decimal
  tempoMedioResposta: {
    geral: TempoMedioComponente
    avaliacao_360: TempoMedioComponente
    clima_geral: TempoMedioComponente
  }
}
```

Comentário no topo do arquivo: "Payload 100% agregado — nenhum campo
identifica avaliador/avaliado/tipo de relacionamento. Nunca combinar com
`types/ciclo.ts` (`Relacionamento`) ou qualquer dado identificado."

#### 1.2 `frontend/src/services/analiseService.ts` (novo)

Padrão de função solta sobre `apiFetch<T>`, mesmo estilo de
`ciclosService.ts` — sem lógica de negócio:

```ts
import { apiFetch } from '../lib/apiClient'
import type { VisaoGeralAnalise } from '../types/analise'

export interface BuscarVisaoGeralAnaliseParams {
  de: string // 'YYYY-MM-DD'
  ate: string // 'YYYY-MM-DD'
  cicloId?: string
}

/**
 * `GET /api/analise/visao-geral` — dado 100% agregado (contagens/médias),
 * nunca identificado. `de`/`ate` são sempre obrigatórios (sem default no
 * backend); quem decide a sugestão inicial de período é a página.
 */
export function buscarVisaoGeralAnalise(params: BuscarVisaoGeralAnaliseParams): Promise<VisaoGeralAnalise> {
  const query = new URLSearchParams({ de: params.de, ate: params.ate })
  if (params.cicloId) query.set('cicloId', params.cicloId)
  return apiFetch<VisaoGeralAnalise>(`/api/analise/visao-geral?${query.toString()}`)
}
```

#### 1.3 `frontend/src/components/analise/MetricaCard/MetricaCard.tsx` (novo)

Componente genérico de "stat tile", paralelo a `components/ciclos/`:

```tsx
import { Card, CardContent, Divider, Typography } from '@mui/material'

interface MetricaCardDetalhe {
  rotulo: string
  valor: string
}

interface MetricaCardProps {
  titulo: string
  valor: string
  descricao?: string
  detalhes?: MetricaCardDetalhe[]
}

/**
 * "Stat tile" genérico reutilizável por qualquer tela futura do módulo
 * Análise (Ranking, Performance, etc.) — não acoplado a nenhum shape
 * específico de `VisaoGeralAnalise`. Recebe só strings já formatadas pelo
 * chamador; nenhuma lógica de cálculo/formatação vive aqui.
 */
export function MetricaCard({ titulo, valor, descricao, detalhes }: MetricaCardProps) {
  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-1">
        <Typography variant="subtitle2" color="text.secondary">
          {titulo}
        </Typography>
        <Typography variant="h4" component="p" sx={{ fontWeight: 600 }}>
          {valor}
        </Typography>
        {descricao && (
          <Typography variant="body2" color="text.secondary">
            {descricao}
          </Typography>
        )}
        {detalhes && detalhes.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <div className="flex flex-col gap-1">
              {detalhes.map((detalhe) => (
                <div key={detalhe.rotulo} className="flex items-center justify-between gap-2">
                  <Typography variant="caption" color="text.secondary">
                    {detalhe.rotulo}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {detalhe.valor}
                  </Typography>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
```

Nota: usar `sx={{ fontWeight: 600 }}`, nunca a prop solta `fontWeight` em
`Typography` (ver "Estado atual verificado" — erro de tipagem já visto numa
task anterior).

#### 1.4 `frontend/src/pages/AnaliseVisaoGeralPage/formatadores.ts` (novo, local à página)

Helpers puros de formatação, sem chamada de rede/estado — arquivo local à
página (mesmo padrão de `ResponderPesquisaPage/mensagensErroPublico.ts`
sendo local à sua página, em vez de um util genérico prematuro):

```ts
const FORMATADOR_NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const FORMATADOR_INTEIRO = new Intl.NumberFormat('pt-BR')

export function formatarInteiro(valor: number): string {
  return FORMATADOR_INTEIRO.format(valor)
}

export function formatarPercentual(valor: number): string {
  return `${FORMATADOR_NUMERO.format(valor)}%`
}

/**
 * `horas` vem cru do backend (ver contrato). Decisão de exibição: < 24h em
 * horas, >= 24h em dias (1 casa decimal). `0` (sem amostras) vira "—" — não
 * sugere uma média real sobre zero amostras.
 */
export function formatarHoras(horas: number): string {
  if (horas <= 0) return '—'
  if (horas < 24) return `${FORMATADOR_NUMERO.format(horas)} h`
  return `${FORMATADOR_NUMERO.format(horas / 24)} d`
}

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

#### 1.5 `frontend/src/pages/AnaliseVisaoGeralPage/AnaliseVisaoGeralPage.tsx` (novo)

Rota `/analise/visao-geral`, dentro do grupo protegido existente
(`admin`/`gestor_rh`, `PainelAdminLayout`).

**Estado local**:
- `de: string`, `ate: string` — inputs controlados, inicializados com
  `inicioAnoCorrenteYMD()`/`hojeYMD()` no `useState` inicial (não em
  `useEffect`, para não gerar um piscar de campo vazio antes da primeira
  busca).
- `cicloId: string | null` — lido de `useSearchParams()` no mount
  (`searchParams.get('cicloId')`); `null` se ausente.
- `nomeCiclo: string | null` — resultado best-effort de
  `buscarCiclo(cicloId)` (decisão 6); `null` enquanto não resolvido ou se a
  chamada falhar (cai para exibir o uuid cru no chip).
- `dados: VisaoGeralAnalise | null`, `carregando: boolean`,
  `erro: string | null` — mesmo trio já usado em `CiclosListPage`.

**Fluxo**:
- `useEffect` no mount dispara a primeira busca com os valores iniciais de
  `de`/`ate`/`cicloId` (união discriminada não é necessária aqui — o
  fluxo é mais simples que `ResponderPesquisaPage`, um único
  carregando/erro/sucesso sem fases intermediárias).
- Função `executarBusca()` (chamada pelo `useEffect` inicial, pelo submit
  do formulário de filtro e pelo botão "Tentar novamente"):
  1. Se `ate < de` (comparação de string, seguro para `YYYY-MM-DD` de
     tamanho fixo, mesmo padrão do backend): não chama a API, mantém um
     erro de validação inline dedicado (ver "Filtro" abaixo) — não é um
     `ApiError`.
  2. `setCarregando(true); setErro(null)`.
  3. `buscarVisaoGeralAnalise({ de, ate, cicloId: cicloId ?? undefined })`.
  4. Sucesso → `setDados(resultado)`.
  5. Erro → `err instanceof ApiError ? err.message : 'Não foi possível
     carregar a visão geral.'`, mapeado com uma mensagem específica quando
     `err.codigo === 'CICLO_NAO_ENCONTRADO'` ("O ciclo filtrado não foi
     encontrado. Remova o filtro de ciclo e tente novamente.") — os demais
     códigos (`CAMPO_INVALIDO`, `PERIODO_INVALIDO`, `PAPEL_NAO_AUTORIZADO`)
     usam a mensagem genérica de `err.message` (o backend já devolve texto
     legível).
  6. `finally → setCarregando(false)`.
- `useEffect` separado, só quando `cicloId` muda e não é `null`: chama
  `buscarCiclo(cicloId)` (de `ciclosService.ts`) e popula `nomeCiclo`;
  `try/catch` silencioso (decisão 6) — nunca seta `erro` nem bloqueia a
  busca principal.
- Botão/chip "Remover filtro de ciclo" (só renderizado quando
  `cicloId !== null`): `setCicloId(null); setNomeCiclo(null);
  setSearchParams({}, { replace: true })`, então dispara `executarBusca()`
  de novo com `cicloId: undefined`.

**Layout**:
1. Cabeçalho: `Typography variant="h5"` "Visão Geral" + (se `cicloId`)
   `Chip` "Filtrado por ciclo: {nomeCiclo ?? cicloId}" com `onDelete` para
   o fluxo de remoção acima.
2. `Paper`/`form` de filtro: dois `TextField type="date"` (`de`/`ate`,
   `label="De"`/`label="Até"`, `slotProps={{ inputLabel: { shrink: true } }}`),
   erro inline (`helperText`/`error` no campo `ate`) quando
   `ate < de`, botão `Button type="submit" variant="contained"` "Aplicar
   filtro" desabilitado enquanto `ate < de` ou enquanto `carregando`.
3. Estados de conteúdo (mutuamente exclusivos, mesmo padrão de
   `CiclosListPage`):
   - `carregando`: grid de 5 `Skeleton variant="rounded" height={160}`.
   - `!carregando && erro`: `Typography role="alert" color="error"` + botão
     "Tentar novamente" (chama `executarBusca()`).
   - `!carregando && !erro && dados && dados.totalCiclos === 0`:
     `Alert severity="info"` "Nenhum ciclo encontrado no período
     selecionado." (decisão 12) — nenhum `MetricaCard` renderizado.
   - `!carregando && !erro && dados && dados.totalCiclos > 0`: grade de
     `MetricaCard`s (ver composição abaixo).
4. Composição das 4 métricas (decisão 7), duas seções:

   **Seção "Visão geral do período"** (`grid gap-4 sm:grid-cols-2 xl:grid-cols-3`):
   - `MetricaCard titulo="Ciclos e respostas" valor={formatarInteiro(dados.totalCiclos)}
     descricao={\`\${dados.totalCiclos === 1 ? 'ciclo' : 'ciclos'} no período\`}
     detalhes={[{ rotulo: 'Total de respostas', valor: formatarInteiro(dados.totalRespostas) }]}`
   - `MetricaCard titulo="Taxa de resposta média" valor={formatarPercentual(dados.taxaRespostaMedia)}
     descricao="Ponderada por volume de participantes"`
   - `MetricaCard titulo="Tempo médio de resposta" valor={formatarHoras(dados.tempoMedioResposta.geral.horas)}
     descricao={\`\${formatarInteiro(dados.tempoMedioResposta.geral.amostras)} respostas com tempo registrado\`}
     detalhes={[
       { rotulo: 'Avaliação 360', valor: formatarHoras(dados.tempoMedioResposta.avaliacao_360.horas) },
       { rotulo: 'Clima e Satisfação', valor: formatarHoras(dados.tempoMedioResposta.clima_geral.horas) },
     ]}`

   **Seção "Distribuição por tipo de pesquisa"** (`grid gap-4 sm:grid-cols-2`):
   - `MetricaCard titulo="Avaliação 360" valor={formatarInteiro(dados.distribuicaoPorTipo.avaliacao_360.totalCiclos)}
     descricao="ciclos no período"
     detalhes={[{ rotulo: 'Respostas', valor: formatarInteiro(dados.distribuicaoPorTipo.avaliacao_360.totalRespostas) }]}`
   - `MetricaCard titulo="Clima e Satisfação" valor={formatarInteiro(dados.distribuicaoPorTipo.clima_geral.totalCiclos)}
     descricao="ciclos no período"
     detalhes={[{ rotulo: 'Respostas', valor: formatarInteiro(dados.distribuicaoPorTipo.clima_geral.totalRespostas) }]}`

   Títulos "Avaliação 360"/"Clima e Satisfação" reaproveitados literalmente
   de `TipoPesquisaChip` (ver "Estado atual verificado").

**Papéis com acesso**: `admin`, `gestor_rh` — idênticos, sem nenhuma
renderização condicional por papel dentro da página (ver "Guard rails").
`colaborador` nunca alcança esta rota (barrado por `RotaProtegida`).

**Fonte dos dados (identificado vs. agregado)**: 100% agregado. Nenhuma
chamada desta página lê `itens_resposta`/relacionamentos identificados;
`buscarCiclo(cicloId)` (decisão 6) só lê metadados administrativos do
ciclo (nome/status/datas), nunca quem avaliou quem.

**Estados tratados**: carregando (skeleton), vazio
(`totalCiclos === 0` → `Alert` informativo, distinto de erro), erro
(`ApiError`/mensagem genérica + "Tentar novamente"), sucesso com dado
(grade de `MetricaCard`).

#### 1.6 `frontend/src/App.tsx` (editado)

Import de `AnaliseVisaoGeralPage` +
`<Route path="/analise/visao-geral" element={<AnaliseVisaoGeralPage />} />`
dentro do `<Route element={<PainelAdminLayout />}>` já existente (mesmo
nível de `/ciclos`). Nenhuma outra linha de `App.tsx` muda.

#### 1.7 `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx` (editado)

- `SubmenuOpcao` ganha `to?: string` (decisão 9):
  ```ts
  type SubmenuOpcao = {
    label: string
    disabled?: boolean
    to?: string
  }
  ```
- Entrada `quantitativa` em `GRUPOS` passa a ter a opção real:
  ```ts
  { key: 'quantitativa', label: 'Quantitativa', opcoes: [{ label: 'Visão Geral', to: '/analise/visao-geral' }] },
  ```
  (`qualitativa` inalterado, continua `{ label: 'Em breve', disabled: true }`.)
- Renderização das opções do submenu (dentro do `MenuList`/`Popper`):
  ```tsx
  {submenu.opcoes.map((opcao) =>
    opcao.to ? (
      <MuiMenuItem key={opcao.label} component={NavLink} to={opcao.to} onClick={() => setSubmenuAberto(null)}>
        {opcao.label}
      </MuiMenuItem>
    ) : (
      <MuiMenuItem key={opcao.label} disabled={opcao.disabled}>
        {opcao.label}
      </MuiMenuItem>
    ),
  )}
  ```
- `grupoAtivo(pathname)` estendido (decisão 10) para cobrir também grupos
  `tipo === 'submenus'`:
  ```ts
  function grupoAtivo(pathname: string): string | null {
    const grupo = GRUPOS.find((g) => {
      if (g.tipo === 'links') return g.items.some((item) => pathname.startsWith(item.to))
      return g.submenus.some((submenu) => submenu.opcoes.some((opcao) => opcao.to && pathname.startsWith(opcao.to)))
    })
    return grupo?.key ?? null
  }
  ```
  Nenhuma outra linha do componente muda (o `useState(() => grupoAtivo(...))`
  que já chama essa função continua igual, só passa a também reconhecer
  `/analise/visao-geral`).

#### 1.8 `frontend/src/pages/CiclosListPage/CiclosListPage.tsx` (editado)

Dentro de `CardActions` (linhas ~277–311), botão novo logo após "Ver
detalhes", **fora** do bloco condicional `ciclo.status === 'rascunho'`
(visível em qualquer status):

```tsx
<Button size="small" onClick={() => navigate(`/ciclos/${ciclo.id}`)}>
  Ver detalhes
</Button>
<Button size="small" onClick={() => navigate(`/analise/visao-geral?cicloId=${ciclo.id}`)}>
  Visão Geral
</Button>
{ciclo.status === 'rascunho' && (
  ...
)}
```

Nenhuma outra linha de `CiclosListPage.tsx` muda. Botão "Avaliações" citado
no brief **não é adicionado** aqui (decisão 11) — nem como placeholder.

#### 1.9 Fora de escopo explícito (não implementar nesta task)

- Seletor manual de ciclo na própria tela (só via `?cicloId=` na URL, mesmo
  critério já fechado na spec/`task-backend.md`).
- Filtro por tipo de pesquisa (decisão já fechada — os dois tipos sempre
  combinados/lado a lado).
- Qualquer quebra por avaliador/avaliado/competência (reservado para
  Ranking/Performance, telas futuras não especificadas).
- Botão "Avaliações" no card de ciclo (decisão 11).
- Submenu "Qualitativa" (permanece `disabled`/"Em breve").
- Qualquer novo tipo de pergunta, qualquer atalho de criação
  automática/IA/template de pesquisa (não relevante a esta tela, mas
  reafirmado por princípio do projeto).

**Componentes novos/reaproveitados**: `MetricaCard` (novo,
`components/analise/`); `TipoPesquisaChip`'s rótulos reaproveitados (só os
textos, não o componente em si, já que aqui não há um `Chip` de tipo
isolado); `ciclosService.buscarCiclo` (reaproveitado).

**Página(s)/rota(s)**: `frontend/src/pages/AnaliseVisaoGeralPage/AnaliseVisaoGeralPage.tsx`
→ `/analise/visao-geral`, dentro do grupo protegido existente.

**Papéis com acesso**: `admin`, `gestor_rh` — idênticos (ver "Guard rails").
`colaborador` sem acesso.

**Endpoints da API consumidos**: `GET /api/analise/visao-geral`
(`de`/`ate`/`cicloId?`); `GET /api/ciclos/:id` (via `buscarCiclo`, só para o
nome do ciclo filtrado, best-effort).

**Estados a tratar**: carregando (skeleton) / vazio (`totalCiclos === 0`,
`Alert` informativo, distinto de erro) / erro (`ApiError` + "Tentar
novamente", incluindo mapeamento específico para `CICLO_NAO_ENCONTRADO`) /
sucesso com dado.

Ao terminar: rodar `npm run build` (`tsc -b && vite build`) e `npm run lint`
(`eslint .`) dentro de `frontend/`, confirmar que ambos passam sem
erros/avisos novos. Registrar no resumo da etapa se o contrato consumido
bateu literalmente contra o `task-backend.md` real (nomes de campo, códigos
de erro) ou se algum ajuste foi necessário.

### 2. frontend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Nenhum campo de identidade em nenhum lugar da feature** — grep em
   `AnaliseVisaoGeralPage.tsx`/`analiseService.ts`/`types/analise.ts` por
   `avaliadorId`/`avaliadoId`/`tipoRelacionamento` não deveria retornar
   nada; confirmar que a página nunca chama
   `ciclosService.listarRelacionamentos` (dado identificado, exclusivo de
   `CicloDetalhePage`).
2. **Nenhum cálculo de agregação client-side** além da conversão de unidade
   `horas / 24` em `formatarHoras` (decisão 8) — todo `totalCiclos`,
   `totalRespostas`, `taxaRespostaMedia` etc. exibido vem literalmente do
   payload, sem soma/média recalculada.
3. **`admin`/`gestor_rh` sem nenhuma renderização condicional por papel**
   dentro de `AnaliseVisaoGeralPage.tsx` — grep por `colaborador?.papel`
   dentro do arquivo não deveria retornar nada (a única checagem de papel é
   `RotaProtegida`, já no nível de rota).
4. **Validação `ate < de` client-side é só UX** — confirmar que o botão
   "Aplicar filtro" desabilita nesse caso, mas que `executarBusca`/o
   tratamento de erro ainda sabe lidar com `422 PERIODO_INVALIDO` vindo do
   backend sem quebrar a tela (defensivo).
5. **`cicloId` combinável com `de`/`ate`, não mutuamente exclusivo**:
   trocar o período mantém o filtro de ciclo já aplicado; só o botão/chip
   "Remover filtro de ciclo" o limpa (e limpa também da URL via
   `setSearchParams`).
6. **`buscarCiclo(cicloId)` (decisão 6) é best-effort e não-bloqueante** —
   sua falha nunca aparece como o `erro` principal da página nem impede a
   busca de `buscarVisaoGeralAnalise`; confirmar `try/catch` isolado.
7. **Estado "vazio" (`totalCiclos === 0`) nunca renderiza a grade de
   `MetricaCard`** — só o `Alert severity="info"`, distinto visualmente e
   semanticamente do estado de erro.
8. **`SubmenuOpcao`/`grupoAtivo` — mudança aditiva, sem regressão**: o
   submenu "Qualitativa" continua idêntico (`disabled: true`, sem `to`);
   `grupoAtivo` estendido não deveria alterar o comportamento para nenhuma
   rota já existente sob grupos `tipo === 'links'` (`/colaboradores`,
   `/equipes`, `/pesquisas*`, `/ciclos*`) — só adiciona reconhecimento de
   `/analise/visao-geral` dentro do grupo `analises`.
9. **Botão "Visão Geral" em `CiclosListPage` aparece para QUALQUER status**
   de ciclo (fora do bloco `status === 'rascunho'`), navegando para
   `/analise/visao-geral?cicloId=<id>` — confirmar que não ficou preso
   dentro do bloco condicional por engano (o mesmo erro seria fácil de
   cometer copiando o botão "Ativar ciclo" por perto).
10. **Nenhum botão "Avaliações" foi adicionado** a `CiclosListPage` (decisão
    11) — fora de escopo desta task, não deveria aparecer nem como
    placeholder/comentário morto.
11. **Sem nova dependência de date-picker** (`@mui/x-date-pickers`/`dayjs`)
    — conferir `package.json` sem diffs nessas libs; os dois campos de
    período são `TextField type="date"` nativos.
12. **`sx={{ fontWeight: ... }}` em vez de `fontWeight={...}` como prop
    solta** em todo `Typography` novo desta feature (`MetricaCard`
    incluso) — erro de tipagem já visto numa task anterior.
13. **Exatamente os textos "Avaliação 360"/"Clima e Satisfação"** nos
    títulos da seção de distribuição por tipo — reaproveitados de
    `TipoPesquisaChip`, sem uma terceira variação de rótulo inventada
    (ex.: "Clima organizacional").
14. Confirmar `npm run build`/`npm run lint` sem novas falhas antes de
    aprovar.

## Revisão

Revisor: `frontend-codereviewer`. Arquivos conferidos: `types/analise.ts`,
`services/analiseService.ts`, `components/analise/MetricaCard/MetricaCard.tsx`,
`pages/AnaliseVisaoGeralPage/formatadores.ts`,
`pages/AnaliseVisaoGeralPage/AnaliseVisaoGeralPage.tsx`, `App.tsx`,
`layouts/PainelAdminLayout/PainelAdminLayout.tsx`,
`pages/CiclosListPage/CiclosListPage.tsx`.

**Nenhum achado crítico.** Os pontos 1–3 (os mais sensíveis) foram conferidos
e estão corretos:

- Grep por `avaliadorId`/`avaliadoId`/`tipoRelacionamento` em
  `types/analise.ts`, `analiseService.ts` e `AnaliseVisaoGeralPage.tsx` não
  retorna nada. `ciclosService.listarRelacionamentos` (dado identificado) não
  é chamado em nenhum lugar da feature — só `buscarCiclo(cicloId)`, cujo
  tipo `Ciclo` (`types/ciclo.ts`) não carrega nenhum campo de
  avaliador/avaliado (só metadados administrativos: nome, status, datas,
  configuração de anonimização, progresso agregado).
- Nenhum cálculo de agregação client-side além de `horas / 24` em
  `formatarHoras` (`formatadores.ts`) — todo `totalCiclos`, `totalRespostas`,
  `taxaRespostaMedia`, `distribuicaoPorTipo.*` exibido vem literalmente do
  payload de `buscarVisaoGeralAnalise`.
- Nenhuma renderização condicional por papel dentro de
  `AnaliseVisaoGeralPage.tsx` — grep por `colaborador?.papel`/`colaborador.papel`
  não retorna nada; a única checagem de papel continua em `RotaProtegida`
  (`App.tsx`).

Demais pontos do checklist (4–14) também conferem: validação `ate < de` é só
gate de UX (botão desabilitado + `helperText`), mas `executarBusca` trata
`CICLO_NAO_ENCONTRADO` e qualquer outro `ApiError` (incluindo um eventual
`422 PERIODO_INVALIDO`) sem quebrar a tela; `cicloId` é combinável com
`de`/`ate` e só é limpo pelo chip "Remover filtro de ciclo"; `buscarCiclo` é
best-effort com `try/catch` isolado (nunca vira o `erro` principal); estado
vazio (`totalCiclos === 0`) renderiza só o `Alert` informativo, nunca a
grade de `MetricaCard`; `SubmenuOpcao`/`grupoAtivo` são extensões aditivas
sem alterar o branch `tipo === 'links'` existente; o botão "Visão Geral" em
`CiclosListPage` está fora do bloco `status === 'rascunho'`, visível para
qualquer status; nenhum botão "Avaliações" foi adicionado; `package.json` sem
diff em `dayjs`/`@mui/x-date-pickers`; todo `Typography` novo usa
`sx={{ fontWeight: ... }}`; os textos "Avaliação 360"/"Clima e Satisfação"
são reaproveitados literalmente de `TipoPesquisaChip`.

**Sobre o desvio registrado (`executarBusca(overrides?)`):** razoável e sem
problema. É a solução padrão em React para o caso em que uma ação precisa
disparar um efeito colateral com um valor que ainda não foi confirmado pelo
`setState` (a closure de `handleRemoverFiltroCiclo`, chamada no mesmo tick de
`setCicloId(null)`, ainda veria o `cicloId` antigo se dependesse só do
state). O parâmetro é opcional, aditivo, não muda a assinatura pública nem o
comportamento dos outros chamadores (`useEffect` inicial, submit do form,
"Tentar novamente" seguem passando sem argumento e usando o `cicloId` do
state normalmente). Conferido que `cicloIdAtual ?? undefined` reduz
corretamente `overrides.cicloId === null` para "sem filtro" na chamada a
`buscarVisaoGeralAnalise`, e que não há corrida com o `useEffect` que observa
`cicloId` para buscar `nomeCiclo` (esse efeito só dispara para `cicloId`
truthy; `handleRemoverFiltroCiclo` já zera `nomeCiclo` explicitamente antes
de disparar a nova busca).

### Crítico

Nenhum.

### Deveria corrigir

Nenhum.

### Sugestão

1. **`React.FormEvent` sem import explícito de `FormEvent`**
   (`AnaliseVisaoGeralPage.tsx`, `handleSubmit`). Compila (o pacote de tipos
   do React expõe `React` como namespace global ambiente, e o próprio
   `PainelAdminLayout.tsx` já usa `React.ReactNode` do mesmo jeito), mas
   diverge do padrão predominante já estabelecido em cinco outras páginas com
   formulário (`ColaboradorFormPage`, `CicloFormPage`, `LoginPage`,
   `DefinirSenhaPage`, `EsqueciSenhaModal`), todas com
   `import { type FormEvent } from 'react'` e
   `FormEvent<HTMLFormElement>` (tipado ao elemento). Não bloqueia; considerar
   alinhar na próxima alteração deste arquivo por consistência de
   nomenclatura/import.

**Conclusão**: sem achados críticos nem "deveria corrigir" — a task pode
seguir para a etapa de `test-engineer`.

## Testes

`test-engineer`. Confirmado por `Glob`/leitura de `package.json` que o
projeto não tem, hoje, nenhuma suíte de testes de componente/página no
frontend: nenhum arquivo `*.test.tsx`/`*.test.ts`/`*.spec.tsx` sob
`frontend/src/**` (fora de `node_modules`), nenhum `vitest`/`jest`/
`@testing-library/*`/`jsdom` em `dependencies`/`devDependencies`, e nenhum
script `test` em `frontend/package.json` (só `dev`/`build`/`lint`/`preview`).
Nenhuma tela existente do projeto — nem `CiclosListPage`, nem
`PesquisasListPage`, nem nenhuma outra — tem precedente de teste automatizado
de componente.

Seguindo a instrução explícita da task de `test-engineer` para este caso
("se não houver testes de frontend estabelecidos no projeto... você pode se
concentrar só no backend e reportar essa constatação, em vez de introduzir
um framework de teste novo sem precedente"), nenhum framework de teste foi
adicionado e nenhum teste de frontend foi escrito para
`AnaliseVisaoGeralPage`/`MetricaCard`/`analiseService`. A cobertura desta
feature ficou inteiramente no backend (`GET /api/analise/visao-geral`) — ver
`task-backend.md`, seção "## Testes", para a suíte completa
(`backend/src/modules/analise/analise.service.spec.ts`, 24 testes,
priorizando anonimização e controle de acesso por papel).

Isso deixa `AnaliseVisaoGeralPage.tsx` (fluxo de filtro/estados de
carregamento-erro-vazio-sucesso), `MetricaCard.tsx` e `formatadores.ts`
(`formatarHoras`/`formatarPercentual`/`formatarInteiro`) sem cobertura
automatizada — risco aceito nesta rodada, registrado aqui para quem
priorizar introduzir Vitest + Testing Library no frontend no futuro (não é
uma decisão desta task, é uma lacuna pré-existente do projeto como um todo).
