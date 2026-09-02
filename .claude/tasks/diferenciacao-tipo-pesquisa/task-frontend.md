# Task: Diferenciação de tipo de pesquisa (Avaliação 360 vs Clima/Geral) — Frontend

Demanda de frontend (`frontend/`, equivalente ao `apps/web` citado nos
agentes/skills — usar sempre os caminhos reais `frontend/**` neste plano).
Etapa `spec` pulada a pedido explícito do usuário — nada abaixo deve ser
tratado como pergunta em aberto, exceto o que está explicitamente listado na
seção final "Perguntas em aberto". Este plano não toca `backend/`.

O `task-backend.md` desta mesma pasta (demanda irmã, já escrito) foi lido por
completo e é a fonte do contrato de API abaixo — nenhuma rota/campo foi
inventado. A tela pública de resposta (`/responder`) continua FORA de escopo
(não existe hoje, não é tocada por este plano).

## Estado atual verificado (antes do plano)

### Contrato de API que muda (confirmado em `task-backend.md`, seções "Decisões de modelagem" 8/9, "1.11" e a tabela de rotas)

- `pesquisas` ganha campo `tipo: 'avaliacao_360' | 'clima_geral'`
  (`NOT NULL DEFAULT 'avaliacao_360'`), retornado em `POST /api/pesquisas`,
  `GET /api/pesquisas` (cada item), `GET /api/pesquisas/:id`,
  `POST /api/pesquisas/:id/duplicar`. **Nunca aceito em
  `PUT /api/pesquisas/:id`** — o DTO de atualização do backend simplesmente
  não declara o campo (mesmo critério já usado para `status` nesse DTO,
  confirmado em `task-backend.md`).
- `POST /api/pesquisas/:pesquisaId/paginas/:paginaId/perguntas` e o `PUT`
  equivalente passam a rejeitar `tipo: 'pessoa'` quando a pesquisa dona é
  `clima_geral`, com `422 TIPO_PERGUNTA_INVALIDO_PARA_PESQUISA`.
- `GET /api/ciclos/:cicloId/envios` **muda de shape**: de
  `EnvioCicloResposta[]` (array plano) para
  `{ tipoPesquisa: TipoPesquisa | null, envios: EnvioCicloResposta[] }`. Cada
  item é uma união discriminada por `origem`:
  - `origem: 'relacionamento'` (avaliação 360) — **exatamente os mesmos 5
    campos identificadores já existentes hoje** (`avaliadorId`,
    `avaliadorNome`, `avaliadoId`, `avaliadoNome`, `tipoRelacionamento`),
    zero-diff nesse braço.
  - `origem: 'colaborador'` (clima) — **um único campo novo**
    `destinatario: { id: string; nomeCompleto: string }`, sem
    avaliador/avaliado/tipoRelacionamento (essa dimensão não existe para
    clima).
  - Campos comuns aos dois: `id`, `status`, `link`, `quantidadeLembretes`,
    `cpfConfirmadoEm`, `concluidoEm` — idênticos ao shape anterior.
  - `tipoPesquisa` é `null` **somente** quando `envios` está vazio (ciclo
    ainda não ativado).
- As 3 rotas `PATCH /api/ciclos/:cicloId/envios/:id/{marcar-enviado,
  registrar-lembrete,expirar}` continuam retornando o **item único**
  atualizado (mesma união discriminada por `origem`, **sem** o envelope
  `{ tipoPesquisa, envios }`).
- Nenhuma rota nova. Nenhuma das rotas tocadas é acessível por `colaborador`.

### Código real lido por completo

- `frontend/src/types/envio.ts` (hoje): `EnvioPesquisa` é uma interface
  **plana única** com os 5 campos de avaliador/avaliado sempre presentes —
  não sobrevive ao novo shape (nem ao envelope, nem à união discriminada).
- `frontend/src/services/enviosPesquisaService.ts` (hoje): `listarEnvios`
  tipado como `Promise<EnvioPesquisa[]>` (array plano) — precisa retornar o
  envelope novo.
- `frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx` (hoje, lido por
  completo, 847 linhas): já tem as seções "Dados do ciclo", "Participantes",
  "Pesquisa vinculada", "Ativação", "Relacionamentos gerados" (via
  `listarRelacionamentos`, só quando `ciclo.status !== 'rascunho'`) e
  "Envios" (via `listarEnvios`, mesma condição, assumindo hoje que todo item
  tem avaliador/avaliado). A seção "Pesquisa vinculada" já calcula
  `pesquisaVinculada = pesquisas.find(p => p.cicloId === ciclo.id) ?? null`
  a partir de `listarPesquisas()`, **já buscado em paralelo com o ciclo** em
  `carregar()` (`Promise.all([buscarCiclo, listarParticipantes,
  listarPesquisas, listarColaboradores, listarEquipes])`) — ou seja, **o tipo
  da pesquisa vinculada já está disponível na página, de forma síncrona com
  `ciclo`, antes mesmo de `listarEnvios` resolver.** Isso é a peça central da
  Decisão 1 abaixo (ver seção dedicada "Fonte de verdade do tipo de
  pesquisa").
- `frontend/src/types/pesquisa.ts` / `frontend/src/types/competencia.ts`
  (hoje, lidos por completo): `TipoPergunta` já tem só os 4 valores exigidos
  (`likert`, `texto_aberto`, `matriz`, `pessoa`); `PesquisaResumo` e
  `Pesquisa` (detalhe) **não têm** campo `tipo` hoje — precisa ser
  adicionado aos dois.
- `frontend/src/services/pesquisasService.ts` (hoje, lido por completo):
  `CriarPesquisaPayload` não tem `tipo`; `AtualizarPesquisaPayload` já segue
  o padrão "campo ausente = não editável por este endpoint" para `status`
  (implicitamente — `status` nunca esteve nesse tipo) e documenta
  explicitamente esse mesmo critério para `cicloId` não ter restrição —
  **precedente direto a reaproveitar para `tipo`**: não adicionar o campo a
  `AtualizarPesquisaPayload`, só documentar por quê.
- `frontend/src/pages/PesquisaConstrutorPage/PesquisaConstrutorPage.tsx`
  (hoje, lido por completo, 397 linhas): modo criação (`/pesquisas/nova`,
  sem `id`) só tem `titulo`+`mensagemBoasVindas`; modo edição carrega
  `buscarPesquisa`+`listarCompetencias` em paralelo, cabeçalho com
  `titulo`+`mensagemBoasVindas`+botão "Salvar alterações", lista de
  `PaginaEditor` por página. Não passa nenhum dado de `pesquisa.tipo` para
  baixo hoje (o campo não existe ainda no tipo).
- `frontend/src/pages/PesquisaConstrutorPage/PaginaEditor.tsx` (hoje, lido
  por completo, 277 linhas): é aqui que vive o seletor de tipo de pergunta —
  `const TIPO_OPCOES: { valor: TipoPergunta; label: string }[] = [
  { valor: 'likert', ... }, { valor: 'texto_aberto', ... }, { valor: 'matriz',
  ... }, { valor: 'pessoa', label: 'Pessoa' } ]`, renderizado num `TextField
  select`. `PaginaEditorProps` não recebe `tipoPesquisa` hoje — precisa
  ganhar essa prop, propagada por `PesquisaConstrutorPage`.
- `frontend/src/components/perguntas/PerguntaCard/PerguntaCard.tsx` (hoje,
  lido por completo): **este é o precedente exato para "campo travado pós-
  criação"** pedido no requisito 1 — `pergunta.tipo` é escolhido só na
  criação (o backend não aceita `tipo` no DTO de atualização de pergunta) e,
  no construtor, é exibido como um `Chip` informativo (`TIPO_LABEL[tipo]`,
  `<Chip label={...} size="small" color="primary" variant="outlined" />`),
  **nunca** como um `Select`/campo editável — o `switch` por `pergunta.tipo`
  escolhe o editor certo, mas o tipo em si não é mais escolhível. Este
  plano reaproveita literalmente esse padrão para `pesquisa.tipo` (ver
  Decisão 4), em vez de inventar um novo critério de "campo travado".
- `frontend/src/components/pesquisas/StatusPesquisaChip/StatusPesquisaChip.tsx`,
  `frontend/src/components/ciclos/StatusCicloChip/StatusCicloChip.tsx` e
  `frontend/src/components/ciclos/StatusEnvioChip/StatusEnvioChip.tsx` (lidos
  por completo): mesmo formato nas 3 — `Chip` pequeno + mapa `CONFIG:
  Record<Enum, { label, color }>` embutido no próprio arquivo do componente
  (não um arquivo `rotulos*.ts` separado, porque cada mapa só tem um
  consumidor de fato — `rotulosTipoRelacionamento.ts` é a exceção porque tem
  2 consumidores). Precedente direto para o novo `TipoPesquisaChip` (ver
  Decisão 9).
- `frontend/src/types/ciclo.ts` (lido por completo): `TipoRelacionamento` e
  `Relacionamento` já existem aqui, reaproveitados tal qual por
  `types/envio.ts` (import cruzado já existente, mantido).
- `frontend/src/lib/apiClient.ts` (`apiFetch`/`ApiError`, com `err.codigo`
  disponível — confirmado por uso em `ColaboradorFormPage.tsx`,
  `err.codigo === 'CPF_INVALIDO'`) — reaproveitado tal qual, sem wrapper
  novo.
- `frontend/src/App.tsx`: `/pesquisas`, `/pesquisas/nova`,
  `/pesquisas/:id/editar`, `/ciclos`, `/ciclos/novo`, `/ciclos/:id` já
  existem, todas dentro do bloco `RotaProtegida
  papeis={['admin', 'gestor_rh']}` + `PainelAdminLayout` já existente. **Este
  plano não adiciona nenhuma rota nova** — todas as mudanças vivem dentro de
  páginas já protegidas.
- `frontend/package.json`: sem `@mui/icons-material`, sem lib nova a
  instalar — nenhuma dependência nova necessária para esta task (seletores
  via `TextField select`/`MenuItem`, mesmo padrão já usado em todo o
  projeto).

### Fonte de verdade do tipo de pesquisa em `CicloDetalhePage` (ponto que o pedido exige resolver explicitamente)

`GET /api/ciclos/:cicloId/envios` só informa `tipoPesquisa` de forma
assíncrona e **somente quando `envios` não está vazio** (`null` em rascunho).
Mas a página já busca `GET /api/pesquisas` (via `listarPesquisas()`) **na
mesma leva** que busca o ciclo (`Promise.all` em `carregar()`), e já calcula
`pesquisaVinculada` a partir desse array — **e, por esta task, `PesquisaResumo`
ganha o campo `tipo`** (confirmado na tabela de rotas de `task-backend.md`:
"`GET /api/pesquisas` ... Cada item da lista ganha `tipo`"). Ou seja: **o tipo
da pesquisa vinculada ao ciclo já está disponível na própria página, de forma
síncrona com o carregamento do ciclo, sem nenhuma chamada nova e sem esperar
`listarEnvios` resolver.**

Decisão (ver Decisão 1 abaixo): `CicloDetalhePage` usa
`pesquisaVinculada?.tipo` (já carregado) como fonte primária de verdade para
decidir (a) se vale a pena chamar `listarRelacionamentos` e (b) qual seção
renderizar no lugar de "Relacionamentos gerados"; usa o `tipoPesquisa` do
envelope de `listarEnvios` só como reforço/fallback para o caso residual em
que a pesquisa foi desvinculada do ciclo depois da ativação (situação que a
UI de hoje impede, mas o backend não bloqueia — já registrada como "Pergunta
em aberto" #2 em `.claude/tasks/ciclos-avaliacao/task-frontend.md`).

**Isso resolve a exigência do pedido sem precisar de nenhum campo/endpoint
novo do backend** — não há dependência de backend a registrar aqui. A única
dependência de sequenciamento é que `PesquisaResumo.tipo` precisa existir no
backend antes desta implementação ter efeito prático completo (já garantido
pelo próprio `task-backend.md`, que adiciona esse campo).

## Decisões (com justificativa)

1. **Fonte de verdade do tipo de pesquisa em `CicloDetalhePage`:
   `pesquisaVinculada?.tipo` (já carregado, síncrono com `ciclo`) com
   fallback para `tipoPesquisaEnvios` (do envelope de `listarEnvios`).**
   Justificativa detalhada na seção acima. Evita tanto uma segunda rodada de
   rede quanto um "flash" de UI em que a seção certa não pode ser decidida
   enquanto `listarEnvios` ainda está em voo.
2. **União discriminada em `types/envio.ts` via type guards exportados
   (`ehEnvioAvaliacao360`/`ehEnvioClimaGeral`), nunca via cast (`as`) nem
   campos opcionais espalhados.** Atende ao pedido explícito ("modele a
   união discriminada... de forma que o compilador force o tratamento dos
   dois braços"). `CicloDetalhePage` usa esses guards para filtrar `envios`
   antes de mapear cada tabela — o compilador impede acessar
   `avaliadorNome` num item `EnvioClimaGeralResposta` e vice-versa.
3. **Nomes dos tipos no frontend espelham literalmente os nomes usados no
   backend** (`EnvioAvaliacao360Resposta`, `EnvioClimaGeralResposta`,
   `ListarEnviosCicloResposta`, campo discriminante `origem`) — facilita
   rastrear o contrato 1:1 entre as duas tasks, mesmo critério já seguido
   pelas tasks anteriores (`Relacionamento`/`RelacionamentoResposta`,
   `Participante`/`ParticipanteResposta`, etc.).
4. **Campo `tipo` de pesquisa: seletor (`TextField select`) só na criação
   (`/pesquisas/nova`), `Chip` somente-leitura na edição — nunca um
   `Select`/campo editável em modo edição.** Reaproveita literalmente o
   padrão já existente em `PerguntaCard.tsx` para `pergunta.tipo` (ver
   "Estado atual verificado"), que é o único precedente real de "campo
   travado pós-criação" já usado no projeto — não um novo critério
   inventado para esta task. A trava é dupla: visual (Chip, não editável) e
   estrutural (o tipo não existe em `AtualizarPesquisaPayload`, então não há
   como enviá-lo mesmo com um `PUT` manual pela UI).
5. **"Pessoa" ocultada do seletor de tipo de pergunta via filtro do array
   de opções já existente em `PaginaEditor.tsx` (`TIPO_OPCOES` → filtrado
   dinamicamente), prop nova `tipoPesquisa: TipoPesquisa` propagada por
   `PesquisaConstrutorPage`.** Não duplica a lista de opções — só filtra a
   mesma constante já existente. `PesquisaConstrutorPage` já tem
   `pesquisa.tipo` disponível (state `pesquisa: Pesquisa`, buscado por
   `buscarPesquisa`), então repassar a prop não exige nenhuma chamada nova.
6. **Erro `422 TIPO_PERGUNTA_INVALIDO_PARA_PESQUISA` do backend tratado pelo
   catch genérico já existente (`err instanceof ApiError ? err.message :
   ...`), sem branch de código nova.** `handleAdicionarPergunta`/
   `handleSalvarRascunho` em `PaginaEditor.tsx` já exibem `err.message`
   literal em caso de falha — como a UI já previne a seleção de "Pessoa"
   para `clima_geral`, esse erro só chegaria em uma corrida improvável (ex.
   duas abas), e já apareceria corretamente sem nenhuma mudança de código.
   Atende ao pedido ("o frontend deve prevenir, e idealmente tratar o erro
   se ele chegar") sem inventar uma segunda camada de tratamento.
7. **"Relacionamentos gerados" nunca renderizada quando a pesquisa vinculada
   é `clima_geral`; nova seção "Participantes e envios" ocupa o lugar,
   reaproveitando a mesma tabela de envios (`envios` state) já buscada —
   filtrada por `ehEnvioClimaGeral` em vez de `ehEnvioAvaliacao360`.** Os 4
   handlers de ação (`handleCopiarLink`, `handleMarcarComoEnviado`,
   `handleRegistrarLembrete`, `handleConfirmarExpirar`) já operam só sobre
   os campos comuns da união (`id`, `status`, `link`,
   `quantidadeLembretes`) — **nenhuma mudança de assinatura** neles, só o
   texto do `ConfirmDialog` de "Expirar" precisa de um helper novo
   (`rotuloAlvoExpirar`) para descrever o alvo sem assumir
   avaliador/avaliado.
8. **Chamada a `listarRelacionamentos` pulada como otimização quando já se
   sabe, via `pesquisaVinculada?.tipo`, que é `clima_geral`** — decisão de
   performance/limpeza, não uma correção de bug (chamar sempre também
   funcionaria, o array simplesmente viria vazio, já que
   `gerarRelacionamentos` nunca roda para `clima_geral`). Em qualquer caso
   de incerteza (`pesquisaVinculada` nulo ou `avaliacao_360`), a chamada
   continua acontecendo, mesmo comportamento de hoje — registrada em
   "Perguntas em aberto" #1 porque não foi pedida explicitamente.
9. **`TipoPesquisaChip` novo componente**
   (`components/pesquisas/TipoPesquisaChip/TipoPesquisaChip.tsx`), seguindo
   exatamente o formato de `StatusPesquisaChip`/`StatusCicloChip`/
   `StatusEnvioChip` (Chip + mapa `CONFIG` embutido, um único arquivo).
   Reaproveitado em dois lugares: cabeçalho do construtor em modo edição
   (ao lado do `StatusPesquisaChip` já existente) e seção "Pesquisa
   vinculada" de `CicloDetalhePage` (ao lado do `StatusPesquisaChip` que já
   existe lá) — este segundo uso não foi pedido literalmente, mas torna
   explícito na mesma tela por que a seção abaixo mudou de comportamento
   (ver Decisão 7), evitando que o admin precise adivinhar.
10. **Nenhuma rota nova, nenhum item de menu novo, nenhuma dependência
    nova.** Todas as telas tocadas já existem e já estão atrás de
    `RotaProtegida papeis={['admin', 'gestor_rh']}` — a mudança é inteiramente
    de conteúdo dentro de páginas já protegidas.
11. **Estilização: só Tailwind (layout/espaçamento) + MUI (controles:
    `TextField select`, `Chip`, `Table`) — nenhum `.css` novo, nenhum
    `style={{}}` extenso.** Nenhum conflito MUI×Tailwind nesta task (não há
    customização de tema/paleta envolvida, só reaproveitamento de
    componentes MUI já usados no projeto).

## Guard rails (obrigatórios para o `frontend-developer` e o revisor)

Regra de negócio central do projeto: respostas de avaliadores dos tipos
`pares`/`subordinado` nunca podem ser expostas identificadas ao avaliado — só
agregadas, e só ao atingir `ciclos_avaliacao.minimoRespostasPares`. Essa
regra é **específica de `avaliacao_360` e não muda nesta task** — nenhuma
tela tocada aqui exibe respostas (só metadados estruturais de envio,
restritos a `admin`/`gestor_rh`).

- **Nenhum componente novo/editado renderiza `avaliadorNome`/`avaliadoNome`/
  `tipoRelacionamento` para um item com `origem: 'colaborador'`** — a seção
  nova "Participantes e envios" (clima) só lê `destinatario.nomeCompleto` +
  campos comuns. Confirmar via grep que `envio.avaliadorNome`/
  `envio.avaliadoNome`/`envio.tipoRelacionamento` só aparecem dentro de
  blocos já filtrados por `ehEnvioAvaliacao360` (nunca soltos num `.map`
  sobre `envios` sem filtro).
- **Nenhum cálculo/simulação de `minimoRespostasPares` aplicado a itens de
  clima** — essa dimensão não existe ali (não há sequer `tipoRelacionamento`
  para checar). Nenhuma lógica nova desta task lê `minimoRespostasPares` em
  nenhum ponto (mesma garantia já mantida pelas duas tasks anteriores).
- **`EnvioPesquisa`/`enviosPesquisaService`/`listarRelacionamentos`/
  `Relacionamento` continuam só importados dentro de `CicloDetalhePage.tsx`**
  (mais seus próprios arquivos de definição) — nenhum componente genérico
  reaproveitável por uma tela futura de `colaborador` deve importar esses
  tipos/services. `TipoPesquisaChip`, por ser puramente decorativo (recebe só
  `tipo: TipoPesquisa`), pode ser importado por qualquer tela sem risco —
  não carrega dado sensível.
- **`pesquisa.tipo` nunca é enviado em `PUT /api/pesquisas/:id`** —
  `AtualizarPesquisaPayload` não ganha o campo; confirmar por grep que
  nenhum código novo faz `atualizarPesquisa(id, { tipo: ... })`.
- **Nenhuma rota nova acessível por `colaborador`** — todas as mudanças
  vivem em páginas já atrás de `RotaProtegida papeis={['admin',
  'gestor_rh']}`.
- **Criação de pesquisa continua 100% manual** — o seletor de tipo é só mais
  um campo do formulário manual já existente, nenhum atalho de geração
  automática/IA/template introduzido.

## Plano — Frontend

### 1. frontend-developer

#### 1.1 `types/pesquisa.ts` (editado)

Adicionar, logo após `StatusPesquisa`:

```ts
/** Escolhido na criação da pesquisa (`POST /api/pesquisas`) e IMUTÁVEL depois — nunca aceito em `PUT /api/pesquisas/:id`. */
export type TipoPesquisa = 'avaliacao_360' | 'clima_geral'
```

Adicionar `tipo: TipoPesquisa` a `PesquisaResumo` (logo após `status`) e a
`Pesquisa` (detalhe completo, logo após `status`).

#### 1.2 `services/pesquisasService.ts` (editado)

- `CriarPesquisaPayload`: adicionar `tipo?: TipoPesquisa` (comentário:
  "default `'avaliacao_360'` no backend se omitido — o formulário de
  criação sempre envia explicitamente").
- `AtualizarPesquisaPayload`: **não adicionar o campo** — só estender o
  comentário já existente no topo da interface com uma linha explicando que
  `tipo` é imutável e por isso deliberadamente ausente aqui (mesmo critério
  já documentado no backend para este DTO).
- Import: adicionar `TipoPesquisa` ao `import type { ... } from
  '../types/pesquisa'` já existente.

#### 1.3 `components/pesquisas/TipoPesquisaChip/TipoPesquisaChip.tsx` (novo)

```tsx
import { Chip } from '@mui/material'
import type { TipoPesquisa } from '../../../types/pesquisa'

const CONFIG: Record<TipoPesquisa, { label: string; color: 'primary' | 'secondary' }> = {
  avaliacao_360: { label: 'Avaliação 360', color: 'primary' },
  clima_geral: { label: 'Clima e Satisfação', color: 'secondary' },
}

interface TipoPesquisaChipProps {
  tipo: TipoPesquisa
}

/**
 * `tipo` é escolhido na criação da pesquisa e IMUTÁVEL depois — este chip é
 * a representação somente-leitura usada no construtor em modo edição e na
 * seção "Pesquisa vinculada" de `CicloDetalhePage`. Mesmo critério já usado
 * por `PerguntaCard` para o tipo de pergunta: um `Chip` informativo, nunca
 * um seletor editável, uma vez que o valor já existe.
 */
export function TipoPesquisaChip({ tipo }: TipoPesquisaChipProps) {
  const { label, color } = CONFIG[tipo]
  return <Chip label={label} color={color} size="small" variant="outlined" />
}
```

Mesmo formato de `StatusPesquisaChip`/`StatusCicloChip`/`StatusEnvioChip` —
nenhum padrão novo introduzido.

#### 1.4 `pages/PesquisaConstrutorPage/PesquisaConstrutorPage.tsx` (editado)

- **Modo criação**: novo state `tipoCriacao: TipoPesquisa` (default
  `'avaliacao_360'`); novo `TextField select` "Tipo de pesquisa" entre
  "Título" e "Mensagem de boas-vindas", com as duas opções rotuladas
  exatamente como pedido:
  ```tsx
  <TextField
    select
    label="Tipo de pesquisa"
    value={tipoCriacao}
    onChange={(e) => setTipoCriacao(e.target.value as TipoPesquisa)}
    disabled={criando}
    helperText="Não pode ser alterado depois de criada."
    required
    fullWidth
  >
    <MenuItem value="avaliacao_360">Avaliação 360</MenuItem>
    <MenuItem value="clima_geral">Clima e Satisfação</MenuItem>
  </TextField>
  ```
  `handleCriar` passa a enviar `tipo: tipoCriacao` em `criarPesquisa({ ... })`.
- **Modo edição**: adicionar `<TipoPesquisaChip tipo={pesquisa.tipo} />` no
  cabeçalho, ao lado do `<StatusPesquisaChip status={pesquisa.status} />` já
  existente. Nenhum campo editável novo (o tipo nunca aparece em nenhum
  `TextField`/`Select` em modo edição).
- Propagar `tipoPesquisa={pesquisa.tipo}` para cada `<PaginaEditor ... />`
  renderizado no `.map` de páginas.
- Import novo: `TipoPesquisa` de `../../types/pesquisa`,
  `TipoPesquisaChip` de `../../components/pesquisas/TipoPesquisaChip/TipoPesquisaChip`.

#### 1.5 `pages/PesquisaConstrutorPage/PaginaEditor.tsx` (editado)

- Renomear a constante módulo-nível `TIPO_OPCOES` para `TIPO_OPCOES_BASE`
  (mesmo array, sem mudança de conteúdo).
- Nova prop `tipoPesquisa: TipoPesquisa` em `PaginaEditorProps`.
- Dentro do componente:
  ```ts
  const tipoOpcoes =
    tipoPesquisa === 'clima_geral'
      ? TIPO_OPCOES_BASE.filter((opcao) => opcao.valor !== 'pessoa')
      : TIPO_OPCOES_BASE
  ```
  Usar `tipoOpcoes.map(...)` (em vez de `TIPO_OPCOES.map(...)`) no
  `TextField select` de "Tipo de pergunta". `tipoNovaPergunta` continua
  default `'likert'` — nunca fica com um valor inválido, já que "Pessoa"
  nunca é a opção default e só é oferecida quando `tipoPesquisa ===
  'avaliacao_360'`.
- Import novo: `TipoPesquisa` de `../../types/pesquisa`.
- `PerguntaRascunhoCard.tsx` **não precisa de nenhuma mudança** — recebe o
  tipo já escolhido via prop de `PaginaEditor` (que já garante que "pessoa"
  nunca chega até lá para uma pesquisa `clima_geral`, pois a opção nem
  aparece no seletor).

#### 1.6 `types/envio.ts` (reescrito)

```ts
import type { TipoPesquisa } from './pesquisa'
import type { TipoRelacionamento } from './ciclo'

export type StatusEnvio = 'pendente' | 'enviado' | 'em_andamento' | 'concluido' | 'expirado'

interface EnvioComum {
  id: string
  status: StatusEnvio
  link: string
  quantidadeLembretes: number
  cpfConfirmadoEm: string | null
  concluidoEm: string | null
}

/**
 * Envio gerado a partir de `relacionamentos_avaliacao` (pesquisa
 * `avaliacao_360`) — dado IDENTIFICADO de quem avalia quem
 * (`avaliadorId`/`avaliadorNome`), inclusive para os tipos
 * `pares`/`subordinado`. Só pode ser consumido dentro de `CicloDetalhePage`,
 * atrás do guard de papel admin/gestor_rh.
 */
export interface EnvioAvaliacao360Resposta extends EnvioComum {
  origem: 'relacionamento'
  avaliadorId: string
  avaliadorNome: string
  avaliadoId: string
  avaliadoNome: string
  tipoRelacionamento: TipoRelacionamento
}

/**
 * Envio gerado a partir de `ciclo_participantes` (pesquisa `clima_geral`) —
 * SEM avaliador/avaliado/tipoRelacionamento (essa dimensão não existe para
 * clima). `destinatario` é identificado, mas é dado ESTRUTURAL de controle
 * de envio (quem recebeu o link), não uma resposta — mesmo critério já
 * aplicado ao braço `avaliacao_360`. NUNCA renderizar
 * avaliador/avaliado/tipoRelacionamento para um item deste braço, e NUNCA
 * aplicar a regra de anonimização de pares/subordinado aqui — essa regra é
 * exclusiva de `avaliacao_360`.
 */
export interface EnvioClimaGeralResposta extends EnvioComum {
  origem: 'colaborador'
  destinatario: { id: string; nomeCompleto: string }
}

export type EnvioPesquisa = EnvioAvaliacao360Resposta | EnvioClimaGeralResposta

/** Narrowing para o braço `avaliacao_360` — usar em vez de cast (`as`). */
export function ehEnvioAvaliacao360(envio: EnvioPesquisa): envio is EnvioAvaliacao360Resposta {
  return envio.origem === 'relacionamento'
}

/** Narrowing para o braço `clima_geral` — usar em vez de cast (`as`). */
export function ehEnvioClimaGeral(envio: EnvioPesquisa): envio is EnvioClimaGeralResposta {
  return envio.origem === 'colaborador'
}

/**
 * Resposta de `GET /api/ciclos/:cicloId/envios`. `tipoPesquisa` é `null`
 * SOMENTE quando `envios` está vazio (ciclo ainda não ativado) — nunca
 * interpretar como erro. `CicloDetalhePage` usa a pesquisa vinculada já
 * carregada como fonte primária de verdade do tipo (ver
 * `task-frontend.md`), tratando este campo como reforço/fallback.
 */
export interface ListarEnviosCicloResposta {
  tipoPesquisa: TipoPesquisa | null
  envios: EnvioPesquisa[]
}
```

#### 1.7 `services/enviosPesquisaService.ts` (editado)

```ts
import { apiFetch } from '../lib/apiClient'
import type { EnvioPesquisa, ListarEnviosCicloResposta } from '../types/envio'

/** Dado IDENTIFICADO — só pode ser consumido dentro de `CicloDetalhePage`. Ver `types/envio.ts`. */
export function listarEnvios(cicloId: string): Promise<ListarEnviosCicloResposta> {
  return apiFetch<ListarEnviosCicloResposta>(`/api/ciclos/${cicloId}/envios`)
}

/** Só aceito pelo backend com o envio em `pendente` (`409 TRANSICAO_ENVIO_INVALIDA` caso contrário). Retorna o item único, sem envelope. */
export function marcarComoEnviado(cicloId: string, envioId: string): Promise<EnvioPesquisa> {
  return apiFetch<EnvioPesquisa>(`/api/ciclos/${cicloId}/envios/${envioId}/marcar-enviado`, { method: 'PATCH' })
}

/** Só aceito pelo backend com o envio em `enviado` (`409 TRANSICAO_ENVIO_INVALIDA` caso contrário). */
export function registrarLembrete(cicloId: string, envioId: string): Promise<EnvioPesquisa> {
  return apiFetch<EnvioPesquisa>(`/api/ciclos/${cicloId}/envios/${envioId}/registrar-lembrete`, {
    method: 'PATCH',
  })
}

/** Aceito a partir de qualquer status, inclusive idempotente. */
export function expirarEnvio(cicloId: string, envioId: string): Promise<EnvioPesquisa> {
  return apiFetch<EnvioPesquisa>(`/api/ciclos/${cicloId}/envios/${envioId}/expirar`, { method: 'PATCH' })
}
```

Único ponto que muda de fato: `listarEnvios` retorna o envelope. As 3 ações
continuam retornando o item único, sem mudança de assinatura.

#### 1.8 `pages/CicloDetalhePage/CicloDetalhePage.tsx` (editado)

**Papéis com acesso**: inalterado — `admin`/`gestor_rh`, herdado do guard de
página já existente (`RotaProtegida papeis={['admin', 'gestor_rh']}` em
`App.tsx`). `colaborador` nunca alcança esta seção.

- Imports novos: `TipoPesquisa` de `../../types/pesquisa`;
  `ehEnvioAvaliacao360`, `ehEnvioClimaGeral`, `ListarEnviosCicloResposta` de
  `../../types/envio` (ao lado do `EnvioPesquisa` já importado);
  `TipoPesquisaChip` de
  `../../components/pesquisas/TipoPesquisaChip/TipoPesquisaChip`.
- Novo state: `const [tipoPesquisaEnvios, setTipoPesquisaEnvios] =
  useState<TipoPesquisa | null>(null)`.
- `carregarEnvios` atualizado para desempacotar o envelope:
  ```ts
  const carregarEnvios = useCallback(async (cicloId: string) => {
    setCarregandoEnvios(true)
    setErroEnvios(null)
    try {
      const resposta = await listarEnvios(cicloId)
      setEnvios(resposta.envios)
      setTipoPesquisaEnvios(resposta.tipoPesquisa)
    } catch (err) {
      setErroEnvios(err instanceof ApiError ? err.message : 'Não foi possível carregar os envios.')
    } finally {
      setCarregandoEnvios(false)
    }
  }, [])
  ```
- `carregar()`: computar `pesquisaDoCiclo` localmente (a partir do array
  recém-buscado `dadosPesquisas`, não do state ainda não atualizado) para
  decidir se pula `carregarRelacionamentos` (ver Decisão 8):
  ```ts
  if (dadosCiclo.status !== 'rascunho') {
    const pesquisaDoCiclo = dadosPesquisas.find((p) => p.cicloId === dadosCiclo.id) ?? null
    // Otimização: pula a chamada de relacionamentos só quando já se SABE
    // (pela pesquisa vinculada) que é clima_geral — que nunca gera
    // relacionamentos_avaliacao. Em qualquer outro caso (avaliacao_360 ou
    // incerto), continua chamando, mesmo comportamento de hoje.
    if (pesquisaDoCiclo?.tipo !== 'clima_geral') {
      carregarRelacionamentos(id)
    }
    carregarEnvios(id)
  }
  ```
- `handleConfirmarAtivar`: mesma lógica, usando o `pesquisaVinculada` já em
  memória (precisa existir para a ativação ter sido aceita pelo backend):
  ```ts
  const atualizado = await atualizarStatusCiclo(ciclo.id, 'ativo')
  setCiclo(atualizado)
  setConfirmarAtivar(false)
  if (pesquisaVinculada?.tipo !== 'clima_geral') {
    carregarRelacionamentos(ciclo.id)
  }
  carregarEnvios(ciclo.id)
  ```
- Novo valor computado, logo após os `useMemo` de `pesquisaVinculada`/
  `pesquisasCandidatas` já existentes:
  ```ts
  /**
   * Fonte de verdade do tipo de pesquisa desta página (ver "Decisões" no
   * task-frontend.md, item 1): prioriza `pesquisaVinculada` (já carregada,
   * síncrona com `ciclo`); cai para `tipoPesquisaEnvios` (do envelope de
   * `listarEnvios`, autoritativo sobre o que foi de fato gerado) só se a
   * pesquisa tiver sido desvinculada do ciclo depois da ativação — caso
   * residual que a UI de hoje não permite, mas o backend não bloqueia.
   */
  const tipoPesquisaCiclo = pesquisaVinculada?.tipo ?? tipoPesquisaEnvios

  const enviosAvaliacao360 = useMemo(() => envios.filter(ehEnvioAvaliacao360), [envios])
  const enviosClimaGeral = useMemo(() => envios.filter(ehEnvioClimaGeral), [envios])
  ```
- Seção **"Pesquisa vinculada"**: adicionar `<TipoPesquisaChip tipo=
  {pesquisaVinculada.tipo} />` logo ao lado do `<StatusPesquisaChip
  status={pesquisaVinculada.status} />` já existente, dentro do bloco
  `{pesquisaVinculada ? (...)}`.
- Seção **"Relacionamentos gerados"** (avaliação 360, existente): condição
  de renderização passa de `ciclo.status !== 'rascunho'` para
  `ciclo.status !== 'rascunho' && tipoPesquisaCiclo !== 'clima_geral'`.
  Nenhuma outra mudança nesta seção — para `avaliacao_360`, tudo continua
  exatamente como está hoje (requisito explícito do pedido).
- Seção **"Envios"** (avaliação 360, existente): mesma condição adicional
  (`tipoPesquisaCiclo !== 'clima_geral'`); usar `enviosAvaliacao360` (em vez
  de `envios`) tanto no `vazio={... enviosAvaliacao360.length === 0}` quanto
  no `.map`. Nenhuma outra mudança de coluna/lógica.
- **Nova seção "Participantes e envios"** (clima, só quando
  `ciclo.status !== 'rascunho' && tipoPesquisaCiclo === 'clima_geral'`),
  reaproveitando `Card`/`CardContent`/`TableContainer`/`Table`/`TabelaEstado`
  exatamente como as seções irmãs:
  ```tsx
  {ciclo.status !== 'rascunho' && tipoPesquisaCiclo === 'clima_geral' && (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <Typography variant="subtitle1">Participantes e envios</Typography>
        <Typography variant="body2" color="text.secondary">
          Pesquisa de clima e satisfação — não há relacionamento avaliador↔avaliado
          (essa dimensão não existe para este tipo de pesquisa). Controle manual de
          envio do link de resposta, mesmo critério da avaliação 360. Dado
          identificado — visível apenas para admin/gestor de RH.
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Colaborador</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Lembretes</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TabelaEstado
                colSpan={4}
                carregando={carregandoEnvios}
                erro={erroEnvios}
                vazio={!carregandoEnvios && !erroEnvios && enviosClimaGeral.length === 0}
                mensagemVazio="Nenhum envio gerado ainda."
                onTentarNovamente={() => carregarEnvios(ciclo.id)}
              />
              {!carregandoEnvios &&
                !erroEnvios &&
                enviosClimaGeral.map((envio) => {
                  const acaoAtual = acaoEmAndamento?.envioId === envio.id ? acaoEmAndamento.acao : null
                  return (
                    <TableRow key={envio.id} hover>
                      <TableCell>{envio.destinatario.nomeCompleto}</TableCell>
                      <TableCell>
                        <StatusEnvioChip status={envio.status} />
                      </TableCell>
                      <TableCell>{envio.quantidadeLembretes}</TableCell>
                      <TableCell align="right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button size="small" onClick={() => handleCopiarLink(envio.link)}>
                            Copiar link
                          </Button>
                          <Tooltip title={envio.status !== 'pendente' ? 'Só disponível a partir de "Pendente".' : ''}>
                            <span>
                              <Button
                                size="small"
                                disabled={envio.status !== 'pendente' || acaoAtual === 'marcar-enviado'}
                                onClick={() => handleMarcarComoEnviado(envio)}
                              >
                                {acaoAtual === 'marcar-enviado' ? 'Aguarde...' : 'Marcar como enviado'}
                              </Button>
                            </span>
                          </Tooltip>
                          <Tooltip title={envio.status !== 'enviado' ? 'Só disponível a partir de "Enviado".' : ''}>
                            <span>
                              <Button
                                size="small"
                                disabled={envio.status !== 'enviado' || acaoAtual === 'registrar-lembrete'}
                                onClick={() => handleRegistrarLembrete(envio)}
                              >
                                {acaoAtual === 'registrar-lembrete' ? 'Aguarde...' : `Lembrete (${envio.quantidadeLembretes})`}
                              </Button>
                            </span>
                          </Tooltip>
                          <Button
                            size="small"
                            color="error"
                            disabled={envio.status === 'expirado'}
                            onClick={() => {
                              setErroExpirar(null)
                              setAlvoExpirar(envio)
                            }}
                          >
                            Expirar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  )}
  ```
  `handleCopiarLink`, `handleMarcarComoEnviado`, `handleRegistrarLembrete`
  **não mudam** (já operam só sobre `id`/`status`/`link`/
  `quantidadeLembretes`, comuns aos dois braços) — reaproveitados tal qual
  desta seção nova, sem duplicar lógica.
- `ConfirmDialog` "Expirar envio": a mensagem hoje assume
  `alvoExpirar?.avaliadorNome`/`avaliadoNome`. Adicionar helper local:
  ```ts
  function rotuloAlvoExpirar(envio: EnvioPesquisa | null): string {
    if (!envio) return ''
    return ehEnvioAvaliacao360(envio)
      ? `de "${envio.avaliadorNome}" para "${envio.avaliadoNome}"`
      : `para "${envio.destinatario.nomeCompleto}"`
  }
  ```
  Mensagem passa a ser:
  ``` `Marcar o envio ${rotuloAlvoExpirar(alvoExpirar)} como expirado? Esta ação normalmente não tem volta nesta tela.` ```

#### 1.9 Fora de escopo explícito (não implementar nesta task)

- Tela pública `/responder/:token` — continua fora de escopo, nenhuma rota
  nova.
- Qualquer exibição de resposta/nota de pesquisa de clima — esta task só
  mexe em metadados estruturais de envio (colaborador destinatário,
  status), nunca em conteúdo de resposta (que nem existe como tabela ainda).
- Qualquer cálculo de `minimoRespostasPares`/anonimização aplicado a itens
  de clima — essa dimensão não existe para `clima_geral`.
- Exibir `TipoPesquisaChip` em `PesquisasListPage` (cards da listagem) — não
  pedido explicitamente; registrado em "Perguntas em aberto" como possível
  extensão futura, não implementada aqui.
- Qualquer atalho de geração automática de pesquisa por tipo (ex.: template
  pré-pronto de perguntas de clima) — criação continua 100% manual.

**Endpoints consumidos/afetados por esta task**: `POST /api/pesquisas`
(body ganha `tipo?`), `GET /api/pesquisas` (cada item ganha `tipo`),
`GET /api/pesquisas/:id` (ganha `tipo`),
`POST /api/pesquisas/:pesquisaId/paginas/:paginaId/perguntas` (pode retornar
`422 TIPO_PERGUNTA_INVALIDO_PARA_PESQUISA`, tratado genericamente),
`GET /api/ciclos/:cicloId/envios` (shape muda para o envelope),
`PATCH /api/ciclos/:cicloId/envios/:id/{marcar-enviado,registrar-lembrete,
expirar}` (item único, união discriminada). Nenhum endpoint novo.

Ao terminar: rodar `npm run build` (`tsc -b && vite build`) e `npm run lint`
(`eslint .`) dentro de `frontend/` e confirmar que ambos passam sem
erros/avisos novos antes de marcar a etapa concluída. Registrar no resumo da
etapa se `frontend/src/pages/CicloFormPage/CicloFormPage.tsx` (já aparece
modificado no `git status` antes desta task, não relacionado) foi tocado ou
não — não deveria ser, esta task não altera criação de ciclo.

### 2. frontend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **`pesquisa.tipo` nunca enviado em `PUT`**: `AtualizarPesquisaPayload`
   não ganhou o campo `tipo`; grep por `atualizarPesquisa(` não deve
   mostrar nenhum objeto com chave `tipo`.
2. **Seletor de tipo só existe em modo criação**: `PesquisaConstrutorPage`
   em modo edição nunca renderiza um `Select`/`TextField select` para
   `tipo` — só `<TipoPesquisaChip>`, somente-leitura.
3. **"Pessoa" realmente ocultada para `clima_geral`**: em `PaginaEditor`,
   com `tipoPesquisa === 'clima_geral'`, a opção "Pessoa" não aparece nas
   `MenuItem` renderizadas do seletor de tipo de pergunta — nem como opção
   visível, nem como um `case` morto acessível por outro caminho. Para
   `avaliacao_360`, as 4 opções continuam presentes (sem regressão).
4. **União discriminada usada com type guards, nunca cast**: grep por `as
   EnvioAvaliacao360Resposta`/`as EnvioClimaGeralResposta`/`(envio as any)`
   dentro de `CicloDetalhePage.tsx` — não deveria haver nenhum; toda
   distinção deve passar por `ehEnvioAvaliacao360`/`ehEnvioClimaGeral`.
5. **Nenhum dado de avaliador/avaliado renderizado para itens de clima**:
   confirmar que a seção "Participantes e envios" só lê
   `envio.destinatario.nomeCompleto` + campos comuns — nenhuma referência a
   `avaliadorNome`/`avaliadoNome`/`tipoRelacionamento` dentro do bloco
   `enviosClimaGeral.map(...)`.
6. **"Relacionamentos gerados" nunca renderizada para `clima_geral`**:
   confirmar a condição `tipoPesquisaCiclo !== 'clima_geral'` (ou
   equivalente) no `{...&& (...)}` dessa seção — e que, para
   `avaliacao_360`, o comportamento é idêntico ao anterior a esta task
   (nenhuma coluna/lógica alterada).
7. **`listarEnvios` retorna o envelope, as 3 ações `PATCH` retornam o item
   único**: confirmar assinatura em `enviosPesquisaService.ts` bate
   exatamente com isso (`Promise<ListarEnviosCicloResposta>` só para
   `listarEnvios`).
8. **`tipoPesquisaCiclo` calculado corretamente**: prioriza
   `pesquisaVinculada?.tipo`, cai para `tipoPesquisaEnvios` só quando o
   primeiro é `undefined`/`null` — nenhuma lógica adicional (ex. comparar
   os dois e alertar divergência) foi introduzida sem necessidade.
9. **Nenhum cálculo de anonimização/`minimoRespostasPares` no código novo**:
   grep por `minimoRespostasPares` dentro de `types/envio.ts`,
   `enviosPesquisaService.ts`, `TipoPesquisaChip.tsx`,
   `PaginaEditor.tsx`/`PesquisaConstrutorPage.tsx` — não deveria haver
   nenhuma ocorrência nova.
10. **Nenhuma rota nova em `App.tsx`, nenhum item novo em
    `PainelAdminLayout.tsx`** — esta task só edita conteúdo de páginas já
    existentes/protegidas.
11. **Reaproveitamento confirmado**: `TipoPesquisaChip` segue exatamente o
    formato de `StatusPesquisaChip`/`StatusCicloChip`/`StatusEnvioChip`
    (Chip + `CONFIG` embutido); `TabelaEstado`/`ConfirmDialog` usados com a
    mesma assinatura de props já existente; nenhum componente genérico novo
    de "tabela de envios" foi extraído sem necessidade (a nova seção clima
    é markup próprio dentro de `CicloDetalhePage.tsx`, mesmo critério das
    seções irmãs).
12. **Stack de estilização**: Tailwind + MUI, sem `.css` novo, sem
    `style={{}}` extenso, nenhuma dependência nova em `package.json`.
13. **Estados tratados**: a nova seção "Participantes e envios" trata
    carregando/vazio/erro via `TabelaEstado`, com `colSpan={4}` (4 colunas:
    Colaborador, Status, Lembretes, Ações) — não reaproveitando por engano o
    `colSpan={6}` da tabela irmã de avaliação 360.
14. **`frontend/src/pages/CicloFormPage/CicloFormPage.tsx` não foi tocado**
    por esta task (criação de ciclo é fora de escopo aqui) — a diferença já
    presente no `git status` antes desta task começar não deve ser
    confundida com uma mudança desta etapa.

## Perguntas em aberto

Decisões de UX/produto que os requisitos não cobriram literalmente — a
implementação segue as decisões assumidas acima, mas sinalizando aqui para
não passar despercebido (mesmo critério já usado nas 3 tasks de frontend
anteriores desta plataforma):

1. **Chamada a `listarRelacionamentos` pulada como otimização quando já se
   sabe que a pesquisa é `clima_geral`** (Decisão 8) — não foi pedido
   explicitamente; alternativa mais simples seria sempre chamar (o array
   viria vazio de qualquer forma) e decidir só a renderização. Se o usuário
   preferir a versão mais simples (sempre chamar, só filtrar o que
   renderiza), é uma troca trivial (remover o `if` em `carregar()`/
   `handleConfirmarAtivar`).
2. **`TipoPesquisaChip` exibido também em `CicloDetalhePage` (seção
   "Pesquisa vinculada"), além do construtor** — extensão pequena não
   pedida literalmente, incluída para explicar visualmente por que a seção
   abaixo muda (Decisão 9). Se o usuário preferir manter essa tela sem esse
   chip extra, é uma remoção pontual.
3. **`TipoPesquisaChip` NÃO adicionado a `PesquisasListPage`** (cards da
   listagem) — poderia ser útil para o admin distinguir pesquisas de clima
   vs. avaliação 360 na lista sem abrir cada uma, mas não foi pedido e este
   plano não o inclui para não expandir escopo. Candidato natural a uma
   iteração futura pequena, reaproveitando o mesmo componente já criado
   aqui.
4. **Texto exato da seção nova "Participantes e envios"** (título, texto de
   contexto, mensagem de vazio) foi escrito seguindo o mesmo tom das seções
   irmãs já existentes ("Relacionamentos gerados"/"Envios"), mas não foi
   fornecido pelo usuário literalmente — pode precisar de ajuste de copy
   depois de revisão de produto.
5. **Sequenciamento com o backend**: esta implementação depende de
   `PesquisasResumo.tipo`/`Pesquisa.tipo` existirem de fato na API (task
   `task-backend.md` desta mesma pasta) — se o frontend for implementado
   antes do backend, os campos `pesquisa.tipo` viriam `undefined` em tempo
   de execução (embora o TypeScript assuma `TipoPesquisa` não-opcional).
   Recomendação: implementar/mergear o backend desta feature antes ou junto
   desta etapa de frontend, não depois.

## Status — 1. frontend-developer (concluído)

Implementação seguiu literalmente o plano (seções 1.1 a 1.8) — nenhum desvio
de conteúdo funcional. O backend correspondente já estava implementado em
paralelo no working tree no momento desta implementação (`backend/src/...`
modificado, embora não commitado), então o contrato consumido é exatamente o
descrito nas seções "Decisões de modelagem" 8/9 e "1.11" de
`task-backend.md`.

### Arquivos alterados/criados

- `frontend/src/types/pesquisa.ts` (editado) — `TipoPesquisa` novo;
  `tipo: TipoPesquisa` adicionado a `PesquisaResumo` e `Pesquisa`.
- `frontend/src/services/pesquisasService.ts` (editado) — `tipo?: TipoPesquisa`
  em `CriarPesquisaPayload`; comentário adicionado a
  `AtualizarPesquisaPayload` explicando a ausência deliberada do campo
  (imutabilidade); import de `TipoPesquisa`.
- `frontend/src/components/pesquisas/TipoPesquisaChip/TipoPesquisaChip.tsx`
  (novo) — Chip somente-leitura, mesmo formato de
  `StatusPesquisaChip`/`StatusCicloChip`/`StatusEnvioChip`.
- `frontend/src/pages/PesquisaConstrutorPage/PesquisaConstrutorPage.tsx`
  (editado) — `TextField select` "Tipo de pesquisa" em modo criação (default
  `avaliacao_360`, enviado explicitamente em `handleCriar`);
  `<TipoPesquisaChip>` no cabeçalho em modo edição, ao lado de
  `StatusPesquisaChip`; `tipoPesquisa={pesquisa.tipo}` propagado a cada
  `PaginaEditor`.
- `frontend/src/pages/PesquisaConstrutorPage/PaginaEditor.tsx` (editado) —
  `TIPO_OPCOES` renomeada para `TIPO_OPCOES_BASE`; nova prop
  `tipoPesquisa: TipoPesquisa`; `tipoOpcoes` filtra "Pessoa" quando
  `tipoPesquisa === 'clima_geral'`; seletor usa `tipoOpcoes.map(...)`.
- `frontend/src/types/envio.ts` (reescrito) — união discriminada
  `EnvioAvaliacao360Resposta | EnvioClimaGeralResposta` por `origem`, type
  guards `ehEnvioAvaliacao360`/`ehEnvioClimaGeral`, envelope
  `ListarEnviosCicloResposta { tipoPesquisa, envios }`.
- `frontend/src/services/enviosPesquisaService.ts` (editado) — `listarEnvios`
  retorna `Promise<ListarEnviosCicloResposta>` (envelope); as 3 ações
  `PATCH` continuam retornando o item único `EnvioPesquisa`, sem mudança de
  assinatura.
- `frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx` (editado) —
  `tipoPesquisaEnvios` (state) + `tipoPesquisaCiclo` (computado, prioriza
  `pesquisaVinculada?.tipo`, fallback `tipoPesquisaEnvios`);
  `carregarEnvios` desempacota o envelope; `carregar()`/
  `handleConfirmarAtivar` pulam `carregarRelacionamentos` quando já se sabe
  que é `clima_geral`; `enviosAvaliacao360`/`enviosClimaGeral` (`useMemo`,
  via os type guards); seção "Relacionamentos gerados" e "Envios" ganham
  `&& tipoPesquisaCiclo !== 'clima_geral'` na condição de renderização (sem
  nenhuma outra mudança de conteúdo); nova seção "Participantes e envios"
  (`&& tipoPesquisaCiclo === 'clima_geral'`) reaproveitando os mesmos 4
  handlers de ação (`handleCopiarLink`, `handleMarcarComoEnviado`,
  `handleRegistrarLembrete`, `handleConfirmarExpirar` — nenhum mudou de
  assinatura); helper `rotuloAlvoExpirar` novo para a mensagem do
  `ConfirmDialog` de "Expirar" sem assumir avaliador/avaliado;
  `<TipoPesquisaChip>` adicionado à seção "Pesquisa vinculada".

### Desvios do plano

Nenhum. A implementação seguiu literalmente as seções 1.1–1.8 do plano,
inclusive nomes de arquivos, tipos, funções e comentários-guia sugeridos.

### Guard rails verificados (por grep, além da leitura visual)

- `avaliadorNome`/`avaliadoNome`/`tipoRelacionamento` só aparecem em
  `CicloDetalhePage.tsx` dentro de: (a) `rotuloAlvoExpirar`, atrás do guard
  `ehEnvioAvaliacao360(envio)`; (b) o `.map` de `relacionamentos` (tipo
  `Relacionamento`, não `EnvioPesquisa`); (c) o `.map` de
  `enviosAvaliacao360` (já filtrado). Nenhuma ocorrência solta sobre `envios`
  sem filtro.
- Nenhum `as EnvioAvaliacao360Resposta`/`as EnvioClimaGeralResposta`/
  `envio as any` em `CicloDetalhePage.tsx` — toda distinção passa pelos type
  guards `ehEnvioAvaliacao360`/`ehEnvioClimaGeral`.
- Nenhum `atualizarPesquisa(...)` (grep em `frontend/src`) envia `tipo` —
  só `cicloId`/`titulo`/`mensagemBoasVindas`.
- Nenhuma ocorrência nova de `minimoRespostasPares` — as únicas 5 ocorrências
  no repo (`CicloFormPage.tsx`, `CicloDadosForm.tsx`, `CiclosListPage.tsx`,
  `ciclosService.ts`, `types/ciclo.ts`) são pré-existentes, não tocadas por
  esta task.
- `frontend/src/pages/CicloFormPage/CicloFormPage.tsx` **não foi tocado**
  por esta etapa — a diferença já presente no `git status` antes desta task
  começar (`git diff --stat` mostra 2 inserções/8 remoções, inalterado desde
  o início da sessão) não é uma mudança desta etapa.
- Nenhuma rota nova em `App.tsx`, nenhum item novo em `PainelAdminLayout`,
  nenhuma dependência nova em `package.json`.

### Build / lint

- `npm run build` (`tsc -b && vite build`) dentro de `frontend/`: **passou
  sem erros**.
- `npm run lint` (`eslint .`) dentro de `frontend/`: **passou sem
  erros/avisos**.

Nenhum erro pré-existente encontrado em nenhum dos dois comandos.

## Revisão

Revisão feita lendo por completo todos os 8 arquivos tocados (novo +
alterados) contra este plano e contra o contrato de API documentado em
`task-backend.md` (Decisões 8/9, seção 1.11 com JSONs de exemplo, tabela de
rotas 1.12), e conferido também contra a implementação real de
`backend/src/modules/envios-pesquisa/envios-pesquisa.service.ts` e
`backend/src/modules/pesquisas/pesquisas.service.ts` (leitura apenas).

**Nenhum achado Crítico.** Pode prosseguir para a etapa de testes.

### Conferência do contrato de API (frontend × backend real)

- `ListarEnviosCicloResposta { tipoPesquisa: TipoPesquisa | null; envios:
  EnvioCicloResposta[] }` no frontend bate 1:1 com o tipo homônimo do
  backend, inclusive o comentário sobre `null` só quando `envios` está vazio.
- União discriminada por `origem: 'relacionamento' | 'colaborador'` idêntica
  nos dois lados; braço `avaliacao_360` com exatamente os mesmos 5 campos
  (`avaliadorId`, `avaliadorNome`, `avaliadoId`, `avaliadoNome`,
  `tipoRelacionamento`); braço `clima_geral` com o único campo
  `destinatario: { id, nomeCompleto }` — sem divergência de nome de campo em
  nenhum dos dois braços.
- Campos comuns (`id`, `status`, `link`, `quantidadeLembretes`,
  `cpfConfirmadoEm`, `concluidoEm`) idênticos nos dois lados.
- `PesquisaResumo`/`Pesquisa` do frontend batem campo a campo com
  `PesquisaRespostaLista`/`PesquisaRespostaDetalhe` do backend, incluindo a
  posição de `tipo` logo após `status`.
- As 3 ações `PATCH` (`marcar-enviado`/`registrar-lembrete`/`expirar`)
  retornam o item único (`EnvioCicloResposta`/`EnvioPesquisa`), sem o
  envelope — confirmado nos dois lados.
- Caso `tipoPesquisa: null` (envios vazio, ciclo em rascunho ou recém-
  ativado antes de `carregarEnvios` resolver): `CicloDetalhePage` usa
  `pesquisaVinculada?.tipo ?? tipoPesquisaEnvios` como fonte de verdade
  (`tipoPesquisaCiclo`), então nesse caso ela decide pela pesquisa já
  carregada em paralelo com o ciclo, nunca fica bloqueada esperando o
  envelope de envios. Em ciclo `rascunho`, nenhuma das 3 seções condicionais
  (Relacionamentos/Envios/Participantes e envios) renderiza de qualquer
  forma (`ciclo.status !== 'rascunho'` é o primeiro termo dos 3 `&&`), então
  o `null` de `tipoPesquisaCiclo` nesse estado é inofensivo. Lógica correta,
  sem regressão.

### 1. Anonimização — nenhum achado

- Nenhum item com `origem: 'colaborador'` renderiza `avaliadorNome`/
  `avaliadoNome`/`tipoRelacionamento` em nenhum lugar (confirmado por grep:
  essas 3 strings só aparecem em `CicloDetalhePage.tsx` dentro de
  `rotuloAlvoExpirar` atrás do guard `ehEnvioAvaliacao360`, no `.map` de
  `relacionamentos` — tipo `Relacionamento`, não `EnvioPesquisa` — e no
  `.map` de `enviosAvaliacao360`, já filtrado).
- Nenhum `as EnvioAvaliacao360Resposta`/`as EnvioClimaGeralResposta`/`as any`
  em `CicloDetalhePage.tsx` (grep confirmado) — toda distinção passa pelos
  type guards `ehEnvioAvaliacao360`/`ehEnvioClimaGeral`, que usam
  `envio.origem === ...` (comparação de literal, não cast).
  `PesquisaConstrutorPage.tsx`/`PaginaEditor.tsx` também não têm cast
  suspeito.
- `minimoRespostasPares` não aparece em nenhum arquivo tocado por esta task
  (grep confirmado); as 5 ocorrências existentes no repo são todas
  pré-existentes em arquivos fora do escopo desta task.
- A seção nova "Participantes e envios" só lê `envio.destinatario.nomeCompleto`
  + campos comuns — nenhuma referência a avaliador/avaliado/tipoRelacionamento
  dentro do bloco `enviosClimaGeral.map(...)`.

### 2. Controle de acesso por papel — nenhum achado

- Nenhuma rota nova em `App.tsx`, nenhum item novo em layout de admin —
  todas as seções novas vivem dentro de `CicloDetalhePage`/
  `PesquisaConstrutorPage`, já atrás de `RotaProtegida papeis={['admin',
  'gestor_rh']}`.
- As duas novas seções condicionais ("Relacionamentos gerados"/"Envios" com
  `&& tipoPesquisaCiclo !== 'clima_geral'`, "Participantes e envios" com
  `&& tipoPesquisaCiclo === 'clima_geral'`) seguem o mesmo critério de
  visibilidade das seções já existentes na página (nenhuma delas introduz um
  novo guard de papel — herdam o guard de página).

### 3. Imutabilidade do `tipo` de pesquisa — nenhum achado

- `AtualizarPesquisaPayload` não declara `tipo` (só comentário explicando a
  ausência deliberada) — confirmado por grep que nenhum dos 4 usos de
  `atualizarPesquisa(...)` no repo (`pesquisasService.ts` própria definição,
  2 chamadas em `CicloDetalhePage.tsx` para `cicloId`, 1 chamada em
  `PesquisaConstrutorPage.tsx` para `titulo`/`mensagemBoasVindas`) envia
  `tipo`.
- Seletor de `tipo` (`TextField select`) só existe no branch `!isEdicao` de
  `PesquisaConstrutorPage`; em modo edição só `<TipoPesquisaChip
  tipo={pesquisa.tipo} />`, somente-leitura — trava dupla (estrutural +
  visual) confirmada.

### 4. Convenções de estilo — nenhum achado

- Nenhum arquivo `.css` novo (`Glob` confirma que o único `.css` do projeto
  continua sendo `src/index.css`, pré-existente).
- Nenhum `style={{}}` em nenhum dos arquivos tocados (grep confirmado); os
  únicos usos de `sx={{ ... }}` são o padrão MUI já estabelecido no projeto
  (`sx={{ minWidth: ... }}`, `sx={{ width: '100%' }}` no `Alert` do
  `Snackbar`).
- Tailwind restrito a layout/espaçamento (`flex`, `gap`, `grid`), controles
  de fato via MUI (`TextField select`, `Chip`, `Table`) — sem sobreposição
  MUI×Tailwind na mesma propriedade.

### 5. Regressão em `avaliacao_360` — nenhum achado

- Seções "Relacionamentos gerados" e "Envios" só ganharam o termo adicional
  `&& tipoPesquisaCiclo !== 'clima_geral'` na condição — nenhuma coluna,
  handler ou lógica de conteúdo foi alterada nelas.
- `frontend/src/pages/CicloFormPage/CicloFormPage.tsx` não foi tocado por
  esta etapa (confirmado por grep — nenhuma ocorrência da palavra "tipo" no
  arquivo); a diferença já presente no `git status` antes desta task é
  pré-existente e não relacionada.

### Sugestão (não-bloqueante)

1. **Duplicação de markup entre as seções "Envios" (avaliação 360) e
   "Participantes e envios" (clima)**: os ~80 blocos de JSX dos 4 botões de
   ação (Copiar link / Marcar como enviado / Lembrete / Expirar, com os
   mesmos 2 `Tooltip` condicionais) em `CicloDetalhePage.tsx` são
   praticamente idênticos entre as duas seções, diferindo só nas colunas de
   identificação (avaliador/avaliado/tipo vs. destinatário). O plano já
   justificou deliberadamente não extrair um componente novo ("mesmo
   critério das seções irmãs", decisão 1.11), mas do ponto de vista de
   qualidade geral (item 5 do checklist de revisão) vale registrar como
   candidato a um `EnvioAcoesCell` compartilhado numa iteração futura, caso
   uma 3ª variante de seção apareça depois — não é um problema hoje, só uma
   observação para não perder de vista.

Nenhum outro achado (Crítico ou "Deveria corrigir") identificado.
