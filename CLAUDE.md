# CLAUDE.md

Este arquivo fornece orientação ao Claude Code (claude.ai/code) ao trabalhar com código
neste repositório.

## Projeto

Plataforma de Avaliação 360° — uma plataforma single-tenant de avaliação de desempenho
360°. Dois projetos npm independentes, sem tooling de workspace/monorepo ligando-os:

- `frontend/` — React 19 + Vite + TypeScript.
- `backend/` — Node.js + Express + TypeORM + Postgres (Supabase). Já tem `src/` real
  (não é mais greenfield): módulos `auth`, `colaboradores`, `equipes`, `competencias`,
  `pesquisas`, `paginas-pesquisa`, `perguntas`, `ciclos-avaliacao` (entidades
  `CicloAvaliacao`/`RelacionamentoAvaliacao`), `ciclo-participantes`, `envios-pesquisa` e
  `coleta-respostas-publica` implementados, com migrations, testes (Vitest) e scripts de
  build/dev configurados. `coleta-respostas-publica` é a única rota pública da API
  (`app.use('/api/publico', ...)`, montada em `app.ts` sem o middleware `autenticar`) —
  fluxo de resposta a pesquisa via link + CPF, sem login, espelhado no frontend por
  `ResponderPesquisaPage`. `respostas` e `respostas-clima` também já existem, mas só como
  módulos de entidade (`resposta.entity.ts`/`item-resposta.entity.ts` e
  `resposta-clima.entity.ts`/`item-resposta-clima.entity.ts`, sem `service`/`controller`/
  `module.ts` próprios) — gravados diretamente pelo service de `coleta-respostas-publica`.
  Só a ESCRITA (coleta) está implementada: `respostas`/`itens_resposta` (avaliação 360) são
  sempre gravados identificados via `envio_id`; `respostas_clima`/`itens_resposta_clima`
  são estruturalmente anônimos (sem nenhuma FK de identidade). Módulo futuro/greenfield de
  verdade: leitura/agregação dessas respostas (inclusive a regra de anonimização de
  pares/subordinado descrita abaixo) — nenhum endpoint disso existe ainda.

Os agentes/skills do próprio repositório (`.claude/agents/*.md`, `.claude/skills/**/*.md`)
se referem a estes diretórios como `apps/web` e `apps/api` — essa nomenclatura não existe
em disco, os diretórios reais são `frontend/` e `backend/`. Leia os arquivos de
agente/skill com essa substituição em mente.

`docs/schema_avaliacao360_pt_v2.sql` existe no repo — é a fonte de verdade para nomes de
tabela/coluna dos módulos ainda não implementados. Para os módulos já implementados, as
migrations existentes em `backend/src/migrations/` (9 arquivos, ver histórico de nomes
lá) são a fonte de verdade de fato. Nenhuma delas rodou contra um banco real ainda —
confirme sempre com o usuário antes de decidir entre editar uma migration in-place ou
gerar uma nova migration de correção em cima (as duas mais recentes,
`1788550000000-AdicionarEhGestorColaboradores.ts` e
`1788600000000-EmailColaboradorOpcional.ts`, seguiram o mesmo padrão de nova migration de
correção em vez de editar `1788268503083-CriarEquipesEColaboradores.ts` in-place, por já
ser de uma task fechada anteriormente — trate isso como o padrão a seguir: uma vez que
uma migration corresponde a uma task já fechada, prefira uma nova migration de correção,
mesmo que nenhuma tenha rodado ainda). Divergência conhecida e deliberada
entre as duas: o módulo `perguntas` usa `enunciado` (sem `descricao`) e uma tabela
relacional `perguntas_competencias` para o vínculo matriz↔competência, enquanto o doc de
schema descreve `titulo`+`descricao` e vínculo via jsonb — já implementado ponta a ponta
(service, DTOs, 15 arquivos do frontend); não alterar isso sem confirmação explícita do
usuário.

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
alguma faltar — `backend/src/config/env.ts`). `PORT` (default `3333`), `CORS_ORIGIN`
(default `http://localhost:5173`) e `FRONTEND_URL` (default `http://localhost:5173`,
usada para montar links absolutos que apontam pro frontend, ex.: `redirectTo` de
e-mails do Supabase Auth) são opcionais. Nenhuma migration deve ser rodada contra um
banco real sem confirmação explícita do usuário.

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
`.claude/tasks/tela-login/`, `.claude/tasks/cadastro-colaboradores-equipes/` e
`.claude/tasks/pesquisas/` como exemplos completos do formato de arquivo de task).

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
  Exceção deliberada: `respostas` e `respostas-clima` são módulos só de entidade (sem
  `service`/`controller`/`module.ts` próprios) — gravados diretamente pelo service de
  `coleta-respostas-publica`, que é quem expõe a rota pública. Não force o padrão completo
  de módulo nesses dois só por consistência.
- `@Entity('<nome_tabela>')` e nomes de `@Column()` devem bater exatamente com os nomes
  em português de tabela/coluna do schema (ex.: `colaboradores`, `equipes`,
  `competencias`, `pesquisas`, `paginas_pesquisa`, `perguntas`,
  `perguntas_competencias`, `ciclos_avaliacao`, `relacionamentos_avaliacao`,
  `ciclo_participantes`, `envios_pesquisa`) — nunca traduzir de volta para inglês nem
  inventar nomes. Para módulos ainda não implementados (`respostas`, `itens_resposta`),
  `docs/schema_avaliacao360_pt_v2.sql` é a referência; para os já implementados, a
  migration existente é a referência de fato (ver seção "Projeto" sobre a divergência
  conhecida no módulo `perguntas`).
- Enums do Postgres (`papel_colaborador`, `tipo_pergunta`, `status_pesquisa`,
  `status_ciclo`, `tipo_relacionamento` e `status_envio` já existem) mapeiam para union
  types TypeScript (`src/common/enums.ts`, ver `PapelColaborador`) com os mesmos valores
  em português — não usar `enum` nominal do TS para evitar atrito com union types
  usados em DTOs/tipos de request.
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
