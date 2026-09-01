# Task: Módulo de pesquisas (construtor de pesquisas) — Backend

Demanda 100% backend (`backend/`, equivalente a `apps/api` nas referências dos
agentes/skills — usar sempre os caminhos reais `backend/**` neste plano). Não
toca `frontend/`. Requisitos já especificados diretamente pelo usuário — sem
`spec.md`, etapa `spec` pulada a pedido explícito.

## Estado atual verificado (antes do plano)

- Módulo greenfield: não existe `src/modules/pesquisas/`, `paginas-pesquisa/`,
  `perguntas/` nem `competencias/`. Só `auth`, `equipes` e `colaboradores`
  estão implementados (`backend/src/modules/*`).
- Não existe `schema_avaliacao360_pt.sql` no repo (confirmado por `CLAUDE.md`
  e por busca no repositório) — os nomes de tabela/coluna abaixo seguem a
  convenção já estabelecida pela migration existente
  (`1788268503083-CriarEquipesEColaboradores.ts`) e, para os nomes de tabela
  de alto nível (`pesquisas`, `paginas_pesquisa`, `perguntas`, `competencias`),
  o texto já citado em `.claude/agents/backend-developer.md` (linha "Nomes de
  tabela/coluna em português... `pesquisas`, `paginas_pesquisa`, `perguntas`,
  ... `competencias`"). Nomes de **coluna** dentro dessas tabelas não estão
  em nenhum arquivo de referência — são propostas novas desta task, listadas
  explicitamente na seção final "Assunções e pendências" para confirmação.
- `AppDataSource` (`backend/src/data-source.ts`) já faz glob automático de
  `modules/**/*.entity.{ts,js}` — novas entidades não precisam ser
  registradas manualmente em lugar nenhum além de existirem no caminho certo.
- `src/app.ts` monta routers explicitamente (`app.use('/api/<recurso>', ...)`)
  — os novos routers de pesquisas/competências precisam ser adicionados ali.
- `src/common/enums.ts` hoje só tem `PapelColaborador`. Precisa ganhar
  `StatusPesquisa` e `TipoPergunta` como union types + arrays de valores,
  seguindo exatamente o mesmo padrão (nunca `enum` nominal do TS).
- Não existe tabela `ciclos_avaliacao` no banco nem módulo de ciclos no
  backend — por isso `pesquisas.ciclo_id` é `uuid NULL` **sem** `REFERENCES`
  nesta migration (ver decisão assumida 3 abaixo). Quando o módulo de ciclos
  existir, uma migration futura deve adicionar a FK.
- Este módulo é puramente estrutural (template de pesquisa). Nenhuma tabela
  aqui armazena resposta, respondente, avaliador ou contador de respostas —
  ver guard rail de anonimização na seção 1.8.

## Decisões assumidas (documentadas por não estarem no pedido original)

1. Chaves primárias novas: `id uuid DEFAULT gen_random_uuid()`, mesmo padrão
   de `equipes`/`colaboradores`.
2. Todas as tabelas novas ganham `criado_em`/`atualizado_em`
   (`timestamptz DEFAULT now()`), mesmo padrão já em uso.
3. `pesquisas.ciclo_id`: `uuid NULL`, **sem FK** (não existe `ciclos_avaliacao`
   ainda). Validado na aplicação apenas quanto ao formato (é um UUID
   sintaticamente válido), nunca quanto à existência. Este é um ponto
   explícito de dívida técnica — reforçar no comentário da migration e no
   `pesquisa.entity.ts` que a FK precisa ser adicionada quando o módulo de
   ciclos existir.
4. `status` de pesquisa é gerenciado **só** pela rota de transição dedicada
   (`PATCH /api/pesquisas/:id/status`) — `PUT /api/pesquisas/:id` (edição de
   campos gerais) ignora silenciosamente qualquer `status` recebido no body
   (o DTO de atualização nem declara o campo, mesmo padrão usado para
   `usuarioAuthId` em `atualizar-colaborador.dto.ts`).
5. Transições de status permitidas — **só avanço, nunca regressão, nunca
   pular etapa**: `rascunho → publicada`, `publicada → encerrada`. Qualquer
   outra combinação (`rascunho → encerrada`, `publicada → rascunho`,
   `encerrada → qualquer coisa`, ou "transição" para o próprio status atual)
   → `409 TRANSICAO_STATUS_INVALIDA`.
6. Publicar uma pesquisa (`rascunho → publicada`) exige que ela tenha pelo
   menos 1 página com pelo menos 1 pergunta — senão `422 PESQUISA_VAZIA`.
   Isso é uma leitura de "regras básicas" do pedido original, **não** uma
   instrução literal — registrada também na seção final para confirmação.
7. `DELETE /api/pesquisas/:id` só é permitido com a pesquisa em `rascunho`
   (`409 PESQUISA_NAO_REMOVIVEL` caso contrário) — depois de publicada, a
   pesquisa deve ser preservada como registro histórico (mesmo sem ciclo
   ainda ligado a ela de fato). Igual decisão implícita para páginas/perguntas
   individuais: exclusão delas só é permitida enquanto a pesquisa-mãe está em
   `rascunho` (regra literal do pedido, não uma extensão).
8. `paginas_pesquisa.titulo` e `perguntas.obrigatoria` seguem defaults
   permissivos: `titulo` opcional (`NULL`), `obrigatoria boolean NOT NULL
   DEFAULT true`. Nenhum dos dois foi especificado no pedido.
9. Pergunta tipo `matriz` referencia **1 ou mais competências** via tabela de
   junção `perguntas_competencias` (many-to-many), não uma única
   `competencia_id` direta na pergunta — decisão de modelagem para suportar
   uma "matriz" real (várias competências avaliadas na mesma grade). Este é
   o ponto de maior incerteza de modelagem desta task — ver seção final.
   Este vínculo é **sempre relacional** (campo `competenciaIds` de nível
   superior no DTO + tabela `perguntas_competencias`), nunca um valor dentro
   da coluna `perguntas.configuracao` (jsonb, ver 1.7) — um blob JSON não
   permite validar existência de FK (`404 COMPETENCIA_NAO_ENCONTRADA`), a
   relação permite.
10. Duplicar pesquisa: a cópia nasce sempre em `status = 'rascunho'`,
    `ciclo_id = null` (nunca herda o vínculo de ciclo da original, mesmo que
    o motor de ciclos ainda não exista — evita duas pesquisas "ativas" no
    mesmo ciclo por acidente no futuro), e `titulo` recebe o sufixo
    `" (cópia)"`. Nenhum desses três comportamentos foi pedido literalmente.
11. `competencias` não ganha rotas de criação/edição/remoção nesta task — só
    `GET /api/competencias` (listagem), exatamente como pedido. Como as
    linhas entram na tabela é uma pendência explícita (ver seção final).
12. Casing de request/response: **camelCase**, mesmo padrão de
    `equipes`/`colaboradores`. Isso inclui as chaves **dentro** de
    `perguntas.configuracao` (`niveis`, `rotulos`, `filtroRelacionamento`,
    ver 1.7) — mesmo a skill `frontend-componente-pergunta` descrevendo esses
    nomes em snake_case no texto em prosa; a skill descreve o conceito, o
    contrato de wire format desta API segue a convenção já estabelecida do
    projeto.
13. Reordenação (páginas e perguntas) é feita em lote via um único endpoint
    `PATCH .../reordenar` que recebe a lista completa de `{ id, ordem }` do
    escopo afetado (todas as páginas de uma pesquisa, ou todas as perguntas
    de uma página) — não um endpoint por item. Evita estados intermediários
    inconsistentes de `ordem`.

## Plano — Backend

### 1. backend-developer — ✅ concluído

Antes de codar: invocar a skill `backend-modulo-crud` (estrutura de pastas e
convenção de nomes) e a skill `backend-anonimizacao-respostas` — mesmo este
módulo não tocando respostas/avaliadores, a skill define o "sinal de alerta"
que a seção 1.8 abaixo detalha para as entidades desta task especificamente.

**Resumo da implementação**

Skills invocadas antes de codar: `backend-modulo-crud` e
`backend-anonimizacao-respostas` (via `Skill` tool, conforme exigido).

`npm run build` (tsc) executado com sucesso ao final — nenhum erro nos
arquivos novos/alterados desta task. Único erro remanescente no output do
build (`src/test/fakeRepository.ts`, `TS2352`) é **pré-existente** e
independente desta task — confirmado reproduzindo o build em `main` antes de
qualquer alteração (via `git stash -u`); não foi tocado, fora de escopo.

- **1.1 Enums**: `StatusPesquisa`/`STATUS_PESQUISA_VALORES`,
  `TipoPergunta`/`TIPO_PERGUNTA_VALORES` (exatamente 4 valores) e
  `TipoRelacionamento`/`TIPO_RELACIONAMENTO_VALORES` (provisório, comentado
  como tal) adicionados a `src/common/enums.ts`, mesmo padrão de
  `PapelColaborador`.
- **1.2 Migration**: `src/migrations/1788288525381-CriarPesquisasPaginasPerguntasCompetencias.ts`
  criada com `up`/`down` completos, exatamente os nomes de constraint
  pedidos (`uq_competencias_nome`, `uq_paginas_pesquisa_pesquisa_ordem`,
  `uq_perguntas_pagina_ordem`), as duas `UNIQUE ... DEFERRABLE INITIALLY
  DEFERRED` para reordenação em lote, `ciclo_id` sem `REFERENCES` (comentário
  explícito no SQL sobre a dívida técnica). **NÃO executada** contra nenhum
  banco (`npm run migration:run` não foi rodado) — aguardando confirmação
  explícita do usuário, mesma regra da migration de equipes/colaboradores.
- **1.3 Entidades**: `Competencia`, `Pesquisa` (sem `@ManyToOne` para
  `cicloId`, comentário citando a decisão assumida 3), `PaginaPesquisa`,
  `Pergunta` (comentário explícito no `configuracao` sobre nunca guardar
  dado de execução) e `PerguntaCompetencia` (chave composta, tabela de
  junção pura), todas em `src/modules/<módulo>/`.
- **1.4 `competencias`**: só `GET /api/competencias` (listagem), sem
  create/update/delete, conforme pedido.
- **1.5 `pesquisas`**: `criar`/`listar`/`buscarPorId`/`atualizar`/`remover`/
  `atualizarStatus`/`duplicar` em `pesquisas.service.ts`, todas com
  `garantirPapel(['admin', 'gestor_rh'])` como primeira linha (exceto
  `buscarEntidadeOuFalhar`/`garantirEditavel`, explicitamente documentadas no
  plano como auxiliares internas, não rotas). Transições de status restritas
  ao mapa `rascunho→publicada→encerrada`; publicar exige ao menos 1
  pergunta (`422 PESQUISA_VAZIA`); `duplicar` clona a árvore inteira dentro
  de uma transação (`AppDataSource.transaction`), sempre `rascunho`/
  `cicloId: null`/título com sufixo `" (cópia)"`; `remover` só em `rascunho`.
  Shape aninhado (`GET /:id`, `POST`, `PUT`, `duplicar`) monta
  páginas→perguntas→competências reaproveitando
  `paginasPesquisaService.listar` (função interna, sem rota própria) e
  consultas diretas para perguntas/vínculos.
- **1.6 `paginas-pesquisa`**: sub-router (`mergeParams: true`) montado em
  `pesquisas.module.ts` em `/:pesquisaId/paginas`; `criar`/`atualizar`/
  `remover`/`reordenar` chamam `garantirEditavel` (nunca `listar`, que é a
  função interna reaproveitada pelo shape aninhado); `reordenar` roda em
  transação, valida cobertura exata do conjunto de ids + ordens inteiras
  positivas sem duplicatas (`422 ORDEM_INVALIDA`).
- **1.7 `perguntas`**: sub-router (`mergeParams: true`) montado em
  `paginas-pesquisa.module.ts` em `/:paginaId/perguntas`.
  `validarConfiguracaoPergunta` implementa exatamente as 4 regras por tipo
  (`likert`/`matriz`: `niveis` 2–10 + `rotulos` com tamanho exato;
  `texto_aberto`: rejeita qualquer chave; `pessoa`: `filtroRelacionamento`
  não vazio contra `TIPO_RELACIONAMENTO_VALORES`), sempre antes da checagem
  de `competenciaIds`. Regra `matriz`↔`competenciaIds` implementada em
  `resolverCompetencias`, chamada em toda `criar`/`atualizar` com a lista
  efetiva de ids (enviada no body, ou a já vinculada no banco quando
  `competenciaIds` não é reenviado) — **decisão técnica não coberta
  literalmente pelo plano**: em `atualizar`, a validação da regra
  matriz/competência roda sempre (usando o vínculo já existente como
  fallback quando `competenciaIds` não vem no body, para nunca deixar o
  registro num estado inconsistente se só `tipo` mudar), mas a
  **escrita** (`DELETE`+`INSERT` dos vínculos) só acontece quando
  `competenciaIds` é explicitamente enviado — igual para `configuracao`
  (revalidada/substituída só quando enviada, nunca merge parcial). Julguei
  isso uma escolha técnica dentro do já especificado (o plano já previa
  ambos os comportamentos separadamente para escrita; só precisei decidir
  como conciliá-los para leitura/validação), não uma decisão de negócio nova
  — sinalizando aqui para o `backend-codereviewer` conferir com atenção.
- **1.8 Guard rail de anonimização**: nenhuma das 5 entidades tem
  `respondente_id`/`avaliador_id`/contador de resposta; `perguntas.configuracao`
  documentado em comentário (entidade + migration) como estritamente
  estrutural; nenhuma rota deste módulo é acessível por `colaborador`
  (`autenticar` montado nos 4 `*.module.ts`, inclusive nos sub-routers
  `paginas-pesquisa`/`perguntas`, redundante com o pai por defesa em
  profundidade, exatamente como pedido pelo orquestrador).
- **1.9 `app.ts`**: `pesquisasRouter` (já inclui os sub-routers internamente)
  e `competenciasRouter` registrados; `tratadorErros` continua por último.

Nenhuma pendência de negócio nova além das já listadas em "Assunções e
pendências" do próprio plano — nada exigiu parar para decisão do usuário
durante a implementação.

#### 1.1 Enums novos (`src/common/enums.ts`)

Adicionar, no mesmo arquivo, seguindo exatamente o padrão de
`PapelColaborador`/`PAPEL_COLABORADOR_VALORES`:

```ts
export type StatusPesquisa = 'rascunho' | 'publicada' | 'encerrada'
export const STATUS_PESQUISA_VALORES: StatusPesquisa[] = ['rascunho', 'publicada', 'encerrada']

export type TipoPergunta = 'likert' | 'texto_aberto' | 'matriz' | 'pessoa'
export const TIPO_PERGUNTA_VALORES: TipoPergunta[] = ['likert', 'texto_aberto', 'matriz', 'pessoa']

export type TipoRelacionamento = 'autoavaliacao' | 'gestor' | 'pares' | 'subordinado' | 'externo'
export const TIPO_RELACIONAMENTO_VALORES: TipoRelacionamento[] = ['autoavaliacao', 'gestor', 'pares', 'subordinado', 'externo']
```

Nenhum outro valor de `TipoPergunta` deve ser adicionado (CSAT/NPS/KPI/CES/
NVS/Imagem/Indicação estão fora do MVP por decisão já registrada do projeto —
não reintroduzir).

`TipoRelacionamento`/`TIPO_RELACIONAMENTO_VALORES` é uma constante
**provisória** desta task, usada só para validar
`configuracao.filtroRelacionamento` de perguntas tipo `pessoa` (ver 1.7) — o
enum Postgres `tipo_relacionamento` ainda **não** existe (não há módulo de
ciclos/relacionamentos nesta task, nem tabela `relacionamentos_avaliacao`).
Quando esse módulo for criado, esta constante TS precisa ser reconciliada com
o enum Postgres real (mesmos valores/ordem, ou substituída por uma leitura
dele) — ver item correspondente em "Assunções e pendências".

#### 1.2 Migration — criação de `pesquisas`, `paginas_pesquisa`, `perguntas`, `competencias`, `perguntas_competencias`

Arquivo `src/migrations/<timestamp>-CriarPesquisasPaginasPerguntasCompetencias.ts`
(timestamp maior que `1788268503083`, gerado no momento da implementação —
não reutilizar o mesmo número), com `up`/`down`. **Não rodar esta migration
contra nenhum banco real sem confirmação explícita do usuário** — mesma regra
já aplicada à migration de `equipes`/`colaboradores`.

```sql
CREATE TYPE status_pesquisa AS ENUM ('rascunho', 'publicada', 'encerrada');
CREATE TYPE tipo_pergunta AS ENUM ('likert', 'texto_aberto', 'matriz', 'pessoa');

CREATE TABLE competencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome varchar(255) NOT NULL,
  descricao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_competencias_nome UNIQUE (nome)
);

CREATE TABLE pesquisas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo varchar(255) NOT NULL,
  mensagem_boas_vindas text,
  logo_url varchar(500),
  status status_pesquisa NOT NULL DEFAULT 'rascunho',
  -- Sem REFERENCES: ciclos_avaliacao ainda não existe (ver decisão assumida 3).
  -- TODO(futuro): adicionar `REFERENCES ciclos_avaliacao(id)` quando o módulo
  -- de ciclos for criado.
  ciclo_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE paginas_pesquisa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pesquisa_id uuid NOT NULL REFERENCES pesquisas(id) ON DELETE CASCADE,
  titulo varchar(255),
  ordem integer NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_paginas_pesquisa_pesquisa_ordem UNIQUE (pesquisa_id, ordem) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_paginas_pesquisa_pesquisa_id ON paginas_pesquisa (pesquisa_id);

CREATE TABLE perguntas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pagina_id uuid NOT NULL REFERENCES paginas_pesquisa(id) ON DELETE CASCADE,
  tipo tipo_pergunta NOT NULL,
  enunciado text NOT NULL,
  obrigatoria boolean NOT NULL DEFAULT true,
  -- Configuração estrutural por tipo (escala/rótulos do likert e matriz,
  -- filtro de relacionamento selecionável da pergunta pessoa) — NUNCA dado
  -- de resposta, respondente ou avaliador (ver guard rail 1.8). Chaves em
  -- camelCase (niveis, rotulos, filtroRelacionamento), ver 1.7.
  configuracao jsonb NOT NULL DEFAULT '{}'::jsonb,
  ordem integer NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_perguntas_pagina_ordem UNIQUE (pagina_id, ordem) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_perguntas_pagina_id ON perguntas (pagina_id);

CREATE TABLE perguntas_competencias (
  pergunta_id uuid NOT NULL REFERENCES perguntas(id) ON DELETE CASCADE,
  competencia_id uuid NOT NULL REFERENCES competencias(id) ON DELETE RESTRICT,
  PRIMARY KEY (pergunta_id, competencia_id)
);

CREATE INDEX idx_perguntas_competencias_competencia_id ON perguntas_competencias (competencia_id);
```

`down`: `DROP TABLE perguntas_competencias`, `DROP TABLE perguntas`,
`DROP TABLE paginas_pesquisa`, `DROP TABLE pesquisas`, `DROP TABLE
competencias`, `DROP TYPE tipo_pergunta`, `DROP TYPE status_pesquisa` (nessa
ordem, por dependência de FK/enum).

**Sobre as `UNIQUE ... DEFERRABLE INITIALLY DEFERRED`**: necessário porque a
reordenação (1.6/1.7) faz `UPDATE` de vários `ordem` na mesma "coluna+escopo"
dentro de uma única transação — sem isso, trocar `ordem` de duas linhas (ex.:
página A vai de `ordem=1` para `ordem=2` e página B de `2` para `1`) violaria
a constraint em um estado intermediário mesmo dentro da mesma transação. O
service de reordenação (1.6/1.7) **deve** rodar dentro de uma transação
(`AppDataSource.transaction(...)` ou `QueryRunner` explícito) para que o
adiamento da checagem funcione — uma constraint `DEFERRABLE` só ajuda dentro
de uma transação real.

**Usar exatamente esses nomes de constraint** (`uq_competencias_nome`,
`uq_paginas_pesquisa_pesquisa_ordem`, `uq_perguntas_pagina_ordem`) — se
`backend-developer` decidir mapear alguma dessas violações no
`tratadorErros` (ex.: nome de competência duplicado), o nome de constraint
usado no `MAPA_CONSTRAINT_PARA_CODIGO` precisa bater exatamente com este.

#### 1.3 Entidades TypeORM

- `src/modules/competencias/competencia.entity.ts` — `@Entity('competencias')`:
  `id`, `nome` (`varchar(255)`), `descricao` (`text`, nullable), `criadoEm`,
  `atualizadoEm`.
- `src/modules/pesquisas/pesquisa.entity.ts` — `@Entity('pesquisas')`:
  `id`, `titulo` (`varchar(255)`), `mensagemBoasVindas` (`@Column({ name:
  'mensagem_boas_vindas', type: 'text', nullable: true })`), `logoUrl`
  (`@Column({ name: 'logo_url', type: 'varchar', length: 500, nullable:
  true })`), `status` (`@Column({ type: 'enum', enum:
  STATUS_PESQUISA_VALORES, enumName: 'status_pesquisa', default:
  'rascunho' })`), `cicloId` (`@Column({ name: 'ciclo_id', type: 'uuid',
  nullable: true })` — **sem** `@ManyToOne`/`@JoinColumn`, é só uma coluna
  solta hoje, com comentário no código citando a decisão assumida 3),
  `criadoEm`, `atualizadoEm`.
- `src/modules/paginas-pesquisa/pagina-pesquisa.entity.ts` —
  `@Entity('paginas_pesquisa')`: `id`, `pesquisaId` (`@Column({ name:
  'pesquisa_id', type: 'uuid' })`) + `@ManyToOne(() => Pesquisa, { onDelete:
  'CASCADE' }) @JoinColumn({ name: 'pesquisa_id' }) pesquisa: Pesquisa`,
  `titulo` (`varchar(255)`, nullable), `ordem` (`int`), `criadoEm`,
  `atualizadoEm`.
- `src/modules/perguntas/pergunta.entity.ts` — `@Entity('perguntas')`: `id`,
  `paginaId` (`@Column({ name: 'pagina_id', type: 'uuid' })`) +
  `@ManyToOne(() => PaginaPesquisa, { onDelete: 'CASCADE' }) @JoinColumn({
  name: 'pagina_id' }) pagina: PaginaPesquisa`, `tipo` (`@Column({ type:
  'enum', enum: TIPO_PERGUNTA_VALORES, enumName: 'tipo_pergunta' })`),
  `enunciado` (`text`), `obrigatoria` (`boolean`, default `true`),
  `configuracao` (`@Column({ type: 'jsonb', default: {} })` — guarda somente
  configuração estrutural da pergunta: `niveis`/`rotulos` para
  `likert`/`matriz`, `filtroRelacionamento` para `pessoa`, `{}` para
  `texto_aberto` — ver validação por tipo em 1.7; **nunca** resposta,
  `respondenteId`, `avaliadorId`, contagem de respostas ou qualquer dado de
  execução, ver guard rail 1.8), `ordem` (`int`), `criadoEm`, `atualizadoEm`.
  **Não** incluir nenhuma coluna de resposta/respondente/avaliador nesta
  entidade (ver 1.8).
- `src/modules/perguntas/pergunta-competencia.entity.ts` —
  `@Entity('perguntas_competencias')`, chave composta (`@PrimaryColumn({
  name: 'pergunta_id', type: 'uuid' }) perguntaId`, `@PrimaryColumn({ name:
  'competencia_id', type: 'uuid' }) competenciaId`), sem colunas de
  timestamp (tabela de junção pura). Vive dentro do módulo `perguntas` (não
  é um módulo próprio) porque é um detalhe de implementação de "pergunta
  tipo matriz", não uma entidade de primeira classe com CRUD próprio.

Todas as entidades (`Pesquisa`, `PaginaPesquisa`, `Pergunta`) são
**puramente estruturais/template** — nenhuma referencia `envios_pesquisa`,
`respostas`, `itens_resposta` ou `relacionamentos_avaliacao` (tabelas que
ainda nem existem). Ver guard rail 1.8.

#### 1.4 Módulo `competencias` (`src/modules/competencias/`)

Só listagem, conforme pedido — **não** criar `POST`/`PUT`/`DELETE` nesta
task (pendência registrada na seção final sobre como popular a tabela).

- `dto/`: nenhum DTO necessário (não há criação/edição nesta task).
- `competencias.service.ts`:
  - `listar(ator)` → `garantirPapel(ator, ['admin', 'gestor_rh'])` como
    primeira linha, depois `find({ order: { nome: 'ASC' } })`, mapeado para
    `{ id, nome, descricao }`.
- `competencias.controller.ts` + `competencias.module.ts`: `router.use(autenticar)`,
  `router.get('/', asyncHandler(listarCompetencias))`.

**Rota:**

| Método | Rota | Papéis | Sucesso |
|---|---|---|---|
| GET | `/api/competencias` | admin, gestor_rh | `200 [ { id, nome, descricao } ]` |

#### 1.5 Módulo `pesquisas` (`src/modules/pesquisas/`)

**DTOs:**
- `dto/criar-pesquisa.dto.ts`: `{ titulo: string; mensagemBoasVindas?: string;
  logoUrl?: string; cicloId?: string | null }`.
- `dto/atualizar-pesquisa.dto.ts`: mesmos campos, todos opcionais — **não
  declara `status`** (gerenciado só pela rota de transição, decisão assumida
  4). `cicloId` distingue campo omitido de `null` explícito com o mesmo
  padrão `'cicloId' in dto` já usado em `equipeId`/`gestorId` de
  `colaboradores.service.ts`.
- `dto/atualizar-status-pesquisa.dto.ts`: `{ status: StatusPesquisa }`.

**Validações do service (`pesquisas.service.ts`), sempre com `garantirPapel(ator, ['admin', 'gestor_rh'])` como primeira linha de toda função exportada:**
- `titulo`: `validarTextoObrigatorio(..., { campo: 'titulo', min: 2, max: 255 })`.
- `mensagemBoasVindas`: se presente, string não vazia, máximo 2000 caracteres
  (limite arbitrário desta task — sinalizado na seção final).
- `logoUrl`: se presente, string não vazia, máximo 500 caracteres — **sem**
  validação estrita de formato de URL nesta task (não pedido; se
  `backend-developer` achar necessário, registrar como decisão extra, não
  assumir silenciosamente).
- `cicloId`: se presente e não nulo, validar apenas que é um UUID
  sintaticamente válido (regex padrão de UUID v4-ish,
  `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`) —
  **nunca** checar existência em `ciclos_avaliacao` (tabela não existe).
  Inválido → `422 CAMPO_INVALIDO`.
- `criar`: sempre nasce com `status = 'rascunho'` — `status` não é aceito no
  DTO de criação.

**Exportar (para uso pelos módulos `paginas-pesquisa` e `perguntas`):**
- `export async function buscarEntidadeOuFalhar(id: string): Promise<Pesquisa>`
  — busca crua (sem `garantirPapel`, é uma função interna auxiliar, não uma
  rota) que lança `404 PESQUISA_NAO_ENCONTRADA` se não existir.
- `export function garantirEditavel(pesquisa: Pesquisa): void` — lança
  `409 PESQUISA_NAO_EDITAVEL` (`'Só é possível alterar páginas/perguntas de
  uma pesquisa em rascunho.'`) se `pesquisa.status !== 'rascunho'`. Usada por
  `paginas-pesquisa.service.ts` e `perguntas.service.ts` em toda função de
  criar/atualizar/remover/reordenar (nunca em `listar`/`buscarPorId`).

**Transição de status (`atualizarStatus`):**
```ts
const TRANSICOES_VALIDAS: Record<StatusPesquisa, StatusPesquisa[]> = {
  rascunho: ['publicada'],
  publicada: ['encerrada'],
  encerrada: [],
}
```
- Se `novoStatus` não está em `TRANSICOES_VALIDAS[statusAtual]` →
  `409 TRANSICAO_STATUS_INVALIDA`.
- Se transição é `rascunho → publicada`: checar que existe pelo menos 1
  página com pelo menos 1 pergunta (`COUNT` via query ou carregar relations)
  → senão `422 PESQUISA_VAZIA`.

**Duplicar (`duplicar`):**
- Carrega a pesquisa original com `paginas` → `perguntas` →
  `perguntas_competencias` (relations aninhadas ou queries sequenciais).
- Dentro de uma transação (`AppDataSource.transaction`):
  1. Cria nova `pesquisas` com `titulo: original.titulo + ' (cópia)'`,
     `mensagemBoasVindas`/`logoUrl` copiados, `status: 'rascunho'`,
     `cicloId: null` (decisão assumida 10).
  2. Para cada página original (na mesma ordem), cria nova
     `paginas_pesquisa` com mesmo `titulo`/`ordem`, `pesquisa_id` novo.
  3. Para cada pergunta original de cada página, cria nova `perguntas` com
     mesmo `tipo`/`enunciado`/`obrigatoria`/`ordem`/`configuracao`,
     `pagina_id` novo (o jsonb de `configuracao` é copiado tal como está,
     sem revalidar — já era válido na origem).
  4. Para cada vínculo em `perguntas_competencias` da pergunta original,
     cria o mesmo vínculo apontando para a nova `pergunta_id` (mesma
     `competencia_id` — competências são um catálogo compartilhado, não são
     clonadas).
- Retorna a nova pesquisa no mesmo shape aninhado do `GET /:id` (1.5, shape
  de resposta).

**Remover (`remover`):**
- `garantirPapel` → busca (404 se não existir) → se `status !== 'rascunho'`
  → `409 PESQUISA_NAO_REMOVIVEL` (decisão assumida 7) → `DELETE` físico
  (cascata via `ON DELETE CASCADE` cobre `paginas_pesquisa`/`perguntas`/
  `perguntas_competencias`).

**Shape de resposta — listagem (`GET /api/pesquisas`, leve, sem aninhamento):**
```json
{ "id": "uuid", "titulo": "string", "status": "rascunho|publicada|encerrada", "cicloId": "uuid|null", "criadoEm": "ISO 8601", "atualizadoEm": "ISO 8601" }
```

**Shape de resposta — detalhe (`GET /api/pesquisas/:id`, `POST /api/pesquisas`, `PUT /api/pesquisas/:id`, `POST /api/pesquisas/:id/duplicar`, aninhado):**
```json
{
  "id": "uuid",
  "titulo": "string",
  "mensagemBoasVindas": "string | null",
  "logoUrl": "string | null",
  "status": "rascunho | publicada | encerrada",
  "cicloId": "uuid | null",
  "paginas": [
    {
      "id": "uuid",
      "titulo": "string | null",
      "ordem": 1,
      "perguntas": [
        {
          "id": "uuid",
          "tipo": "likert | texto_aberto | matriz | pessoa",
          "enunciado": "string",
          "obrigatoria": true,
          "ordem": 1,
          "configuracao": { "niveis": 5, "rotulos": ["..."] },
          "competencias": [ { "id": "uuid", "nome": "string" } ]
        }
      ]
    }
  ],
  "criadoEm": "ISO 8601",
  "atualizadoEm": "ISO 8601"
}
```
`competencias` é sempre `[]` para perguntas que não são `matriz`.
`configuracao` varia por `tipo` (ver validação completa em 1.7): `likert`/
`matriz` → `{ niveis, rotulos }`; `texto_aberto` → `{}`; `pessoa` →
`{ filtroRelacionamento }`. `competencias` **nunca** aparece dentro de
`configuracao` — é sempre um array irmão no nível da pergunta (vínculo
relacional, decisão assumida 9), mesmo que outra fonte externa a este plano
assuma o contrário.

**Nota de integração com o frontend (`logoUrl`)**: `pesquisas.logoUrl`
(`logo_url` na tabela) já está corretamente modelado nesta API desde a
versão original deste plano (migration 1.2, entidade 1.3, shapes acima). O
`task-frontend.md` paralelo, na versão avaliada no momento desta correção,
ainda não expõe esse campo em nenhuma tela — isso está sendo corrigido do
lado do frontend; não requer nenhuma mudança neste plano de backend.

**Tabela de rotas (`pesquisas.module.ts`, monta os sub-routers de páginas — ver 1.6):**

| Método | Rota | Papéis | Observação |
|---|---|---|---|
| POST | `/api/pesquisas` | admin, gestor_rh | Sempre nasce `rascunho`; criação sempre manual, nenhum atalho de auto-geração/IA/template |
| GET | `/api/pesquisas` | admin, gestor_rh | Lista leve, sem páginas/perguntas |
| GET | `/api/pesquisas/:id` | admin, gestor_rh | Shape aninhado completo; `404 PESQUISA_NAO_ENCONTRADA` |
| PUT | `/api/pesquisas/:id` | admin, gestor_rh | Não aceita `status`; `cicloId` só formato, sem checagem de existência |
| DELETE | `/api/pesquisas/:id` | admin, gestor_rh | Só em `rascunho`; `409 PESQUISA_NAO_REMOVIVEL` caso contrário |
| PATCH | `/api/pesquisas/:id/status` | admin, gestor_rh | Transições restritas (decisão assumida 5/6) |
| POST | `/api/pesquisas/:id/duplicar` | admin, gestor_rh | Clona pesquisa+páginas+perguntas+vínculos de competência; cópia sempre `rascunho`/`cicloId: null` |

#### 1.6 Módulo `paginas-pesquisa` (`src/modules/paginas-pesquisa/`)

Montado como sub-router de `pesquisas` (Express `mergeParams: true`), path
final `/api/pesquisas/:pesquisaId/paginas...`.

**DTOs:**
- `dto/criar-pagina.dto.ts`: `{ titulo?: string }` (`ordem` **não** é
  aceito no body de criação — sempre calculado no service como
  `MAX(ordem WHERE pesquisa_id = :pesquisaId) + 1`, ou `1` se for a primeira
  página).
- `dto/atualizar-pagina.dto.ts`: `{ titulo?: string }` (não reordena aqui —
  reordenação é sempre em lote, ver `reordenar-paginas.dto.ts`).
- `dto/reordenar-paginas.dto.ts`: `{ itens: { id: string; ordem: number }[] }`.

**Service (`paginas-pesquisa.service.ts`), toda função com `garantirPapel(ator, ['admin', 'gestor_rh'])` como primeira linha:**
- `criar(ator, pesquisaId, dto)`: `buscarEntidadeOuFalhar(pesquisaId)` (de
  `pesquisas.service.ts`) → `garantirEditavel(pesquisa)` → calcula `ordem` →
  insere.
- `listar(ator, pesquisaId)`: não é exposta como rota própria nesta task (a
  listagem de páginas já vem embutida no `GET /api/pesquisas/:id`) — existe
  só como função interna reaproveitada pela montagem do shape aninhado em
  `pesquisas.service.ts`. Não criar `GET /api/pesquisas/:pesquisaId/paginas`
  separado (evita duas fontes de verdade para a mesma árvore).
- `atualizar(ator, pesquisaId, paginaId, dto)`: busca página garantindo que
  pertence a `pesquisaId` (`findOneBy({ id: paginaId, pesquisaId })`, senão
  `404 PAGINA_NAO_ENCONTRADA`) → `garantirEditavel` na pesquisa-mãe → atualiza
  `titulo`.
- `remover(ator, pesquisaId, paginaId)`: mesma checagem de pertencimento →
  `garantirEditavel` → `DELETE` físico (cascata cobre `perguntas`/
  `perguntas_competencias` da página).
- `reordenar(ator, pesquisaId, dto)`: `garantirEditavel` → valida que
  `dto.itens` cobre **exatamente** o conjunto de ids de páginas existentes
  da pesquisa (nem a mais, nem a menos) e que os valores de `ordem` são
  inteiros positivos **sem duplicatas** — qualquer divergência →
  `422 ORDEM_INVALIDA`. Executa todos os `UPDATE` dentro de uma transação
  (`AppDataSource.transaction`), aproveitando a constraint `DEFERRABLE`
  (1.2) para não precisar de um passo intermediário com valores negativos.

**Tabela de rotas:**

| Método | Rota | Papéis | Observação |
|---|---|---|---|
| POST | `/api/pesquisas/:pesquisaId/paginas` | admin, gestor_rh | Só se pesquisa em `rascunho` |
| PUT | `/api/pesquisas/:pesquisaId/paginas/:id` | admin, gestor_rh | Só se pesquisa em `rascunho` |
| DELETE | `/api/pesquisas/:pesquisaId/paginas/:id` | admin, gestor_rh | Só se pesquisa em `rascunho` |
| PATCH | `/api/pesquisas/:pesquisaId/paginas/reordenar` | admin, gestor_rh | Body `{ itens: [{ id, ordem }] }`, só se pesquisa em `rascunho` |

#### 1.7 Módulo `perguntas` (`src/modules/perguntas/`)

Montado como sub-router de `paginas-pesquisa`, path final
`/api/pesquisas/:pesquisaId/paginas/:paginaId/perguntas...`.

**DTOs:**
- `dto/criar-pergunta.dto.ts`: `{ tipo: TipoPergunta; enunciado: string;
  obrigatoria?: boolean; configuracao?: Record<string, unknown>;
  competenciaIds?: string[] }`. `configuracao` e `competenciaIds` são campos
  **irmãos, de nível superior** no DTO — competências continuam sendo um
  vínculo relacional (tabela `perguntas_competencias`, decisão assumida 9),
  nunca um valor dentro de `configuracao`. Um blob JSON não permite validar
  existência de FK; a relação `perguntas_competencias` permite. Não tratar
  `configuracao.competenciaIds` como alternativa a `competenciaIds` de nível
  superior — se vier, é apenas mais uma chave de `configuracao` sujeita à
  validação por tipo abaixo (e rejeitada nos casos em que a chave não é
  esperada), nunca lida como vínculo de competência.
- `dto/atualizar-pergunta.dto.ts`: mesmos campos, todos opcionais.
- `dto/reordenar-perguntas.dto.ts`: `{ itens: { id: string; ordem: number }[] }`.

**Coluna `perguntas.configuracao` (jsonb, ver migration 1.2 e entidade 1.3):**
guarda a configuração própria de cada tipo de pergunta, conforme a skill
`frontend-componente-pergunta`:
- `likert`: `{ niveis: number; rotulos: string[] }`.
- `texto_aberto`: `{}` (sem configuração especial além de `obrigatoria`, que
  já é uma coluna própria).
- `matriz`: mesma forma do likert — `{ niveis: number; rotulos: string[] }`
  — aplicada por competência na renderização da resposta; a lista de
  competências em si é relacional (`competenciaIds`/`perguntas_competencias`),
  não faz parte deste objeto.
- `pessoa`: `{ filtroRelacionamento: TipoRelacionamento[] }` — tipos de
  relacionamento **selecionáveis** ao responder (configuração de formulário),
  nunca um dado de resposta em si (ver guard rail 1.8).

**Nota de grafia (desvio deliberado):** o texto da skill
`frontend-componente-pergunta` descreve esses campos como
`configuracao.filtro_relacionamento` (snake_case) em prosa. Este plano usa
**camelCase** nas chaves do JSON (`niveis`, `rotulos`, `filtroRelacionamento`)
para ficar consistente com a decisão assumida 12 (todo request/response da
API em camelCase, mesmo padrão de `equipes`/`colaboradores`) — a skill
descreve o conceito e a intenção do campo, não o contrato de wire format
desta API específica. `backend-developer` segue camelCase aqui, não a grafia
literal do texto da skill.

**Validação de `configuracao` por tipo (`validarConfiguracaoPergunta`, chamada em `criar` e em `atualizar` sempre que o `tipo` resultante for conhecido — antes de qualquer escrita), rejeitando com `422 CONFIGURACAO_INVALIDA`:**
- `likert` e `matriz`: `niveis` obrigatório, inteiro entre 2 e 10; `rotulos`
  obrigatório, array de string com exatamente `niveis` itens (nem a mais,
  nem a menos).
- `texto_aberto`: `configuracao` deve ser `{}` ou omitida — se vier com
  qualquer chave, rejeitar explicitamente (`422 CONFIGURACAO_INVALIDA`), em
  vez de ignorar silenciosamente chaves inesperadas.
- `pessoa`: `filtroRelacionamento` obrigatório, array não vazio, cada item
  pertencente a `TIPO_RELACIONAMENTO_VALORES` (1.1) — o enum Postgres
  `tipo_relacionamento` ainda não existe (não há módulo de
  ciclos/relacionamentos), então a validação é só contra essa constante TS,
  nunca contra uma tabela/enum real. Ver pendência na seção final.

**Service (`perguntas.service.ts`), toda função com `garantirPapel(ator, ['admin', 'gestor_rh'])` como primeira linha:**
- Validação de pertencimento em cadeia: `paginaId` pertence a `pesquisaId`
  (senão `404 PAGINA_NAO_ENCONTRADA`), depois `garantirEditavel` na
  pesquisa-mãe (via `pesquisas.service.buscarEntidadeOuFalhar` +
  `garantirEditavel`).
- Validação de `tipo`: `validarEnum(dto.tipo, TIPO_PERGUNTA_VALORES, 'tipo')`
  — só os 4 valores permitidos, nenhum outro.
- Validação de `configuracao`: `validarConfiguracaoPergunta(tipo,
  dto.configuracao)` conforme a tabela acima — roda **antes** da checagem de
  `competenciaIds` abaixo, para nunca gravar uma pergunta com configuração
  estrutural inválida mesmo que os vínculos de competência estejam corretos.
- Regra `matriz` ↔ `competenciaIds` (aplicada em `criar` e em `atualizar`
  sempre que `tipo` resultante for conhecido):
  - Se `tipo === 'matriz'`: `competenciaIds` é obrigatório e deve ter pelo
    menos 1 item → senão `422 MATRIZ_SEM_COMPETENCIA`. Cada id deve
    existir em `competencias` → senão `404 COMPETENCIA_NAO_ENCONTRADA`.
  - Se `tipo !== 'matriz'`: `competenciaIds`, se enviado, deve ser vazio ou
    omitido — se vier não-vazio → `422 COMPETENCIA_FORA_DE_ESCOPO` (rejeitar
    explicitamente, nunca ignorar silenciosamente um vínculo que o cliente
    pediu para criar).
- `criar`: calcula `ordem` como `MAX(ordem WHERE pagina_id = :paginaId) + 1`
  (ou `1`), insere `perguntas` (incluindo `configuracao` já validada), depois
  insere as linhas de `perguntas_competencias` (se `matriz`) dentro da mesma
  transação.
- `atualizar`: mesma checagem de pertencimento + `garantirEditavel`; se
  `configuracao` for enviada, revalida por completo contra o `tipo` vigente
  da pergunta (substitui o jsonb inteiro, sem merge parcial com o valor
  anterior); se `competenciaIds` for enviado, substitui o conjunto de
  vínculos por completo (`DELETE` dos antigos + `INSERT` dos novos, dentro de
  transação) em vez de fazer diff incremental — mais simples e suficiente
  para o volume esperado.
- `remover`: checagem de pertencimento + `garantirEditavel` → `DELETE`
  físico (cascata cobre `perguntas_competencias`).
- `reordenar`: mesma lógica de validação "cobre exatamente o conjunto de
  ids" da página (ver 1.6), escopada a `pagina_id`, dentro de transação.

**Tabela de rotas:**

| Método | Rota | Papéis | Observação |
|---|---|---|---|
| POST | `.../perguntas` | admin, gestor_rh | Só se pesquisa em `rascunho`; valida `configuracao` por tipo e regra `matriz`↔`competenciaIds` |
| PUT | `.../perguntas/:id` | admin, gestor_rh | Idem |
| DELETE | `.../perguntas/:id` | admin, gestor_rh | Só se pesquisa em `rascunho` |
| PATCH | `.../perguntas/reordenar` | admin, gestor_rh | Body `{ itens: [{ id, ordem }] }`, só se pesquisa em `rascunho` |

#### 1.8 Guard rail de anonimização (aplica-se mesmo este módulo não tocando respostas/avaliadores)

- **Nenhuma** das entidades desta task (`Pesquisa`, `PaginaPesquisa`,
  `Pergunta`, `PerguntaCompetencia`, `Competencia`) pode ganhar, nesta ou em
  tasks futuras que só estendam este módulo, colunas como `respondente_id`,
  `avaliador_id`, `resposta`, `total_respostas` ou qualquer contador de
  resposta — este módulo define **template/estrutura**, não dados de
  execução de pesquisa. Dados de resposta pertencem a tabelas futuras
  (`envios_pesquisa`, `respostas`, `itens_resposta`,
  `relacionamentos_avaliacao`), fora de escopo aqui.
- **Extensão explícita à coluna `perguntas.configuracao` (jsonb)**: ela
  guarda **exclusivamente** configuração estrutural da pergunta — escala
  (`niveis`/`rotulos`) e filtro de relacionamento selecionável
  (`filtroRelacionamento`). Nunca pode conter `resposta`, `respondenteId`,
  `avaliadorId`, contagem de respostas ou qualquer dado de execução. Um
  campo jsonb é justamente o tipo de lugar onde esse vazamento passa
  despercebido em review (não há coluna dedicada e tipada para o revisor
  notar de relance) — por isso deve ser checado explicitamente (ver item
  correspondente na seção 2). Lembrete da regra crítica do projeto que
  motiva este guard rail: respostas de avaliadores dos tipos `pares` e
  `subordinado` nunca podem ser expostas identificadas à pessoa avaliada —
  só agregadas, e só quando atingirem `ciclos_avaliacao.minimo_respostas_pares`
  (skill `backend-anonimizacao-respostas`, views `respostas_identificadas`/
  `respostas_pares_agregadas`). Este módulo é template puro e deve
  permanecer assim mesmo com a coluna `configuracao` adicionada.
- **`filtroRelacionamento` não é dado de resposta**: na pergunta `pessoa`,
  `configuracao.filtroRelacionamento` é apenas a lista de tipos de
  relacionamento **selecionáveis** no formulário de resposta (ex.: "esta
  pergunta só pode ser respondida sobre um relacionamento `gestor` ou
  `pares`") — é configuração de formulário/template, não um dado de resposta
  em si. Não confundir com o `tipo` real de um
  `relacionamentos_avaliacao` (tabela futura, fora de escopo), que registra
  o relacionamento de fato entre avaliador e avaliado.
- Nenhuma rota deste módulo é acessível por `colaborador` — todas exigem
  `autenticar` + `garantirPapel(['admin', 'gestor_rh'])`. `colaborador` não
  interage com o construtor de pesquisas de forma alguma (ele só responde
  pesquisas via link+CPF, fluxo público de outra task, que usa service role
  key + validação manual de token/CPF, nunca este middleware `autenticar`).
- Se qualquer implementação futura precisar mostrar "quantas pessoas já
  responderam" nesta mesma pesquisa, isso é uma feature de outra task
  (`envios_pesquisa`/`respostas`) e deve seguir a skill
  `backend-anonimizacao-respostas` (views `respostas_identificadas`/
  `respostas_pares_agregadas`, checagem de `minimo_respostas_pares`) — não
  deve ser resolvido "de passagem" aqui.

#### 1.9 Registro em `app.ts`

- `app.use('/api/pesquisas', pesquisasRouter)` (já inclui os sub-routers de
  páginas/perguntas montados internamente em `pesquisas.module.ts`).
- `app.use('/api/competencias', competenciasRouter)`.
- Ordem de `app.use` não importa entre si, mas `tratadorErros` continua
  **sempre por último**.

Ao terminar: rodar `npm run build` (tsc) dentro de `backend/` e confirmar que
compila sem erros antes de marcar a etapa concluída. Registrar no resumo da
task que a migration desta seção **não deve ser executada** contra um banco
real sem confirmação explícita do usuário (mesma regra do módulo
`equipes`/`colaboradores`).

### 2. backend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Nenhuma rota deste módulo é acessível por `colaborador`** — `autenticar`
   montado em todos os `*.module.ts` novos (`pesquisas`, `paginas-pesquisa`,
   `perguntas`, `competencias`) e `garantirPapel(ator, ['admin', 'gestor_rh'])`
   é literalmente a primeira linha de toda função exportada dos 4
   `*.service.ts` novos — não só em alguns métodos.
2. **Nenhuma criação automática/IA/template de pesquisa** — conferir que
   `criar` em `pesquisas.service.ts` só insere exatamente o que veio no DTO
   manual (`titulo`, `mensagemBoasVindas`, `logoUrl`, `cicloId`), sem
   nenhuma lógica de geração de páginas/perguntas por conta própria. Se
   algo do tipo aparecer, é achado crítico.
3. **Só 4 tipos de pergunta** — `TIPO_PERGUNTA_VALORES` tem exatamente
   `likert`, `texto_aberto`, `matriz`, `pessoa`; nenhum tipo removido do MVP
   (CSAT/NPS/KPI/CES/NVS/Imagem/Indicação) foi reintroduzido em nenhum
   lugar (migration, enum, validação).
4. **Edição de páginas/perguntas só em `rascunho`** — `garantirEditavel` é
   chamada em toda função de criar/atualizar/remover/reordenar de
   `paginas-pesquisa.service.ts` e `perguntas.service.ts` (nunca em
   `listar`/leitura); tentar mutar uma pesquisa `publicada`/`encerrada`
   retorna `409 PESQUISA_NAO_EDITAVEL` de fato, não passa silenciosamente.
5. **Transições de status restritas** — só `rascunho→publicada` e
   `publicada→encerrada` são aceitas; qualquer outra combinação (incluindo
   pular etapa ou "transicionar" para o mesmo status) retorna
   `409 TRANSICAO_STATUS_INVALIDA`; publicar uma pesquisa vazia (sem
   página+pergunta) retorna `422 PESQUISA_VAZIA`.
6. **Regra `matriz` ↔ `competenciaIds`** — pergunta `matriz` sem nenhuma
   competência é rejeitada (`422 MATRIZ_SEM_COMPETENCIA`); pergunta de
   qualquer outro tipo com `competenciaIds` não-vazio é rejeitada
   (`422 COMPETENCIA_FORA_DE_ESCOPO`), nunca ignorada silenciosamente; ids
   de competência inexistentes retornam `404 COMPETENCIA_NAO_ENCONTRADA`
   antes de qualquer escrita.
7. **Reordenação é atômica e completa** — `reordenar` de páginas/perguntas
   roda dentro de uma transação, valida que o payload cobre exatamente o
   conjunto de ids existentes no escopo (sem itens faltando/sobrando/
   duplicados), e usa as constraints `UNIQUE ... DEFERRABLE` (conferir que
   a migration realmente as declara `DEFERRABLE INITIALLY DEFERRED` — sem
   isso a reordenação pode falhar com violação de unicidade em estados
   intermediários).
8. **`duplicar` clona a árvore inteira** — nova pesquisa em `rascunho`,
   `cicloId: null`, páginas e perguntas clonadas preservando `ordem` e
   `configuracao` (copiada tal como está, sem revalidar), vínculos de
   `perguntas_competencias` recriados apontando para as novas perguntas mas
   para as **mesmas** `competencia_id` (competências não são duplicadas,
   são um catálogo compartilhado).
9. **`pesquisas.ciclo_id` não tem FK** — conferir que a migration realmente
   não declara `REFERENCES ciclos_avaliacao`, que a validação de `cicloId`
   no service é só de formato (UUID sintático), e que existe um comentário
   explícito no código (entidade e/ou migration) marcando isso como dívida
   técnica temporária.
10. **Nenhuma coluna de resposta/respondente/avaliador** em `pesquisas`,
    `paginas_pesquisa`, `perguntas`, `perguntas_competencias` ou
    `competencias` — se aparecer qualquer `respondente_id`, `avaliador_id`,
    contador de respostas ou referência a `itens_resposta`/
    `relacionamentos_avaliacao`, é achado crítico (viola o guard rail 1.8).
11. **`DELETE /api/pesquisas/:id` só em `rascunho`** (`409
    PESQUISA_NAO_REMOVIVEL` caso contrário); cascata de `ON DELETE CASCADE`
    realmente cobre `paginas_pesquisa` → `perguntas` → `perguntas_competencias`.
12. **Nomes de constraint na migration batem com qualquer mapeamento
    adicionado ao `tratadorErros`** (se `backend-developer` mapear
    `uq_competencias_nome` para um código 409 específico, por exemplo).
13. **Casing consistente**: colunas em `snake_case` batendo com a migration,
    JSON de request/response em `camelCase` (sem vazar `mensagem_boas_vindas`,
    `pesquisa_id`, `competencia_id` crus nas respostas). Isso inclui as
    chaves **dentro** de `configuracao` (`niveis`, `rotulos`,
    `filtroRelacionamento`) — camelCase mesmo que a skill
    `frontend-componente-pergunta` descreva esses nomes em snake_case no
    texto (desvio deliberado, ver 1.7).
14. **Validação de `perguntas.configuracao` por tipo** — `likert`/`matriz`
    exigem `niveis` (inteiro entre 2 e 10) e `rotulos` (array de string com
    exatamente `niveis` itens); `texto_aberto` rejeita qualquer chave em
    `configuracao` (não ignora silenciosamente); `pessoa` exige
    `filtroRelacionamento` não vazio com itens só de
    `TIPO_RELACIONAMENTO_VALORES`. Qualquer violação retorna
    `422 CONFIGURACAO_INVALIDA` **antes** de qualquer escrita — conferir que
    a validação roda tanto em `criar` quanto em `atualizar` (e que
    `atualizar` revalida o jsonb inteiro, não faz merge parcial).
15. **`perguntas.configuracao` nunca guarda dado de execução** — checar
    especificamente esta coluna nova (jsonb, mais fácil de esconder um
    vazamento do que uma coluna tipada dedicada): nenhuma chave como
    `resposta`, `respondenteId`, `avaliadorId`, contagem de respostas ou
    qualquer valor vindo de `itens_resposta`/`relacionamentos_avaliacao`
    pode aparecer gravada ali, nem no DTO, nem na validação, nem em nenhum
    teste/fixture. Achado crítico se aparecer. Confirmar também que
    `competenciaIds`/vínculo de competência continua **fora** de
    `configuracao` (campo relacional próprio, decisão assumida 9) — se a
    implementação mover competências para dentro do jsonb "porque é mais
    simples", é achado crítico (perde a validação de FK).

## Assunções e pendências

Itens abaixo são palpites genuínos desta task (não derivações óbvias da
convenção existente) — levantar com o usuário antes ou durante a
implementação, não assumir como definitivo:

1. **Modelagem de "matriz" via `perguntas_competencias` (many-to-many)**:
   o pedido diz apenas "endpoint de listagem de competências, usado para
   popular perguntas do tipo matriz", sem detalhar a estrutura de dados.
   Modelei como uma pergunta `matriz` referenciando **múltiplas**
   competências (uma tabela de junção), assumindo que a "matriz" é uma
   grade de várias competências avaliadas na mesma pergunta. Uma
   alternativa mais simples seria 1 competência por pergunta (coluna
   `competencia_id` direta, sem tabela de junção) — se o construtor de
   pesquisas do frontend só precisar de 1 competência por pergunta
   `matriz`, a modelagem correta é mais simples que a proposta aqui.
2. **Nomes de coluna dentro das tabelas novas** (`mensagem_boas_vindas`,
   `logo_url`, `ciclo_id`, `pagina_id`, `enunciado`, `obrigatoria`,
   `configuracao`, `pergunta_id`/`competencia_id` na tabela de junção,
   `nome`/`descricao` em `competencias`) não vêm de nenhum schema
   existente — são propostas novas seguindo a convenção de nomenclatura já
   estabelecida (`snake_case`, português), mas nunca confirmadas por um
   arquivo de schema real.
3. **`pesquisas.ciclo_id` sem FK** (decisão assumida 3): é a única forma de
   atender "campo preparado, nullable, sem FK obrigatória" pedido pelo
   usuário — mas isso significa que, até o módulo de ciclos existir,
   qualquer valor de `cicloId` sintaticamente válido é aceito sem checagem
   de existência. Confirmar se isso é aceitável para o MVP ou se `cicloId`
   deveria ficar completamente fora da API por enquanto (nem aceitar o
   campo em `POST`/`PUT`) até o módulo de ciclos existir.
4. **Publicar exige conteúdo mínimo** (`422 PESQUISA_VAZIA` — decisão
   assumida 6): não foi pedido literalmente, é uma leitura de "validação
   das regras básicas". Se o usuário não quiser essa validação, é só
   remover a checagem de 1.5 (não afeta o resto do desenho).
5. **`DELETE` restrito a `rascunho`** (decisão assumida 7) e **duplicar
   sempre reseta `cicloId`/`titulo` com sufixo** (decisão assumida 10): nem
   um nem outro foi pedido explicitamente — são inferências razoáveis a
   partir da regra "só rascunho é editável", mas merecem confirmação
   explícita antes de virar comportamento definitivo da API.
6. **Como a tabela `competencias` é populada**: não há endpoint de
   criação/edição nesta task (só `GET`, exatamente como pedido) — falta
   definir se isso é: (a) uma task futura de CRUD de competências, (b)
   populado manualmente via `INSERT`/seed de dados, ou (c) alguma outra
   fonte. Sem isso, `GET /api/competencias` retorna lista vazia até alguém
   decidir.
7. **Limite `niveis` entre 2 e 10 (likert/matriz)**: valor arbitrário desta
   correção do plano, mesmo critério já usado para `mensagemBoasVindas`
   (até 2000 caracteres, item 4 acima) — nenhum limite foi pedido
   literalmente pelo usuário; ajustar se houver um valor de produto
   diferente definido depois.
8. **`TIPO_RELACIONAMENTO_VALORES` é provisório**: usado só para validar
   `configuracao.filtroRelacionamento` da pergunta `pessoa` enquanto o
   módulo de ciclos/relacionamentos (e o enum Postgres `tipo_relacionamento`
   real) não existir. Os 5 valores (`autoavaliacao`, `gestor`, `pares`,
   `subordinado`, `externo`) foram assumidos por corresponderem literalmente
   ao texto de regras de negócio já em `CLAUDE.md`, mas não há confirmação
   de que são exatamente os rótulos do enum Postgres futuro — quando esse
   módulo for criado, reconciliar esta constante TS com ele (mesmos
   valores/ordem, ou substituí-la por uma leitura do enum real).
9. **Competências continuam relacionais, não vão para dentro de
   `configuracao`**: o `task-frontend.md` (plano paralelo), na versão
   avaliada nesta correção, assumia `configuracao.competenciaIds` para a
   pergunta `matriz` — divergência real entre os dois planos, sendo
   corrigida do lado do frontend (fora do escopo desta correção de
   backend). Este plano de backend mantém `competenciaIds` como campo de
   nível superior do DTO + tabela de junção `perguntas_competencias`
   (decisão assumida 9), porque só assim é possível validar existência de
   competência (`404 COMPETENCIA_NAO_ENCONTRADA`) — um blob jsonb não
   permite essa validação de FK.
10. **`logoUrl` já correto na API, pendente de exposição no frontend**:
    `pesquisas.logoUrl`/`logo_url` já está modelado corretamente nesta task
    (1.2/1.3/1.5) desde a versão original deste plano — o `task-frontend.md`
    paralelo, na versão avaliada nesta correção, ainda não expõe esse campo
    em nenhuma tela; isso está sendo corrigido do lado do frontend, não é
    uma pendência deste plano de backend.

## Revisão

Revisão feita lendo todos os arquivos novos/alterados desta task (enums,
migration, 5 entidades, 4 `*.service.ts`, 4 `*.controller.ts`, 4
`*.module.ts`, todos os DTOs, `app.ts`, `common/autorizacao.ts`,
`middlewares/tratadorErros.ts`, `common/validacao.ts`).

**Sem achados críticos.** Anonimização e controle de acesso passam em todos
os pontos verificados — ver detalhamento abaixo. Pode prosseguir para
`test-engineer` depois de considerar o achado "Deveria corrigir" (não é
bloqueante para anonimização/acesso, mas é um bug real de consistência de
dados que vale corrigir antes ou logo depois dos testes).

### Anonimização (checklist 10, 14, 15) — confirmado, sem achados

- Nenhuma das 5 entidades (`Pesquisa`, `PaginaPesquisa`, `Pergunta`,
  `PerguntaCompetencia`, `Competencia`) declara `respondente_id`,
  `avaliador_id`, coluna de resposta ou contador de respostas. Migration
  confere (mesmas 5 tabelas, mesmas colunas do plano).
- `perguntas.configuracao` (jsonb) — auditado especificamente por ser o
  ponto de maior risco de vazamento silencioso. `validarConfiguracaoPergunta`
  (`perguntas.service.ts`) só aceita `niveis`/`rotulos` (likert/matriz),
  `{}` (texto_aberto) ou `filtroRelacionamento` (pessoa), sempre retornando
  um objeto novo reconstruído campo a campo (nunca um passthrough do body) —
  qualquer chave extra enviada pelo cliente (`resposta`, `respondenteId`,
  `avaliadorId` etc.) é descartada na reconstrução ou rejeitada
  explicitamente (`texto_aberto` rejeita qualquer chave). Não há nenhum
  caminho de código que grave algo vindo de `itens_resposta`/
  `relacionamentos_avaliacao` nesta coluna (tabelas nem existem ainda).
  `filtroRelacionamento` tratado corretamente como config de formulário, não
  dado de resposta.
- `competenciaIds`/`perguntas_competencias` seguem relacionais em todo o
  fluxo (DTO, service, migration) — nunca migraram para dentro do jsonb.
- Nenhuma rota do módulo é alcançável por `colaborador`: `autenticar`
  montado em `pesquisas.module.ts`, `paginas-pesquisa.module.ts` (sub-router
  `mergeParams: true`), `perguntas.module.ts` (idem) e
  `competencias.module.ts` — 4 módulos, 4 montagens, nenhuma global em
  `app.ts`. Todo agregado é liberado só para `admin`/`gestor_rh` via
  `garantirPapel`, e este módulo não tem noção de "mínimo de respondentes"
  porque não expõe nenhum dado de resposta — condizente com o guard rail 1.8
  do plano (esse aspecto pertence a uma task futura, não a esta).

### Controle de acesso (checklist 1) — confirmado, sem achados

- `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` é literalmente a primeira
  linha de toda função exportada e roteável dos 4 services novos
  (`pesquisas.service.ts`: `criar`/`listar`/`buscarPorId`/`atualizar`/
  `atualizarStatus`/`duplicar`/`remover`; `paginas-pesquisa.service.ts`:
  `criar`/`listar`/`atualizar`/`remover`/`reordenar`;
  `perguntas.service.ts`: `criar`/`atualizar`/`remover`/`reordenar`;
  `competencias.service.ts`: `listar`).
- `pesquisas.service.ts` também exporta `buscarEntidadeOuFalhar` e
  `garantirEditavel` sem `garantirPapel` — à primeira vista bateria no
  critério "qualquer função exportada sem `garantirPapel` é crítico", mas
  confirmei via grep que nenhum `*.controller.ts` importa essas duas
  funções: elas só são chamadas internamente por
  `paginas-pesquisa.service.ts`/`perguntas.service.ts`, cujas próprias
  funções exportadas (essas sim roteáveis) já checam `garantirPapel` antes.
  Não há rota alcançando essas duas funções sem passar primeiro por um
  `garantirPapel`. Tratando como não-achado, conforme a exceção já
  documentada explicitamente no plano (seção 1.5), mas registrando aqui que
  foi verificado com atenção por ser exatamente o padrão que geraria um
  achado crítico se estivesse errado.
- Nenhum `controller.ts` faz checagem de papel inline — toda checagem vem do
  service, como manda a convenção.

### Ponto de julgamento sinalizado pelo desenvolvedor — `perguntas.service.ts atualizar` (checklist 6)

**`competenciaIds`: comportamento correto, sem estado inválido possível.**
Tracei os dois cenários de preocupação do orquestrador:
- `matriz → outro tipo` sem enviar `competenciaIds`: a lista efetiva de
  fallback é os vínculos já existentes (não-vazia, porque a pergunta era
  `matriz`), e `resolverCompetencias(tipoNovo, efetivos)` rejeita com
  `422 COMPETENCIA_FORA_DE_ESCOPO` antes de qualquer escrita (a chamada
  ocorre fora da transação, então nada é persistido). A pergunta continua
  `matriz` com seus vínculos intactos — nunca fica com vínculos órfãos.
- `outro tipo → matriz` sem enviar `competenciaIds`: fallback é `[]` (não
  havia vínculos antes), `resolverCompetencias('matriz', [])` rejeita com
  `422 MATRIZ_SEM_COMPETENCIA` antes de qualquer escrita. Nunca fica uma
  `matriz` sem competência.

Em ambos os casos o request inteiro falha (nada é persistido) — para migrar
de/para `matriz`, o cliente precisa enviar `competenciaIds` explicitamente
(inclusive `[]` para sair de `matriz`). É uma escolha de API um pouco mais
rígida do que "auto-limpar", mas é segura: nunca deixa o registro inválido.

**`configuracao`: achado real — ver "Deveria corrigir" abaixo.** O mesmo
cuidado de fallback aplicado a `competenciaIds` (revalidar a lista efetiva
mesmo quando não reenviada) **não** foi replicado para `configuracao`,
apesar do plano descrever as duas substituições como espelhadas
("`configuracao` revalidada/substituída só quando enviada... igual para
`competenciaIds`"). Isso abre uma combinação de payload que deixa a pergunta
num estado inconsistente — detalhado abaixo.

### Deveria corrigir

1. **`perguntas.service.ts`, `atualizar`: mudar `tipo` sem reenviar
   `configuracao` persiste uma configuração incompatível com o novo tipo,
   sem revalidação.** Trace concreto: pergunta existente `tipo: 'pessoa'`,
   `configuracao: { filtroRelacionamento: ['gestor'] }`. Requisição
   `PUT { tipo: 'likert' }` (sem `configuracao`, sem `competenciaIds`):
   - `tipoResultante = 'likert'`.
   - `dto.configuracao === undefined` → o bloco `if (dto.configuracao !==
     undefined) { pergunta.configuracao = validarConfiguracaoPergunta(...) }`
     não roda — `pergunta.configuracao` permanece `{ filtroRelacionamento:
     ['gestor'] }`, nunca validado contra as regras de `likert`
     (`niveis`/`rotulos` obrigatórios).
   - `competenciaIds`: fallback são os vínculos existentes de uma pergunta
     `pessoa` (vazios), `resolverCompetencias('likert', [])` passa
     trivialmente (não há vínculo para conflitar).
   - Nada bloqueia a escrita: a pergunta é salva com `tipo: 'likert'` e
     `configuracao: { filtroRelacionamento: ['gestor'] }` — sem `niveis`/
     `rotulos`, com uma chave (`filtroRelacionamento`) que não deveria
     existir para `likert`. O mesmo vale para `likert`/`matriz → texto_aberto`
     (fica com `niveis`/`rotulos` presos numa pergunta que deveria ter
     `configuracao: {}`) e para `→ pessoa` vindo de outro tipo (fica sem
     `filtroRelacionamento`).
   - Isso viola diretamente o item 14 do checklist ("conferir que a
     validação roda tanto em `criar` quanto em `atualizar`") no caso
     específico de troca de tipo, e quebra o consumidor da API (o
     construtor de pesquisas do frontend, ao reabrir essa pergunta para
     edição, receberia uma `configuracao` com o shape errado para o `tipo`
     atual).
   - **Sugestão de correção (não implementada por mim — só reporto):**
     espelhar exatamente o padrão já usado para `competenciaIds` — quando
     `tipo` está mudando (ou, mais simples/seguro, sempre que o tipo
     resultante for conhecido) e `dto.configuracao` não foi reenviada, usar
     `pergunta.configuracao` atual como valor efetivo e revalidá-la contra
     `tipoResultante` via `validarConfiguracaoPergunta`, deixando o
     `422 CONFIGURACAO_INVALIDA` interromper a escrita quando o shape antigo
     não servir para o tipo novo (assim como já acontece com
     `COMPETENCIA_FORA_DE_ESCOPO`/`MATRIZ_SEM_COMPETENCIA`).

### Sugestão

1. **`tratadorErros.ts` não mapeia as 3 novas constraints `UNIQUE`**
   (`uq_competencias_nome`, `uq_paginas_pesquisa_pesquisa_ordem`,
   `uq_perguntas_pagina_ordem`) em `MAPA_CONSTRAINT_PARA_CODIGO`. Não é
   bloqueante — a validação de aplicação (`reordenar` cobre exatamente o
   conjunto de ids; `ordem` de criação é sempre `MAX+1`) evita a maioria dos
   casos de violação — mas sob concorrência (duas criações de página/pergunta
   quase simultâneas calculando o mesmo `MAX(ordem)+1`) o Postgres retornaria
   `23505` e cairia no branch genérico `500 ERRO_INTERNO` em vez de um `409`
   específico. O plano só pedia mapear "se `backend-developer` decidir", então
   isso é opcional, mas vale registrar para uma iteração futura.
2. **`reordenar` (páginas e perguntas) não valida a forma de cada item de
   `dto.itens` antes de acessar `item.id`/`item.ordem`.** Se o body enviar
   `itens` como um array com elementos que não são objetos (ex.: `[null]`,
   `["x"]`), `itens.map(item => item.id)`/`item.ordem` pode lançar uma
   exceção não tratada (TypeError) em vez do `422 ORDEM_INVALIDA` esperado —
   cai no tratador genérico como `500`. Baixo risco (exige payload
   deliberadamente malformado, e não compromete anonimização/autorização),
   mas seria mais consistente validar a forma de cada item (`typeof item ===
   'object' && item !== null && typeof item.id === 'string' &&
   typeof item.ordem === 'number'`) antes do restante da lógica.
3. **Cálculo de `ordem` (`MAX(ordem)+1`) em `criar` de páginas/perguntas não
   roda dentro de uma transação/lock.** Sob duas criações concorrentes na
   mesma pesquisa/página, ambas podem ler o mesmo `MAX` antes de qualquer
   `INSERT` e colidir na constraint `UNIQUE` (ver sugestão 1 acima sobre o
   409 não mapeado). Baixo risco para o volume esperado do produto, mas é o
   tipo de corrida que só aparece em produção sob uso simultâneo real.

### Demais itens do checklist — confirmados sem achados

- **Item 2 (criação sempre manual)**: `pesquisas.service.ts criar` só
  grava exatamente os 4 campos do DTO (`titulo`, `mensagemBoasVindas`,
  `logoUrl`, `cicloId`) + `status: 'rascunho'` fixo — nenhuma geração de
  páginas/perguntas.
- **Item 3 (só 4 tipos de pergunta)**: `TIPO_PERGUNTA_VALORES` em
  `enums.ts` tem exatamente `likert`/`texto_aberto`/`matriz`/`pessoa`; mesmo
  conjunto na migration (`CREATE TYPE tipo_pergunta`) e em
  `validarConfiguracaoPergunta`. Nenhum tipo removido do MVP reaparece em
  nenhum arquivo.
- **Item 4 (edição só em `rascunho`)**: `garantirEditavel` chamada em toda
  função de criar/atualizar/remover/reordenar de `paginas-pesquisa.service.ts`
  e `perguntas.service.ts`, nunca em `listar`.
- **Item 5 (transições de status)**: `TRANSICOES_VALIDAS` restrito a
  `rascunho→publicada`/`publicada→encerrada`; `PESQUISA_VAZIA` checado antes
  de publicar.
- **Item 7 (reordenação atômica)**: ambas as `reordenar` rodam dentro de
  `AppDataSource.transaction`, validam cobertura exata do conjunto de ids
  (nem a mais/menos/duplicado) → `422 ORDEM_INVALIDA`; migration confirma as
  duas constraints `DEFERRABLE INITIALLY DEFERRED`.
- **Item 8 (`duplicar`)**: clona pesquisa (sempre `rascunho`/`cicloId:
  null`, título com sufixo), páginas, perguntas (`configuracao` copiada sem
  revalidar, ordens preservadas) e vínculos de `perguntas_competencias`
  apontando para a mesma `competencia_id`, tudo dentro de uma única
  transação.
- **Item 9 (`ciclo_id` sem FK)**: migration não declara `REFERENCES
  ciclos_avaliacao`; `pesquisa.entity.ts` não tem `@ManyToOne`; validação no
  service é só de formato (regex UUID); comentário de dívida técnica
  presente em ambos os arquivos.
- **Item 11 (`DELETE` só em `rascunho`)**: confirmado
  (`409 PESQUISA_NAO_REMOVIVEL`); cascata `ON DELETE CASCADE` confirmada em
  cadeia completa na migration (`pesquisas → paginas_pesquisa → perguntas →
  perguntas_competencias`).
- **Item 12 (nomes de constraint)**: os 3 nomes usados na migration batem
  literalmente com os pedidos no plano; nenhum foi mapeado no
  `tratadorErros` (ver sugestão 1).
- **Item 13 (casing)**: colunas `snake_case` na migration/entidades
  (`mensagem_boas_vindas`, `logo_url`, `ciclo_id`, `pagina_id`, `pesquisa_id`
  etc.) todas mapeadas via `@Column({ name: ... })`; nenhum shape de
  resposta (`PesquisaRespostaLista`, `PesquisaRespostaDetalhe`,
  `PaginaResposta`, `PerguntaResposta`, `CompetenciaResposta`) vaza a chave
  crua em `snake_case` — inclusive dentro de `configuracao`, que é
  reconstruída campo a campo em `camelCase` (`niveis`, `rotulos`,
  `filtroRelacionamento`), nunca um passthrough do jsonb bruto do banco.

### Fora de escopo desta revisão

- Erro de build pré-existente em `src/test/fakeRepository.ts` (`TS2352`) —
  confirmado pelo desenvolvedor como já existente antes desta task (via
  `git stash -u`), não foi tocado por nenhum arquivo desta mudança. Não
  contabilizado como achado.
- Migration **não executada** contra nenhum banco — confirmado pela ausência
  de qualquer evidência de `migration:run` ter sido rodado e pela
  declaração explícita do desenvolvedor no resumo da etapa 1.

## Correção pós-revisão (backend-developer) — ✅ concluída

Escopo restrito à correção pontual pedida (achados "Deveria corrigir" +
"Sugestão" 1 e 2 da seção "## Revisão"; sugestão 3, sobre `ordem` fora de
transação, deixada como está por decisão explícita — ver "Limitação
conhecida" abaixo). Nenhuma skill precisou ser reinvocada (correção pontual
em código já existente, sem entidade/rota nova).

1. **`perguntas.service.ts`, `atualizar` — `configuracao` agora sempre
   revalidada** (`src/modules/perguntas/perguntas.service.ts`). Removido o
   `if (dto.configuracao !== undefined)` condicional; agora
   `configuracaoEfetiva` usa o valor do body quando enviado, ou
   `pergunta.configuracao` já persistida como fallback — espelhando
   literalmente o padrão de fallback já usado para `competenciaIds` na mesma
   função. `validarConfiguracaoPergunta(tipoResultante, configuracaoEfetiva)`
   roda sempre, antes da transação, rejeitando com `422
   CONFIGURACAO_INVALIDA` qualquer combinação tipo-resultante/configuração
   incompatível, sem escrita parcial. Cobre os dois sentidos verificados
   manualmente por rastreio de código: `pessoa → likert` sem reenviar
   `configuracao` (antes gravava `filtroRelacionamento` sem `niveis`/
   `rotulos`, agora rejeita 422) e `likert → pessoa` sem reenviar
   `configuracao` (antes gravava `niveis`/`rotulos` numa pergunta `pessoa`,
   agora rejeita 422).
2. **`reordenar` (páginas e perguntas) — forma de cada item validada antes
   do uso** (`src/modules/paginas-pesquisa/paginas-pesquisa.service.ts` e
   `src/modules/perguntas/perguntas.service.ts`). Adicionado um passo de
   validação de forma (`typeof item === 'object' && item !== null &&
   typeof item.id === 'string' && typeof item.ordem === 'number'`) logo após
   normalizar `dto.itens` para array, antes de qualquer `.map`/`.every` que
   acessasse `.id`/`.ordem` — payload malformado (`{ itens: [null] }`, item
   sem `id`, `ordem` não numérica) agora retorna `422 ORDEM_INVALIDA` em vez
   de estourar um `TypeError` não tratado (500).
3. **`tratadorErros.ts` — 3 constraints `UNIQUE` novas mapeadas**
   (`src/middlewares/tratadorErros.ts`, `MAPA_CONSTRAINT_PARA_CODIGO`):
   `uq_competencias_nome` → `COMPETENCIA_NOME_DUPLICADO`,
   `uq_paginas_pesquisa_pesquisa_ordem` → `PAGINA_ORDEM_DUPLICADA`,
   `uq_perguntas_pagina_ordem` → `PERGUNTA_ORDEM_DUPLICADA` — todas as 3
   agora retornam `409` com código específico em vez de caírem no genérico
   `500 ERRO_INTERNO`. Nomes de constraint conferidos contra a migration
   (`src/migrations/1788288525381-CriarPesquisasPaginasPerguntasCompetencias.ts`)
   e batem exatamente — nenhuma alteração feita na migration (ela segue não
   executada contra nenhum banco).

**Limitação conhecida, deixada como está por instrução explícita**: cálculo
de `ordem` (`MAX(ordem)+1`) em `criar` de páginas/perguntas
(`paginas-pesquisa.service.ts`/`perguntas.service.ts`) continua fora de
transação/lock — sob duas criações concorrentes na mesma
pesquisa/página, ambas podem ler o mesmo `MAX` antes de qualquer `INSERT` e
colidir na constraint `UNIQUE` (agora pelo menos mapeada para `409`
específico em vez de `500`, graças à correção 3 acima). Risco prático baixo
(fluxo exclusivo de `admin`/`gestor_rh`, uso não concorrente esperado no
MVP) — não incorporado à transação existente para não reestruturar o fluxo
de cálculo de `ordem` fora do escopo desta correção pontual.

**Build**: `npm run build` (tsc) executado com sucesso — nenhum erro novo.
Único erro remanescente é o mesmo pré-existente e não relacionado em
`src/test/fakeRepository.ts` (`TS2352`). `npm test` também executado: 141
testes existentes, todos passando (nenhum teste específico do módulo
`pesquisas` existe ainda — fica para a etapa `test-engineer`).

**Migrations a rodar**: nenhuma migration nova nem alterada nesta correção —
a migration `1788288525381-CriarPesquisasPaginasPerguntasCompetencias.ts`
segue a mesma da etapa anterior, ainda **não executada** contra nenhum
banco, aguardando confirmação explícita do usuário antes de
`npm run migration:run`.

## Revisão — 2ª rodada (re-revisão focada na correção pós-revisão)

Escopo desta rodada: os 3 arquivos tocados pela "Correção pós-revisão"
acima (`src/modules/perguntas/perguntas.service.ts`,
`src/modules/paginas-pesquisa/paginas-pesquisa.service.ts`,
`src/middlewares/tratadorErros.ts`) contra os 3 pontos que a corrigiram,
mais reconfirmação dos invariantes de anonimização/acesso já aprovados na
1ª rodada. Os achados da 1ª rodada acima (linhas 907–1123) permanecem como
registro histórico e não foram alterados.

**Sem achados críticos.** As 3 correções fecham os achados que motivaram
esta rodada, sem introduzir regressão. Backend liberado para
`test-engineer`.

### Correção 1 (`perguntas.service.ts atualizar` — `configuracao` sempre revalidada)

Tracei o código linha a linha (`perguntas.service.ts:262-349`):

- `tipoResultante` é calculado (`dto.tipo ?? pergunta.tipo`) **antes** de
  `pergunta.tipo` ser mutado (linha 288) e antes de `configuracaoEfetiva`
  ser lido (linha 298-299) — na leitura de `configuracaoEfetiva`,
  `pergunta.configuracao` ainda contém o valor original persistido (a
  atribuição em `pergunta.configuracao = validarConfiguracaoPergunta(...)`
  só acontece na linha 300, depois da leitura do fallback). Não há
  reordenação de mutação que corrompa o fallback.
- **`pessoa → likert`** sem reenviar `configuracao`: fallback é
  `{ filtroRelacionamento: [...] }`, validado contra `likert`
  → rejeita com `422 CONFIGURACAO_INVALIDA` (falta `niveis`/`rotulos`)
  antes de qualquer escrita (a validação roda fora/antes da transação).
  Confirmado.
- **`likert → pessoa`** sem reenviar `configuracao`: fallback é
  `{ niveis, rotulos }`, validado contra `pessoa` → rejeita com `422
  CONFIGURACAO_INVALIDA` (falta `filtroRelacionamento`) antes de qualquer
  escrita. Confirmado.
- Validação roda sobre a **combinação efetiva** (`tipoResultante` ×
  `configuracaoEfetiva`), nunca sobre um valor parcialmente atualizado —
  não há cenário em que `pergunta.tipo` já mutado seja combinado com uma
  config ainda não revalidada, nem vice-versa.

**Ponto de maior preocupação desta rodada (regressão em `PUT` que não
mexe em `tipo`/`configuracao`) — verificado, sem achado.** Rastreei o
caso concreto pedido: `PUT { enunciado: 'novo texto' }` numa pergunta
`matriz` válida existente (`{ niveis: 5, rotulos: [...5 itens] }`).
`tipoResultante = pergunta.tipo` (inalterado), `configuracaoEfetiva =
pergunta.configuracao` (o mesmo objeto já persistido).
`validarConfiguracaoPergunta('matriz', { niveis: 5, rotulos: [...] })`
revalida exatamente as mesmas chaves que já foram validadas na
criação/última atualização e reconstrói o objeto campo a campo com os
mesmos valores — não há merge parcial em nenhum ponto do fluxo (toda
gravação de `configuracao`, em `criar` e em `atualizar`, sempre passa
pelo validador completo antes de persistir), logo não existe estado
intermediário "quase válido" que a revalidação possa rejeitar. Como não
há dados legados no banco (migration ainda não executada) e todo caminho
de escrita já passava por este mesmo validador antes da correção, não há
como um registro atualmente persistido falhar nesta revalidação. **Não é
regressão.** (Verificado para os 4 tipos: `likert`/`matriz` — mesmos
`niveis`/`rotulos`; `texto_aberto` — sempre `{}`; `pessoa` — mesmo
`filtroRelacionamento`.)

### Correção 2 (`reordenar` — validação de forma)

Comparei as duas implementações (`perguntas.service.ts:381-421` e
`paginas-pesquisa.service.ts:131-171`) — idênticas em estrutura. Casos
verificados nos dois arquivos:

- `itens` não é array (`dto.itens` string/objeto/`null`/`undefined`):
  normalizado para `[]` por `Array.isArray(dto.itens) ? dto.itens : []`
  antes da checagem de forma — nunca chega a estourar; cai depois na
  checagem `cobreExatamente` (rejeita `422` se existir qualquer
  item/pergunta no escopo; só "passaria" se o escopo já estivesse vazio,
  edge case de risco desprezível, sem 500 possível).
- item `null`/`undefined` dentro do array: `typeof null === 'object'`
  mas `item !== null` barra; `typeof undefined !== 'object'` barra o
  `undefined`. Ambos rejeitados com `422 ORDEM_INVALIDA` antes de
  qualquer `.id`/`.ordem`.
- item sem `id` (ou `id` não string): `typeof (item as
  {id?:unknown}).id === 'string'` falha → `422`.
- `ordem` não numérica (`string`, `undefined`) barrada na checagem de
  forma (`typeof ... === 'number'`); `ordem` numérica mas não inteira
  (float, `NaN`) passa a checagem de forma (é `typeof 'number'`) mas é
  barrada depois por `ordensValidas` (`Number.isInteger`) — ambos os
  caminhos terminam em `422 ORDEM_INVALIDA`, nunca em acesso indevido de
  propriedade.
- `itens: []` com escopo não vazio: `every` vacuamente verdadeiro →
  passa a checagem de forma → falha depois em `cobreExatamente` (`0 !==
  idsExistentes.size`) → `422`. Nenhum 500 possível.
- Validação original de cobertura exata do conjunto (`cobreExatamente`,
  `ordensUnicas`) **preservada sem alteração** — a checagem de forma foi
  inserida como um passo anterior, não substituiu nem reordenou a lógica
  pré-existente.

Confirmado: nenhum caminho degenerado testado mentalmente chega a um
`TypeError` não tratado; todos terminam em `422 ORDEM_INVALIDA`.

### Correção 3 (constraints `UNIQUE` mapeadas)

Conferido string por string, `tratadorErros.ts` (`MAPA_CONSTRAINT_PARA_CODIGO`)
contra a migration
(`src/migrations/1788288525381-CriarPesquisasPaginasPerguntasCompetencias.ts`):

| Constraint na migration | Chave no mapa | Bate? |
|---|---|---|
| `uq_competencias_nome` (linha 35) | `uq_competencias_nome` (linha 13) | Sim |
| `uq_paginas_pesquisa_pesquisa_ordem` (linha 64) | `uq_paginas_pesquisa_pesquisa_ordem` (linha 14) | Sim |
| `uq_perguntas_pagina_ordem` (linha 88) | `uq_perguntas_pagina_ordem` (linha 15) | Sim |

As 3 entradas pré-existentes (`uq_colaboradores_cpf`,
`uq_colaboradores_email`, `uq_colaboradores_usuario_auth_id`)
permanecem intactas — nenhuma removida/alterada por engano.

### Reconfirmação dos invariantes da 1ª rodada — sem regressão

- `garantirPapel(ator, ['admin', 'gestor_rh'])` continua sendo a
  primeira linha de toda função exportada em `perguntas.service.ts`
  (`criar`, `atualizar`, `remover`, `reordenar`) e
  `paginas-pesquisa.service.ts` (`criar`, `listar`, `atualizar`,
  `remover`, `reordenar`) — grep confirma 4 e 5 ocorrências
  respectivamente, uma por função, nenhuma removida pela correção.
  Nenhuma rota nova nem alterada; nenhum caminho alcançável por
  `colaborador`.
- **Anonimização**: `pergunta.entity.ts` não ganhou nenhuma coluna nova
  (`respondente_id`/`avaliador_id`/contador de resposta) — só o
  comentário acima de `configuracao` foi mantido, reforçando que o jsonb
  guarda exclusivamente configuração estrutural. `validarConfiguracaoPergunta`
  continua reconstruindo o objeto campo a campo por tipo (nunca
  passthrough do body) — a correção 1 só mudou *quando* essa função é
  chamada (sempre, em vez de condicionalmente), não *o que* ela aceita ou
  retorna. Nenhuma das 5 entidades do módulo toca
  `itens_resposta`/`relacionamentos_avaliacao` (tabelas que ainda não
  existem). Regra de fundo (respostas `pares`/`subordinado` nunca
  identificadas à pessoa avaliada, só agregadas acima do mínimo do ciclo)
  segue não aplicável a este módulo, que não expõe nenhum dado de
  resposta — mesma conclusão da 1ª rodada.
- `TIPO_PERGUNTA_VALORES` (`common/enums.ts`) continua com exatamente 4
  valores (`likert`, `texto_aberto`, `matriz`, `pessoa`); nenhum
  `synchronize: true` introduzido; nenhum `organization_id` em nenhum
  arquivo tocado por esta correção.

### Sugestão 3 da 1ª rodada (concorrência no cálculo de `ordem`)

Confirmado que continua **deixada como está por decisão explícita** —
"Limitação conhecida" documentada no bloco "Correção pós-revisão" acima,
com o cálculo `MAX(ordem)+1` ainda fora de transação/lock em `criar` de
páginas/perguntas. Não recontabilizada como achado novo nesta rodada,
conforme instrução.

### Migration

Confirmado: nenhuma alteração na migration nesta correção; segue **não
executada** contra nenhum banco (nenhuma evidência de `migration:run`).

### Build/testes (fora de escopo desta revisão de código, só conferência)

Conforme relatado pelo desenvolvedor: `npm run build` sem erros novos
(único erro remanescente é o pré-existente e não relacionado em
`src/test/fakeRepository.ts`, `TS2352`); `npm test` com 141 testes
passando, nenhum novo teste específico do módulo `pesquisas` (fica para
`test-engineer`).

### Conclusão

**Sem achados críticos nesta rodada.** As 3 correções da etapa anterior
resolvem integralmente o achado "Deveria corrigir" e as sugestões 1 e 2
da 1ª rodada, sem introduzir regressão nos invariantes de anonimização,
controle de acesso ou nos fluxos já validados. **Backend liberado para
prosseguir a `test-engineer`.**

## Correção pontual — bug de contrato "impossível esvaziar `mensagemBoasVindas`/`logoUrl`" (backend-developer) — ✅ concluída

Correção cirúrgica pedida diretamente pelo usuário (fora do pipeline de
revisão — sem reabertura de `## Revisão`), motivada por achado do lado
frontend: como `PUT /api/pesquisas/:id` tratava chave ausente e `null` do
mesmo jeito ("não alterar"), e o frontend antigo omitia a chave ao esvaziar
o campo, não existia caminho de volta pela UI depois de preencher
`mensagemBoasVindas`/`logoUrl` uma vez. O frontend passou a enviar `null`
explícito ao esvaziar; esta correção faz o backend aceitar esse caso.
Nenhuma skill reinvocada (correção pontual em campos já existentes, sem
entidade/rota nova, sem tocar respostas/ciclos/anonimização).

**Arquivos alterados:**

- `src/modules/pesquisas/dto/atualizar-pesquisa.dto.ts`: `mensagemBoasVindas`
  e `logoUrl` passam de `?: string` para `?: string | null`, mesmo tipo já
  usado para `cicloId`. Comentário do arquivo atualizado explicando os três
  estados (omitido / `null` / string).
- `src/modules/pesquisas/pesquisas.service.ts`, função `atualizar`: os dois
  campos passam do teste `dto.campo !== undefined` (que não distinguia
  `null` de string) para `'campo' in dto` seguido de `dto.campo === null ?
  null : validarTextoObrigatorio(...)` — exatamente o mesmo padrão já usado
  para `cicloId` nesta função e para `equipeId`/`gestorId` em
  `colaboradores.service.ts`. Nenhuma outra função do service tocada
  (`criar` continua sem aceitar `null` nesses campos — nasce sempre com o
  que veio no DTO de criação ou `null` por omissão, não há campo pré-
  existente para "limpar" na criação; fora do escopo pedido, que era
  restrito a `PUT`).

**Decisão registrada — string vazia/só espaços**: tratada como **inválida**
(`422 CAMPO_INVALIDO`), não como equivalente a `null`. Esse já era o
comportamento de `validarTextoObrigatorio` (usado para todo texto do
módulo) antes desta correção, e é o mesmo comportamento que
`equipeId`/`gestorId` em `colaboradores.service.ts` já aplicam para string
vazia (rejeitam em vez de tratar como limpeza) — mantive por consistência
com o padrão já estabelecido no projeto, em vez de introduzir uma segunda
forma de "limpar" o campo (`null` explícito já cobre esse caso sem
ambiguidade). Só `null` explícito limpa o campo.

**Escopo respeitado**: nenhuma outra parte do módulo tocada; nenhuma
migration criada ou executada (`mensagem_boas_vindas`/`logo_url` já eram
`nullable` desde a migration original,
`1788288525381-CriarPesquisasPaginasPerguntasCompetencias.ts`); nenhuma
coluna/campo de resposta/respondente/avaliador/contador introduzida
(módulo continua template puro).

**Build/testes**: `npm run build` (tsc) executado com sucesso — nenhum erro
novo; único erro remanescente é o mesmo pré-existente e não relacionado em
`src/test/fakeRepository.ts` (`TS2352`). `npm test`: 141 testes existentes,
todos passando (nenhuma regressão) — segue sem teste específico do módulo
`pesquisas` (nenhum existia antes desta correção; fica para a etapa
`test-engineer`, que deve cobrir os três estados de
`mensagemBoasVindas`/`logoUrl` — omitido/`null`/string — ao escrever os
testes de `atualizar`).

**Migrations a rodar**: nenhuma. A migration
`1788288525381-CriarPesquisasPaginasPerguntasCompetencias.ts` segue
inalterada e **não executada** contra nenhum banco, aguardando confirmação
explícita do usuário antes de `npm run migration:run` (mesma situação de
antes desta correção).

## Revisão — 3ª rodada (re-revisão focada na correção pontual de contrato `mensagemBoasVindas`/`logoUrl`)

Escopo desta rodada: os 2 arquivos tocados pela "Correção pontual — bug de
contrato" acima (`src/modules/pesquisas/dto/atualizar-pesquisa.dto.ts` e
`src/modules/pesquisas/pesquisas.service.ts`, função `atualizar`), lidos
integralmente, mais reconfirmação rápida dos invariantes de
anonimização/acesso já aprovados nas rodadas anteriores. As seções "##
Revisão" e "## Revisão — 2ª rodada" acima permanecem como registro
histórico e não foram alteradas.

**Sem achados críticos.** Backend liberado em definitivo — nenhuma pendência
aberta desta rodada.

### 1. Três estados realmente distinguidos, `null` chega até a escrita

Lido `atualizar-pesquisa.dto.ts` e `pesquisas.service.ts` (função `atualizar`,
linhas 263–311) por completo. Para `mensagemBoasVindas` e `logoUrl`:

- Chave ausente: `'mensagemBoasVindas' in dto` / `'logoUrl' in dto` é `false`
  → o bloco inteiro é pulado, `pesquisa.mensagemBoasVindas`/`pesquisa.logoUrl`
  mantêm o valor já carregado do banco (a entidade vem de
  `buscarEntidadeOuFalhar`, não de um objeto novo) — coluna não é tocada.
- Chave presente com `null`: `dto.campo === null` é verdadeiro →
  `pesquisa.campo = null` diretamente, sem passar por
  `validarTextoObrigatorio`.
- Chave presente com string não vazia: cai no `else` do operador ternário,
  valida via `validarTextoObrigatorio` e atribui o texto normalizado
  (`trim()`).

Não há spread (`{ ...pesquisa, ...dto }`) nem `Object.assign` em nenhum ponto
do fluxo — a atribuição é sempre direta a uma propriedade da instância de
entidade já carregada (`pesquisa.mensagemBoasVindas = ...`), e
`repositorio().save(pesquisa)` (TypeORM) persiste a instância mutada tal como
está, incluindo `null` explícito (TypeORM grava `NULL` para uma propriedade
com valor `null`, não a omite do `UPDATE`). Nenhum ponto intermediário filtra
ou converte `null` para `undefined`/string vazia. Confirmado: os três estados
produzem exatamente o efeito descrito no resumo da correção.

### 2. Ponto de maior atenção — vazamento de `null` para `titulo` (campo `NOT NULL`) — verificado, sem achado

Este era o ponto de maior risco desta rodada. Confirmado que a mudança de
tipagem **não vazou**:

- `AtualizarPesquisaDto.titulo` continua `titulo?: string` (sem `| null`) —
  só `mensagemBoasVindas`, `logoUrl` e `cicloId` ganharam `| null`. `titulo`
  segue com a mesma forma de antes desta correção.
- `CriarPesquisaDto.titulo` (`dto/criar-pesquisa.dto.ts`) continua
  `titulo: string`, obrigatório, sem `?` nem `| null` — arquivo não tocado
  por esta correção (confirmado por grep: só `atualizar-pesquesa.dto.ts` e
  `pesquisas.service.ts` referenciam `mensagemBoasVindas`/`logoUrl` além da
  entidade e do DTO de criação, nenhum dos quais foi alterado).
- `pesquisa.entity.ts`, coluna `titulo`: `@Column({ type: 'varchar', length:
  255 })` — sem `nullable: true`, batendo com `titulo!: string` (não
  `string | null`) e com a migration (`titulo varchar(255) NOT NULL`).
  Nenhuma alteração nesta entidade por esta correção.
- Em `atualizar`, o bloco de `titulo` continua exatamente como antes desta
  correção: `if (dto.titulo !== undefined) { pesquisa.titulo =
  validarTextoObrigatorio(dto.titulo, { campo: 'titulo', min: 2, max: 255
  }) }` — nunca ganhou um caminho `=== null ? null : ...` como os outros
  três campos.
- **Defesa em runtime, mesmo com o tipo TS não permitindo `null` em tempo de
  compilação**: como o controller repassa `req.body` sem validação de shape
  antes do service (`pesquisasService.atualizar(ator, id, req.body)`,
  `pesquisas.controller.ts`), um cliente HTTP mal-intencionado/buggy
  poderia, na prática, enviar `{ "titulo": null }` — isso não é bloqueado
  pelo tipo TS em runtime. Tracei esse caminho: `dto.titulo !== undefined`
  é `true` (`null !== undefined`), então entra no bloco e chama
  `validarTextoObrigatorio(null, { campo: 'titulo', ... })`, que checa
  `typeof valor !== 'string'` primeiro (`common/validacao.ts:20`) e lança
  `422 CAMPO_INVALIDO` **antes** de qualquer atribuição a `pesquisa.titulo`
  ou chamada a `.save()`. Não há caminho, nem por bug de tipagem nem por
  payload adversarial, em que `null` chegue à coluna `titulo` — não é
  regressão, não é achado.

### 3. `cicloId` — sem regressão

`pesquisas.service.ts` linha 304–306: `if ('cicloId' in dto) { pesquisa.cicloId
= dto.cicloId === null ? null : validarFormatoCicloId(dto.cicloId) }` —
idêntico ao padrão já revisado nas rodadas anteriores, não tocado por esta
correção (só copiado como referência para os outros dois campos, conforme o
próprio resumo da correção descreve). Comportamento de três estados
preservado.

### 4. Coerência da decisão sobre string vazia

`validarTextoObrigatorio` (`common/validacao.ts:14-43`), usada tanto para
`mensagemBoasVindas` quanto para `logoUrl` no branch de string, rejeita
`''`/só espaços com `422 CAMPO_INVALIDO` antes de checar `min`/`max`
(`valor.trim().length === 0`) — comportamento idêntico para os dois campos,
sem bifurcação. Decisão documentada tanto no comentário de código
(`atualizar-pesquisa.dto.ts`, linhas 6–16, e comentário inline em
`pesquisas.service.ts` acima do bloco de `mensagemBoasVindas`) quanto no
arquivo de task (seção "Decisão registrada — string vazia/só espaços" da
correção acima) — presente nos dois lugares, não só no código.

### 5. Escopo contido — confirmado

Grep por `mensagemBoasVindas|logoUrl` em todo `src/modules/pesquisas/`
retorna exatamente 4 arquivos: `pesquisas.service.ts`,
`dto/atualizar-pesquisa.dto.ts` (os dois alterados por esta correção,
conforme o próprio resumo declara), `pesquisa.entity.ts` e
`dto/criar-pesquisa.dto.ts` (lidos e conferidos como **inalterados** —
`titulo` de `criar-pesquisa.dto.ts` continua `string` obrigatório sem
`null`; a entidade continua sem `nullable: true` em `titulo`). Lido também
`pesquisas.controller.ts` por completo — nenhuma linha tocada, continua
repassando `req.body` cru para o service, mesmo padrão de antes. Nenhum
outro módulo (`paginas-pesquisa`, `perguntas`, `competencias`) nem
`tratadorErros.ts` foi alterado por esta correção. Escopo bate exatamente
com o declarado no resumo ("DTO + função `atualizar`").

### 6. Reconfirmação rápida dos invariantes das rodadas anteriores — sem regressão

- `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` continua sendo a primeira
  linha de `atualizar` (linha 268) e de todas as demais funções exportadas
  de `pesquisas.service.ts` — nenhuma rota nova, nenhuma alcançável por
  `colaborador`.
- **Anonimização**: nenhuma coluna/campo de resposta, respondente,
  `avaliador_id` ou contador foi introduzido nesta correção — só tipagem e
  lógica de dois campos de texto já existentes (`mensagemBoasVindas`,
  `logoUrl`), que continuam sendo apenas configuração estrutural da
  pesquisa (mensagem de boas-vindas e URL de logo), nunca dado de
  resposta/avaliador. O módulo segue template puro; regra de fundo do
  projeto (respostas `pares`/`subordinado` nunca identificadas à pessoa
  avaliada, só agregadas acima do mínimo do ciclo) segue não aplicável a
  este módulo pelos mesmos motivos já registrados nas rodadas 1 e 2.
- `TIPO_PERGUNTA_VALORES` continua com exatamente 4 valores; nenhum
  `synchronize: true`; nenhum `organization_id` em nenhum arquivo tocado por
  esta correção.
- Migration `1788288525381-...` confirmada **não executada** contra nenhum
  banco e sem nenhum arquivo novo/alterado — a correção não precisou de
  migration porque as colunas já eram `nullable` desde a migration
  original.

### Build/testes (fora de escopo desta revisão de código, só conferência)

Conforme relatado pelo desenvolvedor: `npm run build` sem erros novos (único
erro remanescente é o mesmo pré-existente e não relacionado em
`src/test/fakeRepository.ts`, `TS2352` — não contabilizado como achado);
`npm test` com 141 testes passando, sem regressão, sem teste específico
ainda cobrindo os três estados de `mensagemBoasVindas`/`logoUrl` (fica para
`test-engineer`, conforme já sinalizado no resumo da correção).

### Conclusão

**Sem achados críticos, sem achados "Deveria corrigir", sem achados
"Sugestão" nesta rodada.** A correção pontual resolve exatamente o bug de
contrato relatado, dentro do escopo declarado (DTO + função `atualizar`),
sem vazar `null` para `titulo` (campo `NOT NULL`) nem para nenhum outro
campo obrigatório, sem regredir `cicloId`, e sem introduzir nenhum risco de
anonimização/controle de acesso. **Backend liberado em definitivo** — não há
pendência de revisão aberta para este módulo.
