# Task: Cadastro de colaboradores e equipes (Backend)

Demanda 100% backend (`backend/`, equivalente a `apps/api` nas referências dos
agentes/skills — usar sempre os caminhos reais `backend/**` neste plano). Não
toca `frontend/`. Pedido já esclarecido diretamente pelo usuário — sem etapa
de `spec`.

## Estado atual verificado (antes do plano)

- `backend/` é greenfield: só existem `package.json`, `package-lock.json`,
  `tsconfig.json` e `.gitignore`. Não há `src/`, nenhum `DataSource`, nenhum
  app Express, nenhuma migration, nenhum script de dev/build/migration.
- `backend/package.json`: `"type": "commonjs"`. Dependências já instaladas:
  `express` `^5.2.1`, `typeorm` `^1.1.0` (versão real instalada — confirmado
  em `backend/node_modules/typeorm/package.json`; ainda expõe os decorators
  clássicos `@Entity`/`@Column`/`@ManyToOne`/etc. em
  `node_modules/typeorm/decorator/**`, e os bins
  `typeorm`, `typeorm-ts-node-commonjs`, `typeorm-ts-node-esm`), `pg`,
  `@supabase/supabase-js` `^2.112.4`, `dotenv`, `reflect-metadata`.
  Dev: `@types/express`, `@types/node`, `ts-node-dev`, `typescript`. **Não há
  nenhuma lib de validação** (`zod`/`class-validator`/`joi`) nem `cors`
  instalados.
- `backend/tsconfig.json`: `"module": "nodenext"`, `"target": "esnext"`,
  `"types": []` (isso exclui `@types/node` do escopo — precisa virar
  `["node"]` ou remover a linha), sem `rootDir`/`outDir` definidos (comentados),
  sem `experimentalDecorators`/`emitDecoratorMetadata` (**obrigatórios** para
  os decorators do TypeORM funcionarem — sem eles `@Entity`/`@Column` não
  compilam com efeito nenhum em runtime).
- `backend/.gitignore` ignora `node_modules/`, `.env` **e também
  `.env.example`** — mesmo problema já corrigido no frontend durante a task
  `tela-login` (`.env.example` deveria ser versionado, só `.env` real fica de
  fora).
- Não existe `schema_avaliacao360_pt.sql` no repo — as tabelas `equipes` e
  `colaboradores` ainda não existem em lugar nenhum; serão criadas do zero
  por migration nesta task, usando exatamente os nomes de coluna listados
  pelo usuário. Onde o usuário não especificou algo necessário (id, timestamps,
  constraints), a decisão assumida está documentada explicitamente abaixo —
  não é para o `backend-developer` inventar nada além disso.
- `frontend/.env.example` já usa `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  (chave **anon**, pública). O backend precisa da **service role key**
  (nunca a mesma variável/valor do frontend, nunca exposta ao browser).
- Lido `frontend/src/components/EsqueciSenhaModal/EsqueciSenhaModal.tsx`: o
  fluxo de "esqueci minha senha" hoje é só
  `supabase.auth.resetPasswordForEmail(trimmedEmail)` **sem** `redirectTo`
  explícito (depende do Site URL configurado no painel do Supabase). O
  backend deve chamar o equivalente na Admin API (`supabaseAdmin.auth.resetPasswordForEmail`)
  da mesma forma, sem hardcodar `redirectTo`, para manter o mesmo
  comportamento observável pelo usuário final.
- Nenhum `.claude/tasks/cadastro-colaboradores-equipes/spec.md` existe — plano
  feito direto a partir do pedido já esclarecido.

## Decisões assumidas (documentadas por não estarem no pedido original)

1. Chave primária de `equipes` e `colaboradores`: `id uuid` gerado por
   `gen_random_uuid()` (extensão `pgcrypto`, padrão no Supabase).
2. Ambas as tabelas ganham `criado_em` / `atualizado_em` (`timestamptz`,
   `DEFAULT now()`), nomes em português seguindo o padrão do resto do schema.
3. `colaboradores.email` e `colaboradores.cpf` são `NOT NULL UNIQUE`.
   `cpf` é armazenado **só com dígitos** (11 caracteres, sem máscara/pontuação)
   — a máscara é responsabilidade exclusiva do frontend (fora de escopo aqui).
4. `colaboradores.usuario_auth_id` é `uuid NULL UNIQUE` (unicidade parcial
   natural: Postgres permite múltiplos `NULL` sob `UNIQUE` comum, o que é
   exatamente o desejado já que a maioria dos colaboradores não tem conta).
5. `colaboradores.equipe_id` e `colaboradores.gestor_id` são `NULL`
   (colaborador pode existir temporariamente sem equipe/gestor definidos),
   com `ON DELETE SET NULL` em ambas as FKs — apagar uma equipe ou um gestor
   não deve quebrar nem cascatear a exclusão de colaboradores.
6. `colaboradores.cargo` é `varchar` livre, `NULL` (não obrigatório).
7. Regra dura papel↔auth é reforçada em DOIS níveis: aplicação (service) E
   banco (`CHECK` constraint), ver migration abaixo.
8. Casing do JSON de request/response das rotas desta task: **camelCase**
   (`nomeCompleto`, `equipeId`, `usuarioAuthId`, etc.), mapeado explicitamente
   a partir das colunas `snake_case` da entidade — é a primeira API real do
   projeto, então esta escolha vira convenção para os próximos módulos.
9. `DELETE` físico não existe para `colaboradores` nesta task (ver regra de
   inativação abaixo). Para `equipes`, `DELETE` físico é permitido (não há
   pedido de soft delete para equipes, e o `ON DELETE SET NULL` em
   `colaboradores.equipe_id` torna a operação seguro).

## Plano — Backend

### 1. backend-developer — ✅ concluído

Antes de codar: invocar a skill `backend-modulo-crud` (estrutura de pastas) e
a skill `backend-anonimizacao-respostas` (mesmo esta task não tocando
respostas/ciclos — ela define o "sinal de alerta" que se aplica ao endpoint
de listagem de colaboradores, ver regra de negócio crítica no fim desta
seção).

#### 1.1 Bootstrap do `backend/` (greenfield — obrigatório antes de tudo)

- `backend/tsconfig.json`: ajustar
  - `"types": ["node"]` (era `[]`).
  - Descomentar/definir `"rootDir": "./src"` e `"outDir": "./dist"`.
  - Adicionar `"experimentalDecorators": true` e `"emitDecoratorMetadata": true`
    (obrigatórios para os decorators do TypeORM — sem isso as entidades não
    funcionam em runtime mesmo compilando sem erro).
  - Manter `"module": "nodenext"` / `"target": "esnext"` como já está, já que
    `package.json` tem `"type": "commonjs"` (nodenext respeita isso e trata
    `.ts` como CommonJS).
- `backend/package.json`:
  - Adicionar dependência `cors` (+ `@types/cors` em dev) — sem CORS
    configurado, nenhuma chamada do `frontend/` a estas rotas funciona pelo
    browser. Instalação justificada pela necessidade clara do endpoint ser
    consumível.
  - **Não** instalar `zod`/`class-validator`: os campos desta task são
    poucos o bastante para validação manual em `src/common/validacao.ts`
    (ver 1.3). Se o `backend-developer` julgar mesmo assim que vale introduzir
    uma lib de validação, isso é uma decisão de projeto maior — registrar
    explicitamente no resumo da task, não decidir silenciosamente.
  - Scripts:
    ```
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "typeorm": "typeorm-ts-node-commonjs -d src/data-source.ts",
    "migration:generate": "npm run typeorm -- migration:generate",
    "migration:run": "npm run typeorm -- migration:run",
    "migration:revert": "npm run typeorm -- migration:revert"
    ```
- `backend/.gitignore`: remover a linha `.env.example` (mesmo ajuste já feito
  no frontend), mantendo `.env` ignorado.
- `backend/.env.example` (versionado, placeholders vazios):
  ```
  PORT=
  DATABASE_URL=
  SUPABASE_URL=
  SUPABASE_SERVICE_ROLE_KEY=
  ```
  `SUPABASE_SERVICE_ROLE_KEY` é a **service role key** (nunca a anon key do
  frontend, nunca deve vazar em log/response). `DATABASE_URL` é a connection
  string Postgres do Supabase (pooler), usada pelo TypeORM.
- `src/config/env.ts`: carrega `dotenv/config`, valida na inicialização que
  `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` existem —
  lança erro e derruba o processo no boot se algo faltar (fail fast), evita
  o server subir "quebrado". Exporta `env.port` (default `3333`).
- `src/data-source.ts`: `import 'reflect-metadata'` no topo; `new DataSource({ type: 'postgres', url: env.databaseUrl, ssl: { rejectUnauthorized: false }, synchronize: false, logging: process.env.NODE_ENV !== 'production', entities: [path.join(__dirname, 'modules/**/*.entity.{ts,js}')], migrations: [path.join(__dirname, 'migrations/*.{ts,js}')] })`.
- `src/lib/supabaseAdmin.ts`: `createClient(env.supabaseUrl, env.supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })` — cliente server-side com service role, usado só para `auth.admin.createUser`, `auth.admin.deleteUser`, `auth.resetPasswordForEmail` e `auth.getUser(token)` (validação de JWT no middleware). **Nunca** importar isso em código que possa ser exposto ao cliente.
- `src/app.ts`: monta o `express()` (json body parser, `cors({ origin: ... })` — origem lida de env, sem hardcode), monta os routers dos módulos (`/api/equipes`, `/api/colaboradores`) e por último o `tratadorErros` (middleware de erro de 4 argumentos precisa ser o último `app.use`). Exportado separado de `server.ts` para facilitar testes futuros do `test-engineer`.
- `src/server.ts`: `import 'reflect-metadata'`; inicializa `AppDataSource.initialize()`, depois `app.listen(env.port)`. Loga erro e `process.exit(1)` se a conexão falhar.

#### 1.2 Utilitários comuns (`src/common/`)

- `src/common/erro-http.ts`: `export class ErroHttp extends Error { constructor(public status: number, public codigo: string, mensagem: string) { super(mensagem) } }`.
- `src/common/autorizacao.ts`: `export function garantirPapel(colaborador: ColaboradorAutenticado, papeisPermitidos: PapelColaborador[]): void` — lança `new ErroHttp(403, 'PAPEL_NAO_AUTORIZADO', 'Acesso restrito a administradores e RH.')` se `colaborador.papel` não estiver na lista. **Esta é a checagem de papel centralizada exigida pela convenção do projeto**: é chamada como primeira linha de cada função exportada em `equipes.service.ts` e `colaboradores.service.ts` — nunca duplicada inline nos controllers/rotas.
- `src/common/cpf.ts`:
  - `export function normalizarCpf(valor: string): string` — remove tudo que não é dígito, retorna string de dígitos (não valida tamanho aqui).
  - `export function validarCpf(cpfDigitos: string): boolean` — exige exatamente 11 dígitos, rejeita sequências de dígito repetido (`00000000000`...`99999999999`), calcula os dois dígitos verificadores pelo algoritmo mod 11 padrão da Receita Federal e confere contra os dois últimos dígitos. Retorna `boolean` puro (sem lançar), quem chama decide o erro HTTP.
- `src/common/http-async.ts`: `export function asyncHandler(fn: RequestHandler): RequestHandler` — wrapper padrão para os controllers não precisarem de `try/catch` repetido; encaminha rejeições para `next(err)`.
- `src/types/express.d.ts`:
  ```ts
  export interface ColaboradorAutenticado {
    id: string
    papel: 'admin' | 'gestor_rh' | 'colaborador'
    nomeCompleto: string
    email: string
  }
  declare global {
    namespace Express {
      interface Request {
        colaboradorAutenticado?: ColaboradorAutenticado
      }
    }
  }
  ```

#### 1.3 Middlewares de autenticação e erro (`src/middlewares/`)

- `src/middlewares/autenticacao.ts` — `export async function autenticar(req, res, next)`:
  1. Lê header `Authorization: Bearer <token>`; ausente → `next(new ErroHttp(401, 'TOKEN_AUSENTE', 'Autenticação necessária.'))`.
  2. `const { data, error } = await supabaseAdmin.auth.getUser(token)`; erro/sem `data.user` → `next(new ErroHttp(401, 'TOKEN_INVALIDO', 'Sessão inválida ou expirada.'))`.
  3. Busca em `colaboradores` a linha com `usuario_auth_id = data.user.id` **e `ativo = true`**. Não encontrado → `next(new ErroHttp(403, 'COLABORADOR_NAO_VINCULADO', 'Usuário sem colaborador ativo vinculado.'))`. **Importante**: isso significa que inativar (`ativo = false`) um admin/gestor_rh bloqueia o acesso dele à API imediatamente, mesmo com a sessão Supabase ainda tecnicamente válida — é o comportamento esperado (defesa em profundidade), documentar isso no resumo da task.
  4. Preenche `req.colaboradorAutenticado = { id, papel, nomeCompleto: nome_completo, email }` e chama `next()`.
  - Este middleware é aplicado **apenas** nos routers de `equipes` e
    `colaboradores` desta task (`router.use(autenticar)` dentro de cada
    `*.module.ts`), **não globalmente** em `app.ts`. O fluxo público de
    resposta a pesquisa (link + CPF, sem login) é de outra task e **não deve
    reutilizar este middleware** — usa service role key + validação manual de
    token/CPF, conforme a skill/convenção do projeto.
- `src/middlewares/tratadorErros.ts` — middleware de erro (4 args, montado por último em `app.ts`):
  - `err instanceof ErroHttp` → `res.status(err.status).json({ erro: { codigo: err.codigo, mensagem: err.message } })`.
  - Erro de unicidade do Postgres não tratado a montante (`err.code === '23505'`) → mapear pelo nome da constraint (`err.constraint`) para `409` com `codigo` correspondente (`UQ_colaboradores_cpf` → `CPF_DUPLICADO`, `UQ_colaboradores_email` → `EMAIL_DUPLICADO`, `UQ_colaboradores_usuario_auth_id` → `USUARIO_AUTH_DUPLICADO`) — os nomes de constraint usados na migration (seção 1.4) precisam bater exatamente com esse mapeamento.
  - Qualquer outro erro → log completo no servidor (`console.error`), resposta `500 { erro: { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno do servidor.' } }` — nunca vazar stack/mensagem crua ao cliente.

#### 1.4 Migration — criação de `equipes` e `colaboradores`

Arquivo `src/migrations/<timestamp>-CriarEquipesEColaboradores.ts`, com `up`/`down`:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE papel_colaborador AS ENUM ('admin', 'gestor_rh', 'colaborador');

CREATE TABLE equipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome varchar(255) NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo varchar(255) NOT NULL,
  email varchar(255) NOT NULL,
  cpf char(11) NOT NULL,
  papel papel_colaborador NOT NULL DEFAULT 'colaborador',
  cargo varchar(255),
  equipe_id uuid REFERENCES equipes(id) ON DELETE SET NULL,
  gestor_id uuid REFERENCES colaboradores(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  usuario_auth_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_colaboradores_cpf UNIQUE (cpf),
  CONSTRAINT uq_colaboradores_email UNIQUE (email),
  CONSTRAINT uq_colaboradores_usuario_auth_id UNIQUE (usuario_auth_id),
  CONSTRAINT chk_colaboradores_cpf_formato CHECK (cpf ~ '^[0-9]{11}$'),
  CONSTRAINT chk_colaboradores_papel_auth CHECK (
    (papel = 'colaborador' AND usuario_auth_id IS NULL)
    OR (papel <> 'colaborador')
  )
);

CREATE INDEX idx_colaboradores_equipe_id ON colaboradores (equipe_id);
CREATE INDEX idx_colaboradores_gestor_id ON colaboradores (gestor_id);
CREATE INDEX idx_colaboradores_usuario_auth_id ON colaboradores (usuario_auth_id);
```

`down`: `DROP TABLE colaboradores`, `DROP TABLE equipes`, `DROP TYPE papel_colaborador` (nessa ordem, por causa da FK autorreferenciada em `colaboradores` e da dependência do enum `papel_colaborador`).

**Usar exatamente esses nomes de constraint** (`uq_colaboradores_cpf`,
`uq_colaboradores_email`, `uq_colaboradores_usuario_auth_id`) — o
`tratadorErros` (1.3) depende deles para gerar mensagens 409 corretas em vez
de vazar um 500 de violação de constraint.

#### 1.5 Módulo `equipes` (`src/modules/equipes/`)

- `equipe.entity.ts`: `@Entity('equipes')` — `id` (`@PrimaryGeneratedColumn('uuid')`), `nome` (`@Column({ type: 'varchar', length: 255 })`), `criadoEm` (`@CreateDateColumn({ name: 'criado_em' })`), `atualizadoEm` (`@UpdateDateColumn({ name: 'atualizado_em' })`).
- `dto/criar-equipe.dto.ts` / `dto/atualizar-equipe.dto.ts`: `{ nome: string }` — validação manual em `src/common/validacao.ts` (`validarTextoObrigatorio(valor, { campo: 'nome', min: 2, max: 255 })` reutilizável por outros módulos) lançando `ErroHttp(422, 'CAMPO_INVALIDO', ...)` com detalhe do campo.
- `equipes.service.ts` — cada função começa com `garantirPapel(ator, ['admin', 'gestor_rh'])`:
  - `criar(ator, dto)` → valida, insere, retorna entidade mapeada.
  - `listar(ator)` → `find()` simples, sem paginação/filtro nesta task (fora de escopo — não implementar filtros "adivinhados").
  - `buscarPorId(ator, id)` → `findOneBy({ id })`, não encontrado → `ErroHttp(404, 'EQUIPE_NAO_ENCONTRADA', ...)`.
  - `atualizar(ator, id, dto)` → mesma checagem de existência, valida `nome`, salva.
  - `remover(ator, id)` → checagem de existência, `delete` físico (ver decisão assumida 9 — `ON DELETE SET NULL` em `colaboradores.equipe_id` já cobre a integridade).
- `equipes.controller.ts`: um handler fino por rota, só faz parse de `req.params`/`req.body`, chama o service com `req.colaboradorAutenticado!`, responde com o shape mapeado (ver 1.7), usa `asyncHandler`.
- `equipes.module.ts`: `const router = Router(); router.use(autenticar); router.post('/', asyncHandler(criarEquipe)); router.get('/', ...); router.get('/:id', ...); router.put('/:id', ...); router.delete('/:id', ...); export { router as equipesRouter }`.

**Rotas** (todas exigem `Authorization: Bearer <jwt>` válido de um colaborador
`ativo` com papel `admin` ou `gestor_rh` — `colaborador` recebe `403`):

| Método | Rota | Papéis | Body | Sucesso |
|---|---|---|---|---|
| POST | `/api/equipes` | admin, gestor_rh | `{ nome }` | `201 { id, nome, criadoEm, atualizadoEm }` |
| GET | `/api/equipes` | admin, gestor_rh | — | `200 [ { id, nome, criadoEm, atualizadoEm } ]` |
| GET | `/api/equipes/:id` | admin, gestor_rh | — | `200 {...}` ou `404 EQUIPE_NAO_ENCONTRADA` |
| PUT | `/api/equipes/:id` | admin, gestor_rh | `{ nome }` | `200 {...}` ou `404` |
| DELETE | `/api/equipes/:id` | admin, gestor_rh | — | `204` ou `404` |

#### 1.6 Módulo `colaboradores` (`src/modules/colaboradores/`)

- `colaborador.entity.ts`: `@Entity('colaboradores')` com colunas mapeadas 1:1 à migration (`nomeCompleto` → `@Column({ name: 'nome_completo' })`, `cpf` → `@Column({ type: 'char', length: 11 })`, `papel` → `@Column({ type: 'enum', enum: PapelColaborador, enumName: 'papel_colaborador' })`, `cargo` nullable, `ativo` boolean default true, `usuarioAuthId` → `@Column({ name: 'usuario_auth_id', type: 'uuid', nullable: true })`, `criadoEm`/`atualizadoEm`), mais `@ManyToOne(() => Equipe, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'equipe_id' }) equipe: Equipe | null` e `@ManyToOne(() => Colaborador, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'gestor_id' }) gestor: Colaborador | null` (auto-referência).
- `PapelColaborador` enum TS com os 3 valores em `colaborador.entity.ts` (ou `src/common/enums.ts` se for reaproveitado por outros módulos futuros).

**DTOs (`dto/`, entrada em camelCase, ver decisão assumida 8):**
- `criar-colaborador.dto.ts`: `{ nomeCompleto: string; email: string; cpf: string; papel: 'admin' | 'gestor_rh' | 'colaborador'; cargo?: string; equipeId?: string; gestorId?: string }` — todos obrigatórios exceto `cargo`, `equipeId`, `gestorId`.
- `atualizar-colaborador.dto.ts`: mesmos campos, todos opcionais (update parcial) — **não inclui `ativo`** (rota própria, ver abaixo) e **ignora silenciosamente** qualquer `usuarioAuthId` recebido no body (campo gerenciado só pelo server).
- `atualizar-status-colaborador.dto.ts`: `{ ativo: boolean }` (obrigatório).

**Validações do service, nesta ordem, antes de qualquer escrita:**
1. `garantirPapel(ator, ['admin', 'gestor_rh'])`.
2. Campos obrigatórios presentes e formato básico (`nomeCompleto` min 2 chars, `email` casa com `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — mesmo regex já usado no frontend em `EsqueciSenhaModal.tsx`, manter consistência —, `papel` é um dos 3 valores válidos) → `422 CAMPO_INVALIDO`.
3. `cpf`: `normalizarCpf` → `validarCpf`; inválido → `422 CPF_INVALIDO`.
4. Checagem prévia de unicidade de `cpf` e `email` via `SELECT` (evita criar conta órfã no Supabase Auth por um erro que já era previsível) → `409 CPF_DUPLICADO` / `409 EMAIL_DUPLICADO`. A `UNIQUE` constraint do banco continua como defesa contra corrida (mapeada pelo `tratadorErros`, ver 1.3).
5. Se `equipeId` informado: existe em `equipes`? Não → `404 EQUIPE_NAO_ENCONTRADA`.
6. Se `gestorId` informado: existe em `colaboradores`? Não → `404 GESTOR_NAO_ENCONTRADO`. Em update, se `gestorId === id` do próprio registro → `422 GESTOR_INVALIDO` (não pode ser gestor de si mesmo). **Não implementar detecção de ciclo de gestores (A gerente de B, B gerente de A)** nesta task — não foi pedido; deixar como nota para o `backend-codereviewer` avaliar se vale abrir depois, não é bloqueante aqui.

**Regra dura papel → conta Supabase Auth (criação, `POST /api/colaboradores`):**
- Se `papel` é `admin` ou `gestor_rh`:
  1. `supabaseAdmin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { nome_completo: nomeCompleto } })` — **sem senha** (fica indefinida até o colaborador usar o link de definição de senha).
     - Se falhar porque o e-mail já existe no Supabase Auth (mas sem `colaboradores` vinculado — ex.: sobra de tentativa anterior) → `409 EMAIL_JA_REGISTRADO_AUTH`, **não** tentar contornar silenciosamente.
  2. Insere a linha em `colaboradores` com `usuario_auth_id = data.user.id`.
     - Se o INSERT falhar por qualquer motivo, **compensar**: chamar `supabaseAdmin.auth.admin.deleteUser(data.user.id)` para não deixar conta órfã no Auth, logar o erro original, responder `500 ERRO_INTERNO`.
  3. Só depois do INSERT confirmado, chamar `supabaseAdmin.auth.resetPasswordForEmail(email)` — **sem `redirectTo` explícito**, igual ao fluxo já existente em `frontend/src/components/EsqueciSenhaModal/EsqueciSenhaModal.tsx`. Se esse envio falhar, **não desfazer a criação** (a conta já existe e é válida) — apenas logar e devolver no corpo da resposta `emailDefinicaoSenhaEnviado: false` para o frontend poder avisar o admin.
- Se `papel` é `colaborador`: **nenhuma chamada à Supabase Auth API** — insere só a linha em `colaboradores` com `usuario_auth_id = null`. Isto é regra dura, não uma otimização: não criar conta de auth "por via das dúvidas".

**Regra dura papel → conta Supabase Auth (edição, `PUT /api/colaboradores/:id`):**
- **Promoção** (`colaborador` → `admin`/`gestor_rh`, ou seja `usuario_auth_id` atual é `null` e o novo `papel` não é `colaborador`): repete exatamente o fluxo de criação de conta acima (passos 1–3) antes de salvar o novo `papel` + `usuario_auth_id` na linha existente.
- **Rebaixamento** (`admin`/`gestor_rh` → `colaborador`, ou seja `usuario_auth_id` atual não é `null` e o novo `papel` é `colaborador`):
  1. Atualiza a linha: `papel = 'colaborador'`, `usuario_auth_id = null` (o `CHECK chk_colaboradores_papel_auth` da migration exige isso de qualquer forma).
  2. Chama `supabaseAdmin.auth.admin.deleteUser(usuarioAuthIdAntigo)` para remover de fato a conta órfã (higiene de segurança: alguém rebaixado a `colaborador` não deve reter uma credencial de login válida, mesmo que o middleware `autenticar` já bloqueasse o acesso dela por falta de vínculo). Se essa chamada falhar (ex.: rede), **não falhar a atualização do colaborador** — a linha em `colaboradores` já é a fonte de verdade e deve ser salva de qualquer forma; logar com prefixo `[LIMPEZA_AUTH_PENDENTE]` para tratamento manual posterior.
- **Troca lateral** (`admin` ↔ `gestor_rh`, ambos já têm `usuario_auth_id`): só atualiza a coluna `papel`, nenhuma chamada à Auth API.
- Demais campos (`nomeCompleto`, `email`, `cpf`, `cargo`, `equipeId`, `gestorId`) seguem as mesmas validações da criação (unicidade excluindo o próprio `id` no caso de `email`/`cpf`).

**Inativação/reativação (soft delete — não existe `DELETE` para colaboradores):**
- `PATCH /api/colaboradores/:id/status`, body `{ ativo: boolean }` → atualiza só a coluna `ativo`. Não dispara nenhuma chamada à Supabase Auth (a conta de auth continua existindo mesmo com `ativo = false` — quem bloqueia o acesso é o middleware `autenticar`, que exige `ativo = true` para resolver `req.colaboradorAutenticado`, ver 1.3). Retorna `200` com o registro atualizado, ou `404 COLABORADOR_NAO_ENCONTRADO`.
- Não criar rota `DELETE /api/colaboradores/:id` nesta task — decisão explícita, não esquecimento.

**Listagem — shape de resposta exato (`GET /api/colaboradores` e `GET /api/colaboradores/:id`):**
Fazer `LEFT JOIN` com `equipes` e com o próprio `colaboradores` (alias `gestor`) para trazer nome, nunca só os ids:
```json
{
  "id": "uuid",
  "nomeCompleto": "string",
  "email": "string",
  "cpf": "12345678901",
  "papel": "admin | gestor_rh | colaborador",
  "cargo": "string | null",
  "ativo": true,
  "equipe": { "id": "uuid", "nome": "string" } | null,
  "gestor": { "id": "uuid", "nomeCompleto": "string" } | null,
  "usuarioAuthId": "uuid | null",
  "criadoEm": "ISO 8601",
  "atualizadoEm": "ISO 8601"
}
```
`GET /api/colaboradores` retorna `200 [ {...acima...} ]` — lista completa, sem
paginação/filtro nesta task (mesma decisão de `equipes`, não implementar
filtros não pedidos). `POST`/`PUT` retornam o mesmo shape (`201`/`200`); o
`POST` de `admin`/`gestor_rh` inclui também `"emailDefinicaoSenhaEnviado": boolean`
no corpo, conforme descrito acima.

**Tabela de rotas:**

| Método | Rota | Papéis | Observação |
|---|---|---|---|
| POST | `/api/colaboradores` | admin, gestor_rh | Cria conta Auth só se `papel` ≠ `colaborador` |
| GET | `/api/colaboradores` | admin, gestor_rh | Shape acima, com `equipe`/`gestor` por nome |
| GET | `/api/colaboradores/:id` | admin, gestor_rh | `404 COLABORADOR_NAO_ENCONTRADO` |
| PUT | `/api/colaboradores/:id` | admin, gestor_rh | Aplica regra de promoção/rebaixamento acima |
| PATCH | `/api/colaboradores/:id/status` | admin, gestor_rh | `{ ativo }`, soft delete/reativação |

#### 1.7 Guard rail de anonimização (aplica-se mesmo esta task não tocando respostas/ciclos)

- **Não** criar, nesta task, nenhum endpoint que exponha vínculo
  avaliador→avaliado (isso pertence a `relacionamentos_avaliacao`, fora de
  escopo aqui).
- `GET /api/colaboradores` e `GET /api/colaboradores/:id` são estritamente
  `admin`/`gestor_rh` — um `colaborador` comum não pode nem listar
  colegas/estrutura organizacional através dessas rotas (o middleware
  `autenticar` já bloqueia `colaborador` de ter uma sessão útil aqui, já que
  ele nunca tem `usuario_auth_id`; ainda assim `garantirPapel` no service é a
  segunda camada de defesa, redundante de propósito).
- Não adicionar "atalhos" tipo endpoint público `/api/colaboradores/meu-perfil`
  ou `/api/colaboradores/minha-equipe` nesta task — não foi pedido e abriria
  superfície nova sem spec.

Ao terminar: rodar `npm run build` (tsc) dentro de `backend/` e confirmar que
compila sem erros antes de marcar a etapa concluída; registrar no resumo da
task quais migrations precisam ser rodadas (`npm run migration:run`) e
confirmar que nenhuma foi executada contra um banco real sem confirmação do
usuário.

**Resumo da implementação**

Skills invocadas antes de codar: `backend-modulo-crud` e
`backend-anonimizacao-respostas` (ambas via `Skill` tool, conforme exigido).

`npm run build` (tsc) executado com sucesso, sem erros, ao final da
implementação (`dist/` gerado e depois removido — artefato de build, não
versionado, `.gitignore` atualizado para ignorá-lo).

**1.1 Bootstrap**
- `backend/tsconfig.json`: `types: ["node"]`, `rootDir`/`outDir` definidos
  (`./src` / `./dist`), `experimentalDecorators`/`emitDecoratorMetadata`
  adicionados. **Desvio necessário não previsto no plano**:
  `verbatimModuleSyntax` (já `true` no arquivo original) teve que ser
  desligado (`false`) — com `module: "nodenext"` + `package.json` `"type":
  "commonjs"`, essa flag proíbe (`TS1295`) a sintaxe padrão `import`/`export`
  em arquivos resolvidos como CommonJS (ela preserva a sintaxe ESM ao invés
  de convertê-la para `require`/`module.exports`). Sem desligar, nenhum
  arquivo do módulo compilava. `module`/`target` mantidos em `nodenext`/
  `esnext` como o plano pediu.
- `backend/package.json`: adicionadas dependências `cors` + `@types/cors`
  (via `npm install`, justificado pela necessidade de CORS para o
  `frontend/` consumir a API); scripts `dev`/`build`/`start`/`typeorm`/
  `migration:generate`/`migration:run`/`migration:revert` adicionados
  exatamente como especificado. Nenhuma lib de validação (`zod`/
  `class-validator`) foi introduzida — validação manual em
  `src/common/validacao.ts`, `src/common/cpf.ts`, conforme decisão do plano.
- `backend/.gitignore`: removida a linha `.env.example` (agora versionável);
  adicionada `dist/` (artefato de build, decisão adicional não pedida
  explicitamente mas necessária já que `outDir` passou a existir).
- `backend/.env.example` criado com `PORT`, `DATABASE_URL`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` (todos vazios) e mais `CORS_ORIGIN` (não estava
  na lista do plano, mas é necessário para `cors({ origin: ... })` ler de
  env sem hardcode conforme a própria seção 1.1 pede; `src/config/env.ts`
  trata `CORS_ORIGIN` como opcional com default `http://localhost:5173`,
  não faz parte do fail-fast das 3 variáveis obrigatórias).
- Criados: `src/config/env.ts` (fail-fast nas 3 variáveis obrigatórias),
  `src/data-source.ts`, `src/lib/supabaseAdmin.ts`, `src/app.ts`,
  `src/server.ts` — exatamente como descrito no plano.

**1.2/1.3 Comuns e middlewares**
- Criados `src/common/erro-http.ts`, `src/common/autorizacao.ts`
  (`garantirPapel`), `src/common/cpf.ts` (`normalizarCpf`/`validarCpf` com
  mod 11 completo, testado mentalmente com CPF válido conhecido
  529.982.247-25), `src/common/http-async.ts` (`asyncHandler`),
  `src/common/validacao.ts` (`validarTextoObrigatorio`/`validarEmail`/
  `validarEnum`, reaproveitado por `equipes` e `colaboradores`),
  `src/types/express.d.ts` (`ColaboradorAutenticado`).
- Adicional não previsto no plano: `src/common/http-params.ts`
  (`obterParametroRota`) — necessário porque os tipos do Express 5
  (`@types/express` ^5.0.6) tipam `req.params[x]` como `string | string[]`
  (rotas com parâmetros repetidos), o que quebrava a compilação em todo
  handler que usava `req.params.id!` diretamente contra um service que
  espera `string`. A função valida em runtime que o parâmetro é uma string
  não vazia e lança `400 PARAMETRO_INVALIDO` caso contrário.
- Adicional não previsto no plano: `src/common/enums.ts`
  (`PapelColaborador` como union type + `PAPEL_COLABORADOR_VALORES` como
  array de runtime) — o plano sugeria colocar o enum em
  `colaborador.entity.ts` ou em `common/enums.ts` "se reaproveitado por
  outros módulos"; optei por `common/enums.ts` desde já porque
  `common/autorizacao.ts` e `types/express.d.ts` também precisam do tipo, e
  colocá-lo em `colaborador.entity.ts` criaria uma dependência de
  `common/` → `modules/colaboradores/`, invertendo a direção esperada de
  dependências do projeto. Usei um union type (`'admin' | 'gestor_rh' |
  'colaborador'`) + array de valores para a coluna `enum` do TypeORM, em vez
  de um TS `enum` de fato, para evitar atrito de tipos entre o enum nominal
  e o union literal usado em `ColaboradorAutenticado.papel`/DTOs — o valor
  runtime e o formato Postgres (`papel_colaborador`) são idênticos ao que o
  plano pedia.
- `src/middlewares/autenticacao.ts` e `src/middlewares/tratadorErros.ts`
  implementados exatamente como descrito, incluindo o mapeamento de
  `err.constraint` → código 409 (`uq_colaboradores_cpf` → `CPF_DUPLICADO`,
  `uq_colaboradores_email` → `EMAIL_DUPLICADO`,
  `uq_colaboradores_usuario_auth_id` → `USUARIO_AUTH_DUPLICADO`) e a
  checagem `ativo = true` no middleware (confirmado: inativar um
  admin/gestor_rh bloqueia o acesso dele imediatamente, mesmo com JWT
  Supabase ainda válido — comportamento esperado, defesa em profundidade).
  `autenticar` é montado só dentro de cada `*.module.ts`
  (`router.use(autenticar)`), nunca em `app.ts`.

**1.4 Migration**
- `src/migrations/1788268503083-CriarEquipesEColaboradores.ts` — `up`/`down`
  com o SQL exatamente como especificado no plano (extensão `pgcrypto`, enum
  `papel_colaborador`, tabelas `equipes`/`colaboradores`, `CHECK
  chk_colaboradores_papel_auth`, constraints `uq_colaboradores_cpf`/
  `uq_colaboradores_email`/`uq_colaboradores_usuario_auth_id` com os nomes
  exatos exigidos pelo `tratadorErros`, índices). **Migration NÃO foi
  executada contra nenhum banco** — nenhum `DATABASE_URL` real foi
  configurado nesta sessão e nenhuma confirmação do usuário foi pedida/dada
  para rodar contra um banco. Para aplicar: configurar `backend/.env` com
  `DATABASE_URL`/`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` reais e rodar
  `npm run migration:run` dentro de `backend/`.

**1.5 Módulo `equipes`**
- `equipe.entity.ts`, `dto/criar-equipe.dto.ts`, `dto/atualizar-equipe.dto.ts`,
  `equipes.service.ts` (todas as 5 funções exportadas iniciam com
  `garantirPapel(ator, ['admin', 'gestor_rh'])`), `equipes.controller.ts`,
  `equipes.module.ts` — rotas `POST/GET/GET :id/PUT :id/DELETE :id` em
  `/api/equipes`, exatamente como especificado. `DELETE` é físico, apoiado no
  `ON DELETE SET NULL` de `colaboradores.equipe_id` da migration.

**1.6 Módulo `colaboradores`**
- `colaborador.entity.ts`: colunas mapeadas 1:1 à migration, incluindo
  colunas escalares `equipeId`/`gestorId` lado a lado com as relações
  `equipe`/`gestor` (`@ManyToOne` + `@JoinColumn` apontando para a mesma
  coluna) — padrão TypeORM padrão para poder setar a FK sem carregar a
  relação inteira.
- DTOs `criar-colaborador.dto.ts`, `atualizar-colaborador.dto.ts` (sem
  `ativo`; `usuarioAuthId` não existe no tipo — logo nunca é lido do body,
  ignorado por construção, não por checagem explícita),
  `atualizar-status-colaborador.dto.ts`.
- `colaboradores.service.ts`: as 5 funções exportadas (`criar`, `listar`,
  `buscarPorId`, `atualizar`, `atualizarStatus`) iniciam com `garantirPapel`.
  Ordem de validação de `criar` segue exatamente o plano: campos
  obrigatórios/formato → CPF (normalizar + mod 11) → unicidade CPF/e-mail
  via `SELECT` prévio → existência de `equipeId` → existência/self-check de
  `gestorId`.
  - **Ponto único de decisão papel↔auth**: função privada
    `deveTerContaAuth(papel)` (`true` só para `admin`/`gestor_rh`) — é a
    única condição usada nos 3 pontos de chamada à Supabase Auth Admin API
    (`criarContaAuth`/`enviarDefinicaoSenha` gated por
    `deveTerContaAuth(papel)` na criação e por
    `!contaAtualExiste && contaNovaNecessaria` na promoção;
    `removerContaAuthPorRebaixamento` gated por
    `contaAtualExiste && !contaNovaNecessaria`). Busquei no arquivo final
    todas as ocorrências de `createUser`/`resetPasswordForEmail`/
    `deleteUser`: aparecem só dentro dessas funções auxiliares, cada uma
    com exatamente um call site em cada helper, nunca chamadas soltas.
    `papel === 'colaborador'` nunca passa por nenhum desses caminhos.
  - Compensação de conta órfã (`compensarContaAuthOrfa`) implementada tanto
    na criação quanto na promoção (`PUT`), chamando `deleteUser` e
    relançando `500 ERRO_INTERNO` se o INSERT/UPDATE falhar depois do
    `createUser`.
  - Rebaixamento salva a linha primeiro (papel = `colaborador`,
    `usuario_auth_id = null`) e só depois tenta `deleteUser` — falha nessa
    chamada é só logada com prefixo `[LIMPEZA_AUTH_PENDENTE]`, nunca derruba
    a resposta.
  - Troca lateral (`admin` ↔ `gestor_rh`) só atualiza a coluna `papel`, sem
    nenhuma chamada à Auth API.
  - `PATCH /:id/status` não chama Auth API (só a coluna `ativo`).
  - Listagem/detalhe fazem `relations: { equipe: true, gestor: true }` e
    mapeiam para `{ id, nome }`/`{ id, nomeCompleto }` — nunca `equipeId`/
    `gestorId` crus na resposta.
  - Detecção de ciclo de gestores (A gerente de B, B gerente de A) **não foi
    implementada**, conforme o plano já previa explicitamente como não
    bloqueante nesta task.
- `colaboradores.controller.ts`, `colaboradores.module.ts`: rotas
  `POST/GET/GET :id/PUT :id/PATCH :id/status` em `/api/colaboradores`. **Sem
  rota `DELETE`**, conforme decisão explícita do plano.

**1.7 Guard rail de anonimização**
- Nenhum endpoint novo expõe `avaliador_id` ou junta `itens_resposta` com
  `relacionamentos_avaliacao` — esta task não tocou nenhuma dessas tabelas.
- `GET /api/colaboradores` e `GET /api/colaboradores/:id` exigem
  `autenticar` + `garantirPapel(['admin','gestor_rh'])` — `colaborador`
  nunca acessa (e, por definição, nunca teria uma sessão Supabase válida de
  qualquer forma, já que nunca tem `usuario_auth_id`).
- Nenhum atalho tipo `/meu-perfil` ou `/minha-equipe` foi criado dentro do
  módulo `colaboradores` — ver ajuste de escopo abaixo para o único
  endpoint adicional desta implementação.

**Ajuste de escopo decidido pelo orquestrador: `GET /api/auth/me`**

Não previsto no plano original — adicionado a pedido explícito do
orquestrador para destravar o guard de rota do frontend (que precisa saber
o papel do usuário logado). Implementado como módulo próprio
`src/modules/auth/` (`auth.service.ts`, `auth.controller.ts`,
`auth.module.ts`), montado em `app.ts` como `/api/auth`, usando o mesmo
middleware `autenticar` das demais rotas (nunca uma cópia). Retorna
`200 { id, nomeCompleto, email, papel, ativo }` — só o registro do próprio
chamador (`req.colaboradorAutenticado`, nunca aceita `:id` de terceiros,
nunca lista), sem `cpf`, sem `equipe`/`gestor`, sem qualquer vínculo
avaliador→avaliado. `ativo: true` é retornado sem nova consulta ao banco
porque o middleware `autenticar` só preenche `req.colaboradorAutenticado`
quando o colaborador vinculado tem `ativo = true` — logicamente garantido
pela mesma query que já roda em toda rota protegida. Não abre acesso a
`colaborador` comum, que nunca tem `usuario_auth_id` e portanto nunca passa
pelo `autenticar`. Justificativa completa também comentada em
`src/modules/auth/auth.service.ts`.

**O que ficou fora / decisões registradas**
- Nenhuma migration foi executada contra um banco real (sem `DATABASE_URL`
  configurado nesta sessão, sem confirmação do usuário).
- `verbatimModuleSyntax` desligado no `tsconfig.json` (ver 1.1) — desvio
  necessário para compilar com a sintaxe `import`/`export` padrão do resto
  do módulo.
- `dist/` adicionado ao `.gitignore` (consequência de `outDir` agora
  definido).
- `src/common/http-params.ts` e `src/common/enums.ts` são adicionais de
  suporte não literalmente listados no plano, mas necessários para a
  implementação descrita compilar com os tipos estritos já configurados no
  `tsconfig.json` (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
  — não introduzem nenhuma regra de negócio nova.
- Não foi criada nenhuma rota `DELETE /api/colaboradores/:id`, nenhum filtro/
  paginação em `GET /api/equipes` ou `GET /api/colaboradores`, nenhuma
  detecção de ciclo de gestores — todos conforme decisões explícitas do
  plano.

### 2. backend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Regra dura papel↔auth**: `colaborador` nunca gera chamada à Supabase
   Auth Admin API (nem em criação, nem em edição); `admin`/`gestor_rh` sempre
   geram `createUser` + `resetPasswordForEmail` na criação, e o fluxo de
   promoção/rebaixamento descrito em 1.6 é seguido à risca (incluindo o
   `deleteUser` de compensação em caso de falha do INSERT, e o `deleteUser`
   de higiene no rebaixamento sem derrubar a atualização se ele falhar).
2. **CHECK `chk_colaboradores_papel_auth`** realmente existe na migration e
   bate com a regra de aplicação (dupla defesa, não só uma das duas).
3. **CPF**: normalizado (só dígitos) antes de validar/salvar; algoritmo mod
   11 implementado corretamente (testar mentalmente com um CPF válido
   conhecido e um inválido); sequências repetidas rejeitadas; unicidade
   verificada por `SELECT` prévio **e** pela `UNIQUE` constraint + mapeamento
   no `tratadorErros` (nenhuma duplicidade deve virar `500`).
4. **Nenhuma rota nova é acessível por `colaborador`** — conferir que
   `autenticar` está montado nos dois routers e que `garantirPapel` está de
   fato na primeira linha de cada função de `equipes.service.ts` e
   `colaboradores.service.ts` (não só em alguns métodos).
5. **`ativo = false` bloqueia acesso via `autenticar`** mesmo com JWT
   Supabase ainda válido — conferir que a query do middleware filtra
   `ativo = true`.
6. **Listagem de colaboradores** retorna `equipe`/`gestor` como objeto
   `{ id, nome }`/`{ id, nomeCompleto }`, nunca só `equipeId`/`gestorId` crus.
7. **`DELETE` não existe para `colaboradores`** (só `PATCH .../status`); para
   `equipes`, `DELETE` é físico e depende do `ON DELETE SET NULL` da FK —
   conferir que a migration realmente define isso, senão apagar uma equipe
   com colaboradores vinculados vai falhar com erro de FK não tratado.
8. **Nenhum endpoint novo expõe `avaliador_id` ou vínculo
   avaliador→avaliado** — esta task não deveria ter tocado nada relacionado a
   `relacionamentos_avaliacao`/`respostas`; se algo assim aparecer, é achado
   crítico.
9. **Casing consistente**: entidades/colunas em `snake_case` batendo com a
   migration, JSON de request/response em `camelCase` mapeado explicitamente
   (não vazando nomes de coluna crus tipo `nome_completo` na resposta).
10. **Env/segredos**: `SUPABASE_SERVICE_ROLE_KEY` só é lida via
    `process.env` dentro de `src/lib/supabaseAdmin.ts` (nunca hardcoded, nunca
    logada); `.env` real não commitado; `.env.example` versionado com
    placeholders vazios; `.gitignore` do backend não ignora mais
    `.env.example`.
11. **tsconfig**: `experimentalDecorators`/`emitDecoratorMetadata` presentes
    (sem isso os testes do `test-engineer` provavelmente vão falhar de forma
    confusa, não por erro de lógica).

## Revisão

Revisão feita por leitura direta de todos os arquivos em `backend/src/**`
tocados pela etapa 1 (não há `git diff` disponível para este agente — leitura
integral do estado atual de cada arquivo). Cobertura: bootstrap
(`tsconfig.json`, `.gitignore`, `.env.example`, `env.ts`, `data-source.ts`,
`app.ts`, `server.ts`, `supabaseAdmin.ts`), comuns/middlewares
(`erro-http.ts`, `autorizacao.ts`, `cpf.ts`, `validacao.ts`, `enums.ts`,
`http-async.ts`, `http-params.ts`, `autenticacao.ts`, `tratadorErros.ts`),
migration, os dois módulos (`equipes`, `colaboradores`, incluindo
entities/DTOs/services/controllers/routers) e o módulo `auth` adicionado fora
do plano original.

**Sem achados críticos.** A task pode seguir para os testes automatizados
depois de uma correção rápida do item 1 de "Deveria corrigir" (não bloqueia
por si só a etapa de anonimização/controle de acesso, mas é um bug de
contrato que o `test-engineer` provavelmente vai expor de qualquer forma se
escrever um teste de "limpar vínculo").

### Checklist de prioridade máxima — resultado

1. **Colaborador comum nunca tem conta de auth criada — CONFIRMADO.**
   `grep` de todas as ocorrências de `createUser` / `resetPasswordForEmail` /
   `deleteUser` em `backend/src/**` mostra exatamente 3 call sites, todos
   dentro de `colaboradores.service.ts`, todos encapsulados nas funções
   auxiliares `criarContaAuth` / `enviarDefinicaoSenha` /
   `compensarContaAuthOrfa` / `removerContaAuthPorRebaixamento`, e todos
   esses helpers só são chamados a partir de pontos gated por
   `deveTerContaAuth(papel)` (`true` apenas para `admin`/`gestor_rh`) — na
   criação (`criar`), na promoção (`!contaAtualExiste && contaNovaNecessaria`
   dentro de `atualizar`) e no rebaixamento
   (`contaAtualExiste && !contaNovaNecessaria`). Não há nenhum `save()` que
   aceite `usuarioAuthId` vindo direto do body: `AtualizarColaboradorDto` nem
   declara o campo `usuarioAuthId`, e `CriarColaboradorDto` também não —
   `usuarioAuthId` só é atribuído internamente pelo resultado de
   `criarContaAuth`/`null`. `chk_colaboradores_papel_auth` na migration
   reforça a mesma regra no banco (ver item 2 do checklist original,
   confirmado abaixo). Nenhum caminho de escape encontrado.
2. **Controle de acesso — CONFIRMADO.** `garantirPapel(ator, [...PAPEIS_COM_ACESSO])`
   é literalmente a primeira instrução de todas as 5 funções exportadas de
   `colaboradores.service.ts` (`criar`, `listar`, `buscarPorId`, `atualizar`,
   `atualizarStatus`) e das 5 funções de `equipes.service.ts` (`criar`,
   `listar`, `buscarPorId`, `atualizar`, `remover`). `autenticar` é montado
   via `router.use(autenticar)` dentro de `equipes.module.ts`,
   `colaboradores.module.ts` e também `auth.module.ts` — não está montado
   globalmente em `app.ts` (que só monta `cors`, `express.json()`, os três
   routers e por último `tratadorErros`). `GET /api/auth/me`
   (`auth.controller.ts` → `authService.meuPerfil(req.colaboradorAutenticado!)`)
   nunca lê `req.params`, não tem rota com `:id`, retorna só
   `{ id, nomeCompleto, email, papel, ativo }` do próprio chamador — sem
   `cpf`, sem `equipe`/`gestor`, sem enumeração possível (não há como pedir o
   perfil de outra pessoa por essa rota).
3. **CPF — algoritmo confirmado correto**, testado manualmente com o CPF
   529.982.247-25 (válido): dígitos verificadores batem exatamente com o
   mod 11 padrão da Receita (pesos 10→2 e 11→2, resto <2 → 0, senão 11-resto).
   Sequências repetidas rejeitadas via `/^(\d)\1{10}$/`. Normalização
   (`normalizarCpf`, remove tudo que não é dígito) é aplicada tanto na
   criação quanto na edição antes de checar unicidade e antes de salvar — um
   CPF mascarado (`529.982.247-25`) não dribla o `UNIQUE`, porque o valor
   persistido e comparado é sempre só dígitos. `UNIQUE (cpf)` presente na
   migration (`uq_colaboradores_cpf`) e o `tratadorErros` mapeia
   `err.code === '23505'` + `err.constraint === 'uq_colaboradores_cpf'` para
   `409 CPF_DUPLICADO` (nunca 500). Ver também achado "Deveria corrigir" #2
   abaixo sobre um gap de tipagem de entrada nesse mesmo fluxo.
4. **Segredos — CONFIRMADO.** `SUPABASE_SERVICE_ROLE_KEY` só é lida via
   `process.env` dentro de `src/config/env.ts` (fail-fast) e usada só em
   `src/lib/supabaseAdmin.ts`; nunca logada, nunca hardcoded, nunca
   retornada em nenhuma resposta de erro (`tratadorErros` só expõe
   `codigo`/`mensagem` estáticos, nunca o objeto de erro cru do Supabase).
   `backend/.env` real não existe no repo (confirmado por glob). `.env.example`
   está versionado com os 5 placeholders vazios (`PORT`, `DATABASE_URL`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGIN`), e
   `backend/.gitignore` não ignora mais `.env.example` (só `node_modules/`,
   `.env`, `dist/`, `*.log`).
5. **Guard rail de anonimização — CONFIRMADO.** Nenhum arquivo em
   `backend/src/**` referencia `relacionamentos_avaliacao`, `itens_resposta`
   ou `avaliador_id` (`grep` sem resultados). `GET /api/colaboradores` e
   `GET /api/colaboradores/:id` exigem `autenticar` + `garantirPapel(['admin','gestor_rh'])`;
   não há rota `/meu-perfil` ou `/minha-equipe` dentro do módulo
   `colaboradores` — o único endpoint "próprio" adicionado
   (`GET /api/auth/me`) vive em módulo separado e não expõe `equipe`/`gestor`
   nem `cpf`.

### Duas perguntas do orquestrador

**1. O service distingue `equipeId: null` / `gestorId: null` (limpar) de
campo omitido em `PUT /api/colaboradores/:id`?**

**Não — é um bug de contrato real**, classificado abaixo em "Deveria
corrigir". Em `colaboradores.service.ts`, `atualizar()` usa
`if (dto.equipeId !== undefined) { await garantirEquipeExiste(dto.equipeId); colaborador.equipeId = dto.equipeId }`
(mesmo padrão para `gestorId`). Como `AtualizarColaboradorDto` tipa
`equipeId?: string` (sem `| null`), o guard `!== undefined` é o único
tratado — mas em runtime (JSON não é tipado), se o frontend enviar
`{ "equipeId": null }`, essa condição também é verdadeira (`null !== undefined`),
então o código tenta validar `null` como se fosse um id real:
`garantirEquipeExiste(null)` chama `repositorioEquipe().findOneBy({ id: null })`,
que o TypeORM traduz para `WHERE id IS NULL` — nunca encontra nada — e
lança `404 EQUIPE_NAO_ENCONTRADA` em vez de limpar o vínculo. Mesmo problema
idêntico para `gestorId: null` → `404 GESTOR_NAO_ENCONTRADO` (o self-check
`gestorId === idProprioRegistro` não intercepta antes, já que `null !== id`).
Resultado: hoje é **impossível** desvincular um colaborador de sua equipe ou
gestor via `PUT` — todo envio de `null` explícito vira um 404 incorreto em
vez de um clear. Recomendo alinhar o contrato explicitamente (ex.: aceitar
`string | null | undefined` nos dois campos do DTO e, no service, tratar três
estados: omitido → não mexe; `null` → seta a coluna para `null` sem chamar
`garantirEquipeExiste`/`garantirGestorValido`; string não vazia → valida
existência e seta).

**2. Qual é o envelope de erro real do `tratadorErros`?**

`{ erro: { codigo, mensagem } }` — **sempre aninhado sob a chave `erro`**,
nunca `{ codigo, mensagem }` na raiz. Confirmado nos três branches de
`src/middlewares/tratadorErros.ts`: erro de aplicação
(`err instanceof ErroHttp` → `res.status(err.status).json({ erro: { codigo: err.codigo, mensagem: err.message } })`),
violação de unicidade do Postgres mapeada (`res.status(409).json({ erro: { codigo, mensagem: 'Registro duplicado.' } })`)
e o catch-all (`res.status(500).json({ erro: { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno do servidor.' } })`).
O parsing defensivo do frontend (aceitando os dois formatos) pode ser
simplificado para assumir sempre o formato aninhado.

### Conformidade com CLAUDE.md

- `@Entity('equipes')` / `@Entity('colaboradores')` e nomes de coluna
  (`@Column({ name: 'nome_completo' })`, `equipe_id`, `gestor_id`,
  `usuario_auth_id`, `criado_em`, `atualizado_em`) batem exatamente com a
  migration — sem tradução para inglês, sem nome inventado.
  `enum: PAPEL_COLABORADOR_VALORES, enumName: 'papel_colaborador'` bate com
  `CREATE TYPE papel_colaborador AS ENUM ('admin', 'gestor_rh', 'colaborador')`
  da migration.
  - Nota (não bloqueante): o plano sugeria um TS `enum` nominal para
    `PapelColaborador`; a implementação optou por union type + array de
    runtime (`src/common/enums.ts`), justificado no resumo da task para
    evitar atrito de tipos com `ColaboradorAutenticado.papel`. Efeito
    observável idêntico ao pedido (mesmos 3 valores em português no banco e
    na aplicação) — decisão de estilo aceitável, registrada explicitamente
    como desvio, não um achado.
- `synchronize: false` explícito em `data-source.ts` — confirmado que não há
  `synchronize: true` em nenhum lugar do módulo.
- Migration `1788268503083-CriarEquipesEColaboradores.ts` tem `up` (criação
  completa: extensão, enum, duas tabelas, constraints, índices) e `down`
  (`DROP TABLE colaboradores`, `DROP TABLE equipes`, `DROP TYPE papel_colaborador`,
  nessa ordem — respeita a FK autorreferenciada e a dependência do enum).
- Nenhuma ocorrência de `organization_id` ou qualquer campo de
  multi-tenancy em nenhum arquivo (`grep` sem resultados fora deste
  parágrafo de revisão).

### Crítico

Nenhum achado crítico.

### Deveria corrigir

1. **`PUT /api/colaboradores/:id` não limpa `equipeId`/`gestorId` quando o
   corpo envia `null` — trata como se fosse um id real e responde `404`
   (`EQUIPE_NAO_ENCONTRADA` / `GESTOR_NAO_ENCONTRADO`) em vez de desvincular.**
   Local: `backend/src/modules/colaboradores/colaboradores.service.ts`
   (bloco `if (dto.equipeId !== undefined) { ... }` /
   `if (dto.gestorId !== undefined) { ... }` dentro de `atualizar()`) e o
   tipo `AtualizarColaboradorDto` em
   `backend/src/modules/colaboradores/dto/atualizar-colaborador.dto.ts`
   (declara `equipeId?: string` / `gestorId?: string`, sem `| null`, então o
   próprio tipo não documenta a intenção de "limpar"). Ver resposta completa
   à pergunta 1 acima para o comportamento exato e uma sugestão de correção.
   Isso é um bug de contrato entre backend e frontend (não uma falha de
   anonimização/segurança), mas bloqueia um caso de uso legítimo (desvincular
   colaborador de equipe/gestor) descrito implicitamente pela decisão
   assumida 5 do plano ("colaborador pode existir temporariamente sem
   equipe/gestor definidos").
2. **`normalizarCpf` não valida `typeof` antes de operar, diferente dos
   demais validadores do módulo.** Em `criar()`,
   `normalizarCpf(dto.cpf ?? '')` só trata `undefined`/`null` via `??` —- se
   `dto.cpf` vier como número no JSON (ex.: `123456789`), `normalizarCpf`
   chama `.replace` sobre um valor não-string e lança um `TypeError` não
   tratado, que cai no branch genérico do `tratadorErros` e vira
   `500 ERRO_INTERNO` em vez de `422 CPF_INVALIDO`. O mesmo ocorre em
   `atualizar()` (`normalizarCpf(dto.cpf)` sem guarda quando
   `dto.cpf !== undefined`). Os demais campos (`nomeCompleto`, `email`,
   `papel`) não têm esse problema porque `validarTextoObrigatorio`/
   `validarEmail`/`validarEnum` checam `typeof valor !== 'string'` antes de
   qualquer operação. Sugiro que `normalizarCpf`/o ponto de chamada faça a
   mesma checagem de tipo antes de chamar `.replace`, para manter a garantia
   "nenhuma duplicidade/entrada previsível deve virar 500" também para
   entradas de tipo errado, não só para duplicidade.
   Local: `backend/src/common/cpf.ts` (`normalizarCpf`) e call sites em
   `backend/src/modules/colaboradores/colaboradores.service.ts` (linhas do
   bloco `validarCamposObrigatorios` e do bloco de CPF dentro de
   `atualizar()`).

### Sugestão

1. `atualizarStatus()` consulta o banco (`repositorio().findOneBy({ id })`)
   antes de validar `typeof dto.ativo !== 'boolean'`. Inverter a ordem
   (validar o corpo antes de tocar o banco) evita uma query desnecessária em
   requests malformados — não é um bug, só uma pequena melhora de eficiência
   e de "fail fast" na ordem de validação.
2. `garantirEmailECpfUnicos` faz duas consultas sequenciais (`findOneBy` por
   `cpf`, depois por `email`). Poderia ser uma única query com `OR`, mas é
   puramente uma otimização, sem efeito funcional.
3. Detecção de ciclo de gestores (A gerente de B, B gerente de A) continua
   não implementada — já esperado e documentado como não bloqueante pelo
   próprio plano; registrando aqui só para não se perder como possível item
   de backlog.

### Correções aplicadas (pós-revisão)

Correções dos dois achados "Deveria corrigir" acima, feitas pelo
`backend-developer` a pedido do orquestrador (bloqueantes antes da etapa de
testes, mesmo sem achado crítico). Escopo estrito: só `backend/**` e este
arquivo de task; nenhum arquivo em `frontend/` foi tocado.

1. **`PUT /api/colaboradores/:id` agora distingue campo omitido / `null` /
   id real para `equipeId` e `gestorId`.**
   - `backend/src/modules/colaboradores/dto/atualizar-colaborador.dto.ts`:
     `equipeId`/`gestorId` agora tipados `string | null` (eram `string`),
     documentando os três estados possíveis no corpo do `PUT`.
   - `backend/src/modules/colaboradores/colaboradores.service.ts` (`atualizar`):
     trocado `if (dto.equipeId !== undefined)` / `if (dto.gestorId !== undefined)`
     por checagem de presença de chave (`if ('equipeId' in dto)` /
     `if ('gestorId' in dto)`), que é a forma correta de diferenciar "chave
     ausente" de "chave presente com valor `null`" num body JSON não
     tipado — exigido por `exactOptionalPropertyTypes: true` no
     `tsconfig.json`. Dentro de cada bloco: `null` → limpa a coluna
     (`colaborador.equipeId = null` / `colaborador.gestorId = null`) sem
     chamar `garantirEquipeExiste`/`garantirGestorValido`; string não vazia
     → mantém a validação de existência já existente
     (`404 EQUIPE_NAO_ENCONTRADA` / `404 GESTOR_NAO_ENCONTRADO`) e, para
     `gestorId`, a checagem de "não pode ser gestor de si mesmo"
     (`422 GESTOR_INVALIDO`) intacta via `garantirGestorValido(dto.gestorId, id)`;
     qualquer outro tipo (número, objeto, string vazia) → `422 CAMPO_INVALIDO`,
     nova validação defensiva que não existia antes (o plano original não
     cobria entrada de tipo errado nesses dois campos).
   - `criar()`/`CriarColaboradorDto` **não foram alterados** — a
     ambiguidade omitido/null só existe no `PUT` (update parcial); na
     criação `equipeId`/`gestorId` continuam opcionais só como "ausente ou
     id", sem sentido de "limpar" um vínculo que ainda não existe.
   - Nenhuma mudança no envelope de erro, no shape de resposta, em
     `garantirPapel`/`deveTerContaAuth` ou em qualquer rota/consulta de
     `respostas`/`relacionamentos_avaliacao` — correção isolada ao parsing
     de `equipeId`/`gestorId` do `PUT`.

2. **`normalizarCpf` agora trata entrada não-string sem lançar `TypeError`.**
   - `backend/src/common/cpf.ts`: assinatura alterada de
     `normalizarCpf(valor: string): string` para
     `normalizarCpf(valor: unknown): string`; qualquer valor com
     `typeof !== 'string'` (número, boolean, objeto, `null`/`undefined`)
     retorna `''` em vez de chamar `.replace` sobre um valor não-string.
     Uma string vazia sempre falha `validarCpf` (`/^\d{11}$/` não bate),
     então o fluxo cai no `422 CPF_INVALIDO` já previsto, nunca mais num
     `500 ERRO_INTERNO` do branch genérico do `tratadorErros`. Mesmo padrão
     defensivo já usado em `validarTextoObrigatorio`/`validarEmail`/
     `validarEnum` (`src/common/validacao.ts`).
   - `backend/src/modules/colaboradores/colaboradores.service.ts`: call
     site de `criar()` simplificado de `normalizarCpf(dto.cpf ?? '')` para
     `normalizarCpf(dto.cpf)` (o `?? ''` ficou redundante — a função já
     trata `undefined`/qualquer não-string internamente); call site de
     `atualizar()` (`normalizarCpf(dto.cpf)`, dentro do bloco
     `dto.cpf !== undefined`) não precisou mudar, já se beneficia da nova
     assinatura.
   - Nenhuma mudança no algoritmo de validação (mod 11) nem no
     comportamento para CPF válido/mascarado — só o caminho de entrada de
     tipo errado deixou de ser um `TypeError` não tratado.

**Verificação:** `npm run build` (tsc) executado dentro de `backend/` após
as duas correções — compila sem erros (`exactOptionalPropertyTypes` e
`noUncheckedIndexedAccess` continuam satisfeitos). `dist/` gerado pelo build
foi removido em seguida (artefato não versionado, já coberto pelo
`.gitignore`). Nenhuma migration foi executada — não há mudança de schema
nesta correção, só lógica de service/validação e tipo de DTO.

**Migrations pendentes:** nenhuma nova; a migration
`1788268503083-CriarEquipesEColaboradores.ts` já registrada na etapa 1
continua sendo a única pendente de execução contra um banco real (`npm run
migration:run` dentro de `backend/`, após configurar `backend/.env` com
`DATABASE_URL`/`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` reais).

### Re-revisão (pós-correções)

Escopo: verificação focada dos três arquivos alterados na correção —
`backend/src/modules/colaboradores/colaboradores.service.ts`,
`backend/src/modules/colaboradores/dto/atualizar-colaborador.dto.ts`,
`backend/src/common/cpf.ts` — mais leitura de
`backend/src/modules/colaboradores/colaborador.entity.ts` e
`backend/src/modules/colaboradores/colaboradores.controller.ts` (não
alterados, lidos só para confirmar ausência de regressão) e grep de
`normalizarCpf`/`createUser`/`resetPasswordForEmail`/`deleteUser` em todo
`backend/src`.

**1. `null` vs. omitido em `atualizar()` — CONFIRMADO, correção correta, sem
regressão.**
- `'equipeId' in dto` / `'gestorId' in dto` distingue corretamente os três
  estados possíveis de um body JSON não tipado: chave ausente (não entra no
  `if`, propriedade do `colaborador` já carregado permanece intocada) → chave
  presente com `null` (`colaborador.equipeId = null` / `colaborador.gestorId
  = null`, sem chamar `garantirEquipeExiste`/`garantirGestorValido`) → chave
  presente com string não vazia (mantém a validação de existência e, para
  `gestorId`, o self-check `gestorId === idProprioRegistro` via
  `garantirGestorValido(dto.gestorId, id)`, intacto). Um quarto caso (tipo
  errado — número, objeto, string vazia) agora responde `422 CAMPO_INVALIDO`
  em vez de deixar passar silenciosamente — endurecimento não pedido
  explicitamente mas correto e alinhado ao padrão de erro do resto do
  módulo.
- **Ponto de maior risco verificado a fundo (persistência real do `NULL`)**:
  `colaborador.entity.ts` declara **ambos** `@Column({ name: 'equipe_id' })
  equipeId` e `@ManyToOne(...) @JoinColumn({ name: 'equipe_id' }) equipe`
  apontando para a mesma coluna física (idem para `gestor_id`/`gestor`). Fui
  ler o código-fonte do TypeORM instalado
  (`backend/node_modules/typeorm/metadata-builder/RelationJoinColumnBuilder.js`,
  método `collectColumns`): quando já existe uma `ColumnMetadata` explícita
  com o mesmo `databaseNameWithoutPrefixes` do join column (que é
  exatamente este caso), o TypeORM **reaproveita essa mesma `ColumnMetadata`
  em vez de criar uma coluna "virtual" separada para a relação** — ou seja,
  existe uma única coluna de metadado para `equipe_id`, com
  `propertyName = 'equipeId'`. Isso significa que a persistência lê o valor
  a gravar a partir de `entity.equipeId` (o campo escalar), não de
  `entity.equipe?.id`. Como `colaborador` é carregado via
  `repositorio().findOneBy({ id })` (sem `relations`, então `colaborador.equipe`
  fica `undefined`) e o código seta diretamente `colaborador.equipeId = null`,
  o `save()` subsequente gera `UPDATE colaboradores SET equipe_id = NULL, ...`
  de fato — **não há descarte silencioso**. Reforça essa conclusão o fato de
  o mesmo objeto `colaborador` (já com `equipeId`/`gestorId` ajustados nas
  linhas 344–366) ser o mesmo `salvo = await repositorio().save(colaborador)`
  chamado em **todas as três ramificações** subsequentes (promoção,
  rebaixamento, troca lateral/inalterado) — a limpeza da FK não depende de
  qual ramo de papel↔auth é executado.
  - Não testei isso rodando contra um banco real (nenhum `DATABASE_URL`
    configurado nesta sessão, consistente com o restante da task) — a
    confirmação acima é por leitura do código-fonte do ORM instalado, não
    por execução. Fica registrado como o único ponto que só uma migration +
    request real (ou o `test-engineer`, via teste de integração) confirma
    de fato em runtime.
- Pequeno ponto tangencial, fora do escopo desta correção (não é regressão
  dela): `criar()`/`CriarColaboradorDto` continuam usando
  `dto.equipeId !== undefined` (não `'in'`) e `equipeId?: string` (sem
  `| null`). Se um cliente mandar `{ "equipeId": null }` no `POST`, o guard
  `!== undefined` também é verdadeiro para `null`, e `garantirEquipeExiste(null)`
  é chamado — hoje isso cai em `404 EQUIPE_NAO_ENCONTRADA` em vez de tratar
  como "sem equipe". Isso é exatamente a mesma classe de bug que foi
  corrigida no `PUT`, só que na criação (onde "limpar" não faz sentido
  semântico, mas "aceitar null como omitido" faria). Não bloqueia — registrado
  como sugestão abaixo.

**2. `normalizarCpf(valor: unknown)` — CONFIRMADO, correção correta, sem
regressão.**
- Grep de `normalizarCpf` em todo `backend/src` mostra exatamente os dois
  call sites já esperados (`criar()` linha 164, `atualizar()` linha 326),
  ambos em `colaboradores.service.ts`; nenhum outro arquivo chama a função,
  então a mudança de assinatura não quebrou nenhum call site externo.
- Qualquer entrada com `typeof !== 'string'` (número, boolean, objeto,
  array, `null`, `undefined`) retorna `''` em vez de chamar `.replace` sobre
  valor não-string. `validarCpf('')` falha determinística e rapidamente em
  `/^\d{11}$/` (primeira checagem da função) e retorna `false` sem lançar —
  os dois call sites tratam esse `false` com `throw new ErroHttp(422,
  'CPF_INVALIDO', ...)`. Não há caminho restante em que uma entrada
  malformada de `cpf` chegue ao branch genérico do `tratadorErros` como
  `500`.
- Unicidade continua comparando o valor **normalizado**: em ambos os call
  sites, `cpfDigitos`/`cpfDigitosNovo` (saída de `normalizarCpf`, só
  dígitos, já validada por `validarCpf`) é o valor passado para
  `garantirEmailECpfUnicos(...)`, que faz `findOneBy({ cpf: cpfDigitos })` —
  e é também o mesmo valor efetivamente atribuído à coluna via
  `repositorio().create({ cpf: cpfDigitos, ... })` (criação) e
  `colaborador.cpf = cpfDigitosNovo` (edição). Um CPF mascarado
  (`529.982.247-25`) não dribla o `UNIQUE (cpf)`, porque tanto a checagem
  prévia quanto o valor persistido são sempre a versão só-dígitos. Nenhuma
  regressão no algoritmo mod 11 (arquivo `cpf.ts` inalterado nessa parte,
  só a assinatura de `normalizarCpf` mudou).

**3. Garantias de segurança já validadas anteriormente — sem regressão,
reconfirmado.**
- (a) Grep de `createUser`/`resetPasswordForEmail`/`deleteUser` em todo
  `backend/src` continua retornando exatamente os mesmos 4 call sites de
  antes (1×`createUser`, 1×`resetPasswordForEmail`, 2×`deleteUser`), todos
  dentro de `criarContaAuth`/`enviarDefinicaoSenha`/`compensarContaAuthOrfa`/
  `removerContaAuthPorRebaixamento`, todos ainda gated por
  `deveTerContaAuth(papel)` (verdadeiro só para `admin`/`gestor_rh`) nos
  mesmos três pontos de decisão (`criar`, promoção e rebaixamento dentro de
  `atualizar`). O bloco de `equipeId`/`gestorId` alterado fica
  estruturalmente **antes** da lógica de papel↔auth (linhas 344–366 vs.
  368+) e não interfere nela — `colaborador` comum nunca passa por nenhum
  desses call sites, inclusive nos novos caminhos de `null`.
- (b) `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` continua sendo
  literalmente a primeira instrução de `criar`, `listar`, `buscarPorId`,
  `atualizar` e `atualizarStatus` em `colaboradores.service.ts` — nenhuma
  das duas correções tocou essas linhas. `equipes.service.ts` não foi
  alterado nesta rodada.
- (c) Envelope de erro `{ erro: { codigo, mensagem } }` inalterado —
  `tratadorErros.ts` não foi tocado; os novos erros introduzidos
  (`422 CAMPO_INVALIDO` para `equipeId`/`gestorId` de tipo errado) usam a
  mesma classe `ErroHttp`, logo caem no mesmo branch já existente do
  middleware.
- (d) Shape de resposta inalterado — `mapearColaborador` não foi tocado;
  `equipe`/`gestor` continuam mapeados para `{ id, nome }`/`{ id,
  nomeCompleto }`, nunca `equipeId`/`gestorId` crus. Após limpar o vínculo
  (`null`), o `findOne({ relations: { equipe: true, gestor: true } })`
  refeito depois do `save()` retorna corretamente `equipe: null`/`gestor:
  null` no corpo da resposta (consequência direta de a coluna física ter
  sido de fato zerada, ver item 1 acima).
- Regra de anonimização (pares/subordinado, `avaliador_id`,
  `minimo_respostas_pares`): nenhum dos três arquivos revisados toca
  `respostas`/`relacionamentos_avaliacao`/`ciclos_avaliacao` — nenhuma
  superfície nova aberta nessa direção, grep confirma ausência de
  `avaliador_id`/`relacionamentos_avaliacao` em `colaboradores.service.ts`.

### Crítico

Nenhum achado crítico.

### Deveria corrigir

Nenhum achado. Os dois itens da rodada anterior foram corrigidos
corretamente e sem introduzir regressão, incluindo o ponto de maior risco
(persistência real do `NULL` via `save()` apesar da coluna `equipe_id`/
`gestor_id` ser compartilhada entre `@Column` e `@ManyToOne`+`@JoinColumn`),
confirmado por leitura do código-fonte do TypeORM instalado.

### Sugestão

1. `criar()`/`CriarColaboradorDto` ainda usam `dto.equipeId !== undefined`
   (não checagem de presença de chave) e o tipo `equipeId?: string` (sem
   `| null`). Um `POST` com `{ "equipeId": null }` explícito hoje cai em
   `404 EQUIPE_NAO_ENCONTRADA` em vez de ser tratado como "sem equipe"
   (equivalente a omitido). Mesma classe de problema do bug já corrigido no
   `PUT`, só que sem o mesmo efeito prático relevante (não bloqueia nenhum
   caso de uso documentado no plano, já que na criação não existe vínculo
   prévio para "limpar"). Não bloqueante — registrar como possível item de
   consistência para uma próxima rodada, se o `test-engineer` não cobrir.
2. O ponto de persistência do `NULL` (item 1 do checklist acima) foi
   confirmado por leitura do código-fonte do ORM, não por execução real
   contra um banco (nenhuma migration foi rodada nesta task). Recomendo que
   o `test-engineer` inclua um teste de integração explícito para `PUT
   /api/colaboradores/:id` com `{ "equipeId": null }` e `{ "gestorId": null
   }` (checando tanto o `200` com `equipe: null`/`gestor: null` na resposta
   quanto, se possível, a coluna no banco) — é o único jeito de fechar
   definitivamente esse ponto sem depender só de leitura de código.

### Conclusão da re-revisão

**Liberado para a etapa de `test-engineer`.** As duas correções resolvem
exatamente os achados "Deveria corrigir" da rodada anterior, sem introduzir
nenhuma regressão nas garantias de anonimização, controle de acesso, regra
papel↔auth, envelope de erro ou shape de resposta. Não há achados críticos
nem novos achados "Deveria corrigir" nesta re-revisão — só duas sugestões
não bloqueantes (uma de consistência em `criar()`, outra pedindo cobertura
de teste de integração específica para o cenário de `null` que só é
totalmente confirmável em runtime).
