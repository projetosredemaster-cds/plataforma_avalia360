# Task: Envio único (link de campanha) por ciclo para pesquisas `clima_geral` — Backend

Demanda 100% backend (`backend/`, equivalente a `apps/api` nas referências dos
agentes/skills — usar sempre os caminhos reais `backend/**` neste plano). Não
toca `frontend/`. Isto é uma **correção de modelo de dados já implementado**
(não uma funcionalidade nova) — o módulo `envios-pesquisa` foi implementado
gerando 1 envio por participante para pesquisas `clima_geral`
(`envios_pesquisa.colaborador_id`, `gerarEnviosClima`, índice
`uq_envios_pesquisa_colaborador`); o usuário confirmou que o fluxo correto é
**1 envio único por ciclo** (link de campanha), com confirmação de CPF contra
`ciclo_participantes` no momento da resposta. Requisitos já decididos
diretamente pelo usuário — etapa `spec` pulada a pedido explícito.

**Avaliação 360 (`origem: 'relacionamento'`, `relacionamento_id` preenchido)
NÃO MUDA EM NADA nesta task** — mesmo comportamento, mesmas queries, mesmo
shape de resposta. Toda mudança abaixo é específica do caminho `clima_geral`.

**Fora de escopo** (explicitamente, mesmo criticamente relacionado): o
formulário público de resposta (`/responder`), a validação de CPF contra
`ciclo_participantes`, e qualquer rota que escreva
`ciclo_participantes.respondeu_em`. Esta task só cria a **coluna**
`respondeu_em` (para a listagem já poder exibi-la, sempre `null` por ora) —
nenhuma rota desta task a escreve. Dados de teste gerados pelo modelo anterior
(1 envio por participante) são só de desenvolvimento e podem ser
limpos/regenerados — nada a preservar/migrar.

## Estado atual verificado (antes do plano)

Todo o código abaixo foi lido por completo antes deste plano.

### `envios-pesquisa/envio-pesquisa.entity.ts` (hoje)

`colaboradorId: string | null` + `@ManyToOne(() => Colaborador, ...)`
(`colaborador_id`, nullable, `ON DELETE CASCADE`) — preenchido só para
`clima_geral`, ao lado de `relacionamentoId` (nullable, preenchido só para
`avaliacao_360`). Comentários da entidade já documentam o guard rail "nunca
ganha coluna de resposta/nota/valor" — **mantido tal qual**, só o par
`colaboradorId`/`colaborador` é substituído por `cicloId`/`ciclo`.

### `envios-pesquisa/envios-pesquisa.service.ts` (hoje)

- `gerarEnviosClima(manager, cicloId, pesquisaId)`: busca
  `CicloParticipante.find({ where: { cicloId } })`, insere **1
  `envios_pesquisa` por participante** (`colaboradorId: p.colaboradorId`,
  `relacionamentoId: null`), `.orIgnore()` sobre
  `uq_envios_pesquisa_colaborador (pesquisa_id, colaborador_id) WHERE
  colaborador_id IS NOT NULL`. **Isto é o que está sendo substituído.**
- `buscarEnvioDoCicloOuFalhar(cicloId, envioId)`: filtra por
  `pesquisa.ciclo_id = :cicloId` (via `INNER JOIN Pesquisa`) — **já
  origem-agnóstico** (não depende de `colaborador_id`/`relacionamento_id`
  para localizar o envio dentro do ciclo). **Não precisa de nenhuma mudança
  nesta task.**
- `baseQuery()`: `LEFT JOIN RelacionamentoAvaliacao` + avaliador/avaliado +
  `LEFT JOIN Colaborador AS destinatario ON destinatario.id =
  e.colaborador_id` + seleciona `e.colaborador_id AS destinatarioId` e
  `destinatario.nome_completo AS destinatarioNome`. **O `leftJoin`/`addSelect`
  de `destinatario` deixam de existir** (não há mais "destinatário" — a linha
  de clima passa a ser a campanha inteira, não uma pessoa).
- `mapearLinha(linha)`: discrimina por `linha.relacionamentoId` truthy →
  braço `avaliacao_360` (`origem: 'relacionamento'`, com
  avaliador/avaliado/tipoRelacionamento); senão → braço clima
  (`origem: 'colaborador'`, com `destinatario: { id, nomeCompleto }`). **O
  braço `else` muda de forma** (sem `destinatario`, novo discriminante
  `origem: 'ciclo'`).
- `listarPorCiclo`: 1 única query via `baseQuery()` filtrando
  `pesquisa.ciclo_id = :cicloId`, retorna `{ tipoPesquisa, envios: [...] }`
  (array plano, um item por linha de `envios_pesquisa`, `tipoPesquisa` tirado
  de `linhas[0].pesquisaTipo` ou `null` se `linhas.length === 0`). **Muda
  para um envelope discriminado por `tipoPesquisa`, com um objeto único
  `campanha` + array `participantes` no braço `clima_geral`** (ver "Shape de
  resposta").
- `marcarComoEnviado`/`registrarLembrete`/`expirarEnvio`: sem lógica própria
  de filtro — só chamam `buscarEnvioDoCicloOuFalhar` + `buscarEnvioComNomes`
  (que reusa `baseQuery()` + `mapearLinha`). **Nenhuma mudança de lógica**,
  só herdam a mudança de `baseQuery()`/`mapearLinha` (menos campos no braço
  clima) e de nome de tipo de retorno.

### `ciclo-participantes/ciclo-participante.entity.ts` (hoje)

`id`, `cicloId` (+ `ciclo` `ManyToOne` `CASCADE`), `colaboradorId` (+
`colaborador` `ManyToOne` `CASCADE`), `criadoEm`. **Sem nenhum campo de
controle de resposta hoje** — `respondeuEm` é inteiramente novo.

### `ciclos-avaliacao/ciclos-avaliacao.service.ts`, `atualizarStatus` (hoje)

```ts
const salvo = await AppDataSource.transaction(async (manager) => {
  if (pesquisaPublicada.tipo === 'avaliacao_360') {
    await gerarRelacionamentos(manager, ciclo.id)
    await gerarEnviosPesquisa(manager, ciclo.id, pesquisaPublicada.id)
  } else {
    // clima_geral: NUNCA gera relacionamentos_avaliacao — guard rail de
    // anonimização.
    await gerarEnviosClima(manager, ciclo.id, pesquisaPublicada.id)
  }
  ciclo.status = novoStatus
  return manager.getRepository(CicloAvaliacao).save(ciclo)
})
```

A checagem `CICLO_SEM_PARTICIPANTES` (422, `totalParticipantes === 0`) já
roda **antes** deste bloco, **para os dois tipos de pesquisa**, sem
diferenciar `avaliacao_360`/`clima_geral`. Consequência direta para esta task
(ver decisão 3): quando `gerarEnviosClima` roda, **sempre existe pelo menos 1
`ciclo_participantes`** — a função não precisa (re)verificar isso.
**`gerarEnviosClima(manager, cicloId, pesquisaId)` mantém exatamente a mesma
assinatura** — esta task não muda absolutamente nada em
`ciclos-avaliacao.service.ts` (nem o import, nem o branch, nem a chamada).

### Migrations existentes (não editar in-place — ambas de tasks já fechadas)

- `1788350000000-CriarEnviosPesquisa.ts`: cria `envios_pesquisa` com
  `relacionamento_id uuid NOT NULL`.
- `1788400000000-DiferenciarTipoPesquisaEEnviosClima.ts`: `ALTER COLUMN
  relacionamento_id DROP NOT NULL`; `ADD COLUMN colaborador_id uuid
  REFERENCES colaboradores(id) ON DELETE CASCADE`; `ADD CONSTRAINT
  chk_envios_pesquisa_origem_exclusiva CHECK ((relacionamento_id IS NOT NULL)
  <> (colaborador_id IS NOT NULL))`; `CREATE UNIQUE INDEX
  uq_envios_pesquisa_colaborador ON envios_pesquisa (pesquisa_id,
  colaborador_id) WHERE colaborador_id IS NOT NULL`; `CREATE INDEX
  idx_envios_colaborador ON envios_pesquisa (colaborador_id)`.

Nenhuma das duas rodou ainda contra um banco real (mesma regra de sempre —
esta task também não roda a migration nova sem confirmação explícita do
usuário). **Esta task cria uma 3ª migration** (`ALTER TABLE`/`CREATE
INDEX`/`DROP`), timestamp maior que `1788400000000` — não edita nenhuma das
duas anteriores.

### `MAPA_CONSTRAINT_PARA_CODIGO` (`tratadorErros.ts`), lido por completo

```ts
const MAPA_CONSTRAINT_PARA_CODIGO: Record<string, string> = {
  uq_colaboradores_cpf: 'CPF_DUPLICADO',
  uq_colaboradores_email: 'EMAIL_DUPLICADO',
  uq_colaboradores_usuario_auth_id: 'USUARIO_AUTH_DUPLICADO',
  uq_competencias_nome: 'COMPETENCIA_NOME_DUPLICADO',
  uq_paginas_pesquisa_pesquisa_ordem: 'PAGINA_ORDEM_DUPLICADA',
  uq_perguntas_pagina_ordem: 'PERGUNTA_ORDEM_DUPLICADA',
  uq_ciclo_participantes_ciclo_colaborador: 'CICLO_PARTICIPANTE_DUPLICADO',
}
```

Nenhuma entrada para `envios_pesquisa` hoje — decisão já tomada nas duas
tasks anteriores (o único `INSERT` em `envios_pesquisa` é o motor de
ativação, que usa `.orIgnore()`, então a constraint nunca sobe como exceção
por uma rota HTTP). **Esta task mantém essa lógica** (ver decisão 6) — sem
entrada nova para `uq_envios_pesquisa_ciclo`.

### Frontend já consome o shape antigo (fora de escopo aqui, só um aviso)

`frontend/src/types/envio.ts` (`EnvioClimaGeralResposta` com `destinatario`,
`origem: 'colaborador'`) e `frontend/src/services/enviosPesquisaService.ts` +
`CicloDetalhePage.tsx` consomem o shape **atual** de
`GET /api/ciclos/:cicloId/envios`. **Esta task muda esse contrato de novo**
(braço clima deixa de ser um array de itens `destinatario` e passa a ser
`{ campanha, participantes }`) — consequência esperada, tratada por uma
`task-frontend.md` em paralelo (sendo escrita simultaneamente a este plano).
Não é escopo desta task de backend alterar nada em `frontend/`.

## Decisões de modelagem (com justificativa)

1. **`envios_pesquisa.colaborador_id` é removida (coluna + FK + os dois
   índices que a referenciam); nova coluna `ciclo_id uuid NULLABLE
   REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE`.** `ON DELETE CASCADE`
   espelha o mesmo comportamento já usado em `relacionamento_id` e em
   `colaborador_id` (removido) — remover um ciclo remove o envio de campanha
   associado, mesma política de integridade referencial já aplicada em todo
   o domínio.
2. **CHECK `chk_envios_pesquisa_origem_exclusiva` reescrita para
   `(relacionamento_id IS NOT NULL) <> (ciclo_id IS NOT NULL)`** — mesmo
   nome de constraint (só o corpo muda), mesma semântica "exatamente um dos
   dois preenchido, nunca os dois, nunca nenhum".
3. **Índice único: `CREATE UNIQUE INDEX uq_envios_pesquisa_ciclo ON
   envios_pesquisa (ciclo_id) WHERE ciclo_id IS NOT NULL`** — índice único
   PARCIAL (não `UNIQUE (pesquisa_id, ciclo_id)`), porque a garantia
   desejada agora é mais forte que "1 por pesquisa+ciclo": é **1 envio por
   ciclo, ponto** (não faz sentido duas pesquisas `clima_geral` gerarem duas
   campanhas concorrentes pro mesmo ciclo — o motor de ativação já impede
   isso indiretamente, já que só há uma `pesquisaPublicada` por ativação,
   mas o índice único em `(ciclo_id)` sozinho é a garantia mais direta e a
   mais barata de verificar visualmente no schema). Índice parcial (não
   constraint de tabela) pelo mesmo motivo já registrado na task anterior
   para `uq_envios_pesquisa_colaborador`: portável para qualquer versão do
   Postgres suportada pelo Supabase, sem depender de `UNIQUE NULLS NOT
   DISTINCT` (sintaxe 15+). A `.orIgnore()` de `gerarEnviosClima` continua
   absorvendo qualquer violação sem precisar nomear o índice (mesmo padrão
   de `gerarRelacionamentos`/`gerarEnviosPesquisa`).
4. **`ciclo_participantes.respondeu_em timestamptz NULLABLE`, sem `DEFAULT`,
   sem índice novo.** É metadado de controle de participação ("este
   colaborador já respondeu à campanha deste ciclo?"), nunca conteúdo de
   resposta — mesma natureza de `envios_pesquisa.cpf_confirmado_em`
   (controle), nunca de `itens_resposta`/`respostas` (que não existem e não
   são tocadas aqui). **Nenhuma rota desta task escreve esta coluna** — fica
   sempre `null` até a futura task do formulário público de resposta.
   Nenhum índice dedicado: a única leitura desta coluna nesta task é dentro
   de `listarPorCiclo`, já filtrada por `ciclo_id` (que tem índice
   implícito via FK/uso já existente em `ciclo_participantes`), volume
   esperado (dezenas a poucas centenas de participantes por ciclo) não
   justifica um índice extra agora.
5. **`gerarEnviosClima(manager, cicloId, pesquisaId)`: mesma assinatura,
   corpo reescrito para inserir exatamente 1 linha** (`cicloId` preenchido,
   `relacionamentoId: null`, sem depender de `ciclo_participantes` para
   gerar a linha). **Deixa de buscar `CicloParticipante.find(...)`** — a
   função não precisa mais saber quantos/quais participantes existem para
   gerar o envio de campanha, só precisa do `cicloId`. `.orIgnore()`
   mantido (agora absorvendo `uq_envios_pesquisa_ciclo`), garantindo
   idempotência sob retry/corrida, mesmo padrão das funções irmãs.
6. **Pular geração quando não há participantes: decisão explícita — NÃO
   pular, gerar sempre.** Justificativa: (a) por construção, quando
   `gerarEnviosClima` roda, `CICLO_SEM_PARTICIPANTES` já garantiu
   `totalParticipantes >= 1` (ver "Estado atual verificado" acima), então a
   checagem "sem participantes → pular" que existia na versão anterior de
   `gerarEnviosClima` já era mmorta por construção (nunca era `true` na
   prática) — não há motivo para portá-la; (b) mesmo num cenário hipotético
   futuro onde essa pré-condição deixasse de existir, o link único da
   campanha **deveria** existir mesmo com 0 participantes no momento da
   ativação (ex.: admin ativa o ciclo e só depois adiciona participantes —
   hoje isso não é possível porque `garantirCicloEditavel` bloqueia adicionar
   participante fora de `rascunho`, mas não há razão de design para o link da
   campanha depender do número de participantes, já que é 1 link fixo por
   ciclo, não 1 por pessoa). Resultado prático: `gerarEnviosClima` não faz
   nenhuma leitura de `ciclo_participantes` — só um `INSERT ... ON CONFLICT
   DO NOTHING` de 1 linha.
7. **Nenhuma mudança em `ciclos-avaliacao.service.ts`.** A assinatura de
   `gerarEnviosClima` não muda (`manager, cicloId, pesquisaId`), o branch em
   `atualizarStatus` não muda, a checagem `CICLO_SEM_PARTICIPANTES` não
   muda. Zero linhas alteradas neste arquivo.
8. **Shape de `GET /api/ciclos/:cicloId/envios` para `clima_geral`: envelope
   `{ tipoPesquisa: 'clima_geral', campanha: EnvioClimaGeralCampanhaResposta,
   participantes: ParticipanteClimaResposta[] }`**, em vez do array plano
   anterior. `campanha` é **sempre não-nulo** dentro deste braço — o braço
   só é retornado quando já existe pelo menos 1 linha de `envios_pesquisa`
   para o ciclo (ou seja, o ciclo já foi ativado; ver decisão 9 sobre o caso
   "ainda não ativado"), e o índice único parcial `uq_envios_pesquisa_ciclo`
   garante que existe no máximo 1. `campanha` reaproveita o **mesmo tipo**
   usado como retorno das 3 ações (`EnvioClimaGeralCampanhaResposta`, ver
   decisão 10) — um único par de funções de mapeamento
   (`baseQuery`/`mapearLinha`) serve tanto a listagem quanto as ações, sem
   duplicar lógica de montagem de link/status. `participantes` vem de um
   `JOIN` separado (`ciclo_participantes` + `colaboradores`), **sempre**
   presente (mesmo array vazio nunca acontece na prática, dado o guard rail
   `CICLO_SEM_PARTICIPANTES`, mas o tipo permite array vazio por robustez).
9. **`tipoPesquisa: null` continua significando exclusivamente "ciclo ainda
   não ativado" (nenhum envio gerado ainda)** — mesmo critério já usado
   antes desta task (decisão 8/9 da task `diferenciacao-tipo-pesquisa`), não
   revisitado aqui. Consequência explícita: `participantes` com
   `respondeu_em` **não é exposto neste endpoint antes da ativação**, mesmo
   que `ciclo_participantes` já exista nesse momento — quem precisa da lista
   de participantes de um ciclo em rascunho já tem
   `GET /api/ciclos/:cicloId/participantes` (módulo `ciclo-participantes`,
   inalterado por esta task). Este endpoint (`/envios`) é especificamente
   sobre o estado da campanha/envio, não uma listagem geral de participantes
   — ver "Perguntas em aberto" nº 1 para o caso em que isso seja indesejado
   pelo frontend.
10. **3 ações (`marcar-enviado`/`registrar-lembrete`/`expirar`) continuam nas
    MESMAS rotas `PATCH /api/ciclos/:cicloId/envios/:id/<acao>`, sem rota
    nova dedicada à campanha.** Decisão explícita (pedido no plano pedia
    para avaliar): manter `:id` — `buscarEnvioDoCicloOuFalhar` já resolve
    por `id` + `pesquisa.ciclo_id` de forma **origem-agnóstica**, sem
    nenhuma mudança necessária. O frontend obtém o `id` da campanha a partir
    de `campanha.id` no corpo de `GET /api/ciclos/:cicloId/envios` (mesmo
    padrão já usado para os itens de `avaliacao_360`, cujo `id` também vem
    da listagem antes de acionar uma ação). Alternativa descartada: uma rota
    "resolve o envio único pelo ciclo" (ex.: `PATCH
    /api/ciclos/:cicloId/envios/campanha/marcar-enviado`) — descartada por
    introduzir uma segunda forma de endereçar o mesmo recurso
    (`envios_pesquisa` por `id`) sem necessidade real: como há no máximo 1
    campanha por ciclo, resolver por `:id` explícito é igualmente simples
    para o frontend e mantém as 3 rotas 100% compartilhadas entre os dois
    tipos de pesquisa (nenhum `if (tipoPesquisa === ...)` a mais em
    `envios-pesquisa.module.ts`/`controller.ts`). Resultado: retorno das 3
    ações passa a ser a união `EnvioAcaoResposta =
    EnvioAvaliacao360Resposta | EnvioClimaGeralCampanhaResposta` (renomeada
    de `EnvioCicloResposta`, ver decisão 8) — o item único atualizado,
    discriminado por `origem`.
11. **`EnvioClimaGeralCampanhaResposta` (novo tipo, substitui
    `EnvioClimaGeralResposta`): mesmos campos comuns (`id`, `status`,
    `link`, `quantidadeLembretes`, `cpfConfirmadoEm`, `concluidoEm`) +
    `origem: 'ciclo'` — SEM `destinatario`.** O campo `destinatario`
    (pessoa única) deixa de fazer sentido porque a linha de
    `envios_pesquisa` para clima não representa mais 1 pessoa, e sim a
    campanha inteira. O valor do discriminante muda de `'colaborador'` para
    `'ciclo'` — escolhido para espelhar o nome da coluna que passa a ser o
    lado preenchido do CHECK (`ciclo_id`), mesmo critério já usado para
    `'relacionamento'` (espelha `relacionamento_id`).
12. **`ParticipanteClimaResposta` (novo tipo)**: `{ id: string;
    colaboradorId: string; nomeCompleto: string; respondeuEm: string | null
    }`. Mesmo shape de `id`+`colaboradorId` já usado por `ParticipanteResposta`
    em `ciclo-participantes.service.ts` (consistência entre os dois
    endpoints que expõem participantes), com `respondeuEm` adicional
    (`ISO 8601` ou `null` — sempre `null` nesta task, ver decisão 4).
13. **Nenhuma entrada nova em `MAPA_CONSTRAINT_PARA_CODIGO`
    (`tratadorErros.ts`).** Mesma justificativa das duas tasks anteriores: a
    `CHECK chk_envios_pesquisa_origem_exclusiva` (corpo novo) e o índice
    único parcial `uq_envios_pesquisa_ciclo` só poderiam ser violados por um
    `INSERT`/`UPDATE` que a aplicação nunca faz fora de `gerarEnviosClima`
    (que já usa `.orIgnore()`) — nenhuma rota HTTP desta task insere/atualiza
    `relacionamento_id`/`ciclo_id` diretamente.
14. **Migration nova, timestamp `1788450000000` (ajustar para um valor maior
    caso outra migration tenha sido criada nesse intervalo — nunca reutilizar
    um timestamp já usado), só `ALTER TABLE`/`DROP`/`CREATE INDEX` sobre
    tabelas já existentes.** Não edita nenhuma das migrations anteriores.
    **Não executar contra nenhum banco real sem confirmação explícita do
    usuário** — mesma regra de sempre (nenhuma das 3 migrations do módulo
    rodou ainda).
15. **`down()` não preserva os dados de `colaborador_id` perdidos no `up()`**
    (limitação inerente de `DROP COLUMN`) — aceitável e explicitamente
    autorizado pelo usuário ("dados de teste... pode limpar/regenerar, nada a
    preservar"). `down()` recria a coluna/constraint/índices antigos
    estruturalmente (mesmos nomes/tipos de `1788400000000`), mas com a
    coluna `colaborador_id` vazia (`NULL` em todas as linhas existentes) até
    nova geração — mesma limitação já documentada no `down()` de
    `1788400000000` para o sentido inverso (`relacionamento_id SET NOT
    NULL`).

## Guard rails de anonimização (aplicam-se a toda a task)

- **Esta task não cria nem toca `respostas`/`itens_resposta`** (nenhuma das
  duas existe). `respondeu_em` é **metadado de controle de participação**
  (quem respondeu, não o quê) — nunca conteúdo de resposta, nunca escrito por
  nenhuma rota desta task (fica `null` até a futura task de
  `/responder`).
- **`clima_geral` continua nunca gerando `relacionamentos_avaliacao`.**
  `gerarEnviosClima` (reescrita) não importa, não referencia e não escreve
  em `RelacionamentoAvaliacao`/`relacionamentos_avaliacao` em nenhuma linha —
  só faz um `INSERT` de 1 linha em `EnvioPesquisa` com `cicloId` preenchido.
  Nenhuma mudança no branch de `ciclos-avaliacao.service.ts` que já garante
  isso.
- **A regra de `minimo_respostas_pares`/anonimização de `pares`/`subordinado`
  continua exclusiva de `tipo_relacionamento`** — dimensão que não existe
  para `origem: 'ciclo'`. Nenhuma função desta task aplica, simula ou
  referencia essa regra para a campanha de clima ou para `participantes`.
- **`GET /api/ciclos/:cicloId/envios`, braço `clima_geral`, expõe
  `participantes` (colaboradores **identificados**, nome completo +
  `respondeuEm`) a `admin`/`gestor_rh`.** Isso é aceitável e não é uma
  regressão de anonimização: é dado **estrutural de controle de
  campanha/participação** ("quem está na lista, quem já respondeu"), nunca
  uma **resposta em si** — mesmo critério já usado para `destinatario` no
  shape anterior e para `avaliadorNome`/`avaliadoNome` no braço
  `avaliacao_360`. Restrito a `admin`/`gestor_rh` via `garantirPapel`, nunca
  a `colaborador` — sem mudança nesse padrão.
- **Nenhuma rota nova ou alterada por esta task é acessível por
  `colaborador`.** `garantirPapel(ator, ['admin', 'gestor_rh'])` continua
  sendo a primeira linha de toda função exportada de
  `envios-pesquisa.service.ts` que recebe `ator`. `autenticar` continua
  montado nos mesmos módulos (router pai `ciclos-avaliacao` + de novo em
  `envios-pesquisa.module.ts`), sem remoção.
- **Fluxo público futuro (`/responder`, confirmação de CPF)**: esta task não
  implementa nenhuma parte dele. Quando implementado, deve usar a service
  role key + validação manual de token/CPF (nunca RLS de sessão, já que
  colaborador comum não tem conta no Supabase Auth) — nota de arquitetura já
  registrada, só reafirmada aqui porque `campanha.link`/`token_acesso` é o
  capability token que esse fluxo público vai consumir.
- **Single-tenant**: nenhuma coluna/parâmetro `organization_id` introduzido em
  nenhum lugar desta task.

## Plano — Backend

### 1. backend-developer

Antes de codar: invocar a skill `backend-modulo-crud` (mudança em módulo CRUD
existente) e reler a skill `backend-anonimizacao-respostas` — esta task não
expõe nenhuma resposta, mas mexe na tabela que vai ancorar o fluxo público
futuro de resposta de clima, então a skill deve ser conferida contra a seção
"Guard rails de anonimização" acima antes de escrever qualquer query.

#### 1.1 Migration (`backend/src/migrations/1788450000000-EnvioUnicoClimaGeralPorCiclo.ts`)

Timestamp `1788450000000` (maior que `1788400000000`; ajustar se outra
migration tiver sido criada nesse intervalo — nunca reutilizar um timestamp
já usado). **Não rodar esta migration contra nenhum banco real sem
confirmação explícita do usuário.**

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Correção de modelo de dados: pesquisas `clima_geral` passam a gerar 1
 * ÚNICO envio (link de campanha) por ciclo, em vez de 1 envio por
 * participante. Substitui `envios_pesquisa.colaborador_id` (criada por
 * `1788400000000-DiferenciarTipoPesquisaEEnviosClima.ts`) por
 * `envios_pesquisa.ciclo_id`. `avaliacao_360` não muda em nada.
 *
 * Também adiciona `ciclo_participantes.respondeu_em` — metadado de controle
 * de participação (quem já respondeu à campanha), NUNCA conteúdo de
 * resposta. Nenhuma rota escreve esta coluna ainda (reservada para a futura
 * task do formulário público `/responder`).
 *
 * NÃO EXECUTAR esta migration contra nenhum banco real sem confirmação
 * explícita do usuário — mesma regra já aplicada às migrations anteriores
 * (nenhuma delas rodou ainda contra um banco real). Dados gerados pelo
 * modelo anterior (1 envio por participante) são só de desenvolvimento —
 * `down()` não preserva o valor histórico de `colaborador_id`.
 */
export class EnvioUnicoClimaGeralPorCiclo1788450000000 implements MigrationInterface {
  name = 'EnvioUnicoClimaGeralPorCiclo1788450000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE envios_pesquisa DROP CONSTRAINT chk_envios_pesquisa_origem_exclusiva`,
    )
    await queryRunner.query(`DROP INDEX idx_envios_colaborador`)
    await queryRunner.query(`DROP INDEX uq_envios_pesquisa_colaborador`)
    await queryRunner.query(`ALTER TABLE envios_pesquisa DROP COLUMN colaborador_id`)

    await queryRunner.query(`
      ALTER TABLE envios_pesquisa
        ADD COLUMN ciclo_id uuid REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE
    `)

    // Exatamente um dos dois preenchido — nunca os dois, nunca nenhum.
    await queryRunner.query(`
      ALTER TABLE envios_pesquisa
        ADD CONSTRAINT chk_envios_pesquisa_origem_exclusiva
        CHECK ((relacionamento_id IS NOT NULL) <> (ciclo_id IS NOT NULL))
    `)

    // 1 envio (campanha) por ciclo, no máximo — índice único PARCIAL restrito
    // às linhas onde ciclo_id é preenchido (linhas de avaliacao_360 têm
    // ciclo_id NULL e nunca entram neste índice).
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_envios_pesquisa_ciclo
        ON envios_pesquisa (ciclo_id)
        WHERE ciclo_id IS NOT NULL
    `)

    await queryRunner.query(`CREATE INDEX idx_envios_ciclo ON envios_pesquisa (ciclo_id)`)

    await queryRunner.query(`
      ALTER TABLE ciclo_participantes
        ADD COLUMN respondeu_em timestamptz
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE ciclo_participantes DROP COLUMN respondeu_em`)

    await queryRunner.query(`DROP INDEX idx_envios_ciclo`)
    await queryRunner.query(`DROP INDEX uq_envios_pesquisa_ciclo`)
    await queryRunner.query(
      `ALTER TABLE envios_pesquisa DROP CONSTRAINT chk_envios_pesquisa_origem_exclusiva`,
    )
    await queryRunner.query(`ALTER TABLE envios_pesquisa DROP COLUMN ciclo_id`)

    await queryRunner.query(`
      ALTER TABLE envios_pesquisa
        ADD COLUMN colaborador_id uuid REFERENCES colaboradores(id) ON DELETE CASCADE
    `)

    await queryRunner.query(`
      ALTER TABLE envios_pesquisa
        ADD CONSTRAINT chk_envios_pesquisa_origem_exclusiva
        CHECK ((relacionamento_id IS NOT NULL) <> (colaborador_id IS NOT NULL))
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_envios_pesquisa_colaborador
        ON envios_pesquisa (pesquisa_id, colaborador_id)
        WHERE colaborador_id IS NOT NULL
    `)

    await queryRunner.query(
      `CREATE INDEX idx_envios_colaborador ON envios_pesquisa (colaborador_id)`,
    )
  }
}
```

**Nomes a usar exatamente**: coluna `envios_pesquisa.ciclo_id`; constraint
`chk_envios_pesquisa_origem_exclusiva` (reescrita, mesmo nome); índice único
parcial `uq_envios_pesquisa_ciclo`; índice `idx_envios_ciclo`; coluna
`ciclo_participantes.respondeu_em`.

#### 1.2 Entidade `EnvioPesquisa` (`envios-pesquisa/envio-pesquisa.entity.ts`)

Substituir o bloco `colaboradorId`/`colaborador` por `cicloId`/`ciclo`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { STATUS_ENVIO_VALORES, type StatusEnvio } from '../../common/enums'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { Pesquisa } from '../pesquisas/pesquisa.entity'

/**
 * Guarda só metadados de controle de envio (status/token/contadores) —
 * NUNCA ganha coluna de resposta/nota/valor (guard rail de anonimização,
 * mesma garantia já aplicada a `RelacionamentoAvaliacao`). Dados de resposta
 * (`itens_resposta`/`respostas`) são de uma task futura.
 */
@Entity('envios_pesquisa')
export class EnvioPesquisa {
  @PrimaryGeneratedColumn('uuid') id!: string

  @Column({ name: 'pesquisa_id', type: 'uuid' }) pesquisaId!: string
  @ManyToOne(() => Pesquisa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pesquisa_id' })
  pesquisa!: Pesquisa

  // NULL para envios de pesquisas `clima_geral` (ver `cicloId` abaixo).
  // Exatamente um dos dois é preenchido, garantido pelo CHECK
  // `chk_envios_pesquisa_origem_exclusiva` no banco — a aplicação nunca deve
  // gravar os dois ou nenhum.
  @Column({ name: 'relacionamento_id', type: 'uuid', nullable: true })
  relacionamentoId!: string | null
  @ManyToOne(() => RelacionamentoAvaliacao, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'relacionamento_id' })
  relacionamento!: RelacionamentoAvaliacao | null

  // Substitui `colaboradorId` (modelo anterior, 1 envio por participante).
  // Preenchido SÓ para pesquisas `clima_geral` — 1 ÚNICO envio (link de
  // campanha) por ciclo, garantido pelo índice único parcial
  // `uq_envios_pesquisa_ciclo`. Nunca gerado/lido junto de
  // `relacionamentoId` na mesma linha.
  @Column({ name: 'ciclo_id', type: 'uuid', nullable: true })
  cicloId!: string | null
  @ManyToOne(() => CicloAvaliacao, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ciclo_id' })
  ciclo!: CicloAvaliacao | null

  @Column({ type: 'enum', enum: STATUS_ENVIO_VALORES, enumName: 'status_envio', default: 'pendente' })
  status!: StatusEnvio

  // Preenchido pelo DEFAULT do Postgres (gen_random_uuid()) — a aplicação
  // NUNCA gera nem reatribui este valor.
  @Column({ name: 'token_acesso', type: 'uuid', unique: true })
  tokenAcesso!: string

  @Column({ name: 'enviado_em', type: 'timestamptz', nullable: true })
  enviadoEm!: Date | null

  // Reservado para a task futura de resposta (`/responder`) — esta task
  // NUNCA escreve esta coluna, só a expõe (sempre `null` por enquanto).
  @Column({ name: 'concluido_em', type: 'timestamptz', nullable: true })
  concluidoEm!: Date | null

  @Column({ name: 'quantidade_lembretes', type: 'smallint', default: 0 })
  quantidadeLembretes!: number

  // Reservado para a task futura de resposta — esta task NUNCA escreve.
  @Column({ name: 'cpf_confirmado_em', type: 'timestamptz', nullable: true })
  cpfConfirmadoEm!: Date | null

  // Reservado para a task futura de resposta — esta task NUNCA escreve.
  @Column({ name: 'tentativas_cpf_invalidas', type: 'smallint', default: 0 })
  tentativasCpfInvalidas!: number

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date
}
```

#### 1.3 Entidade `CicloParticipante` (`ciclo-participantes/ciclo-participante.entity.ts`)

Adicionar `respondeuEm` ao final (antes de `criadoEm` ou depois, tanto faz —
manter perto de `colaboradorId` por legibilidade):

```ts
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'
import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'
import { Colaborador } from '../colaboradores/colaborador.entity'

/**
 * Tabela nova desta task (sem equivalente no schema doc) — guarda apenas o
 * vínculo de participação (quem está no ciclo), nunca papel/tipo de
 * relacionamento, que é derivado na ativação e vive em
 * `relacionamentos_avaliacao`.
 */
@Entity('ciclo_participantes')
export class CicloParticipante {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'ciclo_id', type: 'uuid' })
  cicloId!: string

  @ManyToOne(() => CicloAvaliacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ciclo_id' })
  ciclo!: CicloAvaliacao

  @Column({ name: 'colaborador_id', type: 'uuid' })
  colaboradorId!: string

  @ManyToOne(() => Colaborador, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'colaborador_id' })
  colaborador!: Colaborador

  // Metadado de controle de PARTICIPAÇÃO (quem já respondeu à pesquisa de
  // `clima_geral` do ciclo) — NUNCA conteúdo de resposta. Escrito só pela
  // futura rota pública `/responder` (fora de escopo desta task) após
  // validar CPF contra este mesmo participante — esta task NUNCA escreve
  // esta coluna, só cria e expõe (sempre `null` por ora).
  @Column({ name: 'respondeu_em', type: 'timestamptz', nullable: true })
  respondeuEm!: Date | null

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date
}
```

#### 1.4 `envios-pesquisa.service.ts` — reescrita completa

```ts
import type { EntityManager } from 'typeorm'
import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { env } from '../../config/env'
import { ErroHttp } from '../../common/erro-http'
import type { ColaboradorAutenticado } from '../../types/express'
import type { TipoPesquisa, TipoRelacionamento } from '../../common/enums'
import { Colaborador } from '../colaboradores/colaborador.entity'
import { CicloParticipante } from '../ciclo-participantes/ciclo-participante.entity'
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { buscarCicloOuFalhar } from '../ciclos-avaliacao/ciclos-avaliacao.service'
import { Pesquisa } from '../pesquisas/pesquisa.entity'
import { EnvioPesquisa } from './envio-pesquisa.entity'

const PAPEIS_COM_ACESSO = ['admin', 'gestor_rh'] as const

interface EnvioComumResposta {
  id: string
  status: string // StatusEnvio
  link: string
  quantidadeLembretes: number
  cpfConfirmadoEm: string | null
  concluidoEm: string | null
}

/** Envio gerado a partir de `relacionamentos_avaliacao` (pesquisa `avaliacao_360`). SEM MUDANÇA nesta task. */
export interface EnvioAvaliacao360Resposta extends EnvioComumResposta {
  origem: 'relacionamento'
  avaliadorId: string
  avaliadorNome: string
  avaliadoId: string
  avaliadoNome: string
  tipoRelacionamento: TipoRelacionamento
}

/**
 * O ÚNICO envio (link de campanha) de uma pesquisa `clima_geral` — 1 por
 * ciclo (garantido pelo índice único parcial `uq_envios_pesquisa_ciclo`).
 * Sem `destinatario`: não representa mais 1 pessoa, e sim a campanha
 * inteira — a lista de destinatários/participantes vive em
 * `ListarEnviosCicloRespostaClimaGeral.participantes`, não aqui.
 */
export interface EnvioClimaGeralCampanhaResposta extends EnvioComumResposta {
  origem: 'ciclo'
}

/** Retorno das 3 ações (`marcar-enviado`/`registrar-lembrete`/`expirar`) — o item único atualizado. */
export type EnvioAcaoResposta = EnvioAvaliacao360Resposta | EnvioClimaGeralCampanhaResposta

/**
 * Participante do ciclo, para o braço `clima_geral` de
 * `GET /api/ciclos/:cicloId/envios` — `respondeuEm` é metadado de controle
 * de participação (NUNCA conteúdo de resposta), sempre `null` nesta task
 * (nenhuma rota o escreve; reservado para a futura página pública
 * `/responder`).
 */
export interface ParticipanteClimaResposta {
  id: string
  colaboradorId: string
  nomeCompleto: string
  respondeuEm: string | null
}

export interface ListarEnviosCicloRespostaVazia {
  tipoPesquisa: null
  envios: []
}

export interface ListarEnviosCicloRespostaAvaliacao360 {
  tipoPesquisa: 'avaliacao_360'
  envios: EnvioAvaliacao360Resposta[]
}

export interface ListarEnviosCicloRespostaClimaGeral {
  tipoPesquisa: 'clima_geral'
  campanha: EnvioClimaGeralCampanhaResposta
  participantes: ParticipanteClimaResposta[]
}

/**
 * Resposta de `GET /api/ciclos/:cicloId/envios`. `tipoPesquisa: null`
 * SOMENTE quando o ciclo ainda não foi ativado (nenhum envio gerado ainda)
 * — nunca interpretar como erro. `avaliacao_360` mantém o shape anterior
 * (array `envios`) sem NENHUMA mudança. `clima_geral` muda de shape: em vez
 * de um item por participante, um único objeto `campanha` (o link) + a lista
 * `participantes` (quem está no ciclo + `respondeuEm`).
 */
export type ListarEnviosCicloResposta =
  | ListarEnviosCicloRespostaVazia
  | ListarEnviosCicloRespostaAvaliacao360
  | ListarEnviosCicloRespostaClimaGeral

function montarLinkPublico(tokenAcesso: string): string {
  // Página `/responder` ainda não existe (próximo item do roadmap) — só a
  // URL/token precisam existir e ser exibidos por ora.
  return `${env.frontendUrl}/responder/${tokenAcesso}`
}

/**
 * Gera `envios_pesquisa` a partir dos `relacionamentos_avaliacao` recém-
 * criados/existentes do ciclo — 1 envio por relacionamento. SEM MUDANÇA
 * nesta task (reproduzida aqui por completude do arquivo).
 */
export async function gerarEnviosPesquisa(
  manager: EntityManager,
  cicloId: string,
  pesquisaId: string,
): Promise<void> {
  const relacionamentos = await manager
    .getRepository(RelacionamentoAvaliacao)
    .find({ where: { cicloId } })

  if (relacionamentos.length === 0) return

  await manager
    .createQueryBuilder()
    .insert()
    .into(EnvioPesquisa)
    .values(
      relacionamentos.map((r) => ({
        pesquisaId,
        relacionamentoId: r.id,
        status: 'pendente' as const,
      })),
    )
    .orIgnore()
    .execute()
}

/**
 * Gera o ÚNICO `envios_pesquisa` (link de campanha) do ciclo, para
 * pesquisas `clima_geral` — `cicloId` preenchido, `relacionamentoId: null`.
 * REESCRITA nesta task: antes gerava 1 envio por `ciclo_participantes`
 * (`colaboradorId` preenchido); agora gera exatamente 1 linha por ciclo,
 * sem depender de ler `ciclo_participantes` (a checagem
 * `CICLO_SEM_PARTICIPANTES`, em `ciclos-avaliacao.service.ts`, já garante
 * que existe ao menos 1 participante antes desta função rodar — mas o link
 * da campanha não depende de QUANTOS participantes existem, ver decisão de
 * modelagem 6 do plano). NUNCA gera `relacionamentos_avaliacao` (guard rail
 * de anonimização, inalterado). Idempotente via `.orIgnore()` sobre o
 * índice único parcial `uq_envios_pesquisa_ciclo (ciclo_id) WHERE ciclo_id
 * IS NOT NULL`. Assinatura inalterada — `ciclos-avaliacao.service.ts` não
 * precisa de nenhuma mudança.
 */
export async function gerarEnviosClima(
  manager: EntityManager,
  cicloId: string,
  pesquisaId: string,
): Promise<void> {
  await manager
    .createQueryBuilder()
    .insert()
    .into(EnvioPesquisa)
    .values({
      pesquisaId,
      relacionamentoId: null,
      cicloId,
      status: 'pendente' as const,
    })
    .orIgnore()
    .execute()
}

/**
 * Busca um envio garantindo que pertence ao ciclo informado, via
 * `pesquisas.ciclo_id` — SEM MUDANÇA nesta task. Já era origem-agnóstico
 * (não depende de `colaborador_id`/`ciclo_id` da própria linha de
 * `envios_pesquisa` para localizar o envio dentro do ciclo), então continua
 * funcionando sem alteração tanto para `avaliacao_360` quanto para o novo
 * modelo de `clima_geral`.
 */
async function buscarEnvioDoCicloOuFalhar(cicloId: string, envioId: string): Promise<EnvioPesquisa> {
  const envio = await AppDataSource.getRepository(EnvioPesquisa)
    .createQueryBuilder('e')
    .innerJoin(Pesquisa, 'pesquisa', 'pesquisa.id = e.pesquisa_id')
    .where('e.id = :envioId', { envioId })
    .andWhere('pesquisa.ciclo_id = :cicloId', { cicloId })
    .getOne()

  if (!envio) {
    throw new ErroHttp(404, 'ENVIO_NAO_ENCONTRADO', 'Envio de pesquisa não encontrado para este ciclo.')
  }

  return envio
}

/**
 * Query base — reaproveitada por `listarPorCiclo` (braço `avaliacao_360`) e
 * por `buscarEnvioComNomes` (usada pelas 3 ações, qualquer origem).
 * `LEFT JOIN` (nunca `INNER JOIN`) em `relacionamentos_avaliacao`/
 * avaliador/avaliado: cada linha de `envios_pesquisa` só preenche um dos
 * dois lados (garantido pelo CHECK do banco) — para uma linha de
 * `clima_geral`, todos os campos vindos desse `LEFT JOIN` vêm `NULL`,
 * tratado em `mapearLinha`. O `leftJoin`/`addSelect` de `destinatario`
 * (modelo anterior) foram REMOVIDOS — não há mais "destinatário" por linha.
 */
function baseQuery() {
  return AppDataSource.getRepository(EnvioPesquisa)
    .createQueryBuilder('e')
    .innerJoin(Pesquisa, 'pesquisa', 'pesquisa.id = e.pesquisa_id')
    .leftJoin(RelacionamentoAvaliacao, 'r', 'r.id = e.relacionamento_id')
    .leftJoin(Colaborador, 'avaliador', 'avaliador.id = r.avaliador_id')
    .leftJoin(Colaborador, 'avaliado', 'avaliado.id = r.avaliado_id')
    .select('e.id', 'id')
    .addSelect('pesquisa.tipo', 'pesquisaTipo')
    .addSelect('e.relacionamento_id', 'relacionamentoId')
    .addSelect('r.avaliador_id', 'avaliadorId')
    .addSelect('avaliador.nome_completo', 'avaliadorNome')
    .addSelect('r.avaliado_id', 'avaliadoId')
    .addSelect('avaliado.nome_completo', 'avaliadoNome')
    .addSelect('r.tipo_relacionamento', 'tipoRelacionamento')
    .addSelect('e.status', 'status')
    .addSelect('e.token_acesso', 'tokenAcesso')
    .addSelect('e.quantidade_lembretes', 'quantidadeLembretes')
    .addSelect('e.cpf_confirmado_em', 'cpfConfirmadoEm')
    .addSelect('e.concluido_em', 'concluidoEm')
}

async function buscarEnvioComNomes(envioId: string): Promise<EnvioAcaoResposta> {
  const linha = await baseQuery().where('e.id = :envioId', { envioId }).getRawOne()
  return mapearLinha(linha)
}

/**
 * Discriminante: presença de `relacionamentoId` (nunca ambos/nenhum,
 * garantido pelo CHECK `chk_envios_pesquisa_origem_exclusiva` no banco —
 * agora contra `ciclo_id` em vez de `colaborador_id`, mas a lógica de
 * discriminação por `relacionamentoId` não muda).
 */
function mapearLinha(linha: any): EnvioAcaoResposta {
  const comum: EnvioComumResposta = {
    id: linha.id,
    status: linha.status,
    link: montarLinkPublico(linha.tokenAcesso),
    quantidadeLembretes: linha.quantidadeLembretes,
    cpfConfirmadoEm: linha.cpfConfirmadoEm ? new Date(linha.cpfConfirmadoEm).toISOString() : null,
    concluidoEm: linha.concluidoEm ? new Date(linha.concluidoEm).toISOString() : null,
  }

  if (linha.relacionamentoId) {
    return {
      ...comum,
      origem: 'relacionamento',
      avaliadorId: linha.avaliadorId,
      avaliadorNome: linha.avaliadorNome,
      avaliadoId: linha.avaliadoId,
      avaliadoNome: linha.avaliadoNome,
      tipoRelacionamento: linha.tipoRelacionamento,
    }
  }

  return { ...comum, origem: 'ciclo' }
}

function mapearParticipanteClima(linha: any): ParticipanteClimaResposta {
  return {
    id: linha.id,
    colaboradorId: linha.colaboradorId,
    nomeCompleto: linha.nomeCompleto,
    respondeuEm: linha.respondeuEm ? new Date(linha.respondeuEm).toISOString() : null,
  }
}

export async function listarPorCiclo(
  ator: ColaboradorAutenticado,
  cicloId: string,
): Promise<ListarEnviosCicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  // Visão IDENTIFICADA de controle de envio — restrita a admin/gestor_rh,
  // mesma natureza de GET /api/ciclos/:id/relacionamentos. Nunca junction
  // com dado de resposta (itens_resposta/respostas ainda não existem).
  await buscarCicloOuFalhar(cicloId)

  const linhas = await baseQuery()
    .where('pesquisa.ciclo_id = :cicloId', { cicloId })
    .orderBy('avaliado.nome_completo', 'ASC')
    .addOrderBy('r.tipo_relacionamento', 'ASC')
    .getRawMany()

  if (linhas.length === 0) {
    return { tipoPesquisa: null, envios: [] }
  }

  const tipoPesquisa = linhas[0].pesquisaTipo as TipoPesquisa

  if (tipoPesquisa === 'clima_geral') {
    // Exatamente 1 linha, garantido pelo índice único parcial
    // uq_envios_pesquisa_ciclo — mapearLinha() sempre retorna o braço
    // `origem: 'ciclo'` aqui, porque nenhuma linha de clima tem
    // relacionamentoId preenchido.
    const campanha = mapearLinha(linhas[0]) as EnvioClimaGeralCampanhaResposta

    const participantesLinhas = await AppDataSource.getRepository(CicloParticipante)
      .createQueryBuilder('p')
      .innerJoin(Colaborador, 'c', 'c.id = p.colaborador_id')
      .select('p.id', 'id')
      .addSelect('p.colaborador_id', 'colaboradorId')
      .addSelect('c.nome_completo', 'nomeCompleto')
      .addSelect('p.respondeu_em', 'respondeuEm')
      .where('p.ciclo_id = :cicloId', { cicloId })
      .orderBy('c.nome_completo', 'ASC')
      .getRawMany()

    return {
      tipoPesquisa: 'clima_geral',
      campanha,
      participantes: participantesLinhas.map(mapearParticipanteClima),
    }
  }

  // avaliacao_360: SEM MUDANÇA de comportamento em relação à versão
  // anterior (mesmas linhas, mesmo mapeamento).
  return {
    tipoPesquisa: 'avaliacao_360',
    envios: linhas.map(mapearLinha) as EnvioAvaliacao360Resposta[],
  }
}

export async function marcarComoEnviado(
  ator: ColaboradorAutenticado,
  cicloId: string,
  envioId: string,
): Promise<EnvioAcaoResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarCicloOuFalhar(cicloId)
  const envio = await buscarEnvioDoCicloOuFalhar(cicloId, envioId)

  if (envio.status !== 'pendente') {
    throw new ErroHttp(
      409,
      'TRANSICAO_ENVIO_INVALIDA',
      'Só é possível marcar como enviado um envio em status "pendente".',
    )
  }

  envio.status = 'enviado'
  envio.enviadoEm = new Date()
  await AppDataSource.getRepository(EnvioPesquisa).save(envio)

  return buscarEnvioComNomes(envioId)
}

export async function registrarLembrete(
  ator: ColaboradorAutenticado,
  cicloId: string,
  envioId: string,
): Promise<EnvioAcaoResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarCicloOuFalhar(cicloId)
  const envio = await buscarEnvioDoCicloOuFalhar(cicloId, envioId)

  if (envio.status !== 'enviado') {
    throw new ErroHttp(
      409,
      'TRANSICAO_ENVIO_INVALIDA',
      'Só é possível registrar lembrete para um envio em status "enviado".',
    )
  }

  envio.quantidadeLembretes += 1
  await AppDataSource.getRepository(EnvioPesquisa).save(envio)

  return buscarEnvioComNomes(envioId)
}

export async function expirarEnvio(
  ator: ColaboradorAutenticado,
  cicloId: string,
  envioId: string,
): Promise<EnvioAcaoResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarCicloOuFalhar(cicloId)
  const envio = await buscarEnvioDoCicloOuFalhar(cicloId, envioId)

  envio.status = 'expirado'
  await AppDataSource.getRepository(EnvioPesquisa).save(envio)

  return buscarEnvioComNomes(envioId)
}
```

Notas explícitas para o `backend-developer`:

- `gerarEnviosPesquisa` (avaliacao_360), `buscarEnvioDoCicloOuFalhar`,
  `marcarComoEnviado`, `registrarLembrete`, `expirarEnvio`: **corpo idêntico
  ao atual**, só renomeando o tipo de retorno de `EnvioCicloResposta` para
  `EnvioAcaoResposta` — reproduzidos acima por completude do arquivo, não
  por terem lógica nova.
  `getRawMany()`) — os campos vêm de `JOIN`s, não são coluna própria de
  `EnvioPesquisa`/`CicloParticipante`.
- Os dois casts (`as EnvioClimaGeralCampanhaResposta` e `as
  EnvioAvaliacao360Resposta[]`) dentro de `listarPorCiclo` são seguros por
  construção: o CHECK `chk_envios_pesquisa_origem_exclusiva` garante que,
  para um dado `pesquisa.ciclo_id`, ou TODAS as linhas têm
  `relacionamento_id` preenchido (`avaliacao_360`) ou existe EXATAMENTE 1
  linha com `ciclo_id` preenchido e nenhuma outra (`clima_geral`) — nunca
  mistura. `mapearLinha` já teria retornado o braço errado só se essa
  invariante do banco fosse violada, o que a aplicação nunca faz (só
  `gerarEnviosPesquisa`/`gerarEnviosClima` inserem, cada uma populando
  exclusivamente seu próprio lado).

#### 1.5 `ciclos-avaliacao.service.ts`, `ciclos-avaliacao.module.ts`, `envios-pesquisa.controller.ts`, `envios-pesquisa.module.ts`

**Nenhuma mudança em nenhum dos 4 arquivos.** `gerarEnviosClima` mantém a
mesma assinatura (ver decisão 7); as 4 rotas e seus papéis não mudam; o
controller só repassa `req.colaboradorAutenticado`/parâmetros de rota para o
service, sem depender do shape de retorno.

#### 1.6 Shape de resposta — contrato final (literal, para o plano de frontend em paralelo)

**`GET /api/ciclos/:cicloId/envios`** — ciclo ainda não ativado (nenhum envio
gerado, qualquer tipo de pesquisa):
```json
{ "tipoPesquisa": null, "envios": [] }
```

**avaliacao_360** — SEM NENHUMA MUDANÇA em relação ao shape atual:
```json
{
  "tipoPesquisa": "avaliacao_360",
  "envios": [
    {
      "id": "uuid",
      "origem": "relacionamento",
      "avaliadorId": "uuid",
      "avaliadorNome": "string",
      "avaliadoId": "uuid",
      "avaliadoNome": "string",
      "tipoRelacionamento": "autoavaliacao | gestor | pares | subordinado | externo",
      "status": "pendente | enviado | em_andamento | concluido | expirado",
      "link": "string",
      "quantidadeLembretes": 0,
      "cpfConfirmadoEm": null,
      "concluidoEm": null
    }
  ]
}
```

**clima_geral** — shape NOVO desta task:
```json
{
  "tipoPesquisa": "clima_geral",
  "campanha": {
    "id": "uuid",
    "origem": "ciclo",
    "status": "pendente | enviado | em_andamento | concluido | expirado",
    "link": "string",
    "quantidadeLembretes": 0,
    "cpfConfirmadoEm": null,
    "concluidoEm": null
  },
  "participantes": [
    {
      "id": "uuid (ciclo_participantes.id)",
      "colaboradorId": "uuid",
      "nomeCompleto": "string",
      "respondeuEm": null
    }
  ]
}
```

**`PATCH /api/ciclos/:cicloId/envios/:id/marcar-enviado`** /
**`.../registrar-lembrete`** / **`.../expirar`** — mesmas 3 rotas, mesmos
papéis, corpo de resposta é o item único atualizado (`EnvioAcaoResposta`):
para `avaliacao_360`, exatamente o mesmo objeto de item já usado hoje
(`origem: 'relacionamento'`, com avaliador/avaliado); para `clima_geral`,
agora o objeto da campanha (`origem: 'ciclo'`, SEM `destinatario`):
```json
{
  "id": "uuid",
  "origem": "ciclo",
  "status": "enviado",
  "link": "string",
  "quantidadeLembretes": 0,
  "cpfConfirmadoEm": null,
  "concluidoEm": null
}
```

O `id` a usar nessas 3 rotas para uma campanha de clima é `campanha.id`
(vindo do `GET` acima) — mesmo padrão já usado hoje para `avaliacao_360`
(`id` de cada item de `envios`).

#### 1.7 Tabela de rotas — contrato de API completo (inalterado em relação ao já existente)

| Método | Rota | Papéis | Request (body) | Sucesso | Erros específicos |
|---|---|---|---|---|---|
| GET | `/api/ciclos/:cicloId/envios` | admin, gestor_rh | — | `200 ListarEnviosCicloResposta` (shape novo p/ `clima_geral`, ver 1.6) | `404 CICLO_NAO_ENCONTRADO` |
| PATCH | `/api/ciclos/:cicloId/envios/:id/marcar-enviado` | admin, gestor_rh | — | `200 EnvioAcaoResposta` | `404 CICLO_NAO_ENCONTRADO`, `404 ENVIO_NAO_ENCONTRADO`, `409 TRANSICAO_ENVIO_INVALIDA` |
| PATCH | `/api/ciclos/:cicloId/envios/:id/registrar-lembrete` | admin, gestor_rh | — | `200 EnvioAcaoResposta` | `404 CICLO_NAO_ENCONTRADO`, `404 ENVIO_NAO_ENCONTRADO`, `409 TRANSICAO_ENVIO_INVALIDA` |
| PATCH | `/api/ciclos/:cicloId/envios/:id/expirar` | admin, gestor_rh | — | `200 EnvioAcaoResposta` | `404 CICLO_NAO_ENCONTRADO`, `404 ENVIO_NAO_ENCONTRADO` |

Nenhuma rota nova, nenhuma rota removida, nenhum papel alterado. Continua
tudo restrito a `admin`/`gestor_rh` via `garantirPapel` + `autenticar`
(montado 2x — router pai `ciclos-avaliacao` e de novo em
`envios-pesquisa.module.ts`), nunca acessível por `colaborador`.

Ao terminar: rodar `npm run build` (tsc) e `npm test` dentro de `backend/` e
confirmar que compilam/passam antes de marcar a etapa concluída. Registrar no
resumo da task que a migration desta seção **não deve ser executada** contra
um banco real sem confirmação explícita do usuário.

### 2. backend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **`avaliacao_360` realmente não mudou em nada.** Diff de
   `envios-pesquisa.service.ts` restrito a: (a) o corpo de `gerarEnviosClima`
   (b) a remoção do `leftJoin`/`addSelect` de `destinatario` em `baseQuery`
   (c) o novo branch `if (tipoPesquisa === 'clima_geral')` dentro de
   `listarPorCiclo` (d) renomeação de tipos (`EnvioCicloResposta` →
   `EnvioAcaoResposta`, `EnvioClimaGeralResposta` →
   `EnvioClimaGeralCampanhaResposta`). Nenhuma linha de
   `gerarEnviosPesquisa`, `buscarEnvioDoCicloOuFalhar`, `marcarComoEnviado`,
   `registrarLembrete`, `expirarEnvio` deveria ter lógica alterada (só o tipo
   de retorno anotado). **`ciclos-avaliacao.service.ts` não deveria aparecer
   no diff.**
2. **Migration**: ordem de `DROP`/`ADD` no `up()` — a constraint
   `chk_envios_pesquisa_origem_exclusiva` e os 2 índices que referenciam
   `colaborador_id` precisam ser derrubados **antes** de `DROP COLUMN
   colaborador_id`; a nova constraint/índices só depois de `ADD COLUMN
   ciclo_id`. Conferir que `down()` faz o inverso exato, na ordem certa
   (primeiro os objetos dependentes de `ciclo_id`, depois recriar
   `colaborador_id`, depois os objetos dependentes dele). Nomes de
   constraint/índice batendo exatamente com os usados no `up()`/`down()`
   (`chk_envios_pesquisa_origem_exclusiva`, `uq_envios_pesquisa_ciclo`,
   `idx_envios_ciclo`).
3. **Guard rail de anonimização**: `gerarEnviosClima` não deveria importar
   nem referenciar `RelacionamentoAvaliacao`/`relacionamentos_avaliacao` em
   nenhuma linha. Nenhuma query desta task deveria juntar
   `itens_resposta`/`respostas` com `avaliador_id` (tabelas que nem existem
   ainda) — confirmar que a busca. `respondeu_em` só é lida (nunca escrita)
   por `listarPorCiclo`.
4. **`EnvioPesquisa.cicloId`/`ciclo` nullable, `onDelete: 'CASCADE'`** —
   conferir que a entidade bate exatamente com a migration (tipo `uuid`,
   nullable, FK para `ciclos_avaliacao(id)`).
5. **`CicloParticipante.respondeuEm`**: conferir que nenhuma rota desta task
   (nenhuma de `envios-pesquisa`, `ciclo-participantes`, `ciclos-avaliacao`)
   escreve essa coluna — só a migration a cria e só `listarPorCiclo` a lê.
6. **Casts (`as EnvioClimaGeralCampanhaResposta`/`as
   EnvioAvaliacao360Resposta[]`) dentro de `listarPorCiclo`** — conferir que
   a justificativa (invariante garantida pelo CHECK do banco + pela
   exclusividade de `gerarEnviosPesquisa`/`gerarEnviosClima`) está correta e
   documentada em comentário, não um cast "às cegas".
7. **Papéis/autorização**: `garantirPapel(ator, ['admin', 'gestor_rh'])`
   continua como primeira linha de toda função exportada de
   `envios-pesquisa.service.ts` que recebe `ator` (`listarPorCiclo`,
   `marcarComoEnviado`, `registrarLembrete`, `expirarEnvio`) — sem exceção,
   sem regressão. `gerarEnviosPesquisa`/`gerarEnviosClima` continuam sem
   `garantirPapel` própria (funções internas, chamadas só depois de
   `atualizarStatus` já ter checado o papel).
8. **`tratadorErros.ts`**: confirmar que nenhuma entrada nova foi adicionada
   a `MAPA_CONSTRAINT_PARA_CODIGO` (decisão 13) — se o `backend-developer`
   adicionar uma, questionar a justificativa (nenhuma rota HTTP insere
   diretamente em `ciclo_id`/`relacionamento_id`).
9. **Build/testes**: `npm run build` e `npm test` (dentro de `backend/`) sem
   erros novos introduzidos por esta task (erros pré-existentes documentados
   em tasks anteriores, se ainda presentes, não são bloqueadores desta
   revisão).

## Perguntas em aberto

1. **`GET /api/ciclos/:cicloId/envios` (braço `clima_geral`) só mostra
   `participantes` depois do ciclo ativado** (decisão 9) — antes disso,
   `tipoPesquisa: null, envios: []`, mesmo que `ciclo_participantes` já
   exista. Se o frontend precisar mostrar a lista de participantes de um
   ciclo `clima_geral` **antes** da ativação nesta mesma tela, o caminho já
   existente é `GET /api/ciclos/:cicloId/participantes` (módulo
   `ciclo-participantes`, sem `respondeuEm` porque essa coluna não existe
   ali) — ou uma extensão futura para adicionar `respondeuEm` também a esse
   endpoint. Não resolvido aqui porque é uma decisão de UX do
   `task-frontend.md`, não de modelo de dados.
2. **Se a futura task do formulário público `/responder` precisar de mais
   colunas em `ciclo_participantes`** (ex.: tentativas de CPF inválido
   específicas do participante, distintas de
   `envios_pesquisa.tentativas_cpf_invalidas` que é da campanha inteira),
   isso é uma migration nova naquela task — fora de escopo aqui, só
   sinalizado para não ser descoberto tarde.
3. **Nome do índice único `uq_envios_pesquisa_ciclo`** foi escolhido em
   `(ciclo_id)` (sem `pesquisa_id`) — ver decisão 3. Se no futuro o produto
   quiser permitir 2 pesquisas `clima_geral` simultâneas no mesmo ciclo (hoje
   inconcebível: um ciclo só tem uma `pesquisaPublicada` de cada vez), esse
   índice precisaria ser revisitado para `(pesquisa_id, ciclo_id)` parcial —
   não implementado por não haver esse requisito hoje.

## Status — 1. backend-developer

**Concluído.** Implementação seguiu o plano literalmente, sem desvios —
nenhuma divergência do plano foi identificada durante a execução. Skills
`backend-modulo-crud` e `backend-anonimizacao-respostas` invocadas antes de
codar, conforme instruído.

### Arquivos criados

- `backend/src/migrations/1788450000000-EnvioUnicoClimaGeralPorCiclo.ts` —
  migration nova (timestamp maior que `1788400000000`, nenhum conflito com
  outra migration criada nesse intervalo). `up()`: derruba
  `chk_envios_pesquisa_origem_exclusiva` + `idx_envios_colaborador` +
  `uq_envios_pesquisa_colaborador` + `DROP COLUMN colaborador_id`; adiciona
  `ciclo_id uuid REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE` +
  `CHECK chk_envios_pesquisa_origem_exclusiva` reescrita (`ciclo_id` no lugar
  de `colaborador_id`) + índice único parcial `uq_envios_pesquisa_ciclo
  (ciclo_id) WHERE ciclo_id IS NOT NULL` + `idx_envios_ciclo`; adiciona
  `ciclo_participantes.respondeu_em timestamptz` (nullable, sem default,
  sem índice). `down()` reverte na ordem inversa exata, recriando a coluna
  `colaborador_id`/constraint/índices antigos (sem preservar dados
  históricos — autorizado explicitamente pelo usuário). **NÃO executada
  contra nenhum banco real** — só o arquivo foi escrito, aguardando
  confirmação explícita do usuário para rodar `npm run migration:run`.

### Arquivos alterados

- `backend/src/modules/envios-pesquisa/envio-pesquisa.entity.ts` — bloco
  `colaboradorId`/`colaborador` (`ManyToOne` → `Colaborador`) substituído por
  `cicloId`/`ciclo` (`ManyToOne` → `CicloAvaliacao`, nullable, `onDelete:
  'CASCADE'`); import de `Colaborador` trocado por `CicloAvaliacao`.
- `backend/src/modules/ciclo-participantes/ciclo-participante.entity.ts` —
  coluna `respondeuEm: Date | null` nova (`respondeu_em timestamptz
  nullable`), logo após `colaborador`/`colaboradorId`; nenhuma outra mudança.
- `backend/src/modules/envios-pesquisa/envios-pesquisa.service.ts` —
  reescrito por completo conforme o literal da seção 1.4 do plano: tipos
  `EnvioClimaGeralResposta`/`EnvioCicloResposta` (antigos) substituídos por
  `EnvioClimaGeralCampanhaResposta` (`origem: 'ciclo'`, sem `destinatario`) e
  `EnvioAcaoResposta` (união `EnvioAvaliacao360Resposta |
  EnvioClimaGeralCampanhaResposta`); `ListarEnviosCicloResposta` vira união
  discriminada por `tipoPesquisa` (`null` → `{ envios: [] }`;
  `'avaliacao_360'` → `{ envios: [...] }`, shape inalterado; `'clima_geral'`
  → `{ campanha, participantes }`, shape novo); `ParticipanteClimaResposta`
  novo; `gerarEnviosClima` reescrita (não lê mais `ciclo_participantes`, só
  insere 1 linha com `cicloId` preenchido, `.orIgnore()` mantido);
  `gerarEnviosPesquisa`/`buscarEnvioDoCicloOuFalhar`/`marcarComoEnviado`/
  `registrarLembrete`/`expirarEnvio` sem mudança de lógica (só herdam os
  tipos de retorno renomeados); `baseQuery` perdeu o `leftJoin`/`addSelect`
  de `destinatario`; `mapearLinha` braço `else` simplificado para `{
  ...comum, origem: 'ciclo' }`; `listarPorCiclo` ganhou o branch `if
  (tipoPesquisa === 'clima_geral')` com a query separada de participantes
  (`ciclo_participantes` INNER JOIN `colaboradores`).

### Arquivos explicitamente NÃO alterados (confirmado)

- `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.service.ts` — zero
  linhas alteradas; `gerarEnviosClima(manager, ciclo.id,
  pesquisaPublicada.id)` continua com a mesma assinatura/chamada.
- `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.module.ts`,
  `backend/src/modules/envios-pesquisa/envios-pesquisa.controller.ts`,
  `backend/src/modules/envios-pesquisa/envios-pesquisa.module.ts` — nenhuma
  mudança; as 4 rotas, papéis e handlers continuam idênticos.
- `backend/src/middlewares/tratadorErros.ts`
  (`MAPA_CONSTRAINT_PARA_CODIGO`) — nenhuma entrada nova adicionada
  (decisão 13 do plano).
- Nenhum arquivo em `frontend/` tocado.

### Validação

- `npm run build` (tsc): 1 erro pré-existente e não relacionado em
  `backend/src/test/fakeRepository.ts` (arquivo não tocado por esta task,
  confirmado via `git status` sem alterações nele) — nenhum erro novo
  introduzido pela mudança.
- `npm test` (vitest): **141/141 testes passando**, nenhuma falha.

### Migrations que precisam rodar

- `1788450000000-EnvioUnicoClimaGeralPorCiclo.ts` — **NÃO executada**.
  Precisa de `npm run migration:run` dentro de `backend/`, só mediante
  confirmação explícita do usuário (nenhuma das 3 migrations do módulo
  `envios_pesquisa`/`ciclo_participantes` rodou ainda contra um banco real).

## Revisão

**Sem achados críticos.** A implementação segue o plano literalmente — os 4
arquivos tocados (migration, as duas entidades, o service) foram lidos por
completo e conferidos contra o plano linha a linha, e os 4 arquivos que o
developer afirma não ter tocado (`ciclos-avaliacao.service.ts`,
`ciclos-avaliacao.module.ts`, `envios-pesquisa.controller.ts`,
`envios-pesquisa.module.ts`, `tratadorErros.ts`) foram lidos e confirmados
como corretamente inalterados — nenhum deles precisaria de ajuste.

### 1. Regressão em Avaliação 360

Sem regressão. `gerarEnviosPesquisa`, `buscarEnvioDoCicloOuFalhar`,
`marcarComoEnviado`, `registrarLembrete`, `expirarEnvio` têm corpo idêntico ao
descrito como "sem mudança" no plano — só herdam a renomeação de tipo
(`EnvioCicloResposta` → `EnvioAcaoResposta`). Em `baseQuery`/`mapearLinha`, o
único corte foi o `leftJoin`/`addSelect` de `destinatario` (que só existia
para o braço antigo de clima) — o braço `avaliacao_360` (avaliador/avaliado/
`tipoRelacionamento`) não perdeu nenhum campo. `listarPorCiclo` mantém a
mesma query/ordenação para `avaliacao_360` (`orderBy('avaliado.nome_completo'...)`
+ `addOrderBy('r.tipo_relacionamento'...)`), só ganhou um branch novo
`if (tipoPesquisa === 'clima_geral')` antes do retorno de `avaliacao_360`.
`ciclos-avaliacao.service.ts` (`atualizarStatus`, o branch
`avaliacao_360`/`clima_geral`, a checagem `CICLO_SEM_PARTICIPANTES`) foi lido
por completo — zero linhas divergem do que já existia; a chamada
`gerarEnviosClima(manager, ciclo.id, pesquisaPublicada.id)` continua batendo
com a assinatura inalterada da função reescrita.

### 2. Anonimização

Guard rails íntegros: `gerarEnviosClima` não importa nem referencia
`RelacionamentoAvaliacao`/`relacionamentos_avaliacao` em nenhuma linha — só
insere 1 linha em `EnvioPesquisa` com `cicloId` preenchido. `EnvioPesquisa`
não ganhou nenhuma coluna de resposta/nota/valor (confirmado no diff da
entidade: só o par `colaboradorId`/`colaborador` foi trocado por
`cicloId`/`ciclo`, mesmo tipo/nullable/`onDelete`). `ciclo_participantes.
respondeu_em` é lida (nunca escrita) só dentro de `listarPorCiclo` — nenhuma
outra rota desta task ou de módulos vizinhos (`ciclo-participantes`,
`ciclos-avaliacao`) grava essa coluna, confirmado por grep. Nenhuma query
nova junta `itens_resposta`/`respostas` (que não existem) com
`avaliador_id`. A regra de `minimo_respostas_pares` não é tocada nem
simulada para `clima_geral`, corretamente — essa dimensão não existe fora de
`tipo_relacionamento`.

### 3. Controle de acesso

`garantirPapel(ator, [...PAPEIS_COM_ACESSO])` (`['admin', 'gestor_rh']`)
continua como primeira linha de `listarPorCiclo`, `marcarComoEnviado`,
`registrarLembrete` e `expirarEnvio`, sem exceção. `gerarEnviosPesquisa`/
`gerarEnviosClima` seguem sem `garantirPapel` própria (funções internas,
chamadas só a partir de `atualizarStatus`, que já checou o papel antes) —
mesmo padrão pré-existente. `envios-pesquisa.module.ts` continua montando
`autenticar` (defesa em profundidade, já autenticado pelo router pai) e o
controller (`envios-pesquisa.controller.ts`) segue só repassando
`req.colaboradorAutenticado`/parâmetros de rota, sem lógica de autorização
própria — nada duplicado inline. `participantes` (identificado, nome
completo + `respondeuEm`) só é retornado dentro de `listarPorCiclo`, que já
exige `admin`/`gestor_rh` — nenhum caminho o expõe a `colaborador`.

### 4. Migration

`up()`/`down()` são espelho exato um do outro, na ordem certa: `up()` derruba
CHECK → os 2 índices dependentes de `colaborador_id` → `DROP COLUMN
colaborador_id`, só então adiciona `ciclo_id` → CHECK nova → os 2 índices
novos; `down()` inverte na ordem simétrica correta (índices/CHECK
dependentes de `ciclo_id` primeiro, depois recria `colaborador_id`, depois
CHECK/índices antigos). Nomes de constraint/índice idênticos aos usados nas
duas pontas (`chk_envios_pesquisa_origem_exclusiva`,
`uq_envios_pesquisa_ciclo`, `idx_envios_ciclo`) e ao estilo já usado em
`1788400000000-DiferenciarTipoPesquisaEEnviosClima.ts` (FK inline sem nome
explícito via `REFERENCES ... ON DELETE CASCADE`, mesmo padrão). `down()` não
reintroduzido nenhum dado histórico de `colaborador_id` — comportamento
explicitamente autorizado pelo usuário e documentado no comentário da classe.
Nenhuma entrada nova em `MAPA_CONSTRAINT_PARA_CODIGO` (`tratadorErros.ts`)
foi adicionada — confirmado lendo o arquivo por completo; correto, já que o
único `INSERT` em `ciclo_id`/`relacionamento_id` é `gerarEnviosClima`/
`gerarEnviosPesquisa`, ambos com `.orIgnore()`, nunca expondo a violação como
exceção HTTP. Migration **não foi executada** contra nenhum banco real
(consistente com o relatado pelo developer).

### 5. Convenções do projeto

Nomes de tabela/coluna (`envios_pesquisa.ciclo_id`,
`ciclo_participantes.respondeu_em`) em português, batendo com a migration
(fonte de verdade para este módulo). Tipos usados (`TipoPesquisa`,
`StatusEnvio`, `TipoRelacionamento`) são union types de `common/enums.ts`,
não `enum` nominal do TS — confirmado lendo `enums.ts`. `ErroHttp` +
`asyncHandler` inalterados (arquivos não tocados). Nenhum `synchronize:
true`, nenhuma coluna `organization_id`/multi-tenant introduzida.

### 6. Idempotência / decisão de gerar campanha com 0 participantes

`gerarEnviosClima` reescrita usa `.orIgnore()` sobre o índice único parcial
`uq_envios_pesquisa_ciclo` — idempotente sob retry/corrida, mesmo padrão já
usado por `gerarEnviosPesquisa`/`gerarRelacionamentos`. A decisão registrada
de gerar a campanha sempre (mesmo hipoteticamente com 0 participantes) é
coerente com a garantia já existente em `ciclos-avaliacao.service.ts`
(`CICLO_SEM_PARTICIPANTES` roda antes, para os dois tipos de pesquisa) e não
introduz nenhum caminho onde uma campanha "órfã" ficaria inacessível.

### Deveria corrigir

Nenhum item.

### Sugestão

- Nenhum teste automatizado cobre hoje `envios-pesquisa.service.ts` (não há
  `envios-pesquisa.service.test.ts`) — o braço `clima_geral` novo
  (`{ campanha, participantes }`), o cast de `mapearLinha`/`tipoPesquisa` e a
  idempotência de `gerarEnviosClima` sob dupla ativação/corrida seriam bons
  candidatos de cobertura pelo `test-engineer`, priorizando (a) que
  `clima_geral` nunca retorna `destinatario`/dado por pessoa, (b) que
  `avaliacao_360` continua com o shape antigo intacto, e (c) que
  `garantirPapel` bloqueia `colaborador` nas 4 funções exportadas.
- Este revisor não tem acesso a `Bash`/execução de comandos — não foi
  possível reexecutar `npm run build`/`npm test` de forma independente; a
  conclusão acima ("sem achados críticos") se apoia na leitura estática
  completa dos arquivos e no relatório do `backend-developer`
  (`141/141` testes, único erro de build pré-existente e não relacionado em
  `backend/src/test/fakeRepository.ts`).
- Migração cosmética, não bloqueante: os `DROP INDEX`/`DROP CONSTRAINT` no
  `up()`/`down()` não usam `IF EXISTS` — mesmo estilo já usado em
  `1788400000000-DiferenciarTipoPesquisaEEnviosClima.ts`, então não é uma
  divergência introduzida por esta task, só um padrão que já existia e que
  poderia ganhar mais robustez a um retry parcial de migration no futuro.

**Conclusão:** libera para a etapa `test-engineer`.
