# Task: Correção — link único de campanha para pesquisas de clima_geral — Frontend

Demanda de frontend (`frontend/`, equivalente ao `apps/web` citado nos
agentes/skills — usar sempre os caminhos reais `frontend/**` neste plano).
Correção de um fluxo já implementado: `clima_geral` deixa de gerar 1 envio
por participante e passa a ter **1 link único por campanha/ciclo**, com a
lista de participantes mostrando só se cada um já respondeu. **Avaliação 360
não muda em nada** — toda a UI de `avaliacao_360` (seções "Relacionamentos
gerados" e "Envios") é preservada exatamente como está hoje. O formulário
público de resposta (`/responder`, tela de CPF) continua fora de escopo —
não é tocado por este plano.

Este plano não toca `backend/`. O `task-backend.md` desta mesma pasta pode
estar sendo escrito em paralelo — na hora em que rodei este planejamento,
`.claude/tasks/envios-clima-link-unico/` ainda não continha nenhum arquivo
(confirmado via `Glob`). Por isso o contrato abaixo é montado a partir da
descrição literal do pedido, não de um `task-backend.md` já lido.

## ATENÇÃO OBRIGATÓRIA PARA O `frontend-developer`

**Antes de escrever qualquer código**, releia
`.claude/tasks/envios-clima-link-unico/task-backend.md`. Se ele já existir,
confira o shape literal de `GET /api/ciclos/:cicloId/envios` para o braço
`clima_geral` (nomes de campo exatos, incluindo o do identificador do envio
de campanha, o formato de `respondeuEm`/`participanteId` etc.) e ajuste
`frontend/src/types/envio.ts` para bater exatamente com ele — os nomes de
campo usados nas seções 1.1/1.2 abaixo são a melhor suposição a partir do
pedido do usuário, não uma garantia. Se `task-backend.md` ainda não existir
quando a implementação começar, implemente contra o shape descrito abaixo e
deixe registrado no resumo da etapa que isso foi feito sem o contrato de
backend confirmado por escrito.

## Estado atual verificado (antes do plano)

- `frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx` (lido por
  completo, 973 linhas): tem as seções "Dados do ciclo", "Participantes"
  (adicionar/remover participantes, só em rascunho — **não relacionada a
  envios, não tocada por este plano**), "Pesquisa vinculada", "Relacionamentos
  gerados" (só `avaliacao_360`), "Envios" (só `avaliacao_360`) e
  "Participantes e envios" (só `clima_geral`, linhas 808–897 — **esta é a
  seção que este plano substitui por completo**). `tipoPesquisaCiclo`
  (`pesquisaVinculada?.tipo ?? tipoPesquisaEnvios`) já decide qual bloco
  renderizar — reaproveitado tal qual, nenhuma mudança nessa fonte de
  verdade.
- Hoje, para `clima_geral`, `envios` (state único, união
  `EnvioAvaliacao360Resposta | EnvioClimaGeralResposta`) é filtrado por
  `ehEnvioClimaGeral` e renderizado como **uma linha por participante**, cada
  linha com seu próprio link (`envio.link`) e as 4 ações (Copiar link, Marcar
  como enviado, Registrar lembrete, Expirar) — exatamente o comportamento que
  o usuário pediu para corrigir.
- `frontend/src/types/envio.ts` (lido por completo): `EnvioClimaGeralResposta`
  (`origem: 'colaborador'`, `destinatario: { id, nomeCompleto }`) é o tipo
  que modela "1 envio por participante" — **removido** por este plano, junto
  com `ehEnvioClimaGeral`. `EnvioAvaliacao360Resposta`/`ehEnvioAvaliacao360`
  **não mudam**. `ListarEnviosCicloResposta` (envelope
  `{ tipoPesquisa, envios }`) muda de shape para o braço `clima_geral` (ver
  "Contrato de API" abaixo).
- `frontend/src/services/enviosPesquisaService.ts` (lido por completo): as 4
  funções (`listarEnvios`, `marcarComoEnviado`, `registrarLembrete`,
  `expirarEnvio`) continuam existindo com a mesma assinatura de parâmetros
  (`cicloId`, `envioId`) — só o tipo de retorno muda para refletir a união
  atualizada. Nenhuma rota nova, nenhuma rota removida (confirmado contra o
  pedido: as mesmas 4 rotas `GET .../envios` +
  3× `PATCH .../envios/:id/{marcar-enviado,registrar-lembrete,expirar}`
  continuam existindo, agora operando sobre o envio único da campanha em vez
  de um envio por participante, quando `tipoPesquisa === 'clima_geral'`).
- `frontend/src/components/ciclos/StatusEnvioChip/StatusEnvioChip.tsx` (lido
  por completo): mapa `CONFIG: Record<StatusEnvio, {label, color}>` — **não
  muda**, reaproveitado tal qual tanto para o chip de status do envio de
  campanha quanto (sem mudança) para a tabela de `avaliacao_360`.
- `frontend/src/types/ciclo.ts` (lido por completo): `Participante`
  (`id`, `colaboradorId`, `nomeCompleto`, `email`, `cargo`, `equipe`) é o tipo
  já usado pela seção "Participantes" (topo da página, gestão de quem está no
  ciclo) — **não tem `respondeuEm`** e vem de `listarParticipantes`, endpoint
  diferente de `listarEnvios`. A nova lista de participantes desta task (com
  `respondeuEm`) é um tipo novo e distinto, porque vem de um endpoint
  diferente (`GET .../envios`) com um propósito diferente (status de resposta
  da campanha, não gestão de quem está no ciclo) — não reaproveitar/estender
  `Participante` para isso, para não confundir os dois dados.
- `frontend/src/components/TabelaEstado/TabelaEstado.tsx` e
  `frontend/src/components/ConfirmDialog/ConfirmDialog.tsx` (lidos por
  completo) — reaproveitados tal qual, mesma assinatura de props já usada
  hoje na página.
- `frontend/package.json`: sem `@mui/icons-material`, sem lib de clipboard —
  nenhuma dependência nova necessária (cópia via `navigator.clipboard`
  nativo, já usada por `handleCopiarLink`, reaproveitado sem mudança).
- Não existe hoje nenhum componente "chip de status Respondido/Pendente"
  reaproveitável — decisão abaixo é renderizar inline (`Chip` MUI com
  `color`/`label` calculados na hora), sem criar um componente novo de
  arquivo próprio, por ser um único booleano usado em um único lugar (mesmo
  critério de custo-benefício já usado no projeto para não criar componente
  para algo usado uma vez só — ver "Perguntas em aberto" #3 se o revisor/
  usuário preferir extrair mesmo assim).

## Contrato de API consumido (montado a partir do pedido — CONFERIR contra `task-backend.md` antes de implementar)

`GET /api/ciclos/:cicloId/envios`, papéis `admin`/`gestor_rh`, inalterado na
rota. O envelope de resposta é uma união discriminada por `tipoPesquisa`,
como hoje, mas o braço `clima_geral` muda de shape:

```ts
// tipoPesquisa === 'avaliacao_360' — INALTERADO, zero-diff
{
  tipoPesquisa: 'avaliacao_360',
  envios: EnvioAvaliacao360Resposta[] // exatamente os campos já existentes hoje
}

// tipoPesquisa === 'clima_geral' — NOVO SHAPE (o que esta task corrige)
{
  tipoPesquisa: 'clima_geral',
  envio: {
    id: string
    link: string          // link único da campanha, pronto (com token) — nunca montado no frontend
    status: StatusEnvio    // 'pendente' | 'enviado' | 'em_andamento' | 'concluido' | 'expirado'
    quantidadeLembretes: number
  },
  participantes: {
    id: string             // id do participante (ciclo_participantes)
    colaboradorId: string
    nomeCompleto: string
    respondeuEm: string | null // ISO 8601 | null — nullable, nunca inferido
  }[]
}

// tipoPesquisa === null — só quando envios ainda não foram gerados (ciclo em rascunho); esta seção nunca é buscada nesse estado, mas o tipo precisa cobrir o caso residual
{
  tipoPesquisa: null,
  envios: []
}
```

As 3 rotas `PATCH /api/ciclos/:cicloId/envios/:id/{marcar-enviado,
registrar-lembrete,expirar}` continuam existindo sem mudança de rota. Para
`clima_geral`, `:id` passa a ser o id do **envio de campanha** (não mais de
um envio por participante) e a resposta é o objeto `envio` único atualizado
(mesmo shape do campo `envio` acima). Para `avaliacao_360`, nada muda —
`:id` continua sendo o id do envio por relacionamento, resposta
`EnvioAvaliacao360Resposta`.

**Nenhuma rota nova.** `marcarComoEnviado`/`registrarLembrete`/`expirarEnvio`
continuam sem enviar body, mesmo critério de hoje.

## Decisões (com justificativa)

1. **União discriminada em `types/envio.ts` via type guards exportados**
   (`ehEnvioAvaliacao360` já existente + `ehRespostaCampanhaClima`/
   `ehRespostaAvaliacao360` novos para o envelope), nunca cast (`as`). Mesmo
   critério já usado no projeto para o par
   `EnvioAvaliacao360Resposta`/`EnvioClimaGeralResposta` que esta task
   substitui.
2. **`EnvioClimaGeralResposta`/`ehEnvioClimaGeral` são removidos**, não
   mantidos como "morto" — modelavam exatamente o fluxo errado (1 envio por
   participante) que esta task corrige. Nenhum código deve continuar
   referenciando esses dois nomes depois da implementação.
3. **Ações (`marcarComoEnviado`/`registrarLembrete`/`expirarEnvio`) continuam
   genéricas**, retornando `EnvioAvaliacao360Resposta | EnvioCampanhaClima`
   (união com discriminante `origem`) — a página, ao receber o resultado,
   decide se atualiza o array `enviosAvaliacao360` (por `id`, `.map`) ou o
   objeto único `envioCampanhaClima` (substituição direta), usando o mesmo
   type guard. Isso evita duplicar 3 funções de serviço quase idênticas só
   para trocar o tipo de retorno.
4. **Nova lista de participantes da campanha é um tipo próprio
   (`ParticipanteEnvioClima`) em `types/envio.ts`**, não reaproveitando nem
   estendendo `Participante` (`types/ciclo.ts`) — são dados de endpoints e
   propósitos diferentes (gestão de quem está no ciclo vs. status de resposta
   da campanha), mesmo se o shape parecer parecido superficialmente.
5. **Chip "Respondido"/"Pendente" renderizado inline, sem componente novo de
   arquivo próprio** — é a derivação trivial explicitamente permitida pelo
   pedido (`respondeuEm != null`), usada em um único lugar; criar um
   componente dedicado para isso seria over-engineering neste momento. Se o
   revisor preferir extrair, é uma refatoração de baixo risco a considerar
   depois (ver "Perguntas em aberto" #3).
6. **Bloco superior (link da campanha) não usa `Table`** — é um único
   registro, não uma lista; usar `Card`/`CardContent` com `TextField`
   somente-leitura (ou `Typography` com `sx={{ fontFamily: 'monospace' }}`,
   dentro de um container Tailwind com `overflow-x-auto` para não quebrar
   layout em telas estreitas) para o link + `StatusEnvioChip` + contador de
   lembretes + os 4 botões de ação, mesmo padrão de botões (texto, não
   ícone) já usado na tabela de `avaliacao_360`.
7. **Confirmação (`ConfirmDialog`) só em "Expirar"**, mesmo critério já
   decidido e documentado em `.claude/tasks/envios-pesquisa/task-frontend.md`
   ("Perguntas em aberto" #1 daquele arquivo) — não reabrir essa decisão sem
   necessidade; ela se aplica igualmente ao envio único de campanha.
8. **Tabela de participantes sem coluna de Ações** — requisito explícito do
   pedido ("sem ações por linha, já que não existe mais link individual por
   pessoa"). Inclui uma coluna extra "Respondido em" (formatada via
   `FORMATADOR_DATA_HORA` já existente na página, "—" quando `null`) além do
   chip de status — dado literal já vindo da API, não uma derivação nova, e
   torna a tabela mais útil sem violar a regra de "não derivar nada além de
   `respondeuEm != null`" (a data já vem pronta, só é formatada para
   exibição, mesma função `FORMATADOR_DATA_HORA` já usada para
   `relacionamento.criadoEm`).

## Guard rails (obrigatórios para o `frontend-developer` e o revisor)

- **Anonimização (lembrete explícito, mesmo pedido não tocar em
  respostas)**: a tabela de participantes desta seção mostra **apenas**
  "Respondido"/"Pendente" + timestamp de quando respondeu — metadado de
  participação, nunca conteúdo de resposta (nenhum campo de nota/texto
  respondido existe no shape consumido aqui, nem deve ser buscado). Regra de
  `pares`/`subordinado` (agregação + mínimo de respondentes) é exclusiva de
  `avaliacao_360` e **não se aplica** a `clima_geral` (não há
  avaliador↔avaliado nesse tipo de pesquisa) — nenhuma lógica desta task deve
  ler ou simular `ciclo.minimoRespostasPares` para a seção de clima. Esta
  visão identificada (nome do colaborador + se respondeu) continua restrita a
  `admin`/`gestor_rh`, atrás do mesmo guard de página já existente
  (`RotaProtegida papeis={['admin', 'gestor_rh']}` em `App.tsx`, **não
  tocado** por este plano).
- **Avaliação 360 zero-diff**: nenhuma linha das seções "Relacionamentos
  gerados" e "Envios" (avaliação 360) deve mudar de comportamento, texto,
  coluna ou condição de renderização. `enviosAvaliacao360`/
  `handleMarcarComoEnviado`/`handleRegistrarLembrete`/`handleConfirmarExpirar`/
  `handleCopiarLink` continuam sendo os mesmos handlers, só generalizados o
  suficiente (item 3 acima) para aceitar o envio de campanha como alvo
  alternativo — nenhuma duplicação de handler, nenhum comportamento visível
  diferente para quem está olhando a seção de avaliação 360.
- **`EnvioAvaliacao360Resposta`/`EnvioCampanhaClima`/`ParticipanteEnvioClima`/
  `enviosPesquisaService` continuam só importados dentro de
  `CicloDetalhePage.tsx`** (mais seus próprios arquivos de definição) —
  mesma garantia já mantida pelas tasks anteriores desta feature.
- **Link nunca montado no frontend**: `envio.link` (campanha) é usado
  literal, exatamente como `envio.link` já é hoje para avaliação 360 — sem
  concatenar token com URL base no cliente.
- **Nenhuma rota nova, nenhuma tela `/responder` criada** — fora de escopo
  explícito, confirmado no pedido.
- **Criação de pesquisa/ciclo continua 100% manual** — esta task não mexe em
  criação, só na seção de envios de um ciclo já ativo.

## Plano — Frontend

### 1. frontend-developer — CONCLUÍDO

**Nota sobre o contrato de API**: implementado contra o shape literal do
`task-backend.md` (já existente no momento da implementação), que diverge do
que este plano havia suposto em `1.1` em um ponto: o campo do envio único do
envelope de listagem (`GET /api/ciclos/:cicloId/envios`, braço
`clima_geral`) chama-se **`campanha`**, não `envio`. O discriminante de
origem também usa o valor **`'ciclo'`** (não `'campanha_clima'` como
suposto), e `EnvioCampanhaClima`/`EnvioAvaliacao360Resposta` mantêm
`cpfConfirmadoEm`/`concluidoEm` no `EnvioComum` (o backend não os removeu do
braço de campanha). Fora esses três ajustes de nomenclatura, o restante do
plano (`ehRespostaCampanhaClima`/`ehRespostaAvaliacao360`/
`ehEnvioAvaliacao360`/`ehEnvioCampanhaClima`, os 3 novos states, os handlers
generalizados, a reescrita da seção "Participantes e envios") foi seguido
como descrito.

**Resumo do que foi feito**:
- `frontend/src/types/envio.ts` reescrito: `EnvioClimaGeralResposta`/
  `ehEnvioClimaGeral` (modelo antigo, 1 envio por participante) removidos por
  completo; novos `EnvioCampanhaClima` (`origem: 'ciclo'`),
  `EnvioPesquisaAcao`, `ehEnvioCampanhaClima`, `ParticipanteEnvioClima`,
  `ListarEnviosAvaliacao360Resposta`/`ListarEnviosCampanhaClimaResposta`
  (campo `campanha`, não `envio`)/`ListarEnviosVazioResposta`,
  `ehRespostaCampanhaClima`/`ehRespostaAvaliacao360`.
- `frontend/src/services/enviosPesquisaService.ts`: tipo de retorno das 3
  ações (`marcarComoEnviado`/`registrarLembrete`/`expirarEnvio`) trocado de
  `EnvioPesquisa` para `EnvioPesquisaAcao`; `listarEnvios` retorna
  `ListarEnviosCicloResposta` atualizado. Nenhuma mudança de rota/método/
  parâmetros.
- `frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx`: state único
  `envios`/`useMemo` (`enviosAvaliacao360`/`enviosClimaGeral`) substituído por
  3 states diretos (`enviosAvaliacao360`, `envioCampanhaClima`,
  `participantesEnvioClima`); `carregarEnvios` reescrito para desempacotar o
  envelope pela união discriminada; os 3 handlers de ação generalizados via
  helper único `aplicarEnvioAtualizado` (atualiza `envioCampanhaClima` ou faz
  `.map` em `enviosAvaliacao360`, conforme `ehEnvioCampanhaClima`);
  `rotuloAlvoExpirar` atualizado para o novo discriminante. Seções
  "Relacionamentos gerados" e "Envios" (avaliação 360) ficaram zero-diff
  (confirmado via `git diff` — nenhuma linha de JSX dessas duas seções
  mudou). Seção "Participantes e envios" (clima) reescrita por completo:
  bloco superior `Paper` com link somente-leitura (`TextField` +
  `slotProps={{ input: { readOnly: true } }}`, compatível com MUI v9
  instalado) + `StatusEnvioChip` + os 4 botões de ação (mesmo padrão de texto
  já usado em avaliação 360) operando sobre `envioCampanhaClima` (state
  único); tabela de participantes abaixo, sem coluna de Ações, com chip
  inline "Respondido"/"Pendente" (derivação trivial de `respondeuEm != null`)
  + coluna "Respondido em" formatada via `FORMATADOR_DATA_HORA` já existente.
  Estados de carregando (spinner), erro (`Alert` com "Tentar novamente") e
  vazio (`TabelaEstado` na tabela) tratados.
- `npm run build` (`tsc -b && vite build`) e `npm run lint` (`eslint .`)
  rodados dentro de `frontend/` — ambos passaram sem erros/avisos novos.

**Arquivos alterados**:
- `frontend/src/types/envio.ts`
- `frontend/src/services/enviosPesquisaService.ts`
- `frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx`



#### 1.1 `types/envio.ts` (reescrito)

```ts
import type { TipoPesquisa } from './pesquisa'
import type { TipoRelacionamento } from './ciclo'

export type StatusEnvio = 'pendente' | 'enviado' | 'em_andamento' | 'concluido' | 'expirado'

interface EnvioComum {
  id: string
  status: StatusEnvio
  link: string
  quantidadeLembretes: number
}

/**
 * Envio gerado a partir de `relacionamentos_avaliacao` (pesquisa
 * `avaliacao_360`) — dado IDENTIFICADO de quem avalia quem
 * (`avaliadorId`/`avaliadorNome`), inclusive para os tipos
 * `pares`/`subordinado`. INALTERADO por esta task — preservado tal qual já
 * existia antes da correção do fluxo de `clima_geral`. Só pode ser
 * consumido dentro de `CicloDetalhePage`, atrás do guard de papel
 * admin/gestor_rh.
 */
export interface EnvioAvaliacao360Resposta extends EnvioComum {
  origem: 'relacionamento'
  avaliadorId: string
  avaliadorNome: string
  avaliadoId: string
  avaliadoNome: string
  tipoRelacionamento: TipoRelacionamento
  cpfConfirmadoEm: string | null
  concluidoEm: string | null
}

/**
 * NOVO nesta task — substitui `EnvioClimaGeralResposta` (que modelava 1
 * envio por participante, o fluxo errado que esta task corrige). Representa
 * o link ÚNICO da campanha de clima/satisfação do ciclo — não há mais
 * `destinatario` por linha, porque o mesmo link é compartilhado por todos os
 * participantes.
 */
export interface EnvioCampanhaClima extends EnvioComum {
  origem: 'campanha_clima'
}

/** Ação genérica (`marcarComoEnviado`/`registrarLembrete`/`expirarEnvio`) — pode alvejar um envio de avaliação 360 OU o envio único de campanha de clima. */
export type EnvioPesquisaAcao = EnvioAvaliacao360Resposta | EnvioCampanhaClima

/** Narrowing para o braço `avaliacao_360` — usar em vez de cast (`as`). */
export function ehEnvioAvaliacao360(envio: EnvioPesquisaAcao): envio is EnvioAvaliacao360Resposta {
  return envio.origem === 'relacionamento'
}

/** Narrowing para o braço `campanha_clima` — usar em vez de cast (`as`). */
export function ehEnvioCampanhaClima(envio: EnvioPesquisaAcao): envio is EnvioCampanhaClima {
  return envio.origem === 'campanha_clima'
}

/**
 * Metadado de PARTICIPAÇÃO (nunca conteúdo de resposta) de um participante
 * do ciclo em relação à campanha única de clima — `respondeuEm` nullable,
 * nunca inferido/derivado além de `!= null`. Tipo distinto de `Participante`
 * (`types/ciclo.ts`, usado pela seção de gestão de participantes no topo da
 * página): vem de um endpoint diferente (`GET .../envios`), com um
 * propósito diferente. Só pode ser consumido dentro de `CicloDetalhePage`,
 * atrás do guard de papel admin/gestor_rh.
 */
export interface ParticipanteEnvioClima {
  id: string
  colaboradorId: string
  nomeCompleto: string
  respondeuEm: string | null
}

/** Braço `avaliacao_360` do envelope de listagem — INALTERADO. */
export interface ListarEnviosAvaliacao360Resposta {
  tipoPesquisa: 'avaliacao_360'
  envios: EnvioAvaliacao360Resposta[]
}

/**
 * Braço `clima_geral` do envelope de listagem — NOVO SHAPE (o que esta task
 * corrige): um único `envio` de campanha + a lista de `participantes` com
 * `respondeuEm`, em vez de um array de envios (1 por participante).
 */
export interface ListarEnviosCampanhaClimaResposta {
  tipoPesquisa: 'clima_geral'
  envio: EnvioCampanhaClima
  participantes: ParticipanteEnvioClima[]
}

/** Caso residual: ciclo ainda sem envios gerados. Esta seção nunca busca nesse estado (`ciclo.status !== 'rascunho'` guarda a chamada), mas o tipo precisa cobrir. */
export interface ListarEnviosVazioResposta {
  tipoPesquisa: null
  envios: []
}

export type ListarEnviosCicloResposta =
  | ListarEnviosAvaliacao360Resposta
  | ListarEnviosCampanhaClimaResposta
  | ListarEnviosVazioResposta

/** Narrowing do envelope para o braço `clima_geral` — usar em vez de checar `tipoPesquisa` solto em múltiplos lugares. */
export function ehRespostaCampanhaClima(
  resposta: ListarEnviosCicloResposta,
): resposta is ListarEnviosCampanhaClimaResposta {
  return resposta.tipoPesquisa === 'clima_geral'
}

/** Narrowing do envelope para o braço `avaliacao_360`. */
export function ehRespostaAvaliacao360(
  resposta: ListarEnviosCicloResposta,
): resposta is ListarEnviosAvaliacao360Resposta {
  return resposta.tipoPesquisa === 'avaliacao_360'
}
```

`TipoPesquisa` (import) continua vindo de `./pesquisa`, só usado no
discriminante `tipoPesquisa` do envelope — sem mudança nesse import.

**CONFERIR contra `task-backend.md` antes de codar**: nomes exatos de
`envio.id`/`participantes[].id`/`respondeuEm`, e se `EnvioCampanhaClima`
realmente não carrega `cpfConfirmadoEm`/`concluidoEm` (removidos aqui porque,
sendo um link compartilhado por N pessoas, esses dois campos não fazem
sentido no nível do envio — cada participante teria seu próprio
`respondeuEm`, já coberto por `ParticipanteEnvioClima`; se o backend ainda
assim devolver esses 2 campos no objeto `envio`, ajustar o tipo para
incluí-los em vez de removê-los).

#### 1.2 `services/enviosPesquisaService.ts` (editado)

```ts
import { apiFetch } from '../lib/apiClient'
import type { EnvioPesquisaAcao, ListarEnviosCicloResposta } from '../types/envio'

/** Dado IDENTIFICADO — só pode ser consumido dentro de `CicloDetalhePage`. Ver `types/envio.ts`. */
export function listarEnvios(cicloId: string): Promise<ListarEnviosCicloResposta> {
  return apiFetch<ListarEnviosCicloResposta>(`/api/ciclos/${cicloId}/envios`)
}

/** Só aceito pelo backend com o envio em `pendente` (`409 TRANSICAO_ENVIO_INVALIDA` caso contrário). Para clima_geral, `envioId` é o id do envio único da campanha. */
export function marcarComoEnviado(cicloId: string, envioId: string): Promise<EnvioPesquisaAcao> {
  return apiFetch<EnvioPesquisaAcao>(`/api/ciclos/${cicloId}/envios/${envioId}/marcar-enviado`, { method: 'PATCH' })
}

/** Só aceito pelo backend com o envio em `enviado` (`409 TRANSICAO_ENVIO_INVALIDA` caso contrário). */
export function registrarLembrete(cicloId: string, envioId: string): Promise<EnvioPesquisaAcao> {
  return apiFetch<EnvioPesquisaAcao>(`/api/ciclos/${cicloId}/envios/${envioId}/registrar-lembrete`, {
    method: 'PATCH',
  })
}

/** Aceito a partir de qualquer status, inclusive idempotente. */
export function expirarEnvio(cicloId: string, envioId: string): Promise<EnvioPesquisaAcao> {
  return apiFetch<EnvioPesquisaAcao>(`/api/ciclos/${cicloId}/envios/${envioId}/expirar`, { method: 'PATCH' })
}
```

Única mudança de fato: tipo de retorno das 3 ações passa de
`EnvioPesquisa` (união antiga, com `EnvioClimaGeralResposta`) para
`EnvioPesquisaAcao` (união nova, com `EnvioCampanhaClima`). Nenhuma mudança
de rota, método ou parâmetros.

#### 1.3 `pages/CicloDetalhePage/CicloDetalhePage.tsx` (editado)

**Papéis com acesso**: inalterado — `admin`/`gestor_rh`, herdado do guard de
página já existente. `colaborador` nunca alcança esta seção.

- Imports atualizados: trocar `ehEnvioAvaliacao360, ehEnvioClimaGeral` por
  `ehEnvioAvaliacao360, ehEnvioCampanhaClima, ehRespostaCampanhaClima,
  ehRespostaAvaliacao360`; trocar `EnvioPesquisa` por
  `EnvioAvaliacao360Resposta, EnvioCampanhaClima, EnvioPesquisaAcao,
  ParticipanteEnvioClima` (todos de `../../types/envio`).
- **Novo estado**, substituindo o `envios: EnvioPesquisa[]` único de hoje:
  ```ts
  const [enviosAvaliacao360, setEnviosAvaliacao360] = useState<EnvioAvaliacao360Resposta[]>([])
  const [envioCampanhaClima, setEnvioCampanhaClima] = useState<EnvioCampanhaClima | null>(null)
  const [participantesEnvioClima, setParticipantesEnvioClima] = useState<ParticipanteEnvioClima[]>([])
  const [tipoPesquisaEnvios, setTipoPesquisaEnvios] = useState<TipoPesquisa | null>(null)
  ```
  Remover os antigos `envios`, `enviosClimaGeral` (`useMemo` com
  `ehEnvioClimaGeral`); `enviosAvaliacao360` deixa de ser um `useMemo`
  derivado e passa a ser state definido diretamente por `carregarEnvios`.
- **`carregarEnvios` reescrito** para desempacotar o envelope pela nova união:
  ```ts
  const carregarEnvios = useCallback(async (cicloId: string) => {
    setCarregandoEnvios(true)
    setErroEnvios(null)
    try {
      const resposta = await listarEnvios(cicloId)
      setTipoPesquisaEnvios(resposta.tipoPesquisa)
      if (ehRespostaCampanhaClima(resposta)) {
        setEnvioCampanhaClima(resposta.envio)
        setParticipantesEnvioClima(resposta.participantes)
        setEnviosAvaliacao360([])
      } else if (ehRespostaAvaliacao360(resposta)) {
        setEnviosAvaliacao360(resposta.envios)
        setEnvioCampanhaClima(null)
        setParticipantesEnvioClima([])
      } else {
        setEnviosAvaliacao360([])
        setEnvioCampanhaClima(null)
        setParticipantesEnvioClima([])
      }
    } catch (err) {
      setErroEnvios(err instanceof ApiError ? err.message : 'Não foi possível carregar os envios.')
    } finally {
      setCarregandoEnvios(false)
    }
  }, [])
  ```
  Chamada em `carregar()` e em `handleConfirmarAtivar` **sem nenhuma
  mudança** nesses dois pontos — continuam disparando `carregarEnvios(id)`
  exatamente nas mesmas condições de hoje (`ciclo.status !== 'rascunho'`),
  só o corpo da função muda.
- **Handlers de ação generalizados** (`handleMarcarComoEnviado`,
  `handleRegistrarLembrete`, `handleConfirmarExpirar`) — mesma assinatura de
  parâmetro (`envio: EnvioPesquisaAcao`), corpo ajustado para atualizar o
  slot de state certo:
  ```ts
  async function handleMarcarComoEnviado(envio: EnvioPesquisaAcao) {
    if (!ciclo) return
    setAcaoEmAndamento({ envioId: envio.id, acao: 'marcar-enviado' })
    try {
      const atualizado = await marcarComoEnviado(ciclo.id, envio.id)
      if (ehEnvioCampanhaClima(atualizado)) {
        setEnvioCampanhaClima(atualizado)
      } else {
        setEnviosAvaliacao360((prev) => prev.map((e) => (e.id === atualizado.id ? atualizado : e)))
      }
    } catch (err) {
      setSnackbar({
        mensagem: err instanceof ApiError ? err.message : 'Não foi possível marcar o envio como enviado.',
        severidade: 'error',
      })
    } finally {
      setAcaoEmAndamento(null)
    }
  }
  ```
  Mesmo padrão para `handleRegistrarLembrete`. `handleConfirmarExpirar` segue
  o mesmo critério (atualiza `envioCampanhaClima` ou faz `.map` em
  `enviosAvaliacao360`, conforme o guard), mantendo `alvoExpirar`/
  `expirando`/`erroExpirar` como já existem hoje, só trocando o tipo de
  `alvoExpirar` para `EnvioPesquisaAcao | null`.
- **`rotuloAlvoExpirar` atualizado**:
  ```ts
  function rotuloAlvoExpirar(envio: EnvioPesquisaAcao | null): string {
    if (!envio) return ''
    return ehEnvioAvaliacao360(envio)
      ? `de "${envio.avaliadorNome}" para "${envio.avaliadoNome}"`
      : 'da campanha de clima e satisfação deste ciclo'
  }
  ```
- Seções **"Relacionamentos gerados"** e **"Envios"** (avaliação 360):
  **nenhuma mudança de JSX** além de trocar a fonte `enviosAvaliacao360`
  (que já era usada no `.map`/`vazio` de "Envios") de "valor derivado por
  `useMemo`" para "state direto" — o nome da variável e seu conteúdo em tempo
  de execução não mudam, então o JSX dessas duas seções permanece
  literalmente idêntico linha por linha.
- **Seção "Participantes e envios" (clima) — reescrita por completo**, só
  renderizada quando `ciclo.status !== 'rascunho' && tipoPesquisaCiclo ===
  'clima_geral'`:
  ```tsx
  {ciclo.status !== 'rascunho' && tipoPesquisaCiclo === 'clima_geral' && (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <Typography variant="subtitle1">Participantes e envios</Typography>
        <Typography variant="body2" color="text.secondary">
          Pesquisa de clima e satisfação — link único, compartilhado com todos os
          participantes do ciclo. O colaborador acessa o link e confirma o CPF para
          liberar o formulário. Esta tela só controla o envio do link e mostra quem já
          respondeu. Dado identificado — visível apenas para admin/gestor de RH.
        </Typography>

        {carregandoEnvios && (
          <div className="flex justify-center py-6">
            <CircularProgress size={28} />
          </div>
        )}

        {!carregandoEnvios && erroEnvios && (
          <Alert
            severity="error"
            role="alert"
            action={
              <Button color="inherit" size="small" onClick={() => carregarEnvios(ciclo.id)}>
                Tentar novamente
              </Button>
            }
          >
            {erroEnvios}
          </Alert>
        )}

        {!carregandoEnvios && !erroEnvios && envioCampanhaClima && (
          <>
            <Paper variant="outlined" className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Typography variant="subtitle2">Link da campanha</Typography>
                <StatusEnvioChip status={envioCampanhaClima.status} />
              </div>
              <TextField
                value={envioCampanhaClima.link}
                slotProps={{ input: { readOnly: true } }}
                size="small"
                fullWidth
                sx={{ fontFamily: 'monospace' }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="small" onClick={() => handleCopiarLink(envioCampanhaClima.link)}>
                  Copiar link
                </Button>
                <Tooltip title={envioCampanhaClima.status !== 'pendente' ? 'Só disponível a partir de "Pendente".' : ''}>
                  <span>
                    <Button
                      size="small"
                      disabled={
                        envioCampanhaClima.status !== 'pendente' ||
                        (acaoEmAndamento?.envioId === envioCampanhaClima.id && acaoEmAndamento.acao === 'marcar-enviado')
                      }
                      onClick={() => handleMarcarComoEnviado(envioCampanhaClima)}
                    >
                      {acaoEmAndamento?.envioId === envioCampanhaClima.id && acaoEmAndamento.acao === 'marcar-enviado'
                        ? 'Aguarde...'
                        : 'Marcar como enviado'}
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip title={envioCampanhaClima.status !== 'enviado' ? 'Só disponível a partir de "Enviado".' : ''}>
                  <span>
                    <Button
                      size="small"
                      disabled={
                        envioCampanhaClima.status !== 'enviado' ||
                        (acaoEmAndamento?.envioId === envioCampanhaClima.id && acaoEmAndamento.acao === 'registrar-lembrete')
                      }
                      onClick={() => handleRegistrarLembrete(envioCampanhaClima)}
                    >
                      {acaoEmAndamento?.envioId === envioCampanhaClima.id && acaoEmAndamento.acao === 'registrar-lembrete'
                        ? 'Aguarde...'
                        : `Lembrete (${envioCampanhaClima.quantidadeLembretes})`}
                    </Button>
                  </span>
                </Tooltip>
                <Button
                  size="small"
                  color="error"
                  disabled={envioCampanhaClima.status === 'expirado'}
                  onClick={() => {
                    setErroExpirar(null)
                    setAlvoExpirar(envioCampanhaClima)
                  }}
                >
                  Expirar
                </Button>
              </div>
            </Paper>

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Colaborador</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Respondido em</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TabelaEstado
                    colSpan={3}
                    carregando={false}
                    vazio={participantesEnvioClima.length === 0}
                    mensagemVazio="Nenhum participante neste ciclo."
                  />
                  {participantesEnvioClima.map((participante) => (
                    <TableRow key={participante.id} hover>
                      <TableCell>{participante.nomeCompleto}</TableCell>
                      <TableCell>
                        <Chip
                          label={participante.respondeuEm ? 'Respondido' : 'Pendente'}
                          color={participante.respondeuEm ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {participante.respondeuEm ? FORMATADOR_DATA_HORA.format(new Date(participante.respondeuEm)) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </CardContent>
    </Card>
  )}
  ```
  - `Chip` precisa ser adicionado ao import de `@mui/material` já existente
    no topo do arquivo (hoje não é importado — só `StatusEnvioChip` usa
    `Chip` internamente).
  - `TextField` já é importado; `slotProps={{ input: { readOnly: true } }}`
    é a forma atual (MUI v5.15+/v6) de fazer um campo somente-leitura —
    conferir a versão instalada em `package.json` e usar `InputProps={{
    readOnly: true }}` no lugar se o projeto ainda estiver numa versão do MUI
    anterior a essa API (checar antes de implementar; não assumir).
  - Nenhum `colSpan` incorreto: tabela de participantes tem 3 colunas
    (Colaborador, Status, Respondido em).

#### 1.4 Fora de escopo explícito (não implementar nesta task)

- Página pública `/responder/:token` e a tela de confirmação de CPF — item
  futuro, mencionado no pedido como já não fazendo parte desta demanda.
- Qualquer exibição de conteúdo de resposta (nota/texto) — esta task só
  mexe em metadados de envio/participação.
- Qualquer cálculo de `minimoRespostasPares`/agregação — não se aplica a
  `clima_geral`.
- Reintroduzir `EnvioClimaGeralResposta`/`ehEnvioClimaGeral` "por
  compatibilidade" — devem ser removidos por completo, não deprecados.

**Endpoints consumidos por esta seção**: `GET /api/ciclos/:cicloId/envios`,
`PATCH /api/ciclos/:cicloId/envios/:id/marcar-enviado`,
`PATCH /api/ciclos/:cicloId/envios/:id/registrar-lembrete`,
`PATCH /api/ciclos/:cicloId/envios/:id/expirar` (mesmas rotas de antes,
shape de resposta corrigido para `clima_geral`) — mais os endpoints
inalterados da seção de avaliação 360 e do restante da página.

Ao terminar: rodar `npm run build` (`tsc -b && vite build`) e `npm run lint`
(`eslint .`) dentro de `frontend/` e confirmar que ambos passam sem
erros/avisos novos. Registrar no resumo da etapa se o shape consumido bateu
literalmente com `task-backend.md` ou se precisou de ajuste (e qual).

### 2. frontend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Avaliação 360 zero-diff**: diff de `CicloDetalhePage.tsx` restrito às
   seções "Participantes e envios" (clima) + os pontos genéricos listados em
   1.3 (imports, state, `carregarEnvios`, os 3 handlers de ação,
   `rotuloAlvoExpirar`) — nenhuma linha de JSX das seções "Relacionamentos
   gerados"/"Envios" (avaliação 360) deve ter mudado de comportamento visível
   (texto, coluna, condição).
2. **`EnvioClimaGeralResposta`/`ehEnvioClimaGeral` removidos por completo**:
   grep em todo `frontend/src/` não deve retornar nenhuma ocorrência desses
   dois nomes.
3. **Link único, sem link por participante**: confirmar que a tabela de
   participantes não tem coluna "Link"/"Ações" nem botão "Copiar link" por
   linha — só o bloco superior tem o link e os botões de ação.
4. **Ações operam sobre o envio de campanha, não sobre um item da lista de
   participantes**: `handleMarcarComoEnviado(envioCampanhaClima)`/
   `handleRegistrarLembrete(envioCampanhaClima)`/`setAlvoExpirar(envioCampanhaClima)`
   recebem o objeto `envioCampanhaClima` (state único), nunca um item de
   `participantesEnvioClima`.
5. **Status "Respondido"/"Pendente" é derivação trivial de
   `respondeuEm != null`**: grep por qualquer lógica adicional de status de
   participação (ex. comparar datas, contar quantos responderam) — não
   deveria haver nada além do booleano direto.
6. **Nenhum dado de resposta/conteúdo exibido**: confirmar que
   `ParticipanteEnvioClima`/a seção nova só renderizam
   `nomeCompleto`/`respondeuEm` — nenhum campo de nota/texto de resposta.
7. **Nenhum cálculo de `minimoRespostasPares` na seção de clima**: grep
   dentro do bloco novo — não deveria haver nenhuma ocorrência.
8. **Controle de acesso inalterado**: nenhuma rota nova em `App.tsx`, seção
   continua só dentro de `CicloDetalhePage.tsx` atrás de `RotaProtegida
   papeis={['admin', 'gestor_rh']}`.
9. **Union guards usados corretamente, nunca cast**: grep por
   `as EnvioCampanhaClima`/`as EnvioAvaliacao360Resposta`/`(envio as any)`/
   `as ListarEnviosCampanhaClimaResposta` — não deveria haver nenhum;
   toda distinção passa por `ehEnvioAvaliacao360`/`ehEnvioCampanhaClima`/
   `ehRespostaCampanhaClima`/`ehRespostaAvaliacao360`.
10. **`enviosPesquisaService.ts`**: as 3 ações retornam `EnvioPesquisaAcao`
    (não mais o tipo antigo `EnvioPesquisa`); `listarEnvios` retorna
    `ListarEnviosCicloResposta` atualizado; nenhuma mudança de rota/método/
    parâmetros.
11. **Reaproveitamento confirmado**: `StatusEnvioChip`, `TabelaEstado`,
    `ConfirmDialog`, `apiFetch`/`ApiError`, `FORMATADOR_DATA_HORA` usados tal
    qual, sem duplicação; nenhum componente novo de arquivo próprio criado
    para o chip Respondido/Pendente (inline, conforme decisão 5 do plano).
12. **Stack de estilização**: Tailwind + MUI, sem `.css` novo, sem
    `style={{}}` fora do `sx` pontual já usado no restante da página, nenhuma
    dependência nova em `package.json`.
13. **Estados tratados**: carregando (spinner/skeleton), erro (`Alert` com
    "Tentar novamente" chamando `carregarEnvios(ciclo.id)`), vazio (via
    `TabelaEstado` na tabela de participantes, mensagem "Nenhum participante
    neste ciclo.") — todos presentes na seção nova.
14. **`respondeuEm` nunca usado para inferir identidade além do próprio
    participante já identificado por linha** — não há combinação de campos
    tentando deduzir algo além do que a API já entrega explicitamente linha
    a linha.

## Perguntas em aberto

1. **Shape exato do backend não confirmado no momento deste plano** — ver
   aviso no topo do arquivo; se `task-backend.md` divergir de
   `types/envio.ts` (seção 1.1), ajustar os tipos antes de codar o restante,
   não depois.
2. **Coluna "Respondido em" na tabela de participantes** (decisão 8) não foi
   pedida literalmente — só "Respondido"/"Pendente" foi pedido. Incluída por
   ser dado literal já disponível e melhorar a utilidade da tela; se o
   usuário preferir só o chip de status, é uma remoção pontual de coluna.
3. **Chip "Respondido"/"Pendente" inline, sem componente próprio** (decisão
   5) — se este padrão precisar ser reaproveitado em uma tela futura (ex. um
   resumo de participação por ciclo), vale extrair para
   `components/ciclos/StatusParticipacaoChip/` nesse momento, não
   antecipado aqui.
4. **Bloco superior usa `TextField` somente-leitura para o link** — uma
   alternativa seria `Typography` com fundo cinza (`Paper`/`Box` com `sx`) em
   vez de `TextField`; optou-se por `TextField` porque facilita ao admin
   selecionar/copiar manualmente o texto caso `navigator.clipboard` falhe
   (mesmo cenário de erro já tratado por `handleCopiarLink`). Troca trivial
   se o usuário preferir outro visual.

## Revisão

**Método**: leitura completa de `types/envio.ts`, `enviosPesquisaService.ts`,
`CicloDetalhePage.tsx` (973→1057 linhas) e `App.tsx`; comparação campo a
campo contra o shape autoritativo descrito em `task-backend.md`
(`ListarEnviosCicloRespostaClimaGeral`, `EnvioClimaGeralCampanhaResposta`,
`ParticipanteClimaResposta`); `grep` em `frontend/src/` por nomes do modelo
antigo (`EnvioClimaGeralResposta`, `ehEnvioClimaGeral`, `destinatario`,
`EnvioPesquisa`), por casts inseguros (`as Envio...`, `as any`) e por
`minimoRespostasPares`/`.css`/`@mui/icons-material`. **Ressalva de
ferramenta**: este revisor só tem acesso a Read/Grep/Glob/Edit — não pôde
rodar `git diff`/`npm run build`/`npm run lint` diretamente; a confirmação de
zero-diff nas seções de avaliação 360 e a passagem de build/lint foram
verificadas por inspeção estrutural do arquivo final (texto, colunas,
condições, handlers), não por diff byte-a-byte contra a revisão anterior.

### Nenhum achado Crítico

- **Contrato de API**: `types/envio.ts` bate campo a campo com
  `task-backend.md` — campo `campanha` (não `envio`), discriminante
  `origem: 'ciclo'`, `EnvioComum` mantendo `cpfConfirmadoEm`/`concluidoEm`.
  Os três ajustes de nomenclatura registrados no resumo da etapa 1 (nota
  sobre o contrato) foram aplicados corretamente e correspondem exatamente
  às interfaces `ListarEnviosCicloRespostaClimaGeral`/
  `EnvioClimaGeralCampanhaResposta`/`ParticipanteClimaResposta` do backend.
- **Vazamento de identidade / controle de acesso**: seção só renderiza
  dentro de `CicloDetalhePage`, atrás de `RotaProtegida
  papeis={['admin', 'gestor_rh']}` em `App.tsx` — inalterado, sem rota nova.
  `colaborador` nunca alcança esta tela. Nenhuma lógica de agregação/
  `minimoRespostasPares` na seção de clima (`grep` sem ocorrências dentro do
  bloco novo). `respondeuEm` usado apenas como `!= null` → chip
  "Respondido"/"Pendente", sem combinação de campos para inferir identidade
  além do que a API já entrega linha a linha.
- **Link único, sem ação por linha**: tabela de participantes tem só 3
  colunas (Colaborador, Status, Respondido em), sem "Ações"/"Link"; os 4
  botões (Copiar link, Marcar como enviado, Lembrete, Expirar) vivem só no
  `Paper` superior e operam sobre `envioCampanhaClima` (state único), nunca
  sobre um item de `participantesEnvioClima`.
- **Estado morto removido**: `grep` em `frontend/src/` por
  `EnvioClimaGeralResposta`/`ehEnvioClimaGeral`/`destinatario`/`EnvioPesquisa`
  não retorna nenhuma ocorrência de código (só um comentário em
  `types/envio.ts` citando o nome antigo para contexto histórico).
- **Union guards**: `grep` por `as EnvioCampanhaClima`/
  `as EnvioAvaliacao360Resposta`/`as any`/`as ListarEnviosCampanhaClimaResposta`
  não retorna nada — toda distinção passa por `ehEnvioAvaliacao360`/
  `ehEnvioCampanhaClima`/`ehRespostaCampanhaClima`/`ehRespostaAvaliacao360`.
- **Estilo**: nenhum `.css` novo (só o `index.css` pré-existente), nenhum
  `style={{}}` inline em `CicloDetalhePage.tsx`; customização de fonte do
  link usa `sx={{ '& input': { fontFamily: 'monospace' } }}` (MUI vence),
  Tailwind só para layout (`flex`, `gap`, `overflow-x-auto`). Nenhuma
  dependência nova em `package.json`.
- **Avaliação 360**: as seções "Relacionamentos gerados" (linhas 694–736) e
  "Envios" (linhas 738–832) mantêm texto, colunas (Avaliador/Avaliado/Tipo/
  Status/Lembretes/Ações e Avaliador/Avaliado/Tipo/Data) e condição de
  renderização (`ciclo.status !== 'rascunho' && tipoPesquisaCiclo !==
  'clima_geral'`) consistentes com o comportamento descrito como já existente
  no plano — nenhum vestígio de lógica de clima misturado nessas duas
  seções. Handlers genéricos (`aplicarEnvioAtualizado`, `handleMarcarComoEnviado`,
  `handleRegistrarLembrete`, `handleConfirmarExpirar`, `rotuloAlvoExpirar`)
  preservam a mesma assinatura/comportamento para o braço `avaliacao_360`.
- **Reaproveitamento**: `StatusEnvioChip`, `TabelaEstado`, `ConfirmDialog`,
  `FORMATADOR_DATA_HORA` usados tal qual; nenhum componente novo criado para
  o chip Respondido/Pendente (inline, conforme decisão do plano).
- **Conteúdo exibido**: `ParticipanteEnvioClima` e a seção nova só renderizam
  `nomeCompleto`/`respondeuEm` — nenhum campo de nota/texto de resposta.

### Deveria corrigir

Nenhum.

### Sugestão

1. **Estado "vazio" silencioso no bloco do link da campanha**
   (`CicloDetalhePage.tsx`, linha 864): o bloco só renderiza quando
   `!carregandoEnvios && !erroEnvios && envioCampanhaClima`. Se, por algum
   motivo (ex.: `tipoPesquisaCiclo` vindo de `pesquisaVinculada` divergir
   momentaneamente de `tipoPesquisaEnvios`, ou uma resposta inesperada do
   backend), `envioCampanhaClima` ficar `null` após o carregamento terminar
   sem erro, a seção renderiza só o título/descrição, sem nenhuma mensagem
   explicando a ausência do link — diferente da tabela de participantes
   logo abaixo, que trata esse caso via `TabelaEstado`/`vazio`. Baixo risco
   na prática (o contrato do backend garante `campanha` não-nulo sempre que
   `tipoPesquisa === 'clima_geral'`), mas vale um `Alert`/`Typography` de
   fallback nesse `&&` para não deixar a tela com um card "mudo".
2. Build/lint não foram reexecutados por este revisor (ferramentas
   restritas a Read/Grep/Glob/Edit) — recomenda-se que o orquestrador
   confirme novamente `npm run build`/`npm run lint` antes de prosseguir,
   mesmo que o developer já os tenha reportado como aprovados.

### Conclusão

**Nenhum achado Crítico.** O código bate com o contrato de API do backend,
não reintroduz vazamento de identidade nem regressão de controle de acesso,
não deixa código morto do modelo antigo, segue a stack Tailwind+MUI sem CSS
puro, e preserva (por inspeção estrutural) o comportamento da seção de
avaliação 360. Pode prosseguir para a etapa de testes
(`test-engineer`).
