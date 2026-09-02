# Task: Motor de envios de pesquisa (link manual, sem automação) — Backend

Demanda 100% backend (`backend/`, equivalente a `apps/api` nas referências dos
agentes/skills — usar sempre os caminhos reais `backend/**` neste plano). Não
toca `frontend/`. Requisitos já especificados diretamente pelo usuário, com
mudança de escopo confirmada explicitamente (sem automação de e-mail/
WhatsApp) — etapa `spec` pulada a pedido explícito.

## Estado atual verificado (antes do plano)

- Módulo greenfield: não existe `src/modules/envios-pesquisa/`. `auth`,
  `equipes`, `colaboradores`, `competencias`, `pesquisas`, `paginas-pesquisa`,
  `perguntas`, `ciclos-avaliacao` e `ciclo-participantes` já estão
  implementados e revisados sem achados críticos.
- **`backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.service.ts` lido
  por completo.** Pontos relevantes para esta task:
  - `atualizarStatus(ator, id, dto)`: na transição `rascunho → ativo`, hoje
    **já** busca a pesquisa do ciclo antes de abrir a transação:
    ```ts
    const pesquisaPublicada = await AppDataSource.getRepository(Pesquisa).findOneBy({
      cicloId: ciclo.id,
      status: 'publicada',
    })
    if (!pesquisaPublicada) {
      throw new ErroHttp(422, 'CICLO_SEM_PESQUISA_PUBLICADA', '...')
    }
    ```
    Ou seja: **hoje já não é possível ativar um ciclo sem uma pesquisa
    publicada vinculada** (`pesquisas.cicloId === ciclo.id AND status ===
    'publicada'`). Isso resolve de fato a "Pergunta em aberto" nº 4 registrada
    em `.claude/tasks/ciclos-avaliacao/task-backend.md` (o código evoluiu além
    do que aquele plano previa) — **esta task não precisa (re)adicionar essa
    validação**, só reaproveitar a garantia que ela já dá: no momento em que
    `gerarRelacionamentos` roda, `pesquisaPublicada` já existe e está
    resolvida.
  - Depois da checagem acima, a função abre
    `AppDataSource.transaction(async (manager) => { ... })`, chama
    `gerarRelacionamentos(manager, ciclo.id)` (função interna, não exportada,
    insere `relacionamentos_avaliacao` com `.orIgnore()` sobre a constraint
    `unique (ciclo_id, avaliador_id, avaliado_id, tipo_relacionamento)` para
    idempotência), depois seta `ciclo.status = 'ativo'` e salva usando o
    **mesmo** `manager`.
  - Esta task **estende essa mesma transação**: depois de
    `gerarRelacionamentos(manager, ciclo.id)`, chama uma nova função
    `gerarEnviosPesquisa(manager, ciclo.id, pesquisaPublicada.id)` (ver seção
    1.6), também usando `.orIgnore()` para idempotência, antes de persistir
    `ciclo.status = 'ativo'`.
  - **Não há` ciclo_id` direto em `envios_pesquisa`** — o schema doc modela
    `envios_pesquisa.relacionamento_id → relacionamentos_avaliacao.id` e é
    `relacionamentos_avaliacao.ciclo_id` que amarra ao ciclo (dois saltos).
    Todo acesso desta task que precisa "envios do ciclo X" faz
    `envios_pesquisa` `INNER JOIN` `relacionamentos_avaliacao` filtrando
    `ciclo_id`.
  - Race window pré-existente conhecida (já registrada como "Deveria
    corrigir", não crítica, na revisão de `ciclos-avaliacao`): a contagem de
    `ciclo_participantes` e agora também a checagem de `pesquisaPublicada` são
    feitas **fora** da transação, antes dela abrir. Esta task **não corrige**
    essa janela de corrida pré-existente (fora de escopo, mesma decisão já
    tomada na task anterior) — só reaproveita o valor já lido
    (`pesquisaPublicada.id`) para popular `envios_pesquisa`, sem re-consultar
    dentro da transação. Sinalizado de novo em "Perguntas em aberto".
- **`backend/src/modules/pesquisas/pesquisa.entity.ts` lido.** `Pesquisa` já
  tem `@ManyToOne(() => CicloAvaliacao, ...)` real para `ciclo_id` (tech debt
  já resolvido pela task de ciclos). Nada a mudar aqui.
- **`docs/schema_avaliacao360_pt_v2.sql` lido** (definição de `envios_pesquisa`,
  linhas 169–186, e do enum `status_envio`, linha 31):
  ```sql
  create type status_envio as enum ('pendente', 'enviado', 'em_andamento', 'concluido', 'expirado');

  create table envios_pesquisa (
    id uuid primary key default gen_random_uuid(),
    pesquisa_id uuid not null references pesquisas(id) on delete cascade,
    relacionamento_id uuid not null references relacionamentos_avaliacao(id) on delete cascade,
    status status_envio not null default 'pendente',
    token_acesso uuid not null default gen_random_uuid() unique,
    enviado_em timestamptz,
    concluido_em timestamptz,
    quantidade_lembretes smallint not null default 0,
    cpf_confirmado_em timestamptz,
    tentativas_cpf_invalidas smallint not null default 0,
    criado_em timestamptz not null default now(),
    unique (pesquisa_id, relacionamento_id)
  );

  create index idx_envios_pesquisa on envios_pesquisa(pesquisa_id);
  create index idx_envios_relacionamento on envios_pesquisa(relacionamento_id);
  create index idx_envios_status on envios_pesquisa(status);
  ```
  **Nenhuma coluna de e-mail/WhatsApp/canal existe nesta tabela no schema doc**
  — o próprio schema já não modela automação de envio (o doc já reflete um
  fluxo de link manual). Não há divergência a documentar aqui: o schema doc já
  bate 1:1 com o pedido do usuário, coluna por coluna. Todas as 11 colunas
  acima são implementadas por esta task, nomes/tipos idênticos.
- `AppDataSource` (`backend/src/data-source.ts`) faz glob automático de
  `modules/**/*.entity.{ts,js}` — a entidade nova não precisa ser registrada
  manualmente em lugar nenhum além de existir no caminho certo.
- `src/app.ts` monta routers explicitamente, mas **esta task não adiciona
  nenhuma linha nova em `app.ts`** — o router de envios é montado como
  sub-router dentro de `ciclos-avaliacao.module.ts` (ver decisão de rotas
  abaixo), mesmo padrão de `cicloParticipantesRouter`.
- `FRONTEND_URL` (`backend/src/config/env.ts`, `env.frontendUrl`) já existe,
  já é obrigatória-com-default (`http://localhost:5173`) — reaproveitada tal
  qual para montar o link público, nenhuma env var nova.
- `pgcrypto` já foi habilitada pela primeira migration
  (`1788268503083-CriarEquipesEColaboradores.ts`, `CREATE EXTENSION IF NOT
  EXISTS pgcrypto`) — `gen_random_uuid()` já está disponível, não precisa
  reabilitar.

## Decisões de modelagem (com justificativa)

1. **"Pesquisa do ciclo" = `pesquisaPublicada` já resolvida por
   `atualizarStatus`** (ver "Estado atual verificado" acima). Não há
   ambiguidade a resolver nesta task: o motor de ativação **já bloqueia**
   `rascunho → ativo` com `422 CICLO_SEM_PESQUISA_PUBLICADA` quando não existe
   `pesquisas` com `cicloId = ciclo.id AND status = 'publicada'`. Logo, no
   ponto em que `gerarEnviosPesquisa` roda, sempre existe exatamente uma
   pesquisa candidata identificada por `pesquisaPublicada.id` (a resolvida
   pelo `findOneBy`, que retorna a primeira em caso de ambiguidade — ver nota
   sobre 1:1 não garantido por constraint em "Perguntas em aberto", item 1).
   **Este plano não adiciona nenhum novo bloqueio de ativação** — o requisito
   1 do pedido já é atendido pela pré-condição que já existe no código.
2. **Enum `status_envio` criado com os 5 valores do schema doc**
   (`pendente, enviado, em_andamento, concluido, expirado`), não só os 3 que
   esta task manipula (`pendente/enviado/expirado`). Justificativa: o schema
   doc já define os 5 valores — criar o `CREATE TYPE` do Postgres com um
   subconjunto obrigaria uma migration `ALTER TYPE ... ADD VALUE` quando a
   futura task de resposta (`/responder`) precisar de `em_andamento`
   (envio aberto, ainda não concluído) e `concluido` (resposta enviada).
   **Esta task nunca escreve `em_andamento` nem `concluido`** — nenhuma das
   3 ações manuais (marcar enviado / lembrete / expirar) transiciona para
   esses dois valores; eles ficam reservados, documentado explicitamente no
   código (comentário no enum TS e no service).
3. **`concluido_em`, `cpf_confirmado_em`, `tentativas_cpf_invalidas` existem
   na entidade/migration mas nunca são escritos por nenhuma rota desta task**
   — sempre `null`/`0` na criação automática do envio, e nenhuma das 3 ações
   manuais os altera. São colunas reservadas para a página pública
   `/responder` (fora de escopo, próximo item do roadmap). Isso é intencional
   e não deve ser interpretado como "falta implementar algo aqui".
4. **`token_acesso`: `uuid` gerado pelo Postgres (`DEFAULT gen_random_uuid()`),
   não uma string aleatória separada.** Justificativa: o schema doc já define
   o tipo como `uuid` com esse default — reaproveita a mesma extensão
   (`pgcrypto`) e o mesmo padrão de geração de PK já usado em toda a base
   (`gen_random_uuid()`), sem introduzir uma segunda estratégia de token
   (ex.: `crypto.randomBytes` em Node). Um UUID v4 já tem entropia suficiente
   para ser usado como capability token de link público (122 bits aleatórios)
   — não precisa ser mais longo. Unicidade garantida por `UNIQUE` na coluna
   (constraint sem nome explícito, como o schema doc também deixa sem nome).
   Nunca é gerado/atribuído pela aplicação Node — sempre delegado ao default
   do banco, e a aplicação nunca faz `UPDATE envios_pesquisa SET
   token_acesso = ...` em nenhuma rota (token nunca é regenerado/reaproveitado
   nesta task; se um token precisar ser invalidado no futuro, isso é uma nova
   decisão de produto fora deste escopo).
5. **Geração automática usa o mesmo padrão de idempotência de
   `gerarRelacionamentos`**: `.orIgnore()` sobre a constraint `unique
   (pesquisa_id, relacionamento_id)`, dentro da mesma transação. Mesma
   justificativa da task anterior — `TRANSICOES_VALIDAS` já impede uma
   segunda ativação real do mesmo ciclo, então isso é defesa em profundidade
   contra corrida concorrente, não um caminho esperado em uso normal.
6. **Rotas**: sub-router `envios-pesquisa`, análogo a `ciclo-participantes`,
   montado em `ciclos-avaliacao.module.ts` como
   `router.use('/:cicloId/envios', enviosPesquisaRouter)` — path final
   `/api/ciclos/:cicloId/envios...`. Justificativa: mesmo padrão já
   estabelecido no projeto para um recurso que (a) é sempre listado no
   contexto de um pai específico (aqui, o ciclo — via join em
   `relacionamentos_avaliacao.ciclo_id`) e (b) tem ações próprias sobre itens
   individuais identificados por `:id` dentro do mesmo sub-router (mesmo
   formato de `/api/pesquisas/:pesquisaId/paginas/:id` e
   `/api/ciclos/:cicloId/participantes/:colaboradorId`). As 3 ações manuais
   (marcar enviado / lembrete / expirar) vivem como
   `PATCH /api/ciclos/:cicloId/envios/:id/<acao>` dentro desse mesmo
   sub-router — não uma rota plana `/api/envios/:id/...` (não existe hoje
   nenhum módulo "plano" na API para um recurso que só é criado
   automaticamente a partir de um pai, e um path plano perderia a checagem
   barata de "este envio pertence mesmo a este ciclo?" que o sub-router dá de
   graça via o parâmetro `:cicloId`).
7. **Nenhum DTO novo.** Nenhuma das 4 rotas desta task recebe corpo de
   requisição: listagem é `GET` sem body, e as 3 ações são `PATCH` sem
   nenhum campo (são apenas transições de estado controladas pelo servidor
   — a UI não envia payload, só aciona a URL).
8. **Nenhuma entrada nova em `MAPA_CONSTRAINT_PARA_CODIGO`
   (`tratadorErros.ts`)**. Justificativa: as duas constraints `UNIQUE` novas
   (`(pesquisa_id, relacionamento_id)` e `token_acesso`) só poderiam ser
   violadas pelo `INSERT` de `gerarEnviosPesquisa`, que já usa `.orIgnore()` —
   nunca deixa a violação subir como exceção. Nenhuma rota HTTP desta task
   faz `INSERT` em `envios_pesquisa` (só o motor de ativação do ciclo, que já
   é à prova de duplicata) — logo nenhum cliente HTTP jamais pode disparar
   essa violação de verdade.
9. **`enviadoEm` é escrito por `marcarComoEnviado` (`now()`) mas não faz parte
   do shape de resposta pedido no requisito 3** (que lista explicitamente:
   nome do avaliador, nome do avaliado, tipo_relacionamento, status, link,
   quantidade_lembretes, cpf_confirmado_em, concluido_em — sem
   `enviado_em`). Persistir o valor é comportamento correto e barato (a
   coluna já existe no schema doc especificamente para isso), só não é
   exposto na resposta por não ter sido pedido — sinalizado em "Perguntas em
   aberto" como uma extensão trivial e provavelmente desejável, não
   implementada por ora para não extrapolar o contrato pedido.
10. **Guard rail de anonimização**: `GET /api/ciclos/:cicloId/envios` expõe
    `avaliadorNome`/`avaliadoNome`/`tipoRelacionamento` — dado **identificado**
    de quem-avalia-quem, mesma natureza (não mais sensível) do que
    `GET /api/ciclos/:id/relacionamentos` já expõe hoje. Nunca é junction com
    dado de resposta (`itens_resposta`/`respostas` nem existem ainda) — só o
    vínculo estrutural + metadados de controle de envio (status, link,
    contadores). Restrito a `admin`/`gestor_rh` via `garantirPapel` +
    `autenticar`, nunca acessível por `colaborador`.

## Plano — Backend

### 1. backend-developer

Antes de codar: invocar a skill `backend-modulo-crud` e reler a skill
`backend-anonimizacao-respostas` (via `Skill` tool) — esta task não expõe
nenhuma resposta, mas a rota de listagem de envios expõe o vínculo
avaliador↔avaliado identificado, então a skill deve ser conferida para
garantir que o padrão de restrição de acesso está sendo seguido à risca.

#### 1.1 Enum (`src/common/enums.ts`)

Adicionar ao final do arquivo:

```ts
/**
 * Reflete o enum Postgres `status_envio`, criado pela migration do módulo
 * `envios-pesquisa`. Esta task só implementa as transições
 * pendente→enviado, enviado→enviado (lembrete, sem mudar status) e
 * qualquer-status→expirado. `em_andamento`/`concluido` são reservados para a
 * futura página pública `/responder` (fora de escopo aqui) — nenhuma rota
 * desta task escreve esses dois valores.
 */
export type StatusEnvio = 'pendente' | 'enviado' | 'em_andamento' | 'concluido' | 'expirado'

export const STATUS_ENVIO_VALORES: StatusEnvio[] = [
  'pendente',
  'enviado',
  'em_andamento',
  'concluido',
  'expirado',
]
```

#### 1.2 Migration

Arquivo `src/migrations/<timestamp>-CriarEnviosPesquisa.ts` (timestamp maior
que `1788300000000`, gerado no momento da implementação — não reutilizar
nenhum número já usado). **Não rodar esta migration contra nenhum banco real
sem confirmação explícita do usuário.**

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Motor de envios de pesquisa (link manual, sem automação de e-mail/
 * WhatsApp) — cria `envios_pesquisa`, gerada automaticamente (1 linha por
 * `relacionamentos_avaliacao`) na ativação do ciclo
 * (`ciclos-avaliacao.service.ts`, `atualizarStatus`). Nenhuma coluna de
 * resposta/valor aqui — `respostas`/`itens_resposta` são de uma task futura.
 *
 * NÃO EXECUTAR esta migration contra nenhum banco real sem confirmação
 * explícita do usuário — mesma regra já aplicada às migrations anteriores.
 */
export class CriarEnviosPesquisa<TIMESTAMP> implements MigrationInterface {
  name = 'CriarEnviosPesquisa<TIMESTAMP>'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE status_envio AS ENUM ('pendente', 'enviado', 'em_andamento', 'concluido', 'expirado')`,
    )

    await queryRunner.query(`
      CREATE TABLE envios_pesquisa (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        pesquisa_id uuid NOT NULL REFERENCES pesquisas(id) ON DELETE CASCADE,
        relacionamento_id uuid NOT NULL REFERENCES relacionamentos_avaliacao(id) ON DELETE CASCADE,
        status status_envio NOT NULL DEFAULT 'pendente',
        token_acesso uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
        enviado_em timestamptz,
        concluido_em timestamptz,
        quantidade_lembretes smallint NOT NULL DEFAULT 0,
        cpf_confirmado_em timestamptz,
        tentativas_cpf_invalidas smallint NOT NULL DEFAULT 0,
        criado_em timestamptz NOT NULL DEFAULT now(),
        UNIQUE (pesquisa_id, relacionamento_id)
      )
    `)

    await queryRunner.query(`CREATE INDEX idx_envios_pesquisa ON envios_pesquisa (pesquisa_id)`)
    await queryRunner.query(
      `CREATE INDEX idx_envios_relacionamento ON envios_pesquisa (relacionamento_id)`,
    )
    await queryRunner.query(`CREATE INDEX idx_envios_status ON envios_pesquisa (status)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_envios_status`)
    await queryRunner.query(`DROP INDEX idx_envios_relacionamento`)
    await queryRunner.query(`DROP INDEX idx_envios_pesquisa`)
    await queryRunner.query(`DROP TABLE envios_pesquisa`)
    await queryRunner.query(`DROP TYPE status_envio`)
  }
}
```

(`<TIMESTAMP>` é o timestamp real escolhido na implementação — usar o mesmo
valor no nome da classe, no nome do arquivo e em `name`, mesmo padrão das
migrations anteriores.)

**Nomes de constraint/índice a usar exatamente**: `idx_envios_pesquisa`,
`idx_envios_relacionamento`, `idx_envios_status` (sem sufixo `_id`, igual ao
schema doc). As duas `UNIQUE` (`(pesquisa_id, relacionamento_id)` e
`token_acesso`) ficam **sem nome explícito** (Postgres gera o nome padrão),
igual ao schema doc — nenhuma delas precisa de mapeamento em
`tratadorErros.ts` (ver decisão 8).

#### 1.3 Entidade TypeORM

`src/modules/envios-pesquisa/envio-pesquisa.entity.ts`:

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
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { Pesquisa } from '../pesquisas/pesquisa.entity'

@Entity('envios_pesquisa')
export class EnvioPesquisa {
  @PrimaryGeneratedColumn('uuid') id!: string

  @Column({ name: 'pesquisa_id', type: 'uuid' }) pesquisaId!: string
  @ManyToOne(() => Pesquisa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pesquisa_id' })
  pesquisa!: Pesquisa

  @Column({ name: 'relacionamento_id', type: 'uuid' }) relacionamentoId!: string
  @ManyToOne(() => RelacionamentoAvaliacao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'relacionamento_id' })
  relacionamento!: RelacionamentoAvaliacao

  @Column({ type: 'enum', enum: STATUS_ENVIO_VALORES, enumName: 'status_envio', default: 'pendente' })
  status!: StatusEnvio

  // Preenchido pelo DEFAULT do Postgres (gen_random_uuid()) — a aplicação
  // NUNCA gera nem reatribui este valor (ver decisão de modelagem 4).
  @Column({ name: 'token_acesso', type: 'uuid', unique: true })
  tokenAcesso!: string

  // Escrito por `marcarComoEnviado` (ver 1.5). Não exposto no shape de
  // resposta desta task (ver decisão de modelagem 9).
  @Column({ name: 'enviado_em', type: 'timestamptz', nullable: true })
  enviadoEm!: Date | null

  // Reservado para a task futura de resposta (`/responder`) — esta task
  // NUNCA escreve esta coluna, só a expõe (sempre `null` por enquanto).
  @Column({ name: 'concluido_em', type: 'timestamptz', nullable: true })
  concluidoEm!: Date | null

  @Column({ name: 'quantidade_lembretes', type: 'smallint', default: 0 })
  quantidadeLembretes!: number

  // Reservado para a task futura de resposta (`/responder`, confirmação de
  // CPF) — esta task NUNCA escreve esta coluna, só a expõe (sempre `null`).
  @Column({ name: 'cpf_confirmado_em', type: 'timestamptz', nullable: true })
  cpfConfirmadoEm!: Date | null

  // Reservado para a task futura de resposta — esta task NUNCA escreve.
  @Column({ name: 'tentativas_cpf_invalidas', type: 'smallint', default: 0 })
  tentativasCpfInvalidas!: number

  @CreateDateColumn({ name: 'criado_em' })
  criadoEm!: Date
}
```

Nunca ganha coluna de valor/resposta — mesma garantia de guard rail já
aplicada a `RelacionamentoAvaliacao`.

#### 1.4 DTOs

Nenhum novo (ver decisão de modelagem 7) — as 4 rotas desta task não
recebem corpo de requisição.

#### 1.5 Módulo `envios-pesquisa` (`src/modules/envios-pesquisa/`)

`envios-pesquisa.service.ts`, toda função exportada com
`garantirPapel(ator, ['admin', 'gestor_rh'])` como primeira linha (exceto o
helper interno `gerarEnviosPesquisa`, chamado só a partir de
`ciclos-avaliacao.service.ts`, que já checou o papel antes):

```ts
import { AppDataSource } from '../../data-source'
import { garantirPapel } from '../../common/autorizacao'
import { env } from '../../config/env'
import { ErroHttp } from '../../common/erro-http'
import type { ColaboradorAutenticado } from '../../types/express'
import { Colaborador } from '../colaboradores/colaborador.entity'
import { RelacionamentoAvaliacao } from '../ciclos-avaliacao/relacionamento-avaliacao.entity'
import { buscarCicloOuFalhar } from '../ciclos-avaliacao/ciclos-avaliacao.service'
import { EnvioPesquisa } from './envio-pesquisa.entity'
import type { TipoRelacionamento } from '../../common/enums'
import type { EntityManager } from 'typeorm'

const PAPEIS_COM_ACESSO = ['admin', 'gestor_rh'] as const

export interface EnvioCicloResposta {
  id: string
  avaliadorId: string
  avaliadorNome: string
  avaliadoId: string
  avaliadoNome: string
  tipoRelacionamento: TipoRelacionamento
  status: string // StatusEnvio
  link: string
  quantidadeLembretes: number
  cpfConfirmadoEm: string | null
  concluidoEm: string | null
}

function montarLinkPublico(tokenAcesso: string): string {
  // Página `/responder` ainda não existe (próximo item do roadmap) — só a
  // URL/token precisam existir e ser exibidos por ora.
  return `${env.frontendUrl}/responder/${tokenAcesso}`
}

/**
 * Gera `envios_pesquisa` a partir dos `relacionamentos_avaliacao` recém-
 * criados/existentes do ciclo — 1 envio por relacionamento, vinculado à
 * pesquisa publicada do ciclo. Função interna, chamada só por
 * `ciclos-avaliacao.service.ts` (`atualizarStatus`), dentro da MESMA
 * transação que gera os relacionamentos — nunca fora de uma transação.
 * Idempotente via `.orIgnore()` sobre `unique (pesquisa_id, relacionamento_id)`.
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
 * Busca um envio garantindo que pertence ao ciclo informado (join via
 * `relacionamento_id → relacionamentos_avaliacao.ciclo_id`) — nunca permite
 * que um `:id` de envio de outro ciclo seja manipulado através de um
 * `:cicloId` diferente na URL.
 */
async function buscarEnvioDoCicloOuFalhar(cicloId: string, envioId: string): Promise<EnvioPesquisa> {
  const envio = await AppDataSource.getRepository(EnvioPesquisa)
    .createQueryBuilder('e')
    .innerJoin(RelacionamentoAvaliacao, 'r', 'r.id = e.relacionamento_id')
    .where('e.id = :envioId', { envioId })
    .andWhere('r.ciclo_id = :cicloId', { cicloId })
    .getOne()

  if (!envio) {
    throw new ErroHttp(404, 'ENVIO_NAO_ENCONTRADO', 'Envio de pesquisa não encontrado para este ciclo.')
  }

  return envio
}

/** Reconsulta com nomes de avaliador/avaliado, reaproveitada por listar() e pelas 3 ações. */
async function buscarEnvioComNomes(envioId: string): Promise<EnvioCicloResposta> {
  const linha = await AppDataSource.getRepository(EnvioPesquisa)
    .createQueryBuilder('e')
    .innerJoin(RelacionamentoAvaliacao, 'r', 'r.id = e.relacionamento_id')
    .innerJoin(Colaborador, 'avaliador', 'avaliador.id = r.avaliador_id')
    .innerJoin(Colaborador, 'avaliado', 'avaliado.id = r.avaliado_id')
    .select('e.id', 'id')
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
    .where('e.id = :envioId', { envioId })
    .getRawOne()

  return mapearLinha(linha)
}

function mapearLinha(linha: any): EnvioCicloResposta {
  return {
    id: linha.id,
    avaliadorId: linha.avaliadorId,
    avaliadorNome: linha.avaliadorNome,
    avaliadoId: linha.avaliadoId,
    avaliadoNome: linha.avaliadoNome,
    tipoRelacionamento: linha.tipoRelacionamento,
    status: linha.status,
    link: montarLinkPublico(linha.tokenAcesso),
    quantidadeLembretes: linha.quantidadeLembretes,
    cpfConfirmadoEm: linha.cpfConfirmadoEm ? new Date(linha.cpfConfirmadoEm).toISOString() : null,
    concluidoEm: linha.concluidoEm ? new Date(linha.concluidoEm).toISOString() : null,
  }
}

export async function listarPorCiclo(
  ator: ColaboradorAutenticado,
  cicloId: string,
): Promise<EnvioCicloResposta[]> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  // Visão IDENTIFICADA de quem-avalia-quem + controle de envio — restrita a
  // admin/gestor_rh, mesma natureza de GET /api/ciclos/:id/relacionamentos.
  await buscarCicloOuFalhar(cicloId)

  const linhas = await AppDataSource.getRepository(EnvioPesquisa)
    .createQueryBuilder('e')
    .innerJoin(RelacionamentoAvaliacao, 'r', 'r.id = e.relacionamento_id')
    .innerJoin(Colaborador, 'avaliador', 'avaliador.id = r.avaliador_id')
    .innerJoin(Colaborador, 'avaliado', 'avaliado.id = r.avaliado_id')
    .select('e.id', 'id')
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
    .where('r.ciclo_id = :cicloId', { cicloId })
    .orderBy('avaliado.nome_completo', 'ASC')
    .addOrderBy('r.tipo_relacionamento', 'ASC')
    .getRawMany()

  return linhas.map(mapearLinha)
}

export async function marcarComoEnviado(
  ator: ColaboradorAutenticado,
  cicloId: string,
  envioId: string,
): Promise<EnvioCicloResposta> {
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
): Promise<EnvioCicloResposta> {
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
): Promise<EnvioCicloResposta> {
  garantirPapel(ator, [...PAPEIS_COM_ACESSO])

  await buscarCicloOuFalhar(cicloId)
  const envio = await buscarEnvioDoCicloOuFalhar(cicloId, envioId)

  // Requisito 6 do pedido: "qualquer status → expirado", sem pré-condição
  // (inclusive idempotente se já estiver expirado). Ver "Perguntas em
  // aberto" sobre bloquear a partir de "concluido".
  envio.status = 'expirado'
  await AppDataSource.getRepository(EnvioPesquisa).save(envio)

  return buscarEnvioComNomes(envioId)
}
```

Notas explícitas para o `backend-developer`:

- `garantirCicloEditavel` (de `ciclos-avaliacao.service.ts`) **não** é chamado
  em nenhuma função deste service — envios só existem depois que o ciclo já
  está `ativo` (nunca `rascunho`), então a regra "só editável em rascunho" não
  se aplica aqui. Nenhuma restrição por `ciclo.status` foi adicionada às 3
  ações (ver "Perguntas em aberto", item 4).
- `buscarEnvioComNomes`/`mapearLinha` usam `getRawOne`/`getRawMany` (não
  entidades hidratadas) pelo mesmo motivo de `listarRelacionamentos` em
  `ciclos-avaliacao.service.ts`: os `nome_completo` vêm de um `JOIN`, não são
  coluna própria de `EnvioPesquisa`.
- `tipoRelacionamento` no tipo `EnvioCicloResposta` deve importar o tipo
  `TipoRelacionamento` de `../../common/enums` (já existe, reaproveitado, não
  recriar).

#### 1.6 Extensão de `ciclos-avaliacao.service.ts` (`atualizarStatus`)

Único arquivo de outro módulo alterado por esta task. Import novo:

```ts
import { gerarEnviosPesquisa } from '../envios-pesquisa/envios-pesquisa.service'
```

Dentro do bloco `if (ciclo.status === 'rascunho' && novoStatus === 'ativo')`,
a chamada à transação passa a ser:

```ts
const salvo = await AppDataSource.transaction(async (manager) => {
  await gerarRelacionamentos(manager, ciclo.id)
  await gerarEnviosPesquisa(manager, ciclo.id, pesquisaPublicada.id)

  ciclo.status = novoStatus
  return manager.getRepository(CicloAvaliacao).save(ciclo)
})
```

Nenhuma outra linha de `ciclos-avaliacao.service.ts` muda. `pesquisaPublicada`
já existe no escopo (lida logo acima, antes da transação, pela checagem
`CICLO_SEM_PESQUISA_PUBLICADA` já existente) — reaproveitada tal qual, sem
nova consulta.

Import cruzado permitido nesta direção
(`ciclos-avaliacao.service.ts → envios-pesquisa.service.ts`) porque é uma
função utilitária pura (recebe `manager`, não chama `garantirPapel` de novo).
A direção contrária (`envios-pesquisa.service.ts → ciclos-avaliacao.service.ts`,
usada só para `buscarCicloOuFalhar` nas rotas de leitura/ação) não cria ciclo
de import porque `ciclos-avaliacao.service.ts` não importa nada de
`envios-pesquisa` além dessa única função — confirmar ausência de import
circular ao compilar (`tsc` já pega isso).

#### 1.7 Controller (`src/modules/envios-pesquisa/envios-pesquisa.controller.ts`)

```ts
import type { Request, Response } from 'express'
import { obterParametroRota } from '../../common/http-params'
import * as enviosPesquisaService from './envios-pesquisa.service'

export async function listarEnviosCiclo(req: Request, res: Response): Promise<void> {
  const cicloId = obterParametroRota(req, 'cicloId')
  const resposta = await enviosPesquisaService.listarPorCiclo(req.colaboradorAutenticado!, cicloId)
  res.status(200).json(resposta)
}

export async function marcarEnvioComoEnviado(req: Request, res: Response): Promise<void> {
  const cicloId = obterParametroRota(req, 'cicloId')
  const id = obterParametroRota(req, 'id')
  const resposta = await enviosPesquisaService.marcarComoEnviado(req.colaboradorAutenticado!, cicloId, id)
  res.status(200).json(resposta)
}

export async function registrarLembreteEnvio(req: Request, res: Response): Promise<void> {
  const cicloId = obterParametroRota(req, 'cicloId')
  const id = obterParametroRota(req, 'id')
  const resposta = await enviosPesquisaService.registrarLembrete(req.colaboradorAutenticado!, cicloId, id)
  res.status(200).json(resposta)
}

export async function expirarEnvioAcao(req: Request, res: Response): Promise<void> {
  const cicloId = obterParametroRota(req, 'cicloId')
  const id = obterParametroRota(req, 'id')
  const resposta = await enviosPesquisaService.expirarEnvio(req.colaboradorAutenticado!, cicloId, id)
  res.status(200).json(resposta)
}
```

#### 1.8 Módulo/router (`src/modules/envios-pesquisa/envios-pesquisa.module.ts`)

```ts
import { Router } from 'express'
import { asyncHandler } from '../../common/http-async'
import { autenticar } from '../../middlewares/autenticacao'
import {
  expirarEnvioAcao,
  listarEnviosCiclo,
  marcarEnvioComoEnviado,
  registrarLembreteEnvio,
} from './envios-pesquisa.controller'

// mergeParams: true — path final montado como sub-router de ciclos-avaliacao,
// precisa herdar `cicloId` do router pai.
const router = Router({ mergeParams: true })

// Montado aqui de novo (mesmo já autenticado pelo router pai) — nenhuma rota
// deste módulo é acessível por `colaborador`, defesa em profundidade
// explícita, mesmo padrão de `ciclo-participantes`/`perguntas`.
router.use(autenticar)

router.get('/', asyncHandler(listarEnviosCiclo))
router.patch('/:id/marcar-enviado', asyncHandler(marcarEnvioComoEnviado))
router.patch('/:id/registrar-lembrete', asyncHandler(registrarLembreteEnvio))
router.patch('/:id/expirar', asyncHandler(expirarEnvioAcao))

export { router as enviosPesquisaRouter }
```

#### 1.9 Registro em `ciclos-avaliacao.module.ts` (não em `app.ts`)

Adicionar import e montagem, na mesma seção onde `cicloParticipantesRouter`
já é montado:

```ts
import { enviosPesquisaRouter } from '../envios-pesquisa/envios-pesquisa.module'
// ...
router.use('/:cicloId/participantes', cicloParticipantesRouter)
router.use('/:cicloId/envios', enviosPesquisaRouter)
```

**`app.ts` não muda** — `envios-pesquisa` nunca é montado como router de
topo-nível, só como sub-router de `ciclos-avaliacao`.

#### 1.10 Shape de resposta

**`EnvioCicloResposta`** (usado em todas as 4 rotas — listagem retorna
array, as 3 ações retornam o item único atualizado):
```json
{
  "id": "uuid (id da linha envios_pesquisa)",
  "avaliadorId": "uuid",
  "avaliadorNome": "string",
  "avaliadoId": "uuid",
  "avaliadoNome": "string",
  "tipoRelacionamento": "autoavaliacao | gestor | pares | subordinado | externo",
  "status": "pendente | enviado | em_andamento | concluido | expirado",
  "link": "{FRONTEND_URL}/responder/{token_acesso}",
  "quantidadeLembretes": 0,
  "cpfConfirmadoEm": "ISO 8601 | null (sempre null nesta task, ver decisão 3)",
  "concluidoEm": "ISO 8601 | null (sempre null nesta task, ver decisão 3)"
}
```

#### 1.11 Tabela de rotas — contrato de API completo

**`envios-pesquisa.module.ts`** (sub-router de `ciclos-avaliacao`, path final
`/api/ciclos/:cicloId/envios...`):

| Método | Rota | Papéis | Request (body) | Sucesso | Erros específicos |
|---|---|---|---|---|---|
| GET | `/api/ciclos/:cicloId/envios` | admin, gestor_rh | — | `200 EnvioCicloResposta[]` | `404 CICLO_NAO_ENCONTRADO` |
| PATCH | `/api/ciclos/:cicloId/envios/:id/marcar-enviado` | admin, gestor_rh | — | `200 EnvioCicloResposta` | `404 CICLO_NAO_ENCONTRADO`, `404 ENVIO_NAO_ENCONTRADO`, `409 TRANSICAO_ENVIO_INVALIDA` (status atual ≠ `pendente`) |
| PATCH | `/api/ciclos/:cicloId/envios/:id/registrar-lembrete` | admin, gestor_rh | — | `200 EnvioCicloResposta` (com `quantidadeLembretes` incrementado) | `404 CICLO_NAO_ENCONTRADO`, `404 ENVIO_NAO_ENCONTRADO`, `409 TRANSICAO_ENVIO_INVALIDA` (status atual ≠ `enviado`) |
| PATCH | `/api/ciclos/:cicloId/envios/:id/expirar` | admin, gestor_rh | — | `200 EnvioCicloResposta` (`status: "expirado"`) | `404 CICLO_NAO_ENCONTRADO`, `404 ENVIO_NAO_ENCONTRADO` |

Nenhuma dessas rotas é acessível por `colaborador` — todas exigem
`autenticar` (montado 2x, no router pai `ciclos-avaliacao` e de novo aqui,
defesa em profundidade) + `garantirPapel(ator, ['admin', 'gestor_rh'])` como
primeira linha de cada função de serviço.

Nenhuma dessas rotas **dispara** e-mail/WhatsApp/notificação real —
`marcar-enviado` e `registrar-lembrete` são só contadores/flags de controle
manual atualizados pelo admin depois de compartilhar o link por fora do
sistema (requisitos 4 e 5 do pedido).

#### 1.12 Guard rail de anonimização (aplica-se mesmo esta task não tocando respostas)

- `EnvioPesquisa` guarda só metadados de controle de envio
  (`status`/`tokenAcesso`/`enviadoEm`/`concluidoEm`/`quantidadeLembretes`/
  `cpfConfirmadoEm`/`tentativasCpfInvalidas`) — nenhuma coluna de
  resposta/valor/nota. Nenhuma rota desta task lê/expõe `itens_resposta`
  nem `respostas` (nenhuma das duas tabelas existe ainda).
- `GET /api/ciclos/:cicloId/envios` expõe `avaliadorNome`/`avaliadoNome`/
  `tipoRelacionamento` — dado identificado de quem-avalia-quem, da mesma
  natureza e mesmo nível de restrição de
  `GET /api/ciclos/:id/relacionamentos` (já existente e já revisado sem
  achados críticos). Restrito a `admin`/`gestor_rh`, nunca a `colaborador`.
- O link público (`{FRONTEND_URL}/responder/{token_acesso}`) usa
  `token_acesso` como capability token — a validação de quem pode abrir esse
  link (token + CPF, sem sessão Supabase) é da task futura da página
  `/responder`, e deve usar a service role key + validação manual (nunca RLS
  de sessão), conforme a nota de arquitetura já registrada no schema doc.
  **Esta task não implementa nenhuma parte desse fluxo público** — só gera o
  token e constrói a URL.
- Nenhuma rota desta task é acessível por `colaborador` — `autenticar` +
  `garantirPapel(['admin', 'gestor_rh'])` em toda função exportada do novo
  service, sem exceção (exceto o helper interno `gerarEnviosPesquisa`,
  chamado só a partir de uma função que já checou o papel).

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
- `backend/src/modules/envios-pesquisa/envio-pesquisa.entity.ts`
- `backend/src/modules/envios-pesquisa/envios-pesquisa.service.ts` (inclui
  `gerarEnviosPesquisa` interna, chamada só por `ciclos-avaliacao.service.ts`
  dentro da mesma transação de `gerarRelacionamentos`, com `.orIgnore()` sobre
  `unique (pesquisa_id, relacionamento_id)`; demais funções exportadas —
  `listarPorCiclo`, `marcarComoEnviado`, `registrarLembrete`, `expirarEnvio`
  — todas com `garantirPapel(ator, ['admin', 'gestor_rh'])` como primeira
  linha)
- `backend/src/modules/envios-pesquisa/envios-pesquisa.controller.ts`
- `backend/src/modules/envios-pesquisa/envios-pesquisa.module.ts`
  (sub-router `mergeParams: true`, montado como
  `/:cicloId/envios` dentro de `ciclos-avaliacao.module.ts`; `autenticar`
  montado de novo aqui, defesa em profundidade)
- `backend/src/migrations/1788350000000-CriarEnviosPesquisa.ts` (timestamp
  escolhido maior que `1788300000000`; cria enum `status_envio` e tabela
  `envios_pesquisa` com as 11 colunas do schema doc, índices
  `idx_envios_pesquisa`/`idx_envios_relacionamento`/`idx_envios_status` e as
  duas `UNIQUE` sem nome explícito — **NÃO executada** contra nenhum banco
  real; precisa de `npm run migration:run` com confirmação explícita do
  usuário antes de rodar em qualquer ambiente)
- Nenhum DTO novo criado (conforme decisão de modelagem 7 — nenhuma das 4
  rotas recebe corpo de requisição).

**Arquivos alterados:**
- `backend/src/common/enums.ts`: adicionado `StatusEnvio`/
  `STATUS_ENVIO_VALORES` (5 valores, mesma ordem do schema doc).
- `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.service.ts`: import
  de `gerarEnviosPesquisa` de `../envios-pesquisa/envios-pesquisa.service`;
  dentro da transação de `atualizarStatus` (transição `rascunho → ativo`),
  chamada `await gerarEnviosPesquisa(manager, ciclo.id, pesquisaPublicada.id)`
  logo após `gerarRelacionamentos`, antes de persistir `ciclo.status =
  novoStatus`. Nenhuma outra linha do arquivo alterada.
- `backend/src/modules/ciclos-avaliacao/ciclos-avaliacao.module.ts`: import de
  `enviosPesquisaRouter` + `router.use('/:cicloId/envios',
  enviosPesquisaRouter)`, montado logo após `cicloParticipantesRouter`.

**`app.ts` não foi alterado** — `envios-pesquisa` só é montado como
sub-router dentro de `ciclos-avaliacao.module.ts`, conforme o plano.

**Nenhuma entrada nova em `MAPA_CONSTRAINT_PARA_CODIGO`** (`tratadorErros.ts`)
— conforme decisão de modelagem 8, as duas `UNIQUE` novas só poderiam ser
violadas pelo `INSERT` de `gerarEnviosPesquisa`, que já usa `.orIgnore()`, e
nenhuma rota HTTP desta task faz `INSERT` em `envios_pesquisa`.

**Guard rail de anonimização**: `EnvioPesquisa` guarda só metadados de
controle de envio, nenhuma coluna de resposta/valor. `GET
/api/ciclos/:cicloId/envios` expõe `avaliadorNome`/`avaliadoNome`/
`tipoRelacionamento` — dado identificado de quem-avalia-quem, mesma natureza
de `GET /api/ciclos/:id/relacionamentos` (já revisado sem achados críticos) —
restrito a `admin`/`gestor_rh` via `garantirPapel` + `autenticar` (montado 2x:
router pai `ciclos-avaliacao` e de novo em `envios-pesquisa.module.ts`),
nunca acessível por `colaborador`. Nenhuma query desta task junta
`itens_resposta`/`respostas` com `relacionamentos_avaliacao.avaliador_id`
(nenhuma das duas tabelas existe ainda).

**Validação:**
- `npm run build` (tsc) dentro de `backend/`: **1 erro pré-existente** em
  `src/test/fakeRepository.ts:30` (`TS2352`, conversão de tipo genérico em
  helper de teste), **não relacionado a esta task** — confirmado rodando o
  mesmo build com as mudanças desta task colocadas em stash (`git stash -u`):
  o mesmo e único erro aparece igualmente sem nenhum arquivo desta task
  presente. Nenhum novo erro de compilação foi introduzido pelas mudanças
  desta task (entidade, service, controller, module, migration, alterações em
  `ciclos-avaliacao.service.ts`/`ciclos-avaliacao.module.ts` e `enums.ts`
  compilam limpos). Não corrigido por estar fora do escopo desta task
  (`fakeRepository.ts` é infraestrutura de teste, não tocada pelo plano).
- Migration **não executada** contra nenhum banco real, conforme instrução —
  requer confirmação explícita do usuário antes de `npm run migration:run`.

### 2. backend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Nomes/tipos batendo exatamente com o schema doc** — `envios_pesquisa`
   (11 colunas, tipos, `unique (pesquisa_id, relacionamento_id)`,
   `token_acesso uuid default gen_random_uuid() unique`, nomes de índice
   `idx_envios_pesquisa`/`idx_envios_relacionamento`/`idx_envios_status` sem
   sufixo `_id`) e o enum `status_envio` (5 valores, nessa ordem exata:
   `pendente, enviado, em_andamento, concluido, expirado`) precisam bater
   literalmente com `docs/schema_avaliacao360_pt_v2.sql` (linhas 31 e
   169–186). Qualquer divergência é achado crítico.
2. **Nenhuma coluna de e-mail/WhatsApp/canal de envio automatizado foi
   introduzida** — confirmar que a entidade/migration têm exatamente as 11
   colunas do schema doc, nem uma a mais.
3. **Nenhuma rota nova é acessível por `colaborador`** — `autenticar`
   montado 2x (`ciclos-avaliacao.module.ts` e `envios-pesquisa.module.ts`);
   `garantirPapel(ator, ['admin', 'gestor_rh'])` é a primeira linha de toda
   função exportada de `envios-pesquisa.service.ts` que recebe `ator`
   (exceção documentada e correta: `gerarEnviosPesquisa`, helper interno sem
   `ator`, chamado só de dentro de `atualizarStatus`, que já checou o papel).
4. **Geração automática de envios correta e completa**: na ativação de um
   ciclo, o número de linhas inseridas em `envios_pesquisa` deve ser
   exatamente igual ao número de `relacionamentos_avaliacao` gerados para
   aquele ciclo (1:1, via `relacionamento_id`), todas com
   `pesquisa_id = pesquisaPublicada.id` (a mesma pesquisa que passou pela
   checagem `CICLO_SEM_PESQUISA_PUBLICADA` já existente) e
   `status = 'pendente'`. Confirmar que `gerarEnviosPesquisa` roda **depois**
   de `gerarRelacionamentos` e **dentro da mesma transação** (mesmo
   `manager`), nunca em uma transação separada.
5. **Idempotência**: `gerarEnviosPesquisa` usa `.orIgnore()` sobre
   `unique (pesquisa_id, relacionamento_id)` — uma segunda execução (só
   alcançável por corrida, já que `TRANSICOES_VALIDAS` impede uma segunda
   ativação real) não duplica linhas.
6. **Nenhuma rota desta task dispara envio de verdade** — `marcar-enviado` e
   `registrar-lembrete` são só um `UPDATE` de `status`/`enviado_em` e um
   incremento de `quantidade_lembretes`, respectivamente; nenhuma chamada a
   serviço de e-mail/SMS/WhatsApp em nenhum lugar do código desta task.
7. **Link construído corretamente com `FRONTEND_URL`**: `montarLinkPublico`
   usa `env.frontendUrl` (nunca uma string hardcoded, nunca uma env var
   nova) e o formato exato `{FRONTEND_URL}/responder/{token_acesso}`.
8. **Transições de status de envio restritas conforme o pedido**:
   `marcarComoEnviado` só parte de `pendente`; `registrarLembrete` só parte
   de `enviado`; `expirarEnvio` parte de **qualquer** status (conforme
   requisito 6, literal — sem pré-condição). Qualquer restrição adicional
   não documentada aqui é desvio do plano.
9. **`cpfConfirmadoEm`/`concluidoEm`/`tentativasCpfInvalidas` nunca são
   escritos por nenhuma rota desta task** — confirmar que nenhuma das 3
   ações manuais toca essas colunas (ficam reservadas para a página
   `/responder` futura).
10. **`buscarEnvioDoCicloOuFalhar` sempre valida o par `(cicloId, envioId)`
    via join em `relacionamentos_avaliacao.ciclo_id`** antes de qualquer
    ação — um `id` de envio de outro ciclo passado com um `cicloId` errado
    na URL deve retornar `404 ENVIO_NAO_ENCONTRADO`, nunca vazar/mutar o
    envio errado.
11. **`app.ts` não foi alterado** — `envios-pesquisa` só é montado como
    sub-router dentro de `ciclos-avaliacao.module.ts`.

## Perguntas em aberto

Decisões de negócio que os requisitos não cobriram literalmente e que valem
confirmação explícita do usuário antes/depois da implementação (a
implementação segue as decisões assumidas acima, mas sinalizando aqui para
não passar despercebido):

1. **"Pesquisa do ciclo" continua sem ser 1:1 garantido por constraint** —
   se, por alguma sequência de operações, mais de uma `pesquisas` acabar com
   `cicloId = X AND status = 'publicada'` ao mesmo tempo (nada no código
   impede isso hoje: `pesquisas.service.atualizar` só exige `status ===
   'publicada'` para vincular, não checa se já existe outra pesquisa
   publicada vinculada ao mesmo ciclo), `pesquisaPublicada = findOneBy(...)`
   (em `ciclos-avaliacao.service.ts`, já existente, não desta task) retorna
   uma linha arbitrária (a que o Postgres decidir devolver primeiro, sem
   `ORDER BY`), e é essa pesquisa que recebe todos os `envios_pesquisa`
   gerados. Confirmar se vale a pena adicionar uma constraint/checagem de
   unicidade "no máximo uma pesquisa publicada por ciclo" em uma task futura
   (fora de escopo aqui, e não pedido literalmente).
2. **`enviadoEm` é persistido mas não exposto na resposta** (ver decisão de
   modelagem 9) — confirmar se deveria entrar no shape de
   `EnvioCicloResposta` mesmo não tendo sido pedido explicitamente no
   requisito 3 (extensão trivial, uma linha a mais no `SELECT`/mapeamento).
3. **`expirarEnvio` permite expirar um envio já `concluido`** (seguindo o
   requisito 6 ao pé da letra: "qualquer status → expirado") — isso parece
   contraintuitivo do ponto de vista de produto (por que expirar algo que já
   foi respondido?), mas o pedido não faz exceção. Confirmar se
   `concluido → expirado` deveria ser bloqueado com `409` quando a task
   futura de respostas existir (esta task nunca produz `status = 'concluido'`
   de verdade, então esse caso é só teórico por ora).
4. **Nenhuma das 3 ações manuais é bloqueada pelo `status` do ciclo**
   (`ativo`/`encerrado`) — ex.: hoje é possível `marcar-enviado`/
   `registrar-lembrete`/`expirar` um envio mesmo depois do ciclo ter sido
   encerrado. Não pedido literalmente; confirmar se isso é aceitável ou se
   ações de envio deveriam travar quando `ciclo.status === 'encerrado'`.
5. **Reaproveita a mesma janela de corrida pré-existente** já registrada
   como "Deveria corrigir" (não crítico) na revisão de `ciclos-avaliacao`:
   a checagem `CICLO_SEM_PESQUISA_PUBLICADA` roda fora da transação de
   ativação. Esta task não fecha essa janela (fora de escopo, decisão já
   tomada na task anterior) — só sinalizando de novo porque agora
   `envios_pesquisa` também depende do mesmo valor lido fora da transação
   (`pesquisaPublicada.id`).

## Revisão

Revisão feita lendo linha a linha todos os arquivos criados/alterados desta
etapa (`envio-pesquisa.entity.ts`, `envios-pesquisa.service.ts`,
`envios-pesquisa.controller.ts`, `envios-pesquisa.module.ts`, a migration
`1788350000000-CriarEnviosPesquisa.ts`, `common/enums.ts`, e os trechos
alterados de `ciclos-avaliacao.service.ts`/`ciclos-avaliacao.module.ts`)
contra `docs/schema_avaliacao360_pt_v2.sql` (linhas 31 e 169–186) e contra o
plano acima, ponto a ponto pela lista da seção "2. backend-codereviewer" e
pelos "Pontos de atenção específicos" do pedido. Nenhum arquivo de código foi
alterado por este agente.

### Crítico

Sem achados críticos. Especificamente:

- **Fidelidade ao schema**: `envios_pesquisa` (migration +
  `envio-pesquisa.entity.ts`) bate coluna por coluna, tipo por tipo,
  nullability e default com `docs/schema_avaliacao360_pt_v2.sql` (linhas
  169–186) — as 11 colunas exatas (`id`, `pesquisa_id`, `relacionamento_id`,
  `status`, `token_acesso`, `enviado_em`, `concluido_em`,
  `quantidade_lembretes`, `cpf_confirmado_em`, `tentativas_cpf_invalidas`,
  `criado_em`), `unique (pesquisa_id, relacionamento_id)` sem nome explícito
  (como o doc também deixa), `token_acesso uuid not null default
  gen_random_uuid() unique`, e os três índices
  `idx_envios_pesquisa`/`idx_envios_relacionamento`/`idx_envios_status` sem
  sufixo `_id`. **Nenhuma coluna de e-mail/WhatsApp/canal foi introduzida** —
  confirmado que a entidade e a migration têm exatamente as 11 colunas do
  schema doc, nem uma a mais. O enum `status_envio` bate em valores e ordem
  exata (`pendente, enviado, em_andamento, concluido, expirado`) com a linha
  31 do doc, tanto no `CREATE TYPE` da migration quanto em
  `StatusEnvio`/`STATUS_ENVIO_VALORES` (`src/common/enums.ts`). `down()`
  reverte na ordem inversa correta (3 índices → tabela → tipo). Nenhum
  `synchronize: true`. Migration não foi executada contra nenhum banco real
  (confirmado — nenhuma evidência de `migration:run` no resumo/estado do
  repo).
- **Controle de acesso**: `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` (com
  `PAPEIS_COM_ACESSO = ['admin', 'gestor_rh']`) é literalmente a primeira
  linha de toda função exportada de `envios-pesquisa.service.ts` que recebe
  `ator` (`listarPorCiclo`, `marcarComoEnviado`, `registrarLembrete`,
  `expirarEnvio`) — exceção correta e documentada para `gerarEnviosPesquisa`
  (helper interno sem `ator`, chamado só de dentro de `atualizarStatus`, que
  já checou o papel antes de abrir a transação). `autenticar` está montado
  duas vezes (router pai `ciclos-avaliacao.module.ts` e de novo em
  `envios-pesquisa.module.ts`, `mergeParams: true`), mesmo padrão de defesa
  em profundidade de `ciclo-participantes`/`perguntas`. Nenhum controller faz
  checagem de papel inline. Nenhuma das 4 rotas é acessível por
  `colaborador`.
- **Geração automática de envios correta e completa**: `gerarEnviosPesquisa`
  é chamada dentro do mesmo `AppDataSource.transaction(async (manager) =>
  {...})` de `atualizarStatus`, **depois** de `gerarRelacionamentos(manager,
  ciclo.id)` e **antes** de persistir `ciclo.status = novoStatus`, usando o
  mesmo `manager` em toda a cadeia (`ciclos-avaliacao.service.ts` linhas
  362–368) — nunca uma segunda transação separada. Dentro da função, `manager
  .getRepository(RelacionamentoAvaliacao).find({ where: { cicloId } })` lê
  (dentro da mesma transação) inclusive os relacionamentos recém-inseridos
  por `gerarRelacionamentos` na mesma transação (read-your-writes padrão
  dentro de uma transação Postgres) e insere 1 `EnvioPesquisa` por
  relacionamento, com `pesquisaId: pesquisaPublicada.id` (o mesmo valor já
  resolvido pela checagem `CICLO_SEM_PESQUISA_PUBLICADA` existente, sem
  re-consulta) e `status: 'pendente'`. Se `relacionamentos.length === 0`, a
  função retorna sem tentar `INSERT` vazio (evita erro do query builder com
  `.values([])`).
- **Idempotência**: `.orIgnore()` sobre `unique (pesquisa_id,
  relacionamento_id)` no `insert` de `gerarEnviosPesquisa`, mesmo padrão já
  usado em `gerarRelacionamentos` — uma segunda execução (só alcançável por
  corrida, já que `TRANSICOES_VALIDAS` impede uma segunda ativação real) não
  duplica linhas.
- **Nenhuma ação desta task dispara envio de verdade**: `marcarComoEnviado` é
  um `UPDATE status/enviado_em`; `registrarLembrete` é um incremento de
  `quantidade_lembretes`; `expirarEnvio` é um `UPDATE status`. Nenhuma
  chamada a serviço de e-mail/SMS/WhatsApp/HTTP externo em nenhum lugar do
  código desta task (confirmado por leitura completa dos 4 arquivos do
  módulo).
- **Link construído corretamente**: `montarLinkPublico` usa
  `env.frontendUrl` (lido de `src/config/env.ts`, variável opcional com
  default `http://localhost:5173`, nunca hardcoded) no formato exato
  `${env.frontendUrl}/responder/${tokenAcesso}` — nenhuma URL relativa
  incompleta, nenhuma env var nova introduzida.
- **`token_acesso`**: `uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE` na
  migration, `@Column({ name: 'token_acesso', type: 'uuid', unique: true })`
  na entidade sem `@Default`/geração no Node — confirmado que nenhuma função
  do service atribui/gera `tokenAcesso` manualmente; é sempre o `DEFAULT` do
  Postgres que preenche o valor no `INSERT` de `gerarEnviosPesquisa` (os
  `values()` só passam `pesquisaId`/`relacionamentoId`/`status`). Unicidade
  garantida pela constraint `UNIQUE` da coluna.
- **`cpf_confirmado_em`/`concluido_em`/`tentativas_cpf_invalidas` nunca são
  escritos por nenhuma rota desta task** — confirmado em
  `marcarComoEnviado`/`registrarLembrete`/`expirarEnvio`: só tocam
  `status`/`enviadoEm`/`quantidadeLembretes`, nunca essas três colunas.
  `mapearLinha` sempre expõe `cpfConfirmadoEm`/`concluidoEm` como `null`
  (verificado: `linha.cpfConfirmadoEm ? ... : null`), coerente com o requisito
  9 do pedido.
- **`buscarEnvioDoCicloOuFalhar` valida corretamente o par `(cicloId,
  envioId)`** via `INNER JOIN relacionamentos_avaliacao r ON r.id =
  e.relacionamento_id` + `WHERE e.id = :envioId AND r.ciclo_id = :cicloId` —
  um `id` de envio pertencente a outro ciclo, acessado com um `:cicloId`
  diferente na URL, cai no `if (!envio)` e retorna `404
  ENVIO_NAO_ENCONTRADO`, nunca vaza/muta o envio errado.
- **Guard rail de anonimização**: `EnvioPesquisa` guarda só metadados de
  controle de envio — nenhuma coluna de resposta/valor/nota. Nenhuma query
  desta task junta `itens_resposta`/`respostas` (nenhuma das duas tabelas
  existe ainda) com `relacionamentos_avaliacao.avaliador_id`. `GET
  /api/ciclos/:cicloId/envios` expõe `avaliadorNome`/`avaliadoNome`/
  `tipoRelacionamento` — dado identificado de quem-avalia-quem, mesma
  natureza e mesmo nível de restrição de `GET /api/ciclos/:id/relacionamentos`
  (já revisado sem achados críticos na task `ciclos-avaliacao`) — restrito a
  `admin`/`gestor_rh`, nunca a `colaborador`. Nada disso é agregado/liberado
  por contagem de respondentes porque esta task nunca lida com respostas —
  a regra de "mínimo de respondentes" da checklist de anonimização não se
  aplica a este módulo (só metadados de envio, não respostas).
- **Single-tenant**: nenhum `organization_id` ou campo de isolamento
  multi-tenant foi introduzido.
- **Transições de status de envio restritas conforme o pedido**:
  `marcarComoEnviado` exige `envio.status === 'pendente'` (senão `409
  TRANSICAO_ENVIO_INVALIDA`); `registrarLembrete` exige `envio.status ===
  'enviado'`; `expirarEnvio` não tem pré-condição (qualquer status →
  `expirado`, conforme requisito 6 do pedido, literal). Nenhuma das três
  escreve `em_andamento`/`concluido`.
- **`app.ts` não foi alterado** — confirmado por leitura de
  `ciclos-avaliacao.module.ts`: `enviosPesquisaRouter` é montado como
  `router.use('/:cicloId/envios', enviosPesquisaRouter)` dentro do próprio
  módulo de ciclos, nunca como router de topo-nível.
- **`MAPA_CONSTRAINT_PARA_CODIGO` (`tratadorErros.ts`) não ganhou entrada
  nova** — confirmado por leitura do arquivo: só a entrada
  `uq_ciclo_participantes_ciclo_colaborador` (da task anterior) está
  presente; nenhuma constraint de `envios_pesquisa` foi adicionada, coerente
  com a decisão de modelagem 8 (o único `INSERT` em `envios_pesquisa` é
  `gerarEnviosPesquisa`, que já usa `.orIgnore()`).

### Deveria corrigir

Sem novos achados "Deveria corrigir" específicos desta etapa. A única janela
de corrida relevante ao módulo (`pesquisaPublicada`/contagem de participantes
lidas fora da transação de ativação) já está registrada como "Deveria
corrigir" na revisão de `ciclos-avaliacao` (`.claude/tasks/ciclos-avaliacao/task-backend.md`)
e é herdada, não introduzida, por esta task — não duplicando o achado aqui.

### Sugestão

1. **Cobertura de teste de controle de acesso ainda não inclui
   `/api/ciclos/:cicloId/envios`** — mesma observação já feita na revisão de
   `ciclos-avaliacao`: não é um problema desta etapa (é trabalho do
   `test-engineer`, próxima etapa), só sinalizando para não passar
   despercebido, dado que a rota de listagem expõe o vínculo
   avaliador↔avaliado identificado.
2. **`enviadoEm` persistido mas não exposto em `EnvioCicloResposta`** — já
   sinalizado no próprio plano ("Perguntas em aberto", item 2) como extensão
   trivial e provavelmente desejável; não é uma falha de implementação (o
   shape pedido no requisito 3 não incluía esse campo), só reforçando que é
   uma decisão de produto pendente de confirmação, não um bug.
3. **`gerarEnviosPesquisa` recalcula todos os `relacionamentos` do ciclo**
   (não só os que `gerarRelacionamentos` acabou de inserir) antes de montar
   os `values()` do insert — correto e necessário para cobrir o caso de
   idempotência sob corrida, mas vale registrar que, em ciclos com muitos
   participantes, isso é uma segunda consulta completa à tabela dentro da
   mesma transação (custo aceitável para o volume esperado do domínio, não é
   um problema de correção).

### Conclusão

Sem achados críticos. A implementação segue o plano ao pé da letra: nomes/
tipos de `envios_pesquisa` e do enum `status_envio` batem literalmente com
`docs/schema_avaliacao360_pt_v2.sql`, nenhuma coluna de e-mail/WhatsApp foi
introduzida, a geração automática de envios roda dentro da mesma transação de
ativação do ciclo (depois de `gerarRelacionamentos`, antes de persistir
`ciclo.status`), é idempotente via `.orIgnore()`, nenhuma rota é acessível
por `colaborador`, nenhuma ação dispara envio real, o link usa
`FRONTEND_URL` corretamente, e `token_acesso`/`cpf_confirmado_em`/
`concluido_em`/`tentativas_cpf_invalidas` seguem exatamente as regras do
plano. Libero para a etapa de testes (`test-engineer`).
