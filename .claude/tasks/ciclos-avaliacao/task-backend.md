# Task: Motor de ciclos de avaliação 360 — Backend

Demanda 100% backend (`backend/`, equivalente a `apps/api` nas referências dos
agentes/skills — usar sempre os caminhos reais `backend/**` neste plano). Não
toca `frontend/`. Requisitos já especificados diretamente pelo usuário — sem
`spec.md`, etapa `spec` pulada a pedido explícito.

## Estado atual verificado (antes do plano)

- Módulo greenfield: não existe `src/modules/ciclos-avaliacao/` nem
  `src/modules/ciclo-participantes/`. `auth`, `equipes`, `colaboradores`,
  `competencias`, `pesquisas`, `paginas-pesquisa`, `perguntas` já estão
  implementados.
- `docs/schema_avaliacao360_pt_v2.sql` é a fonte de verdade para os nomes
  novos desta task (`ciclos_avaliacao`, `relacionamentos_avaliacao`, enums
  `status_ciclo` e `tipo_relacionamento`). `ciclo_participantes` é uma tabela
  **nova**, sem equivalente no schema doc — desenhada nesta task (ver seção
  "Decisão de modelagem — `ciclo_participantes`" abaixo).
- `src/common/enums.ts` **já tem** `TipoRelacionamento`/
  `TIPO_RELACIONAMENTO_VALORES` (`'autoavaliacao' | 'gestor' | 'pares' |
  'subordinado' | 'externo'`, nessa ordem) — foi adicionado de forma
  provisória pela task `pesquisas` para validar
  `perguntas.configuracao.filtroRelacionamento`, com um comentário dizendo
  "quando o módulo de ciclos/relacionamentos for criado, reconciliar com o
  enum Postgres real". Os valores já batem **exatamente** com o enum
  Postgres `tipo_relacionamento` que esta task cria — **não recriar este
  tipo/constante**, só atualizar o comentário (remover "provisória", apontar
  para o enum Postgres real criado pela migration desta task). `StatusCiclo`/
  `STATUS_CICLO_VALORES` ainda não existe — precisa ser adicionado.
- `AppDataSource` (`backend/src/data-source.ts`) faz glob automático de
  `modules/**/*.entity.{ts,js}` — novas entidades não precisam ser
  registradas manualmente em lugar nenhum além de existirem no caminho certo.
- `src/app.ts` monta routers explicitamente — o novo router de ciclos precisa
  ser adicionado ali.
- **Gap encontrado em `pesquisas` (tech debt, corrigir nesta task, ver seção
  dedicada abaixo):**
  - `backend/src/modules/pesquisas/pesquisa.entity.ts`: `cicloId` é uma
    `@Column` solta, sem `@ManyToOne`/FK.
  - `backend/src/modules/pesquisas/pesquisas.service.ts`,
    `validarFormatoCicloId` (linha ~79): só valida formato UUID, nunca
    existência — comentário explícito no código dizendo que isso é dívida
    técnica a resolver quando o módulo de ciclos existir.
  - `backend/src/migrations/1788288525381-CriarPesquisasPaginasPerguntasCompetencias.ts`:
    a tabela `pesquisas` foi criada **sem** o índice
    `idx_pesquisas_ciclo(ciclo_id)` que o schema doc prevê — gap adicional
    encontrado nesta investigação, corrigido na migration desta task (ver
    seção "Migration", passo 6).
- Este módulo **não** implementa `envios_pesquisa`/`respostas`/
  `itens_resposta` nem expõe nenhuma resposta — só gera
  `relacionamentos_avaliacao` (quem avalia quem) e mantém
  `ciclos_avaliacao.minimo_respostas_pares`/`anonimizar_respostas_pares`, que
  são a base sobre a qual a anonimização futura (skill
  `backend-anonimizacao-respostas`, views `respostas_identificadas`/
  `respostas_pares_agregadas`) será construída. Nomes/tipos aqui precisam
  bater exatamente com o schema doc — qualquer divergência quebra essa base.

## Decisão de modelagem — tabela nova `ciclo_participantes`

Não existe no schema doc. Desenhada seguindo a mesma convenção do restante
do schema (uuid PK, FKs com `ON DELETE CASCADE`, `unique` de par, índices
`idx_<tabela>_<coluna>`):

```sql
CREATE TABLE ciclo_participantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id uuid NOT NULL REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ciclo_participantes_ciclo_colaborador UNIQUE (ciclo_id, colaborador_id)
);

CREATE INDEX idx_ciclo_participantes_ciclo_id ON ciclo_participantes (ciclo_id);
CREATE INDEX idx_ciclo_participantes_colaborador_id ON ciclo_participantes (colaborador_id);
```

Nome escolhido: `ciclo_participantes` (singular "ciclo" + "participantes",
por legibilidade — "participantes de um ciclo"), análogo a como
`paginas_pesquisa` lê como "páginas de uma pesquisa". Guarda **apenas** o
vínculo de participação (quem está no ciclo) — não guarda papel/tipo de
relacionamento, isso é derivado na ativação e vive em
`relacionamentos_avaliacao`.

## Decisões assumidas (documentadas por não estarem no pedido original)

1. **Nomes de diretório de módulo seguem o padrão já em uso**
   (`paginas-pesquisa` para tabela `paginas_pesquisa`): diretório
   `src/modules/ciclos-avaliacao/` (entidade `ciclo-avaliacao.entity.ts`,
   classe `CicloAvaliacao`) e `src/modules/ciclo-participantes/` (entidade
   `ciclo-participante.entity.ts`, classe `CicloParticipante`). A entidade
   `RelacionamentoAvaliacao` (`relacionamento-avaliacao.entity.ts`) vive
   **dentro** do módulo `ciclos-avaliacao` (não ganha módulo próprio nesta
   task) porque não tem create/update/delete próprios — é gerada só pela
   ativação do ciclo e só tem uma rota de leitura, exposta via
   `ciclos-avaliacao`. Mesmo padrão já usado para `PerguntaCompetencia`
   dentro do módulo `perguntas`.
2. **Path HTTP é `/api/ciclos`, não `/api/ciclos-avaliacao`** — mesma lógica
   de `equipes`/`colaboradores` (nome de rota curto, sem repetir contexto já
   óbvio da plataforma). O nome de diretório de módulo (decisão 1) segue o
   nome de tabela; o path HTTP é uma escolha de API, documentada aqui.
3. **Edição/remoção de ciclo e gestão de participantes só em
   `status = 'rascunho'`** — mesmo padrão de `garantirEditavel`/
   `PESQUISA_NAO_EDITAVEL` já usado em `pesquisas`. Justificativa: depois de
   `ativo`, os `relacionamentos_avaliacao` já foram gerados a partir do
   conjunto de participantes e das datas/`minimoRespostasPares` vigentes;
   permitir mudar participantes ou essas configurações depois quebraria a
   consistência entre o que foi gerado e o que a UI mostra. **Sinalizado
   também na seção "Perguntas em aberto"** por ser uma extensão de regra de
   negócio não pedida literalmente.
4. **Ativação é feita através do mesmo endpoint genérico de transição de
   status** (`PATCH /api/ciclos/:id/status`), não uma rota de ação separada
   — mesmo padrão exato de `pesquisas.service.atualizarStatus` (que já tem
   um `if` especial para a transição `rascunho→publicada`, checando
   `PESQUISA_VAZIA`). Aqui, o `if` especial para `rascunho→ativo` dispara a
   geração de `relacionamentos_avaliacao` dentro de uma transação, antes de
   persistir o novo `status`.
5. **Idempotência da geração**: como `TRANSICOES_VALIDAS` só permite
   `rascunho→ativo` uma vez (uma segunda chamada com o ciclo já `ativo` cai
   em `409 TRANSICAO_STATUS_INVALIDA` antes de chegar na geração), a
   idempotência pedida no requisito é implementada como defesa em
   profundidade contra corrida (duas requisições concorrentes lendo
   `status='rascunho'` antes de qualquer uma commitar): o insert de
   `relacionamentos_avaliacao` usa `.orIgnore()` do query builder do TypeORM
   sobre a constraint `unique (ciclo_id, avaliador_id, avaliado_id,
   tipo_relacionamento)` (já definida no schema doc), dentro de
   `AppDataSource.transaction(...)`. Isso garante zero duplicação mesmo sob
   corrida, sem precisar de lock explícito.
6. **`criadoPor`** em `ciclos_avaliacao` é preenchido com `ator.id` na
   criação (diferente de `pesquisas.service.criar`, que hoje **não** seta
   `criadoPor` apesar da coluna existir — gap pré-existente de outra task,
   fora de escopo aqui, não corrigido). Não faz parte do shape de resposta
   como objeto aninhado (só o uuid), mesmo padrão simples usado por
   `pesquisas`.
7. **`nome`/`descricao` usam `type: 'text'`** na entidade (não `varchar`),
   batendo exatamente com o schema doc (`nome text not null`, `descricao
   text`), mesmo isso divergindo do padrão `varchar(255)` usado em
   `pesquisas.titulo`/`equipes.nome`. Limites de tamanho (`nome` até 255,
   `descricao` até 2000) são validados só na aplicação (`validarTextoObrigatorio`),
   nunca na coluna — arbitrário desta task, sinalizado para confirmação.
8. **`dataInicio`/`dataFim`** mapeadas como `@Column({ type: 'date' })` —
   TypeORM retorna/aceita como `string` no formato `YYYY-MM-DD` (sem
   componente de hora), não `Date`. Validação de formato via regex
   `^\d{4}-\d{2}-\d{2}$` + verificação de data de calendário válida, mais a
   checagem `dataFim >= dataInicio` replicada na aplicação (além da
   constraint `chk_datas_ciclo` do banco), para devolver `422` amigável em
   vez de deixar a constraint do Postgres estourar como erro 500/genérico.
9. **`minimoRespostasPares`**: inteiro `>= 1` (nunca `0` — um mínimo `0`
   tornaria a agregação de pares/subordinado trivialmente "sempre liberada",
   o que enfraquece a proteção que essa coluna existe para garantir).
   Sinalizado também em "Perguntas em aberto" por ser uma regra não pedida
   literalmente.
10. **Vincular pesquisa a ciclo exige `pesquisas.status === 'publicada'`**
    (requisito 3 do pedido, "pesquisa **já publicada**") — ver seção
    dedicada "Tech debt: `pesquisas.ciclo_id`" abaixo. Desvincular
    (`cicloId: null`) é sempre permitido, independentemente do status da
    pesquisa ou do ciclo.
11. **`POST .../participantes/por-equipe` com equipe sem colaboradores
    ativos não é erro** — retorna a lista de participantes inalterada
    (`200`), não `422`. Times podem legitimamente estar vazios no momento em
    que o RH decide incluí-los.
12. **Colaborador precisa estar `ativo = true` para ser adicionado como
    participante** (individual ou via equipe) — um colaborador inativo não
    deveria gerar `relacionamentos_avaliacao` reais. Se um participante for
    desativado **depois** de já estar no ciclo, esta task não remove
    automaticamente (fora de escopo; participantes só mudam via ação
    explícita do admin/gestor_rh, e só em `rascunho`).
13. **`GET /api/ciclos/:id` não retorna páginas/perguntas nem participantes
    aninhados** — shape plano (mesmos campos de `ciclos_avaliacao`).
    Participantes e relacionamentos têm rotas de listagem próprias, mesma
    filosofia de `pesquisas` vs. `paginas-pesquisa`/`perguntas` (recursos
    granulares, não tudo aninhado numa única resposta).

## Plano — Backend

### 1. backend-developer

Antes de codar: invocar a skill `backend-modulo-crud` e a skill
`backend-anonimizacao-respostas` (via `Skill` tool) — mesmo esta task não
tocando respostas, ela cria as duas colunas/tabela que a anonimização futura
depende (`minimo_respostas_pares`, `relacionamentos_avaliacao`), então a
skill deve ser lida para os nomes baterem exatamente.

#### 1.1 Enums (`src/common/enums.ts`)

Adicionar:

```ts
export type StatusCiclo = 'rascunho' | 'ativo' | 'encerrado'

export const STATUS_CICLO_VALORES: StatusCiclo[] = ['rascunho', 'ativo', 'encerrado']
```

**Não recriar** `TipoRelacionamento`/`TIPO_RELACIONAMENTO_VALORES` — já
existe e os valores já batem com o enum Postgres `tipo_relacionamento`
criado por esta task. Só atualizar o comentário acima dele: remover
"provisória"/"ainda não existe" e apontar para a migration desta task como a
fonte do enum Postgres real (`tipo_relacionamento`, ver 1.2).

#### 1.2 Migration

Arquivo `src/migrations/<timestamp>-CriarCiclosAvaliacaoRelacionamentosEParticipantes.ts`
(timestamp maior que `1788288525381`, gerado no momento da implementação —
não reutilizar o mesmo número). **Não rodar esta migration contra nenhum
banco real sem confirmação explícita do usuário.**

```sql
-- 1. Enums
CREATE TYPE status_ciclo AS ENUM ('rascunho', 'ativo', 'encerrado');
CREATE TYPE tipo_relacionamento AS ENUM ('autoavaliacao', 'gestor', 'pares', 'subordinado', 'externo');

-- 2. ciclos_avaliacao (nomes/tipos exatamente como docs/schema_avaliacao360_pt_v2.sql)
CREATE TABLE ciclos_avaliacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  status status_ciclo NOT NULL DEFAULT 'rascunho',
  anonimizar_respostas_pares boolean NOT NULL DEFAULT true,
  minimo_respostas_pares smallint NOT NULL DEFAULT 3,
  criado_por uuid REFERENCES colaboradores(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_datas_ciclo CHECK (data_fim >= data_inicio)
);

-- 3. ciclo_participantes (tabela nova desta task, ver decisão de modelagem)
CREATE TABLE ciclo_participantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id uuid NOT NULL REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ciclo_participantes_ciclo_colaborador UNIQUE (ciclo_id, colaborador_id)
);

CREATE INDEX idx_ciclo_participantes_ciclo_id ON ciclo_participantes (ciclo_id);
CREATE INDEX idx_ciclo_participantes_colaborador_id ON ciclo_participantes (colaborador_id);

-- 4. relacionamentos_avaliacao (nomes/tipos/índices exatamente como o schema doc,
--    inclusive os nomes de índice sem sufixo "_id": idx_relacionamentos_ciclo,
--    idx_relacionamentos_avaliado, idx_relacionamentos_avaliador)
CREATE TABLE relacionamentos_avaliacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id uuid NOT NULL REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE,
  avaliador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  avaliado_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  tipo_relacionamento tipo_relacionamento NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ciclo_id, avaliador_id, avaliado_id, tipo_relacionamento)
);

CREATE INDEX idx_relacionamentos_ciclo ON relacionamentos_avaliacao (ciclo_id);
CREATE INDEX idx_relacionamentos_avaliado ON relacionamentos_avaliacao (avaliado_id);
CREATE INDEX idx_relacionamentos_avaliador ON relacionamentos_avaliacao (avaliador_id);

-- 5. Tech debt: FK real de pesquisas.ciclo_id (hoje é uuid solto, sem REFERENCES)
ALTER TABLE pesquisas
  ADD CONSTRAINT fk_pesquisas_ciclo FOREIGN KEY (ciclo_id)
  REFERENCES ciclos_avaliacao(id) ON DELETE SET NULL;

-- 6. Tech debt: índice que o schema doc previa e a migration original de
--    pesquisas não criou (idx_pesquisas_ciclo)
CREATE INDEX idx_pesquisas_ciclo ON pesquisas (ciclo_id);
```

`down` (ordem inversa, FK/índice de `pesquisas` primeiro, depois tabelas
dependentes, depois `ciclos_avaliacao`, depois os enums):

```sql
DROP INDEX idx_pesquisas_ciclo;
ALTER TABLE pesquisas DROP CONSTRAINT fk_pesquisas_ciclo;
DROP TABLE relacionamentos_avaliacao;
DROP TABLE ciclo_participantes;
DROP TABLE ciclos_avaliacao;
DROP TYPE tipo_relacionamento;
DROP TYPE status_ciclo;
```

**Nomes de constraint a usar exatamente**: `chk_datas_ciclo`,
`uq_ciclo_participantes_ciclo_colaborador`, `fk_pesquisas_ciclo`. A
`UNIQUE (ciclo_id, avaliador_id, avaliado_id, tipo_relacionamento)` de
`relacionamentos_avaliacao` fica **sem nome explícito** (deixar o Postgres
gerar o nome padrão) — o schema doc também não nomeia essa constraint, e o
service nunca depende do nome dela para tratamento de erro (usa `.orIgnore()`
em vez de capturar violação, ver 1.5).

#### 1.3 Entidades TypeORM

- `src/modules/ciclos-avaliacao/ciclo-avaliacao.entity.ts`:
  ```ts
  @Entity('ciclos_avaliacao')
  export class CicloAvaliacao {
    @PrimaryGeneratedColumn('uuid') id!: string

    @Column({ type: 'text' }) nome!: string

    @Column({ type: 'text', nullable: true }) descricao!: string | null

    @Column({ name: 'data_inicio', type: 'date' }) dataInicio!: string

    @Column({ name: 'data_fim', type: 'date' }) dataFim!: string

    @Column({ type: 'enum', enum: STATUS_CICLO_VALORES, enumName: 'status_ciclo', default: 'rascunho' })
    status!: StatusCiclo

    @Column({ name: 'anonimizar_respostas_pares', type: 'boolean', default: true })
    anonimizarRespostasPares!: boolean

    @Column({ name: 'minimo_respostas_pares', type: 'smallint', default: 3 })
    minimoRespostasPares!: number

    @Column({ name: 'criado_por', type: 'uuid', nullable: true }) criadoPor!: string | null

    @CreateDateColumn({ name: 'criado_em' }) criadoEm!: Date
    @UpdateDateColumn({ name: 'atualizado_em' }) atualizadoEm!: Date
  }
  ```
- `src/modules/ciclo-participantes/ciclo-participante.entity.ts`:
  ```ts
  @Entity('ciclo_participantes')
  export class CicloParticipante {
    @PrimaryGeneratedColumn('uuid') id!: string

    @Column({ name: 'ciclo_id', type: 'uuid' }) cicloId!: string
    @ManyToOne(() => CicloAvaliacao, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'ciclo_id' })
    ciclo!: CicloAvaliacao

    @Column({ name: 'colaborador_id', type: 'uuid' }) colaboradorId!: string
    @ManyToOne(() => Colaborador, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'colaborador_id' })
    colaborador!: Colaborador

    @CreateDateColumn({ name: 'criado_em' }) criadoEm!: Date
  }
  ```
- `src/modules/ciclos-avaliacao/relacionamento-avaliacao.entity.ts`:
  ```ts
  @Entity('relacionamentos_avaliacao')
  export class RelacionamentoAvaliacao {
    @PrimaryGeneratedColumn('uuid') id!: string

    @Column({ name: 'ciclo_id', type: 'uuid' }) cicloId!: string
    @ManyToOne(() => CicloAvaliacao, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'ciclo_id' })
    ciclo!: CicloAvaliacao

    @Column({ name: 'avaliador_id', type: 'uuid' }) avaliadorId!: string
    @ManyToOne(() => Colaborador, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'avaliador_id' })
    avaliador!: Colaborador

    @Column({ name: 'avaliado_id', type: 'uuid' }) avaliadoId!: string
    @ManyToOne(() => Colaborador, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'avaliado_id' })
    avaliado!: Colaborador

    @Column({ name: 'tipo_relacionamento', type: 'enum', enum: TIPO_RELACIONAMENTO_VALORES, enumName: 'tipo_relacionamento' })
    tipoRelacionamento!: TipoRelacionamento

    @CreateDateColumn({ name: 'criado_em' }) criadoEm!: Date
  }
  ```
  Esta entidade **nunca** ganha coluna de valor/resposta — é só o vínculo
  avaliador↔avaliado↔tipo. Dados de resposta (`itens_resposta`) são de outra
  task, fora de escopo (guard rail de anonimização, seção 1.7).

Todas as `@ManyToOne` que apontam para `Colaborador`/`CicloAvaliacao` são
para permitir `relations` no TypeORM ao montar as respostas com nome do
avaliador/avaliado — o `find`/`createQueryBuilder` decide caso a caso (ver
1.5) se usa a relação ou uma query manual com join.

#### 1.4 DTOs

- `src/modules/ciclos-avaliacao/dto/criar-ciclo.dto.ts`:
  ```ts
  export interface CriarCicloDto {
    nome: string
    descricao?: string
    dataInicio: string // "YYYY-MM-DD"
    dataFim: string // "YYYY-MM-DD"
    anonimizarRespostasPares?: boolean
    minimoRespostasPares?: number
  }
  ```
- `src/modules/ciclos-avaliacao/dto/atualizar-ciclo.dto.ts`: mesmos campos,
  todos opcionais — **não** declara `status` (só via rota de transição).
- `src/modules/ciclos-avaliacao/dto/atualizar-status-ciclo.dto.ts`:
  `{ status: StatusCiclo }`.
- `src/modules/ciclo-participantes/dto/adicionar-participantes.dto.ts`:
  `{ colaboradorIds: string[] }`.
- `src/modules/ciclo-participantes/dto/adicionar-participantes-por-equipe.dto.ts`:
  `{ equipeId: string }`.

#### 1.5 Módulo `ciclos-avaliacao` (`src/modules/ciclos-avaliacao/`)

`ciclos-avaliacao.service.ts`, toda função exportada com
`garantirPapel(ator, ['admin', 'gestor_rh'])` como primeira linha (exceto os
dois helpers internos explicitamente marcados abaixo):

- `validarData(valor, campo)`: regex `^\d{4}-\d{2}-\d{2}$` + `new
  Date(`${valor}T00:00:00Z`)` não pode ser `Invalid Date` → senão `422
  CAMPO_INVALIDO`. Retorna a string original (não um `Date`).
- `validarMinimoRespostasPares(valor)`: inteiro, `>= 1` (decisão assumida 9)
  → senão `422 CAMPO_INVALIDO`.
- `export function buscarCicloOuFalhar(id: string): Promise<CicloAvaliacao>`
  — busca crua (sem `garantirPapel`, helper interno reaproveitado por
  `ciclo-participantes.service.ts`), `404 CICLO_NAO_ENCONTRADO` se não
  existir.
- `export function garantirCicloEditavel(ciclo: CicloAvaliacao): void` —
  `409 CICLO_NAO_EDITAVEL` (`'Só é possível alterar um ciclo (ou seus
  participantes) em rascunho.'`) se `ciclo.status !== 'rascunho'`.
  Reaproveitado por `ciclo-participantes.service.ts`.
- `criar(ator, dto)`: valida `nome` (`validarTextoObrigatorio`, min 2, max
  255), `descricao` (se presente, min 1, max 2000, senão `null`),
  `dataInicio`/`dataFim` (`validarData`), checa `dataFim >= dataInicio` →
  senão `422 DATAS_CICLO_INVALIDAS`; `anonimizarRespostasPares` (boolean, se
  omitido `true`); `minimoRespostasPares` (se omitido, `3`). Insere com
  `status: 'rascunho'`, `criadoPor: ator.id`.
- `listar(ator)`: `find({ order: { criadoEm: 'DESC' } })`.
- `buscarPorId(ator, id)`: `garantirPapel` → `buscarCicloOuFalhar`.
- `atualizar(ator, id, dto)`: `buscarCicloOuFalhar` → `garantirCicloEditavel`
  → mesmas validações de `criar` para os campos presentes (`'campo' in dto`
  para distinguir omitido de enviado, mesmo padrão de
  `pesquisas.service.atualizar`) → `save`.
- `remover(ator, id)`: `buscarCicloOuFalhar` → se `status !== 'rascunho'` →
  `409 CICLO_NAO_REMOVIVEL` → `DELETE` físico (cascata cobre
  `ciclo_participantes`/`relacionamentos_avaliacao`; `pesquisas.ciclo_id` vai
  a `NULL` via `ON DELETE SET NULL`).
- `atualizarStatus(ator, id, dto)`:
  ```ts
  const TRANSICOES_VALIDAS: Record<StatusCiclo, StatusCiclo[]> = {
    rascunho: ['ativo'],
    ativo: ['encerrado'],
    encerrado: [],
  }
  ```
  - `novoStatus` fora de `TRANSICOES_VALIDAS[ciclo.status]` → `409
    TRANSICAO_STATUS_INVALIDA`.
  - Transição `rascunho → ativo`: conta `ciclo_participantes` do ciclo; `0`
    → `422 CICLO_SEM_PARTICIPANTES`. Senão, dentro de
    `AppDataSource.transaction(async (manager) => { ... })`: chama
    `gerarRelacionamentos(manager, ciclo.id)` (1.6), depois seta
    `ciclo.status = 'ativo'` e salva usando o **mesmo** `manager` (nunca o
    repositório default fora da transação).
  - Transição `ativo → encerrado`: sem pré-condição nesta task (não existe
    ainda `envios_pesquisa`/`respostas` para checar "todo mundo respondeu"
    — fora de escopo). Só atualiza `status`.
- `listarRelacionamentos(ator, id)`: `garantirPapel` → `buscarCicloOuFalhar`
  → query em `RelacionamentoAvaliacao` com dois joins em `colaboradores`
  (avaliador e avaliado) para trazer nome, ordenado por `criadoEm ASC`. Ver
  shape em 1.8.

#### 1.6 Geração de `relacionamentos_avaliacao` (`gerarRelacionamentos`)

Função interna (não exportada como rota, só usada por `atualizarStatus`),
recebe o `EntityManager` da transação e o `cicloId`:

```ts
async function gerarRelacionamentos(manager: EntityManager, cicloId: string): Promise<void> {
  const participantes = await manager.getRepository(CicloParticipante).find({ where: { cicloId } })
  const participanteIds = participantes.map((p) => p.colaboradorId)

  const colaboradores = await manager.getRepository(Colaborador).find({
    where: { id: In(participanteIds) },
  })

  // Participantes agrupados por gestorId — usado para "subordinado" e "pares".
  const participantesPorGestor = new Map<string, Colaborador[]>()
  for (const c of colaboradores) {
    if (!c.gestorId) continue
    const lista = participantesPorGestor.get(c.gestorId) ?? []
    lista.push(c)
    participantesPorGestor.set(c.gestorId, lista)
  }

  const linhas: { avaliadorId: string; avaliadoId: string; tipoRelacionamento: TipoRelacionamento }[] = []

  for (const p of colaboradores) {
    // autoavaliacao: sempre.
    linhas.push({ avaliadorId: p.id, avaliadoId: p.id, tipoRelacionamento: 'autoavaliacao' })

    // gestor: o gestor de p avalia p, MESMO que o gestor não seja participante
    // (gestorId, se preenchido, sempre existe em `colaboradores` — FK garante).
    if (p.gestorId) {
      linhas.push({ avaliadorId: p.gestorId, avaliadoId: p.id, tipoRelacionamento: 'gestor' })
    }

    // subordinado: participantes cujo gestorId === p.id avaliam p.
    for (const subordinado of participantesPorGestor.get(p.id) ?? []) {
      linhas.push({ avaliadorId: subordinado.id, avaliadoId: p.id, tipoRelacionamento: 'subordinado' })
    }

    // pares: participantes com o MESMO gestorId de p (excluindo p) avaliam p.
    // Participante sem gestorId simplesmente não entra aqui (skip silencioso).
    if (p.gestorId) {
      for (const par of participantesPorGestor.get(p.gestorId) ?? []) {
        if (par.id !== p.id) {
          linhas.push({ avaliadorId: par.id, avaliadoId: p.id, tipoRelacionamento: 'pares' })
        }
      }
    }
  }

  if (linhas.length === 0) return

  await manager
    .createQueryBuilder()
    .insert()
    .into(RelacionamentoAvaliacao)
    .values(linhas.map((l) => ({ cicloId, ...l })))
    .orIgnore() // idempotência (decisão assumida 5) — nunca duplica sob retry/corrida.
    .execute()
}
```

Notas explícitas para o `backend-developer`:

- **Nunca** gera relacionamento `tipo_relacionamento = 'externo'` — esse
  tipo existe no enum para uso futuro (avaliador convidado manualmente, fora
  do quadro de colaboradores), não é produzido por este motor.
- Participante sem `gestorId` não gera nenhuma linha `gestor`/`pares` para
  ele mesmo como avaliado — não é exceção, é o comportamento esperado
  (requisito 4 do pedido).
- Toda a função roda dentro da transação de `atualizarStatus` — nunca chamar
  fora de uma transação.

#### 1.7 Módulo `ciclo-participantes` (`src/modules/ciclo-participantes/`)

Montado como sub-router de `ciclos-avaliacao` (`mergeParams: true`), path
final `/api/ciclos/:cicloId/participantes...`.

`ciclo-participantes.service.ts`, toda função exportada com `garantirPapel`
como primeira linha:

- `listar(ator, cicloId)`: `buscarCicloOuFalhar(cicloId)` (de
  `ciclos-avaliacao.service.ts`) → query `CicloParticipante` com relação
  `colaborador` (e `colaborador.equipe`), ordenado por
  `colaborador.nomeCompleto ASC`. Shape em 1.8.
- `adicionarIndividual(ator, cicloId, dto)`: `buscarCicloOuFalhar` →
  `garantirCicloEditavel` → valida `dto.colaboradorIds` é array não vazio de
  strings → busca todos via `In(colaboradorIds)`; qualquer id ausente →
  `404 COLABORADOR_NAO_ENCONTRADO`; qualquer `ativo === false` → `422
  COLABORADOR_INATIVO` (decisão assumida 12) → busca ids já participantes do
  ciclo, filtra a lista para só os novos → insere só esses (sem erro se a
  lista de novos ficar vazia porque todos já eram participantes — idempotente)
  → retorna `listar(ator, cicloId)`.
- `adicionarPorEquipe(ator, cicloId, dto)`: `buscarCicloOuFalhar` →
  `garantirCicloEditavel` → valida `equipeId` existe (`404
  EQUIPE_NAO_ENCONTRADA`) → busca colaboradores com
  `equipeId = dto.equipeId AND ativo = true` → filtra os já participantes →
  insere os novos (lista vazia não é erro, decisão assumida 11) → retorna
  `listar(ator, cicloId)`.
- `remover(ator, cicloId, colaboradorId)`: `buscarCicloOuFalhar` →
  `garantirCicloEditavel` → `DELETE` por `{ cicloId, colaboradorId }`; se
  `affected === 0` → `404 PARTICIPANTE_NAO_ENCONTRADO`.

#### 1.8 Shapes de resposta

**Ciclo** (`CicloResposta`, usado em todas as rotas de `ciclos-avaliacao`):
```json
{
  "id": "uuid",
  "nome": "string",
  "descricao": "string | null",
  "dataInicio": "YYYY-MM-DD",
  "dataFim": "YYYY-MM-DD",
  "status": "rascunho | ativo | encerrado",
  "anonimizarRespostasPares": true,
  "minimoRespostasPares": 3,
  "criadoPor": "uuid | null",
  "criadoEm": "ISO 8601",
  "atualizadoEm": "ISO 8601"
}
```

**Participante** (`ParticipanteResposta`, usado em `ciclo-participantes`):
```json
{
  "id": "uuid (id da linha ciclo_participantes)",
  "colaboradorId": "uuid",
  "nomeCompleto": "string",
  "email": "string",
  "cargo": "string | null",
  "equipe": { "id": "uuid", "nome": "string" } | null
}
```

**Relacionamento** (`RelacionamentoResposta`, usado em
`GET /api/ciclos/:id/relacionamentos`):
```json
{
  "id": "uuid",
  "avaliadorId": "uuid",
  "avaliadorNome": "string",
  "avaliadoId": "uuid",
  "avaliadoNome": "string",
  "tipoRelacionamento": "autoavaliacao | gestor | pares | subordinado | externo",
  "criadoEm": "ISO 8601"
}
```

#### 1.9 Tabela de rotas — contrato de API completo

**`ciclos-avaliacao.module.ts`** (`router.use(autenticar)`, monta o
sub-router de participantes antes das rotas com `:id`, mesmo padrão de
`pesquisas.module.ts`):

| Método | Rota | Papéis | Request (body) | Sucesso | Erros específicos |
|---|---|---|---|---|---|
| POST | `/api/ciclos` | admin, gestor_rh | `CriarCicloDto` | `201 CicloResposta` | `422 CAMPO_INVALIDO`, `422 DATAS_CICLO_INVALIDAS` |
| GET | `/api/ciclos` | admin, gestor_rh | — | `200 CicloResposta[]` | — |
| GET | `/api/ciclos/:id` | admin, gestor_rh | — | `200 CicloResposta` | `404 CICLO_NAO_ENCONTRADO` |
| PUT | `/api/ciclos/:id` | admin, gestor_rh | `AtualizarCicloDto` (sem `status`) | `200 CicloResposta` | `404 CICLO_NAO_ENCONTRADO`, `409 CICLO_NAO_EDITAVEL`, `422 CAMPO_INVALIDO`/`DATAS_CICLO_INVALIDAS` |
| DELETE | `/api/ciclos/:id` | admin, gestor_rh | — | `204` | `404 CICLO_NAO_ENCONTRADO`, `409 CICLO_NAO_REMOVIVEL` |
| PATCH | `/api/ciclos/:id/status` | admin, gestor_rh | `{ "status": "ativo" \| "encerrado" }` | `200 CicloResposta` | `404 CICLO_NAO_ENCONTRADO`, `409 TRANSICAO_STATUS_INVALIDA`, `422 CICLO_SEM_PARTICIPANTES` (só na transição p/ `ativo`) |
| GET | `/api/ciclos/:id/relacionamentos` | admin, gestor_rh | — | `200 RelacionamentoResposta[]` | `404 CICLO_NAO_ENCONTRADO` |

**`ciclo-participantes.module.ts`** (sub-router, `mergeParams: true`,
`router.use(autenticar)` redundante com o pai por defesa em profundidade,
mesmo padrão de `paginas-pesquisa`/`perguntas`):

| Método | Rota | Papéis | Request (body) | Sucesso | Erros específicos |
|---|---|---|---|---|---|
| GET | `/api/ciclos/:cicloId/participantes` | admin, gestor_rh | — | `200 ParticipanteResposta[]` | `404 CICLO_NAO_ENCONTRADO` |
| POST | `/api/ciclos/:cicloId/participantes` | admin, gestor_rh | `{ "colaboradorIds": string[] }` | `200 ParticipanteResposta[]` (lista completa atualizada) | `404 CICLO_NAO_ENCONTRADO`, `404 COLABORADOR_NAO_ENCONTRADO`, `422 COLABORADOR_INATIVO`, `409 CICLO_NAO_EDITAVEL` |
| POST | `/api/ciclos/:cicloId/participantes/por-equipe` | admin, gestor_rh | `{ "equipeId": "uuid" }` | `200 ParticipanteResposta[]` (lista completa atualizada) | `404 CICLO_NAO_ENCONTRADO`, `404 EQUIPE_NAO_ENCONTRADA`, `409 CICLO_NAO_EDITAVEL` |
| DELETE | `/api/ciclos/:cicloId/participantes/:colaboradorId` | admin, gestor_rh | — | `204` | `404 CICLO_NAO_ENCONTRADO`, `404 PARTICIPANTE_NAO_ENCONTRADO`, `409 CICLO_NAO_EDITAVEL` |

Nenhuma dessas rotas é acessível por `colaborador` — todas exigem
`autenticar` + `garantirPapel(['admin', 'gestor_rh'])` como primeira linha
de cada função de serviço.

#### 1.10 Tech debt: `pesquisas.ciclo_id` (escopo obrigatório desta task)

- **`backend/src/modules/pesquisas/pesquisa.entity.ts`**: adicionar, junto à
  `@Column({ name: 'ciclo_id', ... })` já existente, a relação:
  ```ts
  @ManyToOne(() => CicloAvaliacao, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ciclo_id' })
  ciclo!: CicloAvaliacao | null
  ```
  importando `CicloAvaliacao` de `../ciclos-avaliacao/ciclo-avaliacao.entity`.
  Remover o comentário que hoje documenta a dívida técnica (não é mais
  verdade — a FK passa a existir, ver migration 1.2 passo 5).
- **`backend/src/modules/pesquisas/dto/criar-pesquisa.dto.ts`**: remover o
  campo `cicloId` — uma pesquisa recém-criada **sempre** nasce `rascunho`
  (hardcoded em `pesquisas.service.criar`), e a partir de agora vincular a
  um ciclo exige `status === 'publicada'` (ver abaixo), logo `cicloId` na
  criação nunca teria como ser aceito. Não faz sentido manter o campo no DTO
  de criação.
- **`backend/src/modules/pesquisas/pesquisas.service.ts`**:
  - Remover o uso de `cicloId` em `criar()` (a função já não recebe mais
    esse campo no DTO — ver acima).
  - Substituir `validarFormatoCicloId` (síncrona, só formato) por uma nova
    função **assíncrona** `validarCicloExistente(valor: unknown): Promise<string>`:
    valida formato UUID (mesmo regex já existente) → `422 CAMPO_INVALIDO`
    se inválido; depois consulta `AppDataSource.getRepository(CicloAvaliacao).findOneBy({ id })`
    → `404 CICLO_NAO_ENCONTRADO` se não existir; retorna o id.
  - Em `atualizar()`, no bloco `if ('cicloId' in dto)`: quando
    `dto.cicloId !== null`, chamar `await validarCicloExistente(dto.cicloId)`
    e, **antes** de atribuir, checar `pesquisa.status === 'publicada'` →
    senão `409 PESQUISA_NAO_PUBLICADA` (`'Só é possível vincular um ciclo a
    uma pesquisa publicada.'`) — requisito 3 do pedido ("pesquisa já
    publicada"). Quando `dto.cicloId === null` (desvincular), sem
    restrição de status (decisão assumida 10).
  - Import novo: `import { CicloAvaliacao } from '../ciclos-avaliacao/ciclo-avaliacao.entity'`.
- **`backend/src/modules/pesquisas/dto/atualizar-pesquisa.dto.ts`**: sem
  mudança de shape (`cicloId?: string | null` já existe) — só a validação
  no service muda.
- Nenhuma mudança nos shapes de resposta `PesquisaRespostaLista`/
  `PesquisaRespostaDetalhe` (continuam expondo só `cicloId: string | null`,
  sem objeto `ciclo` aninhado — fora de escopo enriquecer essa resposta
  nesta task).

#### 1.11 `tratadorErros.ts` — nova entrada no mapa de constraint

```ts
uq_ciclo_participantes_ciclo_colaborador: 'CICLO_PARTICIPANTE_DUPLICADO',
```

Adicionar ao `MAPA_CONSTRAINT_PARA_CODIGO` existente
(`backend/src/middlewares/tratadorErros.ts`) — defesa em profundidade: o
service já filtra participantes duplicados antes de inserir (1.7), mas se
uma corrida escapar dessa checagem, a constraint garante 409 em vez de 500.
Nenhuma outra constraint nova desta task precisa de mapeamento (a `UNIQUE`
de `relacionamentos_avaliacao` nunca é violada de forma visível ao cliente —
a geração usa `.orIgnore()`, nunca deixa a violação subir como exceção).

#### 1.12 Registro em `app.ts`

```ts
app.use('/api/ciclos', ciclosAvaliacaoRouter)
```
(já inclui o sub-router de participantes montado internamente em
`ciclos-avaliacao.module.ts`). Ordem de `app.use` não importa entre si, mas
`tratadorErros` continua **sempre por último**.

#### 1.13 Guard rail de anonimização (aplica-se mesmo esta task não expondo respostas)

- `RelacionamentoAvaliacao` guarda **só** `avaliadorId`/`avaliadoId`/
  `tipoRelacionamento` — nenhuma coluna de resposta, nota, valor ou
  contador. Nenhuma rota desta task lê/expõe `itens_resposta` (a tabela nem
  existe ainda).
- `ciclos_avaliacao.minimo_respostas_pares`/`anonimizar_respostas_pares` são
  escritos e lidos **exatamente com esses nomes** (nunca renomeados) —
  qualquer módulo futuro de resultados/respostas vai depender desses nomes
  literais para implementar a checagem de mínimo de respondentes descrita na
  skill `backend-anonimizacao-respostas` e nas views
  `respostas_identificadas`/`respostas_pares_agregadas` do schema doc.
- Nenhuma rota desta task é acessível por `colaborador` — `autenticar` +
  `garantirPapel(['admin', 'gestor_rh'])` em toda função exportada dos dois
  services novos, sem exceção.
- Esta task **não** implementa nenhuma leitura de resultado/resposta
  agregada — isso é de uma task futura (`envios_pesquisa`/`respostas`), que
  deve seguir a skill `backend-anonimizacao-respostas` ao pé da letra usando
  exatamente as colunas/tabelas criadas aqui.

Ao terminar: rodar `npm run build` (tsc) dentro de `backend/` e confirmar que
compila sem erros antes de marcar a etapa concluída. Registrar no resumo da
task que a migration desta seção **não deve ser executada** contra um banco
real sem confirmação explícita do usuário (mesma regra dos módulos
anteriores).

#### Status: CONCLUÍDA (2026-09-02)

Implementação seguiu o plano ao pé da letra, sem desvios de nomes/tipos em
relação a `docs/schema_avaliacao360_pt_v2.sql`. Skills `backend-modulo-crud` e
`backend-anonimizacao-respostas` invocadas antes de codar.

**Arquivos criados:**
- `backend/src/modules/ciclos-avaliacao/ciclo-avaliacao.entity.ts`
- `backend/src/modules/ciclos-avaliacao/relacionamento-avaliacao.entity.ts`
- `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.service.ts` (inclui
  `gerarRelacionamentos` interna, idêntica ao pseudocódigo do plano, com
  `.orIgnore()` dentro de `AppDataSource.transaction`)
- `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.controller.ts`
- `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.module.ts`
- `backend/src/modules/ciclos-avaliacao/dto/criar-ciclo.dto.ts`,
  `dto/atualizar-ciclo.dto.ts`, `dto/atualizar-status-ciclo.dto.ts`
- `backend/src/modules/ciclo-participantes/ciclo-participante.entity.ts`
- `backend/src/modules/ciclo-participantes/ciclo-participantes.service.ts`
- `backend/src/modules/ciclo-participantes/ciclo-participantes.controller.ts`
- `backend/src/modules/ciclo-participantes/ciclo-participantes.module.ts`
- `backend/src/modules/ciclo-participantes/dto/adicionar-participantes.dto.ts`,
  `dto/adicionar-participantes-por-equipe.dto.ts`
- `backend/src/migrations/1788300000000-CriarCiclosAvaliacaoRelacionamentosEParticipantes.ts`
  (timestamp escolhido maior que `1788288525381`; **NÃO executada** contra
  nenhum banco real — precisa de `npm run migration:run` com confirmação
  explícita do usuário antes de rodar em qualquer ambiente)

**Arquivos alterados:**
- `backend/src/common/enums.ts`: adicionado `StatusCiclo`/
  `STATUS_CICLO_VALORES`; comentário de `TipoRelacionamento` atualizado
  (removida menção a "provisória", aponta para o enum Postgres real criado
  pela migration desta task).
- `backend/src/app.ts`: registrado `app.use('/api/ciclos', ciclosAvaliacaoRouter)`.
- `backend/src/middlewares/tratadorErros.ts`: adicionada entrada
  `uq_ciclo_participantes_ciclo_colaborador: 'CICLO_PARTICIPANTE_DUPLICADO'`
  no `MAPA_CONSTRAINT_PARA_CODIGO`.
- `backend/src/modules/pesquisas/pesquisa.entity.ts`: adicionada relação
  `@ManyToOne(() => CicloAvaliacao, ...)` + `@JoinColumn` real para `ciclo_id`
  (a coluna solta já existia). Nota: o comentário de dívida técnica que
  existia nesta entidade já não estava mais presente no arquivo no momento da
  implementação (estado do arquivo em disco divergia do trecho citado no
  plano — provavelmente uma edição concorrente de outra sessão); a relação
  foi adicionada da mesma forma.
- `backend/src/modules/pesquisas/dto/criar-pesquisa.dto.ts`: removido campo
  `cicloId` (nunca aceito na criação).
- `backend/src/modules/pesquisas/pesquisas.service.ts`: `validarFormatoCicloId`
  substituída pela assíncrona `validarCicloExistente` (valida formato UUID +
  existência em `ciclos_avaliacao`, `404 CICLO_NAO_ENCONTRADO` se ausente);
  `criar()` não usa mais `dto.cicloId` (sempre `null` na criação); `atualizar()`
  passou a exigir `pesquisa.status === 'publicada'` para vincular um ciclo
  não nulo (`409 PESQUISA_NAO_PUBLICADA`), sem restrição para desvincular
  (`cicloId: null`).
- `backend/src/modules/pesquisas/dto/atualizar-pesquisa.dto.ts`: sem mudança
  de shape (já verificado, `cicloId?: string | null` já existia).

**Validação:**
- `npm run build` (tsc): compila sem erros nos arquivos desta task. Resta um
  único erro pré-existente, não relacionado a esta task, em
  `backend/src/test/fakeRepository.ts` (fixture de teste usada por specs de
  `equipes`/`colaboradores`, já presente antes desta implementação —
  confirmado comparando com o estado do repositório antes das mudanças desta
  task). Fora do escopo de `backend-developer` (é infraestrutura de teste,
  não um módulo de negócio); sinalizado aqui para o `test-engineer`/revisor.
- `npm test` (vitest): 141/141 testes existentes passando, nenhuma regressão.

**Fora do escopo desta entrega (conforme o plano):**
- Nenhuma migration executada contra banco real.
- Nenhuma leitura/exposição de `itens_resposta`/resultados — só o vínculo
  `relacionamentos_avaliacao` é gerado.
- Pré-condições para `ativo → encerrado` (depende de `envios_pesquisa`,
  task futura) — não implementadas, conforme decisão assumida 3/"Perguntas em
  aberto".
- Enriquecimento de `pesquisas` com objeto `ciclo` aninhado na resposta —
  fora de escopo, shape inalterado.

**Nenhum desvio de negócio em relação ao plano.** Nomes de tabela/coluna/
constraint/índice conferidos linha a linha contra
`docs/schema_avaliacao360_pt_v2.sql` antes da escrita da migration e das
entidades.

### 2. backend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Nomes/tipos batendo exatamente com o schema doc** — `ciclos_avaliacao`
   e `relacionamentos_avaliacao` (colunas, tipos, `chk_datas_ciclo`, nomes de
   índice `idx_relacionamentos_ciclo`/`idx_relacionamentos_avaliado`/
   `idx_relacionamentos_avaliador` sem sufixo `_id`) precisam bater
   literalmente com `docs/schema_avaliacao360_pt_v2.sql`. Qualquer
   divergência (mesmo um `varchar` no lugar de `text`, ou um índice
   renomeado) é achado crítico, porque a anonimização futura depende desses
   nomes exatos.
2. **Nenhuma rota nova é acessível por `colaborador`** — `autenticar`
   montado em `ciclos-avaliacao.module.ts` e `ciclo-participantes.module.ts`;
   `garantirPapel(ator, ['admin', 'gestor_rh'])` é a primeira linha de toda
   função exportada dos dois `*.service.ts` novos.
3. **Geração de relacionamentos correta e completa** — para cada
   participante: 1 `autoavaliacao` (sempre), 1 `gestor` se `gestorId`
   existir (mesmo que o gestor não seja participante), N `subordinado` (só
   entre participantes), N `pares` (só entre participantes com mesmo
   `gestorId`, excluindo o próprio, só se `gestorId` existir). Participante
   sem `gestorId` não deve gerar erro, só pular `gestor`/`pares` para ele.
   Nenhum relacionamento `tipo_relacionamento = 'externo'` é gerado por este
   motor.
4. **Geração roda inteira dentro de uma transação** e usa `.orIgnore()` (ou
   equivalente) sobre a constraint única de `relacionamentos_avaliacao` —
   confirmar que uma segunda execução (ou uma corrida) não duplica linhas.
5. **Transições de status restritas** — `TRANSICOES_VALIDAS` de
   `ciclos_avaliacao` só permite `rascunho→ativo` e `ativo→encerrado`;
   qualquer outra combinação (pular etapa, regressão, "transicionar" para o
   mesmo status) → `409 TRANSICAO_STATUS_INVALIDA`; ativar sem nenhum
   participante → `422 CICLO_SEM_PARTICIPANTES`.
6. **Edição/remoção de ciclo e mutação de participantes só em `rascunho`**
   — `garantirCicloEditavel` chamado em `atualizar`/`remover` (ciclos) e em
   `adicionarIndividual`/`adicionarPorEquipe`/`remover` (participantes),
   nunca em rotas de leitura.
7. **Tech debt de `pesquisas` resolvido de fato** — `pesquisa.entity.ts`
   ganhou `@ManyToOne`/`@JoinColumn` real para `ciclo_id`; a migration desta
   task adiciona a `FOREIGN KEY` (`fk_pesquisas_ciclo`) e o índice ausente
   (`idx_pesquisas_ciclo`); `pesquisas.service.ts` agora valida **existência**
   do ciclo (não só formato) e exige `pesquisas.status === 'publicada'` para
   vincular (`cicloId` não nulo) — `409 PESQUISA_NAO_PUBLICADA` se a pesquisa
   ainda está em rascunho/encerrada. Desvincular (`cicloId: null`) continua
   liberado sem restrição de status.
8. **`ciclo_participantes` exige colaborador `ativo = true`** tanto na
   adição individual quanto na adição por equipe (equipe filtra
   `ativo = true` na query; adição individual rejeita `422
   COLABORADOR_INATIVO` explicitamente, nunca silenciosamente ignora).
9. **Idempotência dos endpoints de adicionar participante** — chamar
   `POST .../participantes` ou `.../participantes/por-equipe` de novo com
   ids já participantes não deve gerar erro nem duplicar linha em
   `ciclo_participantes` (filtragem prévia + `uq_ciclo_participantes_ciclo_colaborador`
   mapeada em `tratadorErros` como defesa em profundidade).

## Perguntas em aberto

Decisões de negócio que os requisitos não cobriram literalmente e que valem
confirmação explícita do usuário antes/depois da implementação (a
implementação segue as decisões assumidas acima, mas sinalizando aqui para
não passar despercebido):

1. **Editar (`PUT`) ou remover participantes de um ciclo já `ativo`/`encerrado`
   é bloqueado nesta proposta (`409 CICLO_NAO_EDITAVEL`)** — o pedido original
   não diz isso explicitamente, só descreve a mecânica de geração na
   ativação. Se o usuário quiser permitir editar `descricao`/datas depois de
   ativo (sem regenerar relacionamentos), isso muda o plano.
2. **`minimoRespostasPares >= 1`** (nunca `0`) é uma regra adicionada por
   este plano, não pedida literalmente — confirmar se `0` deveria ser
   permitido (equivaleria a "nunca exigir mínimo", o que na prática
   desliga a anonimização por contagem).
3. **Transição `ativo → encerrado` não tem nenhuma pré-condição** nesta
   task (ex.: não checa se todos os envios foram concluídos) porque
   `envios_pesquisa` ainda não existe — confirmar se isso é aceitável para o
   MVP deste motor ou se a rota deveria bloquear encerramento de alguma
   forma até essa outra task existir.
4. **Ativar um ciclo não exige que exista uma pesquisa vinculada
   (`pesquisas.ciclo_id`)** — o pedido trata "vincular pesquisa" (requisito
   3) e "ativar ciclo" (requisito 4) como itens separados, e não diz que um
   depende do outro. Confirmar se ativar sem nenhuma pesquisa publicada
   vinculada deveria ser bloqueado (hoje não é).

## Revisão

Revisão feita lendo linha a linha todos os arquivos criados/modificados desta
etapa contra `docs/schema_avaliacao360_pt_v2.sql` e contra o plano acima.
Nenhum arquivo de código foi alterado por este agente.

### Crítico

Sem achados críticos. Especificamente:

- **Fidelidade ao schema**: `ciclos_avaliacao` (migration +
  `ciclo-avaliacao.entity.ts`) e `relacionamentos_avaliacao` (migration +
  `relacionamento-avaliacao.entity.ts`) batem coluna por coluna, tipo por
  tipo, nullability e default com `docs/schema_avaliacao360_pt_v2.sql`
  (linhas 82-97 e 152-164 do doc), inclusive `chk_datas_ciclo`, o `unique
  (ciclo_id, avaliador_id, avaliado_id, tipo_relacionamento)` sem nome
  explícito (como o doc também deixa) e os três índices
  `idx_relacionamentos_ciclo`/`_avaliado`/`_avaliador` sem sufixo `_id`. Os
  enums `status_ciclo` (`rascunho, ativo, encerrado`) e
  `tipo_relacionamento` (`autoavaliacao, gestor, pares, subordinado,
  externo`) batem em valores e ordem com as linhas 23 e 29 do doc, tanto no
  `CREATE TYPE` da migration quanto em `src/common/enums.ts`. A FK e o
  índice adicionados em `pesquisas` (`fk_pesquisas_ciclo`,
  `idx_pesquisas_ciclo`) também batem com o doc (linhas 104 e 114 —
  `ciclo_id` nullable, `on delete set null`, sem `NOT NULL`). `ciclo_participantes`
  segue exatamente a "Decisão de modelagem" documentada no plano (não existe
  no schema doc, então não há divergência a checar ali). `down` da migration
  reverte tudo na ordem inversa correta (índice/FK de pesquisas → tabelas
  dependentes → `ciclos_avaliacao` → enums). Nenhum `synchronize: true`.
- **Controle de acesso**: `garantirPapel(ator, ['admin', 'gestor_rh'])` é
  literalmente a primeira linha de toda função exportada em
  `ciclos-avaliacao.service.ts` (`criar`, `listar`, `buscarPorId`,
  `atualizar`, `remover`, `atualizarStatus`, `listarRelacionamentos`) e em
  `ciclo-participantes.service.ts` (`listar`, `adicionarIndividual`,
  `adicionarPorEquipe`, `remover`) — exceção correta e documentada para
  `buscarCicloOuFalhar`/`garantirCicloEditavel`, que são helpers internos
  reaproveitados por serviços que já checaram o papel antes de chamá-los.
  `autenticar` é montado via `router.use` em ambos os `*.module.ts` (nunca
  global em `app.ts`), com a defesa em profundidade intencional do
  sub-router de participantes remontando `autenticar`. Nenhum controller
  faz checagem de papel inline. **A rota mais sensível,
  `GET /api/ciclos/:id/relacionamentos`, que expõe a visão identificada de
  quem-avalia-quem, está corretamente restrita a admin/gestor_rh** e nunca
  seria alcançável por `colaborador`.
- **Guard rail de anonimização**: `RelacionamentoAvaliacao` não tem nenhuma
  coluna de valor/nota/resposta — só `cicloId`/`avaliadorId`/`avaliadoId`/
  `tipoRelacionamento`. Nenhuma rota desta task lê `itens_resposta`
  (a tabela nem existe ainda). `minimoRespostasPares`/
  `anonimizarRespostasPares` são persistidos com os nomes exatos que a
  anonimização futura vai depender.
- **Single-tenant**: nenhum `organization_id` ou campo de isolamento
  multi-tenant foi introduzido em nenhuma tabela/entidade nova ou alterada.
- **Algoritmo de geração de relacionamentos** (`gerarRelacionamentos`):
  confirmado que produz, por participante, exatamente 1 `autoavaliacao`
  (self), 1 `gestor` se `gestorId` existir (mesmo que o gestor não seja
  participante — usa `p.gestorId` direto, não filtra pela lista de
  participantes), N `subordinado` (só entre participantes, via
  `participantesPorGestor.get(p.id)`), N `pares` (só entre participantes com
  o mesmo `gestorId`, excluindo o próprio `p`, via
  `participantesPorGestor.get(p.gestorId)`, com o filtro `par.id !== p.id`).
  Participante sem `gestorId` pula silenciosamente `gestor`/`pares` (o `if
  (p.gestorId)` guarda os dois blocos), sem lançar erro. Nenhuma linha
  `tipo_relacionamento = 'externo'` é gerada. Roda inteira dentro de
  `AppDataSource.transaction(...)` chamada por `atualizarStatus`, nunca
  fora. Usa `.orIgnore()` sobre a constraint única — uma segunda ativação
  (bloqueada por `TRANSICOES_VALIDAS` antes de chegar aqui) ou uma corrida
  concorrente não duplica linhas.
- **Transições de status**: `TRANSICOES_VALIDAS` de `ciclos-avaliacao.service.ts`
  segue o mesmo padrão de `pesquisas.service.ts` (`rascunho→ativo`,
  `ativo→encerrado`, `encerrado→[]`), sem pular etapa nem regredir.

### Deveria corrigir

1. **Race condition estreita na ativação de ciclo** (`atualizarStatus`,
   `ciclos-avaliacao.service.ts`, linhas ~334-355): a contagem de
   `ciclo_participantes` (`totalParticipantes === 0` → `422
   CICLO_SEM_PARTICIPANTES`) é feita **fora** da transação, via
   `AppDataSource.getRepository(CicloParticipante).count(...)`, e só depois
   é aberta a `AppDataSource.transaction(...)` que re-busca os participantes
   dentro de `gerarRelacionamentos`. Entre esses dois momentos, uma segunda
   requisição concorrente de `remover` participante (`CicloParticipante`)
   ainda passa por `garantirCicloEditavel` com sucesso, porque o ciclo
   continua com `status = 'rascunho'` até a primeira transação committar. Se
   essa remoção esvaziar totalmente os participantes nesse intervalo, a
   ativação segue em frente: `gerarRelacionamentos` re-lê zero participantes,
   `linhas.length === 0`, a função retorna sem inserir nada, e o `ciclo.status`
   ainda assim é salvo como `'ativo'` — resultado: ciclo ativo sem nenhum
   `relacionamentos_avaliacao` gerado e sem o erro `CICLO_SEM_PARTICIPANTES`
   que o requisito pede. É uma janela estreita (exige duas requisições
   concorrentes específicas), mas o mesmo padrão de defesa em profundidade
   que o plano já aplicou para duplicação (`.orIgnore()` dentro da
   transação) não foi replicado aqui para a contagem — o ideal seria mover a
   contagem de participantes para dentro da mesma transação (usando o
   `manager`), imediatamente antes de `gerarRelacionamentos`, para que a
   checagem e a geração enxerguem o mesmo snapshot.

### Sugestão

1. **Cobertura de teste de controle de acesso ainda não inclui `/api/ciclos`**
   — `backend/src/rotas-acesso.spec.ts` (a suíte que varre todas as rotas com
   token ausente/papel errado/papel certo) hoje só cobre `/api/equipes` e
   `/api/colaboradores`; não há nenhum `*.spec.ts` para `pesquisas` nem para
   os módulos desta task. Não é um problema desta etapa (é trabalho do
   `test-engineer`, próxima etapa), só sinalizando para não passar
   despercebido dado o quanto a regra de anonimização depende de
   `garantirPapel` estar correto em `listarRelacionamentos`.
2. **Remoção de `cicloId` de `CriarPesquisaDto`**: avaliada como **coerente**,
   não uma quebra de contrato não justificada. Uma pesquisa sempre nasce
   `rascunho` (hardcoded em `pesquisas.service.criar`) e, a partir desta
   task, vincular um ciclo (`cicloId` não nulo) exige
   `pesquisa.status === 'publicada'` — logo `cicloId` nunca teria como ser
   aceito no `POST` de criação mesmo que o campo continuasse existindo no
   DTO; mantê-lo seria um campo morto que sempre resultaria em erro/ignorado.
   Confirmado também que o frontend já está alinhado com essa mudança:
   `frontend/src/services/pesquisasService.ts` (`CriarPesquisaPayload`) já
   não declara `cicloId`, e o único caminho de escrita para vincular/
   desvincular um ciclo no frontend é `atualizarPesquisa` (`PUT`), usado em
   `frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx` — nenhuma tela
   de criação de pesquisa envia `cicloId`. Nenhuma regressão de frontend.
3. **`validarFormatoCicloId` → `validarCicloExistente`**: substituição
   correta — mantém o mesmo regex de UUID (`REGEX_UUID`), adiciona a
   consulta a `ciclos_avaliacao` via `AppDataSource.getRepository(CicloAvaliacao).findOneBy({ id })`
   e `404 CICLO_NAO_ENCONTRADO` quando ausente, exatamente como pedido no
   plano. Não há nenhum `*.spec.ts`/`*.test.ts` para `pesquisas` no
   repositório hoje (confirmado via busca), então essa troca não tem como
   quebrar teste existente — a alegação de "141/141 testes passando, sem
   regressão" no resumo da etapa 1 é coerente com isso (as suítes existentes
   cobrem `equipes`/`colaboradores`/`common`, não tocam `pesquisas`). Nota
   menor: em `atualizar()`, a ordem é "valida existência do ciclo" antes de
   "checa `pesquisa.status === 'publicada'`" — para uma pesquisa em rascunho
   com um `cicloId` inexistente, o cliente recebe `404 CICLO_NAO_ENCONTRADO`
   em vez de `409 PESQUISA_NAO_PUBLICADA`. Isso é exatamente a ordem que o
   plano pediu explicitamente (seção 1.10), não é um desvio — só registrando
   para o caso de o comportamento de erro nessa combinação importar para o
   frontend.

### Conclusão

Nenhum achado crítico. A implementação segue o plano ao pé da letra, os
nomes/tipos batem exatamente com `docs/schema_avaliacao360_pt_v2.sql`, e a
regra de anonimização/controle de acesso está corretamente aplicada em toda
rota nova. Libero para a etapa de testes (`test-engineer`); o único ponto
"Deveria corrigir" (race condition na contagem de participantes fora da
transação de ativação) é uma janela estreita de corrida, não um problema de
anonimização/autorização — fica registrado para correção, mas não deveria
bloquear o avanço do pipeline.
