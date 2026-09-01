# CLAUDE.md

Este arquivo fornece orientação ao Claude Code (claude.ai/code) ao trabalhar com código
neste repositório.

## Projeto

Plataforma de Avaliação 360° — uma plataforma single-tenant de avaliação de desempenho
360°. Dois projetos npm independentes, sem tooling de workspace/monorepo ligando-os:

- `frontend/` — React 19 + Vite + TypeScript.
- `backend/` — Node.js + Express + TypeORM + Postgres (Supabase). Já tem `src/` real
  (não é mais greenfield): módulos `auth`, `colaboradores` e `equipes` implementados,
  com migration, testes (Vitest) e scripts de build/dev configurados. Módulos futuros
  (ciclos, pesquisas, respostas, relacionamentos de avaliação) ainda não existem —
  trate-os como greenfield até serem implementados.

Os agentes/skills do próprio repositório (`.claude/agents/*.md`, `.claude/skills/**/*.md`)
se referem a estes diretórios como `apps/web` e `apps/api` — essa nomenclatura não existe
em disco, os diretórios reais são `frontend/` e `backend/`. Leia os arquivos de
agente/skill com essa substituição em mente.

Não existe um arquivo `schema_avaliacao360_pt.sql` (ou variantes como `_v2`) no repo,
mesmo que agentes/skills o tratem como fonte de verdade para nomes de tabela/coluna. Se
ele estiver genuinamente ausente quando você precisar dele, pergunte ao usuário em vez
de inventar nomes de tabela/coluna — mas para os módulos já implementados
(`equipes`, `colaboradores`), a migration existente em `backend/src/migrations/` já é a
fonte de verdade de fato para esses nomes.

## Comandos

Frontend (`frontend/`):
```
npm run dev       # servidor de desenvolvimento Vite
npm run build      # tsc -b && vite build
npm run lint       # eslint .
npm run preview    # preview de um build de produção
```

Backend (`backend/`):
```
npm run dev               # tsx watch src/server.ts
npm run build              # tsc -p tsconfig.json
npm run start               # node dist/server.js (após build)
npm test                    # vitest run
npm run test:watch          # vitest (watch mode)
npm run typeorm              # typeorm-ts-node-commonjs -d src/data-source.ts
npm run migration:generate  # gera uma migration a partir de mudanças na entidade
npm run migration:run       # roda migrations pendentes contra DATABASE_URL
npm run migration:revert    # reverte a última migration
```
Variáveis de ambiente obrigatórias em `backend/.env` (ver `backend/.env.example`):
`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (fail-fast no boot se
alguma faltar — `backend/src/config/env.ts`). `PORT` (default `3333`) e `CORS_ORIGIN`
(default `http://localhost:5173`) são opcionais. Nenhuma migration deve ser rodada
contra um banco real sem confirmação explícita do usuário.

## Fluxo de desenvolvimento multiagente

Este repositório conduz o desenvolvimento de funcionalidades através de um pipeline fixo
de subagentes definidos em `.claude/agents/`, coordenado pelo `orquestrador`, com
convenções por domínio capturadas como skills em `.claude/skills/`. Ao ser solicitado a
implementar uma funcionalidade (em oposição a uma pergunta pontual), siga este pipeline
em vez de editar código diretamente:

1. **spec** (só se o pedido for ambíguo) → escreve `.claude/tasks/<slug>/spec.md`.
2. **planejamento-backend** / **planejamento-frontend** (o lado tocado) → escreve
   `.claude/tasks/<slug>/task-backend.md` e/ou `task-frontend.md` com passos numerados.
3. **backend-developer** / **frontend-developer** → implementa o passo 1 do arquivo de
   task correspondente. Backend só pode tocar `backend/**`; frontend só pode tocar
   `frontend/**` (além de `.claude/tasks/**` para atualizar status). Nenhum dos dois
   cruza para a árvore do outro.
4. **backend-codereviewer** / **frontend-codereviewer** → apenas revisão (nunca corrige
   código diretamente), adiciona uma seção "## Revisão" ao arquivo de task com achados
   Crítico / Deveria corrigir / Sugestão. Achados críticos devolvem a task para a etapa
   de desenvolvimento.
5. **test-engineer** → roda por último, assim que os revisores reportarem nenhum achado
   crítico. Escreve testes automatizados, priorizando a regra de anonimização e o
   controle de acesso por papel.

Para ajustes pontuais e bem delimitados (ex.: corrigir um campo que não deveria existir
em uma entidade), o usuário pode pedir diretamente ao `backend-developer` ou
`frontend-developer`, pulando planejamento e code review — nesse caso, siga o pedido tal
como formulado em vez de forçar o pipeline completo.

O estado das tasks vive em `.claude/tasks/<slug>/` — confira lá antes de iniciar um novo
trabalho em uma funcionalidade para ver se já existe spec/plano/revisão (veja
`.claude/tasks/tela-login/` e `.claude/tasks/cadastro-colaboradores-equipes/` como
exemplos completos do formato de arquivo de task).

## Regras de negócio centrais (aplicam-se aos dois lados)

**Anonimização (a regra mais sensível do projeto, detalhada na skill
`backend-anonimizacao-respostas`):** respostas do tipo de relacionamento `pares` e
`subordinado` nunca podem ser expostas identificadas (sem `avaliador_id`) para a pessoa
avaliada — só agregadas (médias/contagens), e somente quando o número de respondentes
para aquele avaliado + ciclo + tipo atingir `ciclos_avaliacao.minimo_respostas_pares`
(padrão 3). Respostas do tipo `autoavaliacao`, `gestor` e `externo` podem ser
identificadas. RH/admin sempre têm a visão identificada completa. Nunca escreva uma
query/endpoint acessível por `colaborador` que junte `itens_resposta` com
`relacionamentos_avaliacao.avaliador_id` para linhas `pares`/`subordinado` — use (ou
replique a separação de) as views `respostas_identificadas` e
`respostas_pares_agregadas`. Abaixo do mínimo, retorne um estado explícito (ex.:
`{ liberado: false, motivo: "aguardando_minimo_respondentes" }`), nunca um array
vazio/parcial.

**Papéis:** `admin`, `gestor_rh`, `colaborador`. Toda rota protegida do backend deve
checar o papel do usuário autenticado (JWT do Supabase Auth); toda tela/ação do frontend
deve se adaptar ou se esconder conforme o papel.

**Tipos de pergunta:** exatamente 4 — `likert`, `texto_aberto`, `matriz`, `pessoa`.
Outros tipos (CSAT, NPS, KPI, CES, NVS, Imagem, Indicação) foram deliberadamente
removidos do escopo do MVP; não reintroduza nenhum sem confirmação explícita já
registrada em uma spec.

**Single-tenant:** nunca introduza `organization_id` ou qualquer isolamento
multi-tenant.

**Criação de pesquisa é sempre manual** — sem atalhos de auto-geração/IA/template.

## Convenções de backend (`backend/`, por padrão da skill `backend-modulo-crud`)

Estrutura de módulo (padrão já em uso por `equipes` e `colaboradores`):
```
src/modules/<nome>/
  <nome>.entity.ts
  <nome>.service.ts
  <nome>.controller.ts
  <nome>.module.ts
  dto/
    criar-<nome>.dto.ts
    atualizar-<nome>.dto.ts
```
- `@Entity('<nome_tabela>')` e nomes de `@Column()` devem bater exatamente com os nomes
  em português de tabela/coluna do schema (ex.: `colaboradores`, `equipes`, e, quando
  implementados, `ciclos_avaliacao`, `relacionamentos_avaliacao`) — nunca traduzir de
  volta para inglês nem inventar nomes. Na ausência do arquivo de schema (ver seção
  "Projeto"), a migration existente é a referência para os módulos já implementados.
- Enums do Postgres (`papel_colaborador` já existe; futuramente `status_ciclo`,
  `tipo_pergunta`, `tipo_relacionamento`, `status_envio`, `status_pesquisa`) mapeiam para
  union types TypeScript (`src/common/enums.ts`, ver `PapelColaborador`) com os mesmos
  valores em português — não usar `enum` nominal do TS para evitar atrito com union
  types usados em DTOs/tipos de request.
- Nunca depender de `synchronize: true` para mudanças de schema — toda mudança de schema
  precisa de uma migration com `up`/`down` (`src/migrations/`).
- Checagens de autorização por papel ficam centralizadas na camada de serviço via
  `garantirPapel` (`src/common/autorizacao.ts`), chamada como primeira linha de cada
  função exportada de `*.service.ts` — nunca duplicadas inline em controllers/rotas.
- Erros usam a classe `ErroHttp` (`src/common/erro-http.ts`) com `status` + `codigo` +
  mensagem, tratados centralmente pelo middleware de erro `tratadorErros`
  (`src/middlewares/tratadorErros.ts`, montado por último em `app.ts`). Violações de
  `UNIQUE` do Postgres (`err.code === '23505'`) são mapeadas por `err.constraint` para
  `409` com um código específico — nomes de constraint na migration precisam bater com
  esse mapeamento.
- Autenticação (`src/middlewares/autenticacao.ts`, função `autenticar`) valida o JWT do
  Supabase via `supabaseAdmin.auth.getUser`, resolve o `colaborador` vinculado
  (exigindo `ativo = true`) e preenche `req.colaboradorAutenticado`. É montada por
  `router.use(autenticar)` dentro de cada `*.module.ts`, nunca globalmente em `app.ts` —
  fluxos públicos (ex.: resposta a pesquisa por link + CPF, sem login) não devem
  reutilizar esse middleware.
- Controllers usam `asyncHandler` (`src/common/http-async.ts`) para encaminhar erros
  assíncronos a `next()` sem `try/catch` repetido.
- `SUPABASE_SERVICE_ROLE_KEY` só é lida via `process.env` dentro de
  `src/lib/supabaseAdmin.ts`/`src/config/env.ts` — nunca hardcoded, nunca logada, nunca
  usada no frontend.

## Convenções de frontend (`frontend/`)

- **Estilo: Tailwind CSS + MUI, sem CSS puro.** Tailwind para layout/espaçamento/cores
  utilitárias, componentes MUI (`TextField`, `Button`, `Dialog`, etc.) para os controles
  de UI de fato. Quando MUI e Tailwind competirem na mesma propriedade, MUI vence —
  customize via `theme` do MUI (`createTheme`, prop `sx`), não com classes Tailwind
  sobrescrevendo um componente MUI. O projeto migrou de arquivos CSS puros logo no
  início (ver a nota "Refatoração... Tailwind + MUI" em
  `.claude/tasks/tela-login/task-frontend.md`); não adicione novos arquivos `.css` nem
  blocos grandes de `style={{}}` inline.
- Componentes de pergunta (construtor de pesquisas / renderização de perguntas), por
  padrão da skill `frontend-componente-pergunta`: um editor + um componente de resposta
  por tipo, em `components/perguntas/Pergunta<Tipo>/`. Componentes de resposta recebem
  `valor` + `onChange` via props e nunca chamam a API diretamente — a página/formulário
  pai persiste. Componentes de resposta devem bloquear o envio quando `obrigatoria` não
  for atendida.
- Assets estáticos referenciados por URL (`/logo.jpg`, `/imagem-tela-login.jpg`) ficam em
  `public/`, não importados de `src/assets`.
- Nenhuma regra de negócio sensível (agregação, anonimização) no frontend — precisa vir
  pré-computada da API. Se a fonte de dados de uma tela de resultados não estiver
  claramente identificada como identificada-vs-agregada na task, isso é motivo para
  parar e perguntar, não para assumir.
- O client do Supabase fica em `frontend/src/lib/supabaseClient.ts`, lê
  `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — nunca hardcodear
  esses valores. `frontend/.env.example` é intencionalmente versionado (com
  placeholders vazios); o `.env` real permanece no gitignore.
