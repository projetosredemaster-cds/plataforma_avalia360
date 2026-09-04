# Task: Tipos de relacionamento configuráveis por ciclo — Backend

Demanda 100% backend (`backend/` — chamado `apps/api` nas referências de
agentes/skills, mas o caminho real neste repositório é `backend/**`, único
que este plano toca). Não toca `frontend/`. Requisitos já especificados
diretamente pelo usuário — sem `spec.md`, etapa `spec` pulada a pedido
explícito. Etapa `test-engineer` **também pulada a pedido explícito** desta
demanda (só `backend-developer` → `backend-codereviewer`).

Resumo do requisito: hoje `gerarRelacionamentos` (dentro de
`ciclos-avaliacao.service.ts`) sempre gera os 4 tipos de relação
(`autoavaliacao`, `gestor`, `pares`, `subordinado`) para todo participante na
ativação de um ciclo `avaliacao_360`. Precisa virar configurável por ciclo —
uma nova coluna em `ciclos_avaliacao` guarda quais tipos estão habilitados, e
`gerarRelacionamentos` passa a respeitar essa lista.

## Estado atual verificado (referências para o `backend-developer` não
precisar re-investigar)

- `backend/src/modules/ciclos-avaliacao/ciclo-avaliacao.entity.ts`: entidade
  `CicloAvaliacao` atual (`nome`, `descricao`, `dataInicio`, `dataFim`,
  `status`, `anonimizarRespostasPares`, `minimoRespostasPares`, `criadoPor`,
  `criadoEm`, `atualizadoEm`). Nenhuma coluna array hoje em nenhuma entidade
  do projeto (confirmado por grep) — este é o primeiro precedente de coluna
  array no codebase.
- `backend/src/migrations/1788300000000-CriarCiclosAvaliacaoRelacionamentosEParticipantes.ts`
  criou `ciclos_avaliacao`/`relacionamentos_avaliacao`/`ciclo_participantes`
  e os enums Postgres `status_ciclo`/`tipo_relacionamento` — **já corresponde
  a uma task fechada, não editar in-place**. A migration mais recente hoje é
  `1788600000000-EmailColaboradorOpcional.ts`; a nova migration desta task
  usa timestamp `1788650000000` (maior que todos os existentes), seguindo o
  mesmo padrão de migration nova de correção já usado por
  `1788550000000-AdicionarEhGestorColaboradores.ts` e
  `1788600000000-EmailColaboradorOpcional.ts` em cima do módulo
  `colaboradores`.
- `backend/src/common/enums.ts` já tem `TipoRelacionamento`/
  `TIPO_RELACIONAMENTO_VALORES` (5 valores: `autoavaliacao`, `gestor`,
  `pares`, `subordinado`, `externo` — reflete o enum Postgres real de
  `relacionamentos_avaliacao.tipo_relacionamento`) e
  `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES` (propósito **diferente**: só
  valida `perguntas.configuracao.filtroRelacionamento` — não reaproveitar
  para este campo).
- `backend/src/common/validacao.ts`: tem `validarTextoObrigatorio`,
  `validarEmail`, `validarEnum<T>` (um único valor). **Não tem** um helper
  para validar lista de enum — precisa ser criado.
- `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.service.ts`:
  - `gerarRelacionamentos(manager, cicloId)` (função interna, só chamada por
    `atualizarStatus`) hoje gera incondicionalmente, por participante: 1
    `autoavaliacao` sempre; 1 `gestor` se `p.gestorId` existir; N
    `subordinado` agrupado por `gestorId`; N `pares` agrupado por
    `equipeId` (mesmo `equipeId`, excluindo o próprio).
  - `atualizarStatus`: no branch `rascunho → ativo`, valida
    `CICLO_SEM_PARTICIPANTES` e `CICLO_SEM_PESQUISA_PUBLICADA` **antes** de
    abrir a transação, então decide `pesquisaPublicada.tipo === 'avaliacao_360'`
    (chama `gerarRelacionamentos` + `gerarEnviosPesquisa`) vs `clima_geral`
    (chama só `gerarEnviosClima`, **nunca** gera `relacionamentos_avaliacao`
    — guard rail de anonimização já existente no código, não mexer nessa
    separação).
  - `atualizar()` já chama `garantirCicloEditavel(ciclo)` como primeira
    linha de mutação (bloqueia com `409 CICLO_NAO_EDITAVEL` fora de
    rascunho) — o campo novo herda essa proteção automaticamente.
  - `criar()`/`atualizar()` seguem o padrão "se `dto.campo !== undefined`,
    valida e usa; senão, valor padrão" (mesmo padrão de
    `anonimizarRespostasPares`/`minimoRespostasPares`).
- `backend/src/modules/ciclos-avaliacao/dto/criar-ciclo.dto.ts` e
  `dto/atualizar-ciclo.dto.ts`: interfaces simples, sem lib de validação.
  `AtualizarCicloDto` nunca declara `status` (só via
  `PATCH /api/ciclos/:id/status`, contrato que **não muda** nesta task).
- `PAPEIS_COM_ACESSO = ['admin', 'gestor_rh']` já é a primeira linha
  (`garantirPapel`) de toda função exportada do service — nenhuma rota de
  `ciclos-avaliacao` é nem será acessível por `colaborador`.
- `backend/src/middlewares/tratadorErros.ts`: mapeia só violações de
  `UNIQUE` (`err.code === '23505'`) por nome de constraint. As duas `CHECK`
  novas desta task (ver 1.3) usam `err.code === '23514'`, que este
  middleware **não trata hoje** — não é uma lacuna desta task fechar (ver
  decisão 4 abaixo).

## Decisões desta task (registradas para o `backend-developer` não precisar
adivinhar)

1. **`text[]`, não array do enum Postgres `tipo_relacionamento`.**
   Justificativa: não há nenhum precedente de coluna array (nem `enum[]` nem
   `text[]`) neste codebase — é padrão novo de qualquer forma. Um array do
   enum Postgres reaproveitaria o tipo já existente, mas TypeORM com
   `array: true` sobre uma coluna `enum` tem sintaxe de `default` mais frágil
   (precisaria de `DEFAULT ARRAY['autoavaliacao','gestor','pares','subordinado']::tipo_relacionamento[]`
   em vez de um literal simples) e adicionaria acoplamento entre o enum
   Postgres de 5 valores (`relacionamentos_avaliacao.tipo_relacionamento`,
   inclui `'externo'`) e este campo, que **nunca** aceita `'externo'` — teria
   que confiar só em `CHECK`/aplicação mesmo assim para excluir esse valor,
   anulando a vantagem de reaproveitar o enum. `text[]` mantém a validação de
   valores 100% em aplicação (mesmo padrão já usado para
   `perguntas.configuracao.filtroRelacionamento`, que é `jsonb` validado em
   código) e evita a pegadinha de sintaxe de default de enum array. Ver
   decisão 3 para o reforço de defesa em profundidade a nível de banco.
2. **Validar lista não vazia também em `criar`/`atualizar`, não só na
   ativação.** O pedido menciona bloquear vazio explicitamente "na
   ativação", mas o resto deste service já é fail-fast no momento de salvar
   (datas, `minimoRespostasPares`). Um ciclo em rascunho salvo com a lista
   vazia até o momento de ativar seria inconsistente com o estilo do
   arquivo. `validarListaEnum` (1.2) rejeita array vazio sempre que o campo é
   **explicitamente enviado**; se omitido, usa o default de 4 tipos. A
   checagem de "vazio" na ativação (pedida explicitamente pelo usuário)
   permanece como defesa adicional — na prática só alcançável se um ciclo
   antigo (anterior a esta migration, já com a coluna preenchida pelo
   `DEFAULT` da migration) ou uma escrita fora do fluxo normal chegasse nesse
   estado, o que os `CHECK`s da decisão 3 tornam ainda mais improvável.
3. **Duas `CHECK constraints` novas na migration, além da validação em
   aplicação**: `chk_ciclos_tipos_relacionamento_validos` (subset dos 4
   valores permitidos, via operador `<@`) e
   `chk_ciclos_tipos_relacionamento_nao_vazio` (não vazio). Mesmo padrão já
   usado em `chk_datas_ciclo` (validação replicada em aplicação **e** no
   banco). **Pegadinha de Postgres a respeitar na migration**:
   `array_length(arr, 1)` retorna `NULL` (não `0`) para um array vazio
   `'{}'`, e uma `CHECK` que avalia para `NULL` é tratada como **satisfeita**
   (não bloqueia) — por isso a constraint de não-vazio usa `cardinality(...)
   > 0`, que retorna `0` (não `NULL`) para array vazio. Ver SQL exato em 1.3.
4. **Não adicionar `err.code === '23514'` (violação de `CHECK`) a
   `tratadorErros.ts` nesta task.** As duas `CHECK`s da decisão 3 são defesa
   em profundidade contra escrita fora do fluxo normal da aplicação — todo
   caminho HTTP já valida antes de chegar no banco (`criar`/`atualizar`
   rejeitam vazio/inválido explicitamente, `atualizarStatus` também). Se o
   revisor discordar e achar que vale adicionar um mapeamento genérico para
   `23514` → `422`, registrar como sugestão na revisão, não bloquear a task
   por isso.
5. **Checagem de "pelo menos 1 tipo selecionado" em `atualizarStatus` roda
   ANTES de abrir a transação, e só dentro do `if
   (pesquisaPublicada.tipo === 'avaliacao_360')`** — mesmo padrão de
   `CICLO_SEM_PARTICIPANTES`/`CICLO_SEM_PESQUISA_PUBLICADA`, que também
   validam antes da transação. Um ciclo `clima_geral` **nunca** deve ser
   bloqueado por este campo (ele não se aplica a `clima_geral`, mesmo que o
   valor default de 4 tipos esteja preenchido na coluna) — ver 1.9 para o
   trecho exato.
6. **`default` do `@Column` do TypeORM é só metadado de schema (usado por
   `migration:generate`/documentação), não é aplicado automaticamente por
   `repositorio().create({...})` quando o campo é omitido no objeto JS.** O
   valor padrão de 4 tipos precisa continuar sendo setado explicitamente em
   `criar()` (mesmo padrão já usado para `anonimizarRespostasPares: true` e
   `minimoRespostasPares: 3`) — não confiar no `default` da coluna para isso.

## Plano — Backend

### 1. backend-developer — CONCLUÍDO

Skills `backend-modulo-crud` e `backend-anonimizacao-respostas` invocadas
antes de codar, conforme pedido. Implementação seguiu o plano abaixo
exatamente como escrito (1.1 a 1.9), sem desvios.

**Resumo do que foi feito:**

- `backend/src/common/enums.ts`: adicionado `TIPO_RELACIONAMENTO_GERACAO_VALORES`
  (`TipoRelacionamento[]` com `'autoavaliacao' | 'gestor' | 'pares' | 'subordinado'`,
  sem `'externo'`), logo após `TIPO_RELACIONAMENTO_VALORES`.
- `backend/src/common/validacao.ts`: adicionado `validarListaEnum<T extends string>(valor, valoresValidos, campo): T[]`
  — rejeita não-array/array vazio (`422 CAMPO_INVALIDO`) e valores fora da
  allowlist, retorna lista deduplicada.
- `backend/src/migrations/1788650000000-TiposRelacionamentoGeradosPorCiclo.ts`
  (nova, não roda contra nenhum banco real): `ALTER TABLE ciclos_avaliacao ADD COLUMN
  tipos_relacionamento_gerados text[] NOT NULL DEFAULT '{autoavaliacao,gestor,pares,subordinado}'`
  + `CHECK chk_ciclos_tipos_relacionamento_validos` (`<@` allowlist de 4 valores)
  + `CHECK chk_ciclos_tipos_relacionamento_nao_vazio` (`cardinality(...) > 0`,
  não `array_length`, pela pegadinha de `NULL` em array vazio). `down` reverte
  as 2 constraints e a coluna, nessa ordem.
- `backend/src/modules/ciclos-avaliacao/ciclo-avaliacao.entity.ts`: campo novo
  `tiposRelacionamentoGerados!: TipoRelacionamento[]`, `@Column({ name:
  'tipos_relacionamento_gerados', type: 'text', array: true, default:
  "'{autoavaliacao,gestor,pares,subordinado}'" })`, logo após `minimoRespostasPares`.
- DTOs — campo final em ambos: `tiposRelacionamentoGerados?: string[]`
  (não `TipoRelacionamento[]`, validação estreita o tipo em runtime):
  - `dto/criar-ciclo.dto.ts`
  - `dto/atualizar-ciclo.dto.ts`
- `ciclos-avaliacao.service.ts`:
  - `CicloResposta.tiposRelacionamentoGerados: TipoRelacionamento[]` (campo
    novo na interface e em `mapearCiclo`).
  - `criar()`: se `dto.tiposRelacionamentoGerados !== undefined`, valida via
    `validarListaEnum(..., TIPO_RELACIONAMENTO_GERACAO_VALORES,
    'tiposRelacionamentoGerados')`; senão usa `[...TIPO_RELACIONAMENTO_GERACAO_VALORES]`
    como default explícito (não depende do `default` da coluna).
  - `atualizar()`: mesmo `validarListaEnum` só quando o campo é enviado
    (mantém valor atual se omitido); protegido por `garantirCicloEditavel`
    já chamado no topo da função (só aceita em `rascunho`, `409
    CICLO_NAO_EDITAVEL` fora disso).
  - `gerarRelacionamentos(manager, cicloId, tiposHabilitados: TipoRelacionamento[])`
    — assinatura ganhou o 3º parâmetro; cada bloco de `push` (autoavaliacao/
    gestor/subordinado/pares) agora condicional a
    `tiposHabilitados.includes(...)`, sem regressão no comportamento
    individual de cada tipo (gestor só se `gestorId` existir E habilitado,
    pares só mesmo `equipeId` excluindo o próprio E habilitado, etc.).
    `'externo'` continua nunca gerado por este motor.
  - `atualizarStatus`: nova checagem `422 CICLO_SEM_TIPO_RELACIONAMENTO`
    (`'O ciclo precisa de pelo menos um tipo de relacionamento selecionado
    para ser ativado.'`), posicionada depois de `CICLO_SEM_PESQUISA_PUBLICADA`
    e antes de abrir a transação, condicionada a `pesquisaPublicada.tipo ===
    'avaliacao_360' && ciclo.tiposRelacionamentoGerados.length === 0` — ciclo
    `clima_geral` nunca é bloqueado por este campo. Chamada a
    `gerarRelacionamentos` passou a incluir `ciclo.tiposRelacionamentoGerados`
    como 3º argumento.

**Migrations que precisam rodar:** só
`1788650000000-TiposRelacionamentoGeradosPorCiclo.ts` (nova) — **NÃO
executada contra nenhum banco real**, aguardando confirmação explícita do
usuário, mesma regra de todas as anteriores.

**Verificação:** `npm run build` (tsc) dentro de `backend/` reproduz só 1
erro pré-existente e não relacionado (`src/test/fakeRepository.ts:30`,
confirmado idêntico antes desta task via `git stash`/rebuild) — nenhum erro
novo introduzido. `npm test` (vitest): 141/141 testes passando, sem
regressão (nenhum teste existente cobre `ciclos-avaliacao.service.ts` hoje,
então nada precisou ser ajustado ali).

---

Antes de codar: reler a skill `backend-anonimizacao-respostas` (via `Skill`
tool) — esta task não expõe respostas, mas mexe diretamente na geração de
`relacionamentos_avaliacao`, base da anonimização futura; conferir que
nenhuma mudança aqui enfraquece a separação identificado/agregado (ver 1.11).

#### 1.1 Enum de aplicação (`src/common/enums.ts`)

Adicionar, próximo a `TIPO_RELACIONAMENTO_VALORES` (não mexer nele nem em
`TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES`):

```ts
/**
 * Subconjunto de `TipoRelacionamento` selecionável em
 * `ciclos_avaliacao.tipos_relacionamento_gerados` — os únicos tipos que o
 * motor de ciclos (`gerarRelacionamentos`) sabe gerar automaticamente.
 * Exclui `'externo'` (reservado para avaliador convidado manualmente, nunca
 * gerado por este motor). Não confundir com
 * `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES` (propósito diferente: filtro
 * de pergunta tipo `pessoa`).
 */
export const TIPO_RELACIONAMENTO_GERACAO_VALORES: TipoRelacionamento[] = [
  'autoavaliacao',
  'gestor',
  'pares',
  'subordinado',
]
```

#### 1.2 Novo helper de validação (`src/common/validacao.ts`)

```ts
/**
 * Valida que `valor` é um array não vazio, com todos os elementos presentes
 * em `valoresValidos`. Retorna a lista deduplicada (preservando a ordem da
 * primeira ocorrência) — nunca `[]`.
 */
export function validarListaEnum<T extends string>(
  valor: unknown,
  valoresValidos: readonly T[],
  campo: string,
): T[] {
  if (!Array.isArray(valor) || valor.length === 0) {
    throw new ErroHttp(
      422,
      'CAMPO_INVALIDO',
      `Campo "${campo}" deve ser uma lista não vazia de valores entre: ${valoresValidos.join(', ')}.`,
    )
  }

  const invalidos = valor.filter((v) => typeof v !== 'string' || !valoresValidos.includes(v as T))
  if (invalidos.length > 0) {
    throw new ErroHttp(
      422,
      'CAMPO_INVALIDO',
      `Campo "${campo}" contém valores inválidos: ${invalidos.join(', ')}. Valores aceitos: ${valoresValidos.join(', ')}.`,
    )
  }

  return Array.from(new Set(valor as T[]))
}
```

#### 1.3 Migration nova (não editar `1788300000000-...`)

Arquivo:
`backend/src/migrations/1788650000000-TiposRelacionamentoGeradosPorCiclo.ts`.
**Não executar contra nenhum banco real sem confirmação explícita do
usuário** — mesma regra de todas as migrations anteriores deste projeto
(nenhuma rodou ainda).

```sql
-- up
ALTER TABLE ciclos_avaliacao
  ADD COLUMN tipos_relacionamento_gerados text[] NOT NULL
    DEFAULT '{autoavaliacao,gestor,pares,subordinado}';

-- Subset dos 4 tipos que o motor de ciclos sabe gerar (nunca 'externo').
ALTER TABLE ciclos_avaliacao
  ADD CONSTRAINT chk_ciclos_tipos_relacionamento_validos
    CHECK (tipos_relacionamento_gerados <@ ARRAY['autoavaliacao','gestor','pares','subordinado']::text[]);

-- cardinality() (não array_length()) porque array_length(arr,1) retorna NULL
-- (não 0) para array vazio '{}', e uma CHECK que avalia NULL é tratada como
-- satisfeita pelo Postgres — cardinality() retorna 0 corretamente.
ALTER TABLE ciclos_avaliacao
  ADD CONSTRAINT chk_ciclos_tipos_relacionamento_nao_vazio
    CHECK (cardinality(tipos_relacionamento_gerados) > 0);
```

```sql
-- down
ALTER TABLE ciclos_avaliacao DROP CONSTRAINT chk_ciclos_tipos_relacionamento_nao_vazio;
ALTER TABLE ciclos_avaliacao DROP CONSTRAINT chk_ciclos_tipos_relacionamento_validos;
ALTER TABLE ciclos_avaliacao DROP COLUMN tipos_relacionamento_gerados;
```

O `DEFAULT` cobre linhas já existentes (nenhum ciclo real hoje, já que
nenhuma migration rodou ainda, mas mantém o padrão "não quebra dado
existente" pedido explicitamente).

Esqueleto do arquivo (mesmo formato de
`1788550000000-AdicionarEhGestorColaboradores.ts`):

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Adiciona `ciclos_avaliacao.tipos_relacionamento_gerados` (text[], NOT
 * NULL, default os 4 tipos atuais) — restringe quais tipos de relação o
 * motor de ciclos (`gerarRelacionamentos`) gera na ativação. NÃO edita
 * `1788300000000-CriarCiclosAvaliacaoRelacionamentosEParticipantes.ts`
 * (task já fechada).
 *
 * NÃO EXECUTAR esta migration contra nenhum banco real sem confirmação
 * explícita do usuário — mesma regra já aplicada às migrations anteriores
 * (nenhuma delas rodou ainda contra um banco real).
 */
export class TiposRelacionamentoGeradosPorCiclo1788650000000 implements MigrationInterface {
  name = 'TiposRelacionamentoGeradosPorCiclo1788650000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ciclos_avaliacao
        ADD COLUMN tipos_relacionamento_gerados text[] NOT NULL
          DEFAULT '{autoavaliacao,gestor,pares,subordinado}'
    `)

    await queryRunner.query(`
      ALTER TABLE ciclos_avaliacao
        ADD CONSTRAINT chk_ciclos_tipos_relacionamento_validos
          CHECK (tipos_relacionamento_gerados <@ ARRAY['autoavaliacao','gestor','pares','subordinado']::text[])
    `)

    await queryRunner.query(`
      ALTER TABLE ciclos_avaliacao
        ADD CONSTRAINT chk_ciclos_tipos_relacionamento_nao_vazio
          CHECK (cardinality(tipos_relacionamento_gerados) > 0)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ciclos_avaliacao DROP CONSTRAINT chk_ciclos_tipos_relacionamento_nao_vazio
    `)
    await queryRunner.query(`
      ALTER TABLE ciclos_avaliacao DROP CONSTRAINT chk_ciclos_tipos_relacionamento_validos
    `)
    await queryRunner.query(`
      ALTER TABLE ciclos_avaliacao DROP COLUMN tipos_relacionamento_gerados
    `)
  }
}
```

#### 1.4 Entidade (`ciclo-avaliacao.entity.ts`)

Adicionar import de `TipoRelacionamento` (já existe em `common/enums.ts`,
importar junto de `STATUS_CICLO_VALORES`/`StatusCiclo` no topo do arquivo) e
a coluna, logo após `minimoRespostasPares`:

```ts
@Column({
  name: 'tipos_relacionamento_gerados',
  type: 'text',
  array: true,
  default: "'{autoavaliacao,gestor,pares,subordinado}'",
})
tiposRelacionamentoGerados!: TipoRelacionamento[]
```

Nota para o `backend-developer`: confirmar durante a implementação a sintaxe
exata de `default` que o driver Postgres do TypeORM espera para coluna
`array: true` (não há precedente no codebase) — o valor final gravado no
banco é definido pela migration SQL (1.3), este `default` é só metadado de
schema (ver decisão 6); se o TypeORM reclamar da string acima ao rodar
`migration:generate` (não deveria ser necessário rodar nesta task, mas serve
de sanity check), ajustar só a sintaxe do `default`, nunca o comportamento
em runtime, que é sempre setado explicitamente pelo service (1.7).

#### 1.5 DTOs

`dto/criar-ciclo.dto.ts`:
```ts
export interface CriarCicloDto {
  nome: string
  descricao?: string
  dataInicio: string // "YYYY-MM-DD"
  dataFim: string // "YYYY-MM-DD"
  anonimizarRespostasPares?: boolean
  minimoRespostasPares?: number
  tiposRelacionamentoGerados?: string[]
}
```

`dto/atualizar-ciclo.dto.ts`:
```ts
export interface AtualizarCicloDto {
  nome?: string
  descricao?: string | null
  dataInicio?: string
  dataFim?: string
  anonimizarRespostasPares?: boolean
  minimoRespostasPares?: number
  tiposRelacionamentoGerados?: string[]
}
```

(`string[]` no DTO, não `TipoRelacionamento[]` — o payload chega cru do HTTP;
`validarListaEnum` é quem estreita para `TipoRelacionamento[]`, mesmo padrão
já usado para `status` em `AtualizarStatusCicloDto`/`validarEnum`.)

#### 1.6 `CicloResposta`/`mapearCiclo` (`ciclos-avaliacao.service.ts`)

Adicionar o campo à interface `CicloResposta`:
```ts
export interface CicloResposta {
  id: string
  nome: string
  descricao: string | null
  dataInicio: string
  dataFim: string
  status: StatusCiclo
  anonimizarRespostasPares: boolean
  minimoRespostasPares: number
  tiposRelacionamentoGerados: TipoRelacionamento[]
  criadoPor: string | null
  criadoEm: string
  atualizadoEm: string
}
```
E em `mapearCiclo`, logo após `minimoRespostasPares: ciclo.minimoRespostasPares,`:
```ts
tiposRelacionamentoGerados: ciclo.tiposRelacionamentoGerados,
```

#### 1.7 `criar()`/`atualizar()` — validação e default

Import novo no topo: `validarListaEnum` de `../../common/validacao` e
`TIPO_RELACIONAMENTO_GERACAO_VALORES` de `../../common/enums`.

Em `criar()`, logo após a linha de `minimoRespostasPares`:
```ts
const tiposRelacionamentoGerados =
  dto.tiposRelacionamentoGerados !== undefined
    ? validarListaEnum(
        dto.tiposRelacionamentoGerados,
        TIPO_RELACIONAMENTO_GERACAO_VALORES,
        'tiposRelacionamentoGerados',
      )
    : [...TIPO_RELACIONAMENTO_GERACAO_VALORES]
```
E incluir `tiposRelacionamentoGerados` no objeto passado a `repositorio().create({...})`.

Em `atualizar()`, logo após o bloco de `minimoRespostasPares` (dentro de
`garantirCicloEditavel`, já garantido no topo da função):
```ts
if (dto.tiposRelacionamentoGerados !== undefined) {
  ciclo.tiposRelacionamentoGerados = validarListaEnum(
    dto.tiposRelacionamentoGerados,
    TIPO_RELACIONAMENTO_GERACAO_VALORES,
    'tiposRelacionamentoGerados',
  )
}
```
Campo omitido no `PUT` → mantém o valor atual do ciclo (nunca reseta para o
default) — mesmo comportamento de todos os outros campos opcionais desta
função.

#### 1.8 `gerarRelacionamentos` — novo parâmetro `tiposHabilitados`

Assinatura muda de `(manager, cicloId)` para `(manager, cicloId,
tiposHabilitados: TipoRelacionamento[])`. Cada bloco de push vira condicional
ao tipo estar presente em `tiposHabilitados` (usar `.includes(...)`, a lista
nunca é grande o bastante para `Set` valer a pena):

```ts
async function gerarRelacionamentos(
  manager: EntityManager,
  cicloId: string,
  tiposHabilitados: TipoRelacionamento[],
): Promise<void> {
  const participantes = await manager.getRepository(CicloParticipante).find({ where: { cicloId } })
  const participanteIds = participantes.map((p) => p.colaboradorId)

  if (participanteIds.length === 0) return

  const colaboradores = await manager.getRepository(Colaborador).find({
    where: { id: In(participanteIds) },
  })

  const participantesPorGestor = new Map<string, Colaborador[]>()
  for (const c of colaboradores) {
    if (!c.gestorId) continue
    const lista = participantesPorGestor.get(c.gestorId) ?? []
    lista.push(c)
    participantesPorGestor.set(c.gestorId, lista)
  }

  const participantesPorEquipe = new Map<string, Colaborador[]>()
  for (const c of colaboradores) {
    if (!c.equipeId) continue
    const lista = participantesPorEquipe.get(c.equipeId) ?? []
    lista.push(c)
    participantesPorEquipe.set(c.equipeId, lista)
  }

  const linhas: { avaliadorId: string; avaliadoId: string; tipoRelacionamento: TipoRelacionamento }[] = []

  for (const p of colaboradores) {
    if (tiposHabilitados.includes('autoavaliacao')) {
      linhas.push({ avaliadorId: p.id, avaliadoId: p.id, tipoRelacionamento: 'autoavaliacao' })
    }

    if (tiposHabilitados.includes('gestor') && p.gestorId) {
      linhas.push({ avaliadorId: p.gestorId, avaliadoId: p.id, tipoRelacionamento: 'gestor' })
    }

    if (tiposHabilitados.includes('subordinado')) {
      for (const subordinado of participantesPorGestor.get(p.id) ?? []) {
        linhas.push({ avaliadorId: subordinado.id, avaliadoId: p.id, tipoRelacionamento: 'subordinado' })
      }
    }

    if (tiposHabilitados.includes('pares') && p.equipeId) {
      for (const par of participantesPorEquipe.get(p.equipeId) ?? []) {
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
    .orIgnore()
    .execute()
}
```

Exemplo do requisito ("só `'autoavaliacao'` marcado"): com
`tiposHabilitados = ['autoavaliacao']`, o loop só entra no primeiro `if` para
cada participante — nenhuma linha `gestor`/`pares`/`subordinado` é inserida,
mesmo que a estrutura organizacional (equipe/gestor) permitisse gerá-las.

#### 1.9 `atualizarStatus` — checagem de "pelo menos 1 tipo" e nova chamada

No branch `rascunho → ativo`, **depois** da checagem existente de
`CICLO_SEM_PESQUISA_PUBLICADA` e **antes** de abrir
`AppDataSource.transaction(...)` (mesma posição das duas validações já
existentes, decisão 5):

```ts
if (pesquisaPublicada.tipo === 'avaliacao_360' && ciclo.tiposRelacionamentoGerados.length === 0) {
  throw new ErroHttp(
    422,
    'CICLO_SEM_TIPO_RELACIONAMENTO',
    'O ciclo precisa de pelo menos um tipo de relacionamento selecionado para ser ativado.',
  )
}

const salvo = await AppDataSource.transaction(async (manager) => {
  if (pesquisaPublicada.tipo === 'avaliacao_360') {
    await gerarRelacionamentos(manager, ciclo.id, ciclo.tiposRelacionamentoGerados)
    await gerarEnviosPesquisa(manager, ciclo.id, pesquisaPublicada.id)
  } else {
    // clima_geral: NUNCA gera relacionamentos_avaliacao, e
    // tipos_relacionamento_gerados não se aplica a este tipo de pesquisa —
    // guard rail de anonimização inalterado por esta task.
    await gerarEnviosClima(manager, ciclo.id, pesquisaPublicada.id)
  }

  ciclo.status = novoStatus
  return manager.getRepository(CicloAvaliacao).save(ciclo)
})
```

Único ponto de atenção: a condição usa `&&` (não bloqueia sozinha) — um
ciclo `clima_geral` com `tiposRelacionamentoGerados` vazio (cenário que na
prática não deveria existir dado 1.7/decisão 2, mas hipoteticamente possível
se o campo não for tocado por quem cria um ciclo `clima_geral`) **não** é
barrado por este `if`, só seguiria para `gerarEnviosClima` normalmente — o
campo é ignorado para esse tipo de pesquisa.

#### 1.10 Rotas/Endpoints afetados

Nenhuma rota nova. Contrato dos três endpoints existentes ganha o campo:

| Método | Rota | Papéis permitidos | Mudança |
|---|---|---|---|
| POST | `/api/ciclos` | admin, gestor_rh | `CriarCicloDto` aceita `tiposRelacionamentoGerados?: string[]`; resposta `201 CicloResposta` inclui o campo |
| PUT | `/api/ciclos/:id` | admin, gestor_rh | `AtualizarCicloDto` aceita o mesmo campo; `409 CICLO_NAO_EDITAVEL` se o ciclo não estiver em `rascunho` (proteção já existente, herdada automaticamente); `422 CAMPO_INVALIDO` se lista vazia/valor inválido |
| PATCH | `/api/ciclos/:id/status` | admin, gestor_rh | novo erro possível na transição `rascunho → ativo`: `422 CICLO_SEM_TIPO_RELACIONAMENTO` (só quando a pesquisa vinculada é `avaliacao_360`) |
| GET | `/api/ciclos` / `/api/ciclos/:id` | admin, gestor_rh | resposta passa a incluir `tiposRelacionamentoGerados` |

Nenhuma dessas rotas é nem passa a ser acessível por `colaborador` —
`garantirPapel(ator, ['admin', 'gestor_rh'])` já é a primeira linha de toda
função exportada do service, inalterado por esta task.

#### 1.11 Tratamento de anonimização (obrigatório por esta demanda tocar
`relacionamentos_avaliacao`)

- Esta task **não** cria, remove nem contorna a separação entre dados
  identificados e agregados — ela só decide **quais tipos de
  `relacionamentos_avaliacao` chegam a existir** para um dado ciclo. As
  views `respostas_identificadas` (autoavaliação/gestor/externo) e
  `respostas_pares_agregadas` (pares/subordinado, só liberada a partir de
  `ciclos_avaliacao.minimo_respostas_pares` respondentes) continuam sendo a
  única forma de ler respostas ligadas a `relacionamentos_avaliacao`, e
  continuam se aplicando **exatamente da mesma forma** às linhas que forem
  geradas.
- Se o admin desabilitar `pares` e/ou `subordinado` para um ciclo (ex.: só
  `['autoavaliacao', 'gestor']` habilitado), `gerarRelacionamentos` (1.8)
  simplesmente nunca insere linhas desses tipos para aquele ciclo — não há
  nada para anonimizar ou agregar, porque as linhas não existem. Isso não
  enfraquece a proteção: colaborador continua sem poder ler linhas
  `pares`/`subordinado` identificadas quando elas existem (regra inalterada
  em `listarRelacionamentos`, que continua restrita a
  `garantirPapel(['admin', 'gestor_rh'])` e nunca é chamada por rota
  acessível a `colaborador`).
- `listarRelacionamentos` (`GET /api/ciclos/:id/relacionamentos`) não muda
  nesta task — continua exclusiva de admin/gestor_rh, visão identificada
  completa (correta para esse papel), e continua sem tocar `itens_resposta`
  (tabela de resposta em si, fora de escopo aqui).
- `minimo_respostas_pares`/`anonimizar_respostas_pares` (colunas já
  existentes) não são lidas nem alteradas por esta task — permanecem
  aplicáveis do mesmo jeito a qualquer linha `pares`/`subordinado` que vier
  a existir, independentemente de quais tipos estavam habilitados no
  momento da ativação.

#### 1.12 Fora de escopo desta task

- Frontend (nenhuma tela nova, nenhum toggle de UI) — pedido só cobre
  backend.
- Rodar a migration contra qualquer banco real.
- Alterar `TIPO_RELACIONAMENTO_VALORES`/`TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES`
  ou qualquer comportamento do módulo `perguntas`.
- Mudar a pré-condição de `ativo → encerrado` (inalterada).
- Adicionar mapeamento de `err.code === '23514'` a `tratadorErros.ts`
  (decisão 4 — deixado para o revisor sugerir, se discordar).

Ao terminar: rodar `npm run build` (tsc) dentro de `backend/` e confirmar que
compila sem erros antes de marcar a etapa concluída. Registrar no resumo da
task que a migration desta seção **não deve ser executada** contra um banco
real sem confirmação explícita do usuário.

### 2. backend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Nome/tipo da coluna exatos**: `tipos_relacionamento_gerados`, `text[]`,
   `NOT NULL`, default com os 4 tipos (`autoavaliacao`, `gestor`, `pares`,
   `subordinado`, nessa ordem ou não — ordem não é semântica aqui, mas o
   conjunto de 4 precisa bater exatamente). As duas `CHECK`s
   (`chk_ciclos_tipos_relacionamento_validos` via `<@`,
   `chk_ciclos_tipos_relacionamento_nao_vazio` via `cardinality(...) > 0`,
   **não** `array_length(...)`) precisam existir e usar exatamente esses
   nomes/expressões — achado crítico se `array_length` for usado no lugar de
   `cardinality` (bug silencioso: `CHECK` nunca bloqueia array vazio, por
   causa do `NULL` de `array_length` em array vazio).
2. **`gerarRelacionamentos` respeita `tiposHabilitados` para os 4 tipos,
   sem regressão no comportamento de cada tipo individual** (autoavaliação
   sempre que habilitada; gestor só se `gestorId` existir E estiver
   habilitado; subordinado só entre participantes E se habilitado; pares só
   mesmo `equipeId`, excluindo o próprio, E se habilitado). Nenhuma linha
   `tipo_relacionamento = 'externo'` é gerada (comportamento pré-existente,
   não pode regredir).
3. **`atualizarStatus`: a checagem `CICLO_SEM_TIPO_RELACIONAMENTO` só
   dispara para `pesquisaPublicada.tipo === 'avaliacao_360'`** — um ciclo
   `clima_geral` nunca deve ser bloqueado por este campo, mesmo com lista
   vazia. Achado crítico se a checagem rodar incondicionalmente (regressão
   que bloquearia ativação de ciclos `clima_geral` sem motivo).
4. **`criar`/`atualizar` rejeitam lista vazia quando o campo é enviado
   explicitamente**, mas **não** exigem o campo quando omitido (usa default
   de 4 tipos em `criar`; mantém valor atual em `atualizar`).
   `validarListaEnum` deve rejeitar tanto array vazio quanto qualquer valor
   fora de `TIPO_RELACIONAMENTO_GERACAO_VALORES` (em especial `'externo'` —
   não deveria ser aceito neste campo mesmo sendo um `TipoRelacionamento`
   válido em outros contextos).
5. **`atualizar()` só aceita o campo com o ciclo em `rascunho`** —
   confirmar que `garantirCicloEditavel(ciclo)` continua sendo chamado antes
   de qualquer atribuição, cobrindo também este campo novo (deveria ser
   automático por já estar no topo da função, mas vale confirmar que o novo
   bloco foi inserido depois dessa chamada, não antes).
6. **Nenhuma rota nova acessível por `colaborador`** — `garantirPapel(ator,
   ['admin', 'gestor_rh'])` continua sendo a primeira linha de toda função
   exportada tocada por esta task.
7. **Anonimização (seção 1.11)**: confirmar que nenhuma mudança nesta task
   passou a permitir `listarRelacionamentos` (ou qualquer outra função) ser
   chamada por `colaborador`, e que `RelacionamentoAvaliacao` continua sem
   nenhuma coluna de resposta/valor — esta task só afeta **quais** linhas de
   relacionamento chegam a ser inseridas, nunca quem pode lê-las nem como.
8. **`npm run build` (tsc) e `npm test` (vitest) sem regressão** — em
   especial testes existentes de `ciclos-avaliacao` que montam objetos
   `CicloResposta`/`CriarCicloDto` esperados; se algum teste comparar o
   shape completo da resposta sem incluir `tiposRelacionamentoGerados`, isso
   quebra e precisa ser corrigido (mas a correção de teste, se necessária, é
   trabalho do `backend-developer` nesta mesma etapa 1, já que não há
   `test-engineer` nesta task — não deixar teste quebrado para depois).

## Revisão

Arquivos lidos na íntegra e conferidos linha a linha contra o plano (1.1–1.9):
`backend/src/migrations/1788650000000-TiposRelacionamentoGeradosPorCiclo.ts`,
`backend/src/common/enums.ts`, `backend/src/common/validacao.ts`,
`backend/src/modules/ciclos-avaliacao/ciclo-avaliacao.entity.ts`,
`backend/src/modules/ciclos-avaliacao/relacionamento-avaliacao.entity.ts`,
`backend/src/modules/ciclos-avaliacao/dto/criar-ciclo.dto.ts`,
`backend/src/modules/ciclos-avaliacao/dto/atualizar-ciclo.dto.ts`,
`backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.service.ts` (completo),
`backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.module.ts`.

### Crítico

Sem achados críticos.

- Migration usa `cardinality(tipos_relacionamento_gerados) > 0` na constraint
  de não-vazio (não `array_length`) — a pegadinha do `NULL` em array vazio
  foi evitada corretamente. As duas `CHECK`s têm exatamente os nomes/expressões
  esperados (`chk_ciclos_tipos_relacionamento_validos` via `<@`,
  `chk_ciclos_tipos_relacionamento_nao_vazio` via `cardinality`), coluna
  `text[] NOT NULL DEFAULT '{autoavaliacao,gestor,pares,subordinado}'`, `down`
  reverte constraints antes da coluna. Migration nova (`1788650000000`), não
  edita `1788300000000` (task fechada).
- `gerarRelacionamentos` (linhas 284–358 do service): cada um dos 4 blocos
  (`autoavaliacao`/`gestor`/`subordinado`/`pares`) é condicionado
  individualmente a `tiposHabilitados.includes(...)`, sem regressão no
  comportamento pré-existente de cada tipo (gestor só com `gestorId`
  presente E habilitado; pares só mesmo `equipeId` excluindo o próprio E
  habilitado). `'externo'` nunca é gerado por este motor (comentário e código
  confirmam).
- `atualizarStatus`: a checagem `422 CICLO_SEM_TIPO_RELACIONAMENTO` está
  condicionada a `pesquisaPublicada.tipo === 'avaliacao_360' && ...length ===
  0` (linha 408), posicionada antes de abrir a transação. Um ciclo
  `clima_geral` nunca passa por esse `if` — guard rail de anonimização
  preservado, o branch `else` (linha 420) segue chamando só
  `gerarEnviosClima`, sem tocar `relacionamentos_avaliacao`.
- `TIPO_RELACIONAMENTO_GERACAO_VALORES` (enums.ts, linha 66) exclui
  `'externo'` corretamente e é uma constante separada de
  `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES` (linha 97, propósito diferente
  — filtro de pergunta tipo `pessoa`), sem confusão entre as duas.

### Deveria corrigir

Nenhum item.

- `validarListaEnum` rejeita array vazio/não-array e qualquer valor fora da
  allowlist (inclusive `'externo'`, já que `TIPO_RELACIONAMENTO_GERACAO_VALORES`
  não o inclui). `criar()` usa `[...TIPO_RELACIONAMENTO_GERACAO_VALORES]`
  (cópia, não referência compartilhada) como default quando o campo é
  omitido; `atualizar()` só aplica quando `dto.tiposRelacionamentoGerados !==
  undefined`, mantendo o valor atual caso contrário — comportamento correto
  em ambos.
- `atualizar()`: `garantirCicloEditavel(ciclo)` é chamado na linha 212, antes
  de qualquer atribuição de campo (inclusive o bloco novo nas linhas
  249–255) — o campo novo herda a proteção de "só em rascunho" (`409
  CICLO_NAO_EDITAVEL`) corretamente.
- Nenhuma rota nova foi adicionada em `ciclos-avaliacao.module.ts`; todas as
  funções exportadas tocadas (`criar`, `atualizar`, `atualizarStatus`)
  continuam com `garantirPapel(ator, ['admin', 'gestor_rh'])` como primeira
  linha. `RelacionamentoAvaliacao` (entidade) permanece sem qualquer coluna
  de resposta/valor — a task só decide quais linhas chegam a existir, não
  quem/como as lê.
- Não há teste existente cobrindo `ciclos-avaliacao.service.ts` (confirmado —
  nenhum arquivo `*.test.ts` sob `ciclos-avaliacao` encontrado), então a
  afirmação de "nenhuma regressão de teste" no resumo é consistente com o
  estado real do repositório.

### Sugestão

- Mapeamento de `err.code === '23514'` (violação de `CHECK`) em
  `tratadorErros.ts`: como já previsto na decisão 4 da task, não é um
  bloqueio — as duas `CHECK`s novas são defesa em profundidade e todo
  caminho HTTP já valida antes. Registrado aqui apenas como sugestão futura
  para uma mensagem de erro mais amigável, caso alguma escrita fora do fluxo
  normal algum dia dispare essas constraints.
- O `default` da coluna no `@Column` da entidade
  (`"'{autoavaliacao,gestor,pares,subordinado}'"`) é uma string literal que o
  driver Postgres do TypeORM não necessariamente normaliza da mesma forma
  que o Postgres normaliza o `DEFAULT` real da coluna após a migration
  rodar (`pg_catalog` costuma armazenar como `'{...}'::text[]`). Isso é só
  metadado de schema (sem efeito em runtime, como a própria task já
  registrou na decisão 6) — mas pode fazer `migration:generate` propor uma
  migration "fantasma" no futuro só por divergência de formatação de
  default, quando a migration `1788650000000` finalmente rodar contra um
  banco real. Vale um sanity check com `migration:generate` na primeira vez
  que isso acontecer; sem necessidade de ação agora.

**Conclusão**: implementação fiel ao plano em todos os pontos verificados,
incluindo os quatro pontos de atenção específicos desta revisão (migration
`cardinality` vs `array_length`, isolamento por tipo em
`gerarRelacionamentos`, guard rail `clima_geral` em `atualizarStatus`,
separação `TIPO_RELACIONAMENTO_GERACAO_VALORES` vs
`TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES`). Sem achados críticos — pode
prosseguir (mesmo com `test-engineer` pulado nesta demanda, por pedido
explícito do usuário).
