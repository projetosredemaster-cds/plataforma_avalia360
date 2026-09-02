# Task: Motor de envios de pesquisa (link manual, sem automação) — Frontend

Demanda de frontend (`frontend/`, equivalente ao `apps/web` citado nos
agentes/skills). Requisitos já esclarecidos diretamente pelo usuário,
inclusive a mudança de escopo confirmada (sem automação de e-mail/WhatsApp —
o admin copia o link manualmente) — sem etapa de `spec` nova (não existe e
não deve existir `.claude/tasks/envios-pesquisa/spec.md`). Este plano não
toca `backend/`. O `task-backend.md` desta mesma pasta foi lido por completo
e é a fonte do contrato de API abaixo — nenhuma rota/campo foi inventado.

## Estado atual verificado (antes do plano)

- Módulo greenfield no frontend: não existe `types/envio.ts`,
  `services/enviosPesquisaService.ts` nem `StatusEnvioChip` hoje.
- `frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx` (lido por
  completo) já é a tela de detalhe de um ciclo, com as seções "Dados do
  ciclo", "Participantes", "Pesquisa vinculada", "Ativação" e
  "Relacionamentos gerados" (esta última só renderizada quando
  `ciclo.status !== 'rascunho'`, dado identificado avaliador→avaliado→tipo,
  vive exclusivamente nesta página atrás do guard de papel). A nova seção
  "Envios" entra **nesta mesma página**, logo depois de "Relacionamentos
  gerados", seguindo exatamente o mesmo padrão visual/estrutural: `Card` +
  `CardContent`, `TableContainer`/`Table` MUI + `TabelaEstado` para
  carregando/vazio/erro, mesmo texto de aviso de dado identificado.
- Rota `/ciclos/:id` já está dentro do bloco `RotaProtegida
  papeis={['admin', 'gestor_rh']}` + `PainelAdminLayout` existente em
  `frontend/src/App.tsx` — **nenhuma rota nova é necessária** para esta task
  (a seção "Envios" é conteúdo adicional dentro de uma página já protegida,
  não uma nova página/rota).
- `frontend/src/types/ciclo.ts` e `frontend/src/services/ciclosService.ts`
  lidos por completo. `Relacionamento`/`listarRelacionamentos` é o
  precedente mais próximo: mesma natureza de dado identificado
  avaliador↔avaliado↔tipo, mesmo comentário de guard rail
  ("só pode ser consumido dentro de `CicloDetalhePage`"). `types/envio.ts`
  segue o mesmo formato de comentário.
- `frontend/src/components/ciclos/rotulosTipoRelacionamento.ts` já existe
  (`ROTULOS_TIPO_RELACIONAMENTO: Record<TipoRelacionamento, string>`) —
  **reaproveitado tal qual** para a coluna "Tipo" da nova tabela de envios,
  nenhum mapa novo/duplicado para isso.
- `frontend/src/components/ciclos/StatusCicloChip/StatusCicloChip.tsx` lido
  por completo — precedente direto e único a seguir para o novo
  `StatusEnvioChip`: `Chip` MUI pequeno, mapa interno `CONFIG: Record<Status,
  { label, color }>` declarado dentro do próprio arquivo do componente (não
  um arquivo `rotulos*.ts` separado — `StatusCicloChip` não usa esse padrão,
  só `rotulosTipoRelacionamento.ts` o usa, porque aquele mapa é reaproveitado
  por duas tabelas diferentes na mesma página; o mapa de status de envio só é
  usado dentro do próprio chip, então fica embutido nele, mesmo critério de
  `StatusCicloChip`).
- `frontend/src/components/ConfirmDialog/ConfirmDialog.tsx` e
  `frontend/src/components/TabelaEstado/TabelaEstado.tsx` lidos por
  completo — reaproveitados tal qual (`ConfirmDialog` só para a ação
  "Expirar", ver decisão abaixo; `TabelaEstado` para os 3 estados da nova
  tabela).
- `frontend/src/lib/apiClient.ts` (`apiFetch`/`ApiError`) lido por completo
  — reaproveitado, sem lógica de negócio no service novo.
- `frontend/package.json` confirmado: sem `@mui/icons-material`, sem lib de
  clipboard. Botões de ação usam texto (ex. "Copiar link"), não ícone. Cópia
  usa a Clipboard API nativa do navegador
  (`navigator.clipboard.writeText`), com tratamento de falha (o método pode
  rejeitar em contexto não seguro ou sem permissão) caindo num `Snackbar` de
  erro em vez de estourar uma exceção não tratada.
- `Snackbar` de feedback assíncrono já é usado em `CicloDetalhePage`
  (`snackbar`/`setSnackbar`, string simples, sempre `severity="info"`, ex.:
  "Nenhum colaborador novo foi adicionado desta equipe."). Esta task
  **generaliza esse estado** para suportar severidade (`'success' | 'info' |
  'error'`), porque agora há 3 casos: "Link copiado." (sucesso), o aviso de
  equipe já existente (info) e falha de uma ação de envio disparada sem
  `ConfirmDialog` (erro) — ver decisão de erro abaixo. É uma pequena edição
  do estado existente, não uma feature nova paralela.
- Nenhuma página pública `/responder/:token` existe nem é criada por esta
  task (confirmado: não há rota assim em `App.tsx`, e o pedido do usuário
  explicita que é item futuro do roadmap). O botão "Copiar link" nunca
  navega — só copia a string `link` que a API já devolve pronta.

## Contrato de API consumido (confirmado contra `task-backend.md`)

Base: `import.meta.env.VITE_API_URL`, via `apiFetch` (injeta `Authorization:
Bearer <token>`). Casing camelCase em toda requisição/resposta, mesmo padrão
de `ciclos-avaliacao`/`ciclo-participantes`.

### `envios-pesquisa` (novo, sub-recurso `/api/ciclos/:cicloId/envios...`)

| Método | Rota | Papéis | Request (body) | Sucesso | Erros específicos |
|---|---|---|---|---|---|
| GET | `/api/ciclos/:cicloId/envios` | admin, gestor_rh | — | `200 EnvioCicloResposta[]` | `404 CICLO_NAO_ENCONTRADO` |
| PATCH | `/api/ciclos/:cicloId/envios/:id/marcar-enviado` | admin, gestor_rh | — | `200 EnvioCicloResposta` | `404 CICLO_NAO_ENCONTRADO`, `404 ENVIO_NAO_ENCONTRADO`, `409 TRANSICAO_ENVIO_INVALIDA` (status atual ≠ `pendente`) |
| PATCH | `/api/ciclos/:cicloId/envios/:id/registrar-lembrete` | admin, gestor_rh | — | `200 EnvioCicloResposta` (`quantidadeLembretes` incrementado) | `404 CICLO_NAO_ENCONTRADO`, `404 ENVIO_NAO_ENCONTRADO`, `409 TRANSICAO_ENVIO_INVALIDA` (status atual ≠ `enviado`) |
| PATCH | `/api/ciclos/:cicloId/envios/:id/expirar` | admin, gestor_rh | — | `200 EnvioCicloResposta` (`status: "expirado"`) | `404 CICLO_NAO_ENCONTRADO`, `404 ENVIO_NAO_ENCONTRADO` |

Nenhuma das 4 rotas recebe corpo de requisição (nem as 3 ações `PATCH`).
Nenhuma delas dispara e-mail/WhatsApp/notificação real — `marcar-enviado` e
`registrar-lembrete` são só contadores/flags de controle manual, atualizados
pelo admin depois de compartilhar o link por fora do sistema.

`EnvioCicloResposta` (usado nas 4 rotas — listagem retorna array, as 3 ações
retornam o item único atualizado):
```json
{
  "id": "uuid",
  "avaliadorId": "uuid",
  "avaliadorNome": "string",
  "avaliadoId": "uuid",
  "avaliadoNome": "string",
  "tipoRelacionamento": "autoavaliacao | gestor | pares | subordinado | externo",
  "status": "pendente | enviado | em_andamento | concluido | expirado",
  "link": "{FRONTEND_URL}/responder/{token_acesso}",
  "quantidadeLembretes": 0,
  "cpfConfirmadoEm": "ISO 8601 | null (sempre null nesta task)",
  "concluidoEm": "ISO 8601 | null (sempre null nesta task)"
}
```

**`link` já vem pronto da API** (`{FRONTEND_URL}/responder/{token_acesso}`,
montado no backend com `env.frontendUrl`) — o frontend nunca monta essa URL,
nunca lê `token_acesso` cru para concatenar nada, nunca depende de uma
`VITE_FRONTEND_URL` que não existe. Isso resolve por completo a ambiguidade
"token cru vs. URL pronta" levantada no pedido: é sempre URL pronta.

Esta task **nunca produz nem trata** `status: 'em_andamento'` ou
`'concluido'` como um caso alcançável pela UI (nenhuma das 3 ações desta
task escreve esses valores — reservados para a futura página
`/responder`). O tipo `StatusEnvio`/`StatusEnvioChip` ainda cobrem os 5
valores (o mesmo enum retornado pela API), por consistência de tipo com o
backend e para não quebrar se um envio futuro chegar nesses estados, mas
nenhum botão de ação desta task assume que esses dois valores sejam
alcançáveis agora.

Nenhuma rota desta task expõe `itens_resposta`/respostas — confirmado por
leitura do `task-backend.md` (nenhuma das duas tabelas existe ainda; a rota
de listagem só faz `JOIN` estrutural com `relacionamentos_avaliacao` e
`colaboradores`).

## Aviso de anonimização (obrigatório para o `frontend-developer` e o revisor)

`GET /api/ciclos/:cicloId/envios` retorna **quem avalia quem, identificado**
(`avaliadorId`/`avaliadorNome`, `avaliadoId`/`avaliadoNome`), inclusive para
os tipos `pares`/`subordinado` — exatamente a mesma natureza de dado que
`GET /api/ciclos/:id/relacionamentos` já expõe hoje em
`CicloDetalhePage`, com metadados de controle de envio a mais (status,
link, contadores). Isso é aceitável **apenas** porque:

1. Esta seção não expõe nenhuma resposta/nota — só o vínculo estrutural
   avaliador↔avaliado↔tipo mais metadados de controle de envio (status do
   link, quantas vezes foi lembrado). A regra de anonimização do projeto
   protege **respostas** de `pares`/`subordinado`, não a existência do
   relacionamento/envio em si, e só protege da pessoa **avaliada**, não de
   RH/admin.
2. A tabela de envios só pode viver dentro de `CicloDetalhePage`, atrás de
   `RotaProtegida papeis={['admin', 'gestor_rh']}` já existente — **nunca**
   extraída para um componente genérico reaproveitável por uma tela futura
   de colaborador (ex. uma futura "meus envios pendentes"). `EnvioPesquisa`
   (tipo) e `enviosPesquisaService.ts` só devem ser importados por
   `CicloDetalhePage.tsx`, mesma garantia já aplicada a
   `Relacionamento`/`listarRelacionamentos`.
3. O `link` (URL com `token_acesso`) é um capability token de acesso público
   à futura página `/responder` — não é, em si, um dado de resposta, mas
   ainda assim só é exibido/copiável dentro dessa mesma tela protegida,
   nunca logado no console nem exposto em nenhum outro lugar do frontend.
4. Nenhum componente desta task junta a tabela de envios com nenhum dado de
   resposta — não existe endpoint de resposta ainda, garantido por
   construção, mas fica registrado explicitamente para quando esse módulo
   futuro existir.
5. Nenhum cálculo de anonimização/mínimo de respostas no frontend: esta
   task não lê nem usa `ciclo.minimoRespostasPares` em nenhuma lógica da
   seção "Envios" — só exibe status/contadores de controle de envio, nunca
   deriva "quantas pessoas já responderam" ou qualquer aproximação disso
   (essa informação nem existe no shape retornado).

## Plano — Frontend

### 1. frontend-developer — CONCLUÍDA

Implementado exatamente conforme o plano abaixo (1.1–1.6), sem desvios de
escopo. Resumo:

- **Tipos/service novos (1.1)**: `frontend/src/types/envio.ts` (novo,
  `StatusEnvio`, `EnvioPesquisa`); `frontend/src/services/enviosPesquisaService.ts`
  (novo, `listarEnvios`, `marcarComoEnviado`, `registrarLembrete`,
  `expirarEnvio` — nenhuma das 4 envia body).
- **Componente novo (1.2)**: `frontend/src/components/ciclos/StatusEnvioChip/StatusEnvioChip.tsx`
  (novo, mesmo formato de `StatusCicloChip`, mapa `CONFIG` embutido). Coluna
  "Tipo" da nova tabela reaproveita `ROTULOS_TIPO_RELACIONAMENTO`
  (`components/ciclos/rotulosTipoRelacionamento.ts`), sem mapa duplicado.
- **Seção "Envios" em `CicloDetalhePage` (1.3)**: `frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx`
  (editado) — nova seção `Card`/`CardContent` logo após "Relacionamentos
  gerados", só renderizada quando `ciclo.status !== 'rascunho'`, com
  `carregarEnvios` disparado lado a lado com `carregarRelacionamentos` (em
  `carregar()` e em `handleConfirmarAtivar`, cada uma com seu próprio estado
  de loading/erro). Tabela com colunas Avaliador/Avaliado/Tipo/Status
  (`StatusEnvioChip`)/Lembretes/Ações, `TabelaEstado` para os 3 estados,
  `colSpan={6}`. As 3 ações (`marcarComoEnviado`/`registrarLembrete`/
  `expirarEnvio`) atualizam só a linha correspondente via `.map` por `id`,
  sem refetch. "Marcar como enviado" habilitado só a partir de `pendente`,
  "Registrar lembrete" só a partir de `enviado` (rótulo com contador,
  `` Lembrete (${quantidadeLembretes}) ``), ambos com `Tooltip` quando
  desabilitados e sem `ConfirmDialog` (loading granular via
  `acaoEmAndamento`, erro em `Snackbar`). "Expirar" habilitado para
  qualquer status exceto `expirado`, atrás de `ConfirmDialog` (erro exibido
  na prop `erro` do dialog). Botão "Copiar link" (`handleCopiarLink`) usa
  `navigator.clipboard.writeText` nativo com tratamento de rejeição —
  nunca navega para o link.
- **Generalização do `Snackbar` (1.4)**: estado `snackbar` alterado de
  `string | null` para `{ mensagem: string; severidade: 'success' | 'info' |
  'error' } | null`; único call site existente (aviso de equipe sem
  colaborador novo) atualizado para `severidade: 'info'`, comportamento
  visual inalterado; `Snackbar`/`Alert` renderizados com
  `snackbar.severidade`.
- **`ConfirmDialog` "Expirar envio" (1.5)**: novo estado
  `alvoExpirar`/`expirando`/`erroExpirar`, mesmo padrão de
  `alvoRemoverParticipante`.
- Nenhum arquivo de rota novo, nenhuma dependência nova em `package.json`.
  Nada do escopo 1.6 ("fora de escopo explícito") foi implementado: sem
  rota `/responder/:token`, sem disparo real de e-mail/WhatsApp, sem
  cálculo de `minimoRespostasPares` no frontend (confirmado por grep, zero
  ocorrências no código novo), sem lembrete automático agendado.

Confirmado por grep: `EnvioPesquisa`, `enviosPesquisaService` e
`StatusEnvioChip` só são referenciados a partir de
`CicloDetalhePage.tsx` (além de seus próprios arquivos de definição) —
mesma garantia já aplicada a `Relacionamento`/`listarRelacionamentos`.

`npm run build` (`tsc -b && vite build`) e `npm run lint` (`eslint .`)
rodados dentro de `frontend/` sem erros.

Observação: `frontend/src/pages/CicloFormPage/CicloFormPage.tsx` já
aparecia como modificado no `git status` antes desta task começar (não
relacionado a envios) — não foi tocado/revertido por mim.

### 1. frontend-developer

#### 1.1 Tipos e service novos

- `frontend/src/types/envio.ts` (novo):
  ```ts
  import type { TipoRelacionamento } from './ciclo'

  export type StatusEnvio = 'pendente' | 'enviado' | 'em_andamento' | 'concluido' | 'expirado'

  /**
   * Dado IDENTIFICADO de quem avalia quem (`avaliadorId`/`avaliadorNome`),
   * inclusive para os tipos `pares`/`subordinado`, mais metadados de
   * controle de envio (status do link, contador de lembretes). Só pode ser
   * consumido dentro de `CicloDetalhePage`, atrás do guard de papel
   * admin/gestor_rh — nunca em uma tela alcançável por `colaborador`. Ver
   * aviso de anonimização em `.claude/tasks/envios-pesquisa/task-frontend.md`.
   * `link` já vem pronto da API (`{FRONTEND_URL}/responder/{token}`) — nunca
   * montado no frontend.
   */
  export interface EnvioPesquisa {
    id: string
    avaliadorId: string
    avaliadorNome: string
    avaliadoId: string
    avaliadoNome: string
    tipoRelacionamento: TipoRelacionamento
    status: StatusEnvio
    link: string
    quantidadeLembretes: number
    cpfConfirmadoEm: string | null
    concluidoEm: string | null
  }
  ```
- `frontend/src/services/enviosPesquisaService.ts` (novo):
  ```ts
  import { apiFetch } from '../lib/apiClient'
  import type { EnvioPesquisa } from '../types/envio'

  /** Dado IDENTIFICADO — só pode ser consumido dentro de `CicloDetalhePage`. Ver `types/envio.ts`. */
  export function listarEnvios(cicloId: string): Promise<EnvioPesquisa[]> {
    return apiFetch<EnvioPesquisa[]>(`/api/ciclos/${cicloId}/envios`)
  }

  /** Só aceito pelo backend com o envio em `pendente` (`409 TRANSICAO_ENVIO_INVALIDA` caso contrário). */
  export function marcarComoEnviado(cicloId: string, envioId: string): Promise<EnvioPesquisa> {
    return apiFetch<EnvioPesquisa>(`/api/ciclos/${cicloId}/envios/${envioId}/marcar-enviado`, { method: 'PATCH' })
  }

  /** Só aceito pelo backend com o envio em `enviado` (`409 TRANSICAO_ENVIO_INVALIDA` caso contrário). */
  export function registrarLembrete(cicloId: string, envioId: string): Promise<EnvioPesquisa> {
    return apiFetch<EnvioPesquisa>(`/api/ciclos/${cicloId}/envios/${envioId}/registrar-lembrete`, {
      method: 'PATCH',
    })
  }

  /** Aceito a partir de qualquer status (conforme contrato do backend), inclusive idempotente. */
  export function expirarEnvio(cicloId: string, envioId: string): Promise<EnvioPesquisa> {
    return apiFetch<EnvioPesquisa>(`/api/ciclos/${cicloId}/envios/${envioId}/expirar`, { method: 'PATCH' })
  }
  ```
  Nenhuma das 4 funções recebe/envia body (mesmo critério de
  `atualizarStatusCiclo`, que envia body, vs. estas, que não enviam — refletir
  isso literalmente, sem `body: {}` supérfluo). Padrão fino, sem lógica de
  negócio, mesmo critério de `ciclosService.ts`.

#### 1.2 Componente novo: `StatusEnvioChip`

- `frontend/src/components/ciclos/StatusEnvioChip/StatusEnvioChip.tsx`
  (novo), mesmo formato de `StatusCicloChip`:
  ```ts
  import { Chip } from '@mui/material'
  import type { StatusEnvio } from '../../../types/envio'

  const CONFIG: Record<StatusEnvio, { label: string; color: 'default' | 'info' | 'primary' | 'success' | 'error' }> = {
    pendente: { label: 'Pendente', color: 'default' },
    enviado: { label: 'Enviado', color: 'primary' },
    em_andamento: { label: 'Em andamento', color: 'info' },
    concluido: { label: 'Concluído', color: 'success' },
    expirado: { label: 'Expirado', color: 'error' },
  }

  interface StatusEnvioChipProps {
    status: StatusEnvio
  }

  /**
   * `em_andamento`/`concluido` nunca são produzidos por esta task (reservados
   * para a futura página `/responder`), mas o mapa cobre os 5 valores do
   * enum do backend por completude de tipo — não é um sinal de que a UI
   * trata esses 2 casos como alcançáveis hoje.
   */
  export function StatusEnvioChip({ status }: StatusEnvioChipProps) {
    const { label, color } = CONFIG[status]
    return <Chip label={label} color={color} size="small" />
  }
  ```
- Coluna "Tipo" da nova tabela reaproveita `ROTULOS_TIPO_RELACIONAMENTO`
  (`components/ciclos/rotulosTipoRelacionamento.ts`), já existente — nenhum
  mapa novo/duplicado.

#### 1.3 Seção "Envios" dentro de `CicloDetalhePage`

Toda a implementação vive em `frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx`
(editado) — nenhum arquivo de página novo, nenhuma rota nova.

- **Papéis com acesso**: `admin` e `gestor_rh`, sem diferença de
  comportamento entre os dois — herdado do guard de página já existente
  (`RotaProtegida papeis={['admin', 'gestor_rh']}` em `App.tsx`,
  inalterado). `colaborador` nunca alcança esta seção porque nunca alcança
  a página.
- **Quando é buscada/exibida**: mesma condição de "Relacionamentos
  gerados" — `ciclo.status !== 'rascunho'`. Justificativa confirmada contra
  `task-backend.md`: `envios_pesquisa` é gerado na **mesma transação** que
  `relacionamentos_avaliacao`, disparada só na transição
  `rascunho → ativo` (`gerarEnviosPesquisa`, chamada logo após
  `gerarRelacionamentos` dentro de `atualizarStatus`). Ou seja, envios
  nunca existem enquanto o ciclo está em rascunho — replicar exatamente a
  mesma lógica de "seção oculta em rascunho, chamada disparada junto com
  `carregarRelacionamentos`" já usada para relacionamentos, inclusive
  disparando `carregarEnvios(id)` no mesmo ponto em que
  `handleConfirmarAtivar` já dispara `carregarRelacionamentos(ciclo.id)`
  após a ativação ter sucesso.
- Novo estado, mesmo padrão de `relacionamentos`/`carregandoRelacionamentos`/`erroRelacionamentos`:
  ```ts
  const [envios, setEnvios] = useState<EnvioPesquisa[]>([])
  const [carregandoEnvios, setCarregandoEnvios] = useState(false)
  const [erroEnvios, setErroEnvios] = useState<string | null>(null)

  const carregarEnvios = useCallback(async (cicloId: string) => {
    setCarregandoEnvios(true)
    setErroEnvios(null)
    try {
      const dados = await listarEnvios(cicloId)
      setEnvios(dados)
    } catch (err) {
      setErroEnvios(err instanceof ApiError ? err.message : 'Não foi possível carregar os envios.')
    } finally {
      setCarregandoEnvios(false)
    }
  }, [])
  ```
  Chamado em `carregar()` no mesmo `if (dadosCiclo.status !== 'rascunho')`
  que já chama `carregarRelacionamentos(id)` (as duas chamadas convivem lado
  a lado, não uma dentro da outra — se uma falhar, a outra ainda deve
  aparecer normalmente, já que cada uma tem seu próprio estado de
  erro/loading, mesmo critério de tabelas independentes na mesma página) e
  em `handleConfirmarAtivar` logo depois de `carregarRelacionamentos(ciclo.id)`.
- **Estado local após cada ação** (decisão: local, sem refetch da lista
  inteira — mesmo critério econômico já usado para
  adicionar/remover participante): as 3 ações (`marcarComoEnviado`,
  `registrarLembrete`, `expirarEnvio`) retornam o **item único atualizado**
  (`EnvioCicloResposta`, não a lista completa — diferente de
  `adicionarParticipantesIndividual`/`adicionarParticipantesPorEquipe`, que
  retornam a lista completa). A página substitui só a linha correspondente:
  ```ts
  setEnvios((prev) => prev.map((e) => (e.id === atualizado.id ? atualizado : e)))
  ```
  Nenhuma das 3 ações dispara um novo `GET /api/ciclos/:cicloId/envios`.
- **Confirmação por ação (decisão explícita, com justificativa)**:
  - **"Marcar como enviado" e "Registrar lembrete": sem `ConfirmDialog`,
    ação de um clique com loading local no próprio botão.** Justificativa:
    são atualizações de baixo risco e não-destrutivas — só avançam um
    contador/flag de controle que o próprio admin já sabe que está fazendo
    (ele acabou de copiar o link ou de reforçar o pedido por fora do
    sistema); um clique indevido em "Registrar lembrete" não corrompe nada
    que não possa ser ignorado (é só um contador informativo), e "Marcar
    como enviado" é uma transição de estado que o backend já valida
    (`409 TRANSICAO_ENVIO_INVALIDA` fora de `pendente`), então um duplo
    clique acidental falha de forma segura, não silenciosa.
  - **"Expirar": com `ConfirmDialog`.** Justificativa: ao contrário das
    outras duas, esta ação não tem um caminho de volta na UI desta task
    (não existe um botão "reativar envio" nem ele foi pedido) e o backend a
    aceita a partir de **qualquer** status, inclusive sem qualquer
    pré-condição — ou seja, é a ação com maior potencial de clique
    acidental causar um efeito real e persistente. Mesmo critério já usado
    no projeto para "Excluir equipe"/"Remover participante"/"Encerrar
    ciclo" (ações sem volta fácil, sempre atrás de `ConfirmDialog`).
  - Ambas as alternativas ficam registradas aqui explicitamente porque essa
    granularidade (quais das 3 ações merecem confirmação) não foi
    especificada literalmente no pedido — se o usuário preferir
    `ConfirmDialog` também em "Marcar como enviado"/"Registrar lembrete",
    ou preferir um clique direto também em "Expirar", é uma troca de
    critério pontual sobre esta seção, sinalizada de novo em "Perguntas em
    aberto".
- **Botão "Copiar link"**: um clique, sem `ConfirmDialog` (ação
  não-destrutiva, só lê a área de transferência do próprio navegador).
  ```ts
  async function handleCopiarLink(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setSnackbar({ mensagem: 'Link copiado.', severidade: 'success' })
    } catch {
      setSnackbar({
        mensagem: 'Não foi possível copiar o link automaticamente. Copie manualmente.',
        severidade: 'error',
      })
    }
  }
  ```
  Nunca navega (`navigate`/`window.location`/`<a href>` para o link) —
  só copia a string. `/responder/:token` não existe como rota nesta task
  nem em nenhuma outra já implementada.
- **Loading por ação/linha** (evita bloquear a tabela inteira por uma ação
  pontual, mesmo critério de "salvando" local em participantes):
  ```ts
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<{
    envioId: string
    acao: 'marcar-enviado' | 'registrar-lembrete'
  } | null>(null)
  ```
  Cada botão fica desabilitado (com texto "Aguarde..." ou spinner pequeno)
  só enquanto `acaoEmAndamento` corresponde à sua própria linha+ação; as
  outras linhas/botões continuam clicáveis. "Expirar" usa o `carregando` do
  próprio `ConfirmDialog` (mesmo padrão de `removendoParticipante`/
  `ativando`/`encerrando`), não este estado.
- **Erros da API por ação (decisão explícita)**:
  - "Marcar como enviado"/"Registrar lembrete" (sem dialog): erro exibido
    via `Snackbar severity="error"` (reaproveitando o mesmo estado
    `snackbar` generalizado, ver 1.4) — não há um lugar natural "inline na
    linha" sem redesenhar a tabela, e um `Alert` fixo no topo da seção
    ficaria destacado demais para uma falha pontual e recuperável (o
    usuário pode simplesmente tentar de novo). Mensagem literal da API
    (`err.message`) quando disponível.
  - "Expirar" (com dialog): erro exibido **dentro do `ConfirmDialog`**, via
    a prop `erro` já suportada pelo componente — mesmo padrão de
    `alvoRemoverParticipante`/`confirmarAtivar`/`confirmarEncerrar`, sem
    fechar o dialog silenciosamente.
  - Erro de **carregamento** da lista inteira (`GET`) segue o padrão de
    `erroRelacionamentos`: exibido dentro da própria tabela via
    `TabelaEstado` (`erro` + botão "Tentar novamente" que rechama
    `carregarEnvios(ciclo.id)`), não um `Alert` solto.
- **Tabela** (`Table` MUI + `TabelaEstado`, dentro de `Card`/`CardContent`,
  mesma composição visual de "Relacionamentos gerados"):
  - Texto de contexto no topo da seção, mesmo espírito do já usado em
    "Relacionamentos gerados": "Controle manual de envio do link de
    resposta — o link é copiado e compartilhado pelo admin fora da
    plataforma (e-mail, WhatsApp, etc.); esta tela só registra o status.
    Dado identificado — visível apenas para admin/gestor de RH."
  - Colunas: Avaliador, Avaliado, Tipo (via `ROTULOS_TIPO_RELACIONAMENTO`),
    Status (`StatusEnvioChip`), Lembretes (`quantidadeLembretes`, número
    puro), Ações.
  - Coluna Ações, por linha:
    - Botão "Copiar link" — sempre habilitado, qualquer status.
    - Botão "Marcar como enviado" — habilitado só quando
      `envio.status === 'pendente'` (oculto ou desabilitado com `Tooltip`
      explicando o motivo fora disso — usar o mesmo critério de `Tooltip`
      em botão desabilitado já usado no botão "Ativar ciclo", não ocultar
      silenciosamente, para deixar claro que a transição só é válida a
      partir de `pendente`).
    - Botão "Registrar lembrete" — habilitado só quando
      `envio.status === 'enviado'`, mesmo critério de `Tooltip` acima.
      Rótulo do botão inclui o contador atual, ex.: `` `Lembrete
      (${envio.quantidadeLembretes})` ``, conforme pedido explícito do
      usuário ("mostra o contador `quantidadeLembretes`").
    - Botão "Expirar" — habilitado para qualquer status **exceto** quando
      `envio.status === 'expirado'` (decisão de UX, não imposta pelo
      backend — ver "Perguntas em aberto"; evita um clique sem efeito
      prático nenhum, já que o próprio backend trata a repetição como
      idempotente, mas a UI não precisa oferecer um botão que sabidamente
      não muda nada).
  - `colSpan` para `TabelaEstado` = 6 (mesmo número de colunas da tabela).
  - Mensagem de vazio: "Nenhum envio gerado ainda." (só alcançável em
    teoria — todo ciclo fora de rascunho tem ao menos os envios gerados
    junto com os relacionamentos, mas usar a mesma defesa que
    "Relacionamentos gerados" já usa para o caso simétrico).
  - Sem paginação (mesmo critério conservador já usado para
    "Relacionamentos gerados" — não antecipar volume).

#### 1.4 Generalização do `Snackbar` existente (edição pontual)

- Estado atual: `const [snackbar, setSnackbar] = useState<string | null>(null)`,
  sempre renderizado com `severity="info"`.
- Novo estado:
  ```ts
  const [snackbar, setSnackbar] = useState<{ mensagem: string; severidade: 'success' | 'info' | 'error' } | null>(
    null,
  )
  ```
- Único call site existente (`handleAdicionarEquipe`, aviso "Nenhum
  colaborador novo...") atualizado para
  `setSnackbar({ mensagem: '...', severidade: 'info' })` — comportamento
  visual inalterado para esse caso (continua `severity="info"`).
- Renderização do `Snackbar` atualizada para usar `snackbar.severidade` em
  vez de um valor fixo:
  ```tsx
  {snackbar && (
    <Snackbar open autoHideDuration={5000} onClose={() => setSnackbar(null)}>
      <Alert severity={snackbar.severidade} onClose={() => setSnackbar(null)} sx={{ width: '100%' }}>
        {snackbar.mensagem}
      </Alert>
    </Snackbar>
  )}
  ```
- Esta é a única mudança fora da seção "Envios" propriamente dita —
  registrada aqui explicitamente para não passar despercebida na revisão.

#### 1.5 `ConfirmDialog` novo: "Expirar envio"

- Mesmo padrão de `alvoRemoverParticipante`:
  ```ts
  const [alvoExpirar, setAlvoExpirar] = useState<EnvioPesquisa | null>(null)
  const [expirando, setExpirando] = useState(false)
  const [erroExpirar, setErroExpirar] = useState<string | null>(null)
  ```
  Mensagem: `` `Marcar o envio de "${alvoExpirar?.avaliadorNome}" para "${alvoExpirar?.avaliadoNome}" como
  expirado? Esta ação normalmente não tem volta nesta tela.` `` — sem
  afirmar que o link para de funcionar de fato (essa validação é da futura
  página `/responder`, fora do escopo desta task; a UI não deve prometer um
  comportamento que o backend ainda não implementa).
- `onConfirmar` chama `expirarEnvio(ciclo.id, alvoExpirar.id)`, sucesso
  atualiza a linha local (1.3) e fecha o dialog; erro fica dentro do dialog
  via prop `erro`.

#### 1.6 Fora de escopo explícito (não implementar nesta task)

- Página pública `/responder/:token` — item futuro do roadmap, mencionado
  aqui só para deixar explícito que nenhuma rota, componente ou link de
  navegação para ela deve ser criado.
- Qualquer disparo real de e-mail/WhatsApp/notificação — as 4 rotas
  consumidas são só leitura/controle manual de estado, nunca uma
  integração de envio de verdade.
- Qualquer cálculo de "quantas pessoas já responderam"/comparação com
  `ciclo.minimoRespostasPares` — não existe no shape de `EnvioPesquisa`,
  não deve ser inferido/estimado no frontend.
- Reenvio automático/lembrete automático agendado — "Registrar lembrete" é
  sempre um clique manual do admin, nunca um timer/cron no frontend.

**Endpoints consumidos por esta seção**: `GET /api/ciclos/:cicloId/envios`,
`PATCH /api/ciclos/:cicloId/envios/:id/marcar-enviado`,
`PATCH /api/ciclos/:cicloId/envios/:id/registrar-lembrete`,
`PATCH /api/ciclos/:cicloId/envios/:id/expirar` (mais os endpoints já
existentes da página, inalterados).

### 2. frontend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Controle de acesso**: a seção "Envios" só é renderizada dentro de
   `CicloDetalhePage`, que continua atrás de `RotaProtegida
   papeis={['admin', 'gestor_rh']}` em `App.tsx` — confirmar que nenhuma
   rota nova foi adicionada e que nenhuma chamada a
   `listarEnvios`/`marcarComoEnviado`/`registrarLembrete`/`expirarEnvio`
   dispara fora dessa página.
2. **Dado identificado só nesta página**: `EnvioPesquisa`
   (`types/envio.ts`) e `enviosPesquisaService.ts` só são importados por
   `CicloDetalhePage.tsx` — confirmar via grep, mesma garantia já aplicada
   a `Relacionamento`/`listarRelacionamentos`. Nenhum componente genérico
   (`StatusEnvioChip` incluso) deveria vazar `avaliadorNome`/`avaliadoNome`
   para fora — `StatusEnvioChip` em si só recebe `status`, não tem esse
   risco, mas confirmar que nenhum refactor futuro o fez receber a linha
   inteira.
3. **Nenhuma automação de envio real disparada**: `marcarComoEnviado`/
   `registrarLembrete`/`expirarEnvio` só chamam as 3 rotas `PATCH`
   documentadas, sem nenhuma chamada a serviço de e-mail/SMS/WhatsApp em
   nenhum lugar do código novo (não haveria nem como, mas confirmar que
   nenhuma dependência nova foi adicionada a `package.json` para isso).
4. **Botão "Copiar link" usa Clipboard API + `Snackbar`, nunca navega**:
   confirmar `navigator.clipboard.writeText`, tratamento de rejeição (não
   assumir que sempre resolve), e ausência total de `navigate`/
   `window.location`/`<a href={link}>` apontando para o link em qualquer
   lugar do código novo.
5. **Nenhuma rota `/responder` foi criada**: confirmar que `App.tsx` não
   ganhou nenhuma rota nova, e que nenhum componente novo assume a
   existência dessa página (ex. um link "Ver página de resposta").
6. **Link nunca é montado no frontend**: confirmar que o código só usa
   `envio.link` literal, vindo da API — nenhuma concatenação de
   `token_acesso` com uma URL base no cliente, nenhuma env var nova (ex.
   `VITE_FRONTEND_URL`) introduzida em `package.json`/`.env.example`.
7. **Estado local após ação, sem refetch completo**: confirmar que as 3
   ações substituem só a linha correspondente em `envios` (`.map` por
   `id`), sem uma chamada extra a `listarEnvios` logo em seguida.
8. **Transições refletidas na UI batem com o contrato**: "Marcar como
   enviado" só habilitado a partir de `pendente`; "Registrar lembrete" só
   a partir de `enviado`; "Expirar" habilitado a partir de qualquer status
   (a exceção de UX "desabilitado se já `expirado`" é aceitável, mas não
   deveria haver nenhuma restrição adicional não documentada aqui, ex.
   bloquear "Expirar" a partir de `enviado`).
9. **Erros tratados por ação conforme o padrão descrito** (1.3): "Marcar
   como enviado"/"Registrar lembrete" → `Snackbar` de erro; "Expirar" →
   dentro do `ConfirmDialog`; erro de listagem → `TabelaEstado`. Nenhum
   erro engolido silenciosamente (ex. `catch` vazio).
10. **`Snackbar` generalizado sem quebrar o uso existente**: o aviso
    "Nenhum colaborador novo foi adicionado desta equipe." continua
    aparecendo com `severity="info"`, mesmo texto/comportamento de antes —
    a generalização do estado (1.4) não deveria mudar nada visível desse
    caso já existente.
11. **Nenhum cálculo de anonimização/mínimo de respostas no frontend**:
    grep por qualquer uso de `minimoRespostasPares` dentro do código novo
    da seção "Envios" — não deveria haver nenhum.
12. **Stack de estilização**: Tailwind + MUI, sem `.css` novo, sem
    `style={{}}` extenso, nenhuma dependência nova em `package.json` (em
    particular, nenhuma lib de clipboard/ícone — `navigator.clipboard`
    nativo, botões com texto em vez de ícone).
13. **Reaproveitamento confirmado**: `ConfirmDialog`, `TabelaEstado`,
    `ROTULOS_TIPO_RELACIONAMENTO` (não duplicado), `apiFetch`/`ApiError` —
    nenhum desses recriado do zero. `StatusEnvioChip` segue exatamente o
    formato de `StatusCicloChip` (mapa `CONFIG` embutido, não um arquivo
    `rotulos*.ts` à parte).
14. **Estados tratados** (carregando/vazio/erro) presentes na seção
    "Envios", com loading granular por linha/ação (não um loading global
    bloqueando a página inteira ao clicar em uma única ação).

## Perguntas em aberto

Decisões de UX/produto que os requisitos não cobriram literalmente e que
valem confirmação explícita do usuário — a implementação segue as decisões
assumidas acima, mas sinalizando aqui para não passar despercebido (mesmo
critério do `task-backend.md` desta feature, que já registra 5 pendências
equivalentes do lado backend):

1. **Confirmação (`ConfirmDialog`) só em "Expirar", não em "Marcar como
   enviado"/"Registrar lembrete"** — decisão de UX assumida acima (1.3),
   justificada por risco/reversibilidade, mas o pedido original não
   especifica isso literalmente ("botão... 'marcar como enviado'",
   "botão... 'registrar lembrete'", sem qualificar se precisam de
   confirmação). Se o usuário preferir confirmação nas 3 ações (ou em
   nenhuma, inclusive "Expirar"), é uma troca pontual de critério.
2. **"Expirar" desabilitado na UI quando o envio já está `expirado`** —
   decisão de UX (evitar um clique sem efeito visível), não uma restrição
   do backend (que aceita a transição de qualquer status, inclusive
   repetida, de forma idempotente). Se o usuário preferir manter o botão
   sempre clicável por simplicidade/consistência com o backend, é uma
   troca trivial (remover a condição de `disabled`).
3. **Erros de "Marcar como enviado"/"Registrar lembrete" em `Snackbar`, não
   inline na linha da tabela** — decisão assumida por não haver, hoje, um
   padrão de "erro inline por linha de tabela" em nenhuma outra tela do
   projeto (as tabelas existentes só têm erro de carregamento via
   `TabelaEstado`, nunca erro de uma ação específica sobre uma linha já
   carregada). Se o volume de erros reais desse tipo (ex. corrida entre
   duas abas do mesmo admin) se mostrar incômodo como toast, vale
   reconsiderar um popover/tooltip de erro ancorado na própria linha —
   fora de escopo antecipar isso agora.
4. **Mensagem do `ConfirmDialog` de "Expirar" não promete invalidar o
   link de fato** — porque a validação de acesso ao link (via a futura
   página `/responder`) ainda não existe; esta task não pode garantir esse
   comportamento na cópia do dialog. Quando a página `/responder` for
   implementada e passar a checar `status !== 'expirado'` antes de aceitar
   respostas, vale revisar essa mensagem para afirmar isso com mais
   confiança.
5. **Botão "Copiar link" sempre visível/habilitado independentemente do
   status** (inclusive `expirado`) — não foi pedido explicitamente que o
   link sumisse/desabilitasse para envios expirados; esta task assume que
   "poder ver/copiar o link, mesmo de um envio expirado" é útil para
   depuração/reenvio manual pelo admin (ex. reativar por fora do fluxo
   desta task). Se o usuário preferir ocultar/desabilitar "Copiar link"
   para `status === 'expirado'`, é uma troca pontual.

## Revisão

Revisão feita lendo os 4 arquivos criados/editados pela etapa 1
(`types/envio.ts`, `services/enviosPesquisaService.ts`,
`components/ciclos/StatusEnvioChip/StatusEnvioChip.tsx`,
`pages/CicloDetalhePage/CicloDetalhePage.tsx`), comparando contra o plano
acima (seções 1.1–1.6 e a lista de pontos de atenção da seção "2.
frontend-codereviewer") e contra `App.tsx`/`ConfirmDialog.tsx`/
`TabelaEstado.tsx`/`package.json`, e rodando os greps indicados no pedido de
revisão.

### Crítico

Nenhum achado crítico.

- **Controle de acesso**: `App.tsx` confirma que nenhuma rota nova foi
  adicionada — `/ciclos/:id` continua a única rota tocada, dentro do mesmo
  bloco `<Route element={<RotaProtegida papeis={['admin', 'gestor_rh']} />}>`
  + `<PainelAdminLayout />` já existente (linhas 27–40). A seção "Envios"
  vive inteiramente dentro de `CicloDetalhePage.tsx`, sem componente novo
  extraído para fora dela; nenhuma chamada a `listarEnvios`/
  `marcarComoEnviado`/`registrarLembrete`/`expirarEnvio` ocorre fora dessa
  página.
- **Dado identificado só nesta página**: confirmado por grep —
  `EnvioPesquisa`, `enviosPesquisaService` e `StatusEnvioChip` só são
  referenciados em `CicloDetalhePage.tsx` além de seus próprios arquivos de
  definição (`types/envio.ts`, `services/enviosPesquisaService.ts`,
  `components/ciclos/StatusEnvioChip/StatusEnvioChip.tsx`). `StatusEnvioChip`
  recebe só `status` como prop — não vaza `avaliadorNome`/`avaliadoNome`.
- **Nenhuma automação de envio real**: `enviosPesquisaService.ts` só expõe
  as 4 funções finas (`listarEnvios` + os 3 `PATCH` sem body) batendo
  exatamente com o contrato do `task-backend.md`; nenhuma chamada a
  e-mail/SMS/WhatsApp em nenhum arquivo novo. `package.json` sem dependência
  nova (confirmado — `dependencies`/`devDependencies` idênticos aos já
  usados por `ciclos-avaliacao`, sem lib de clipboard/ícone).
- **Link nunca montado no frontend, nunca navegado**: `handleCopiarLink` usa
  só `navigator.clipboard.writeText(link)` com `try/catch` cobrindo tanto a
  rejeição da Promise quanto um `navigator.clipboard` indisponível
  (`TypeError` síncrono também cai no mesmo `catch`, já que a expressão é
  avaliada dentro do `try`), com `Snackbar` de sucesso ("Link copiado.") e de
  erro ("Não foi possível copiar o link automaticamente..."). Nenhuma
  ocorrência de `window.location`/`navigate`/`<a href={link}>` no código
  novo; a única ocorrência de `window.location` no projeto é pré-existente e
  não relacionada (`EsqueciSenhaModal.tsx`, reset de senha). Nenhuma rota
  `/responder` em `App.tsx`.
- **Busca condicionada a `ciclo.status !== 'rascunho'`**: `carregarEnvios(id)`
  é disparado lado a lado com `carregarRelacionamentos(id)`, tanto em
  `carregar()` (mesmo `if`) quanto em `handleConfirmarAtivar` — chamadas
  independentes, cada uma com seu próprio `carregando`/`erro`, exatamente
  como planejado.
- **Estado local sem refetch**: as 3 ações (`handleMarcarComoEnviado`,
  `handleRegistrarLembrete`, `handleConfirmarExpirar`) atualizam `envios` só
  via `.map` pelo `id` do item retornado pela API — nenhuma chamada extra a
  `listarEnvios` depois de uma ação.
- **Nenhum cálculo de anonimização/mínimo de respostas**: grep por
  `minimoRespostasPares` não retorna nenhuma ocorrência em
  `types/envio.ts`, `enviosPesquisaService.ts`, `StatusEnvioChip.tsx` nem na
  seção "Envios" de `CicloDetalhePage.tsx` (as únicas ocorrências no projeto
  seguem sendo as já existentes em `CicloFormPage.tsx`/`CicloDadosForm.tsx`/
  `CiclosListPage.tsx`/`ciclosService.ts`/`types/ciclo.ts`, todas de formulário
  puro, não tocadas por esta task).
- **Stack de estilização**: nenhum arquivo `.css` novo em
  `pages/CicloDetalhePage/`; nenhum `style={{}}` — o único uso de `sx` visto
  no código novo (`Tooltip`/`Button`/`Snackbar`/`Alert`) é convenção MUI
  padrão. `package.json` sem dependência nova.
- **Generalização do `Snackbar`**: `handleAdicionarEquipe` (código
  pré-existente da task `ciclos-avaliacao`, não relacionado a envios) segue
  disparando `setSnackbar({ mensagem: 'Nenhum colaborador novo foi
  adicionado desta equipe.', severidade: 'info' })` — comportamento visual
  idêntico ao anterior (`severity="info"`), a generalização do tipo do
  estado não quebrou esse call site.
- **Transições da UI batem com o contrato**: "Marcar como enviado"
  habilitado só quando `envio.status === 'pendente'`; "Registrar lembrete"
  só quando `envio.status === 'enviado'`; "Expirar" habilitado para
  qualquer status exceto `expirado` (decisão de UX documentada, não
  restrição do backend) — sem nenhuma restrição adicional não documentada.
- **Erros por ação conforme o padrão descrito**: "Marcar como
  enviado"/"Registrar lembrete" → `Snackbar severity="error"` (nenhum
  `catch` vazio, `finally` sempre limpa `acaoEmAndamento`); "Expirar" → erro
  exibido na prop `erro` do `ConfirmDialog` (`erroExpirar`), sem fechar o
  dialog; erro de listagem (`GET`) → `TabelaEstado` com `onTentarNovamente`
  rechamando `carregarEnvios(ciclo.id)`.
- **Reaproveitamento confirmado**: `ConfirmDialog`/`TabelaEstado` usados com
  a mesma assinatura de props já existente (nenhuma prop nova inventada);
  `StatusEnvioChip` segue exatamente o formato de `StatusCicloChip` (mapa
  `CONFIG` embutido no próprio arquivo); coluna "Tipo" da tabela de envios
  reaproveita `ROTULOS_TIPO_RELACIONAMENTO`, sem mapa duplicado.

### Deveria corrigir

Nenhum achado nesta categoria.

### Sugestão

1. **Botão "Expirar" desabilitado sem `Tooltip` explicando o motivo**: ao
   contrário de "Marcar como enviado"/"Registrar lembrete" (ambos com
   `Tooltip` quando desabilitados), o botão "Expirar" só fica `disabled`
   quando `envio.status === 'expirado'`, sem nenhuma pista textual — o chip
   de status ao lado ("Expirado") já deixa o motivo implícito, então não é
   um achado bloqueante, só uma pequena inconsistência de padrão dentro da
   própria tabela nova.
2. **`Snackbar` único e compartilhado entre "Link copiado" e os erros de
   "Marcar como enviado"/"Registrar lembrete"**: em um clique muito rápido
   em duas ações diferentes (ex. copiar o link de uma linha e, quase ao
   mesmo tempo, uma falha de "Registrar lembrete" em outra), a segunda
   mensagem substitui a primeira antes do usuário conseguir ler — herdado do
   design pré-existente de `snackbar` único por página (não introduzido por
   esta task), mas o volume de call sites que agora dividem esse estado
   passou de 1 para 4 nesta task; vale considerar no futuro se compensa
   enfileirar mensagens ou usar `key` para forçar reabertura do `Snackbar`
   por mensagem.

### Conclusão

Nenhum achado crítico e nenhum achado "Deveria corrigir". A etapa pode
prosseguir para o `test-engineer`.
