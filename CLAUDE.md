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
  `CicloAvaliacao`/`RelacionamentoAvaliacao`), `ciclo-participantes`, `envios-pesquisa`,
  `coleta-respostas-publica` e `analise` implementados, com migrations, testes (Vitest) e
  scripts de build/dev configurados. `coleta-respostas-publica` é a única rota pública da
  API (`app.use('/api/publico', ...)`, montada em `app.ts` sem o middleware `autenticar`)
  — fluxo de resposta a pesquisa via link + CPF, sem login, espelhado no frontend por
  `ResponderPesquisaPage`. `respostas` e `respostas-clima` também já existem, mas só como
  módulos de entidade (`resposta.entity.ts`/`item-resposta.entity.ts` e
  `resposta-clima.entity.ts`/`item-resposta-clima.entity.ts`, sem `service`/`controller`/
  `module.ts` próprios) — gravados diretamente pelo service de `coleta-respostas-publica`.
  Só a ESCRITA (coleta) está implementada nesses dois: `respostas`/`itens_resposta`
  (avaliação 360) são sempre gravados identificados via `envio_id`;
  `respostas_clima`/`itens_resposta_clima` são estruturalmente anônimos (sem nenhuma FK de
  identidade). O módulo `ciclos-avaliacao` expõe uma fatia leve de leitura agregada,
  restrita a contagem: `progresso: { total, concluidos, percentual }` (calculado por
  `calcularProgressoCiclo`/`buscarPesquisaVinculada` em `ciclos-avaliacao.service.ts`) em
  `GET /api/ciclos`, `GET /api/ciclos/:id` e num endpoint dedicado e leve para polling,
  `GET /api/ciclos/:id/progresso` — para avaliação 360, conta `relacionamentos_avaliacao`
  com resposta registrada via `envios_pesquisa`→`respostas`; para `clima_geral`, conta
  `ciclo_participantes.respondeu_em`. Sempre `COUNT`, nunca seleciona
  `avaliador_id`/`avaliado_id`/`tipo_relacionamento` nem qualquer dado de `itens_resposta`.
  A leitura IDENTIFICADA/agregada de verdade — a que antes era descrita aqui como módulo
  futuro/greenfield — já existe no módulo `analise` (`/api/analise/*`, montado com
  `autenticar` em `analise.module.ts`, nunca como rota pública; todo endpoint chama
  `garantirPapel(ator, ['admin', 'gestor_rh'])` como primeira linha, sem bypass de papel em
  nenhum gate): `GET /api/analise/visao-geral` (métricas agregadas por período — contagens,
  taxa de resposta, tempo médio — sem quebra por avaliador/avaliado; `analise.service.ts`),
  `GET /api/analise/avaliacoes` (texto aberto identificado para
  `autoavaliacao`/`gestor`/`externo`; agrupado por avaliado+ciclo+tipo para
  `pares`/`subordinado`, e por ciclo para `clima_geral`, liberado só quando
  `totalRespondentes >= ciclos_avaliacao.minimo_respostas_pares` — abaixo disso retorna
  `{ liberado: false, motivo: 'aguardando_minimo_respondentes' }`, nunca array parcial;
  `analise-avaliacoes.service.ts`), `GET /api/analise/ranking` (ranking por avaliado ou por
  equipe, likert/matriz, mesmo gate de pares/subordinado — sem bypass de papel para
  admin/gestor_rh — mais um limiar de 5 membros por equipe/métrica; nunca expõe nenhuma
  contagem bruta de respondentes/membros no payload, só booleanos de insuficiência;
  `analise-ranking.service.ts` — teve o passo `backend-developer` concluído mas ainda não
  passou por `backend-codereviewer`/`test-engineer`, confira
  `.claude/tasks/analise-ranking/task-backend.md` antes de tratar como fechado) e
  `GET /api/analise/nuvem-palavras` (já com `backend-codereviewer`/`test-engineer`
  concluídos — frequência agregada de palavras dos mesmos textos `texto_aberto` já usados
  em "Avaliações", nunca o texto original exibido; mesmo gate de liberação aplicado antes
  de buscar o texto no banco — nunca buscar-depois-filtrar; stopwords em português +
  lowercase + piso de 3+ caracteres, top 50 por frequência decrescente, contagem
  unificada por ciclo/período sem segmentar por pergunta; só visualização em LISTA nesta
  rodada — Bolhas e modo TV Dash ficam para rodadas futuras, mas o contrato de resposta
  já foi desenhado para reaproveitamento por elas sem mudar de shape;
  `analise-nuvem-palavras.service.ts`) e `GET /api/analise/resultados-pergunta` (quinta
  tela, "Resultados por Pergunta" — pipeline completo já concluído: `spec`,
  `planejamento-backend`/`planejamento-frontend`, `backend-developer`/`frontend-developer`,
  `backend-codereviewer`/`frontend-codereviewer` sem achados críticos e `test-engineer`
  com 29 testes novos, ver `.claude/tasks/analise-resultados-pergunta/`. DISTRIBUIÇÃO
  (contagem por nível/opção), não média — diferente de "Ranking". Cobre só `likert`,
  `matriz` e `caixa_selecao` (`texto_aberto` já é "Avaliações"/"Nuvem de Palavras",
  `pessoa` reservado para uma futura tela "Análise de Menções"). Filtros de período +
  `cicloId` opcional, como "Visão Geral"/"Avaliações"/"Nuvem de Palavras" — não o
  `cicloId` único obrigatório de "Ranking". Para `avaliacao_360`, distribuição SEPARADA
  por `tipo_relacionamento`; o gate de `pares`/`subordinado` é aplicado **por avaliado +
  ciclo + tipo**, em duas fases (agregação bruta por avaliado → composição em memória que
  só soma ao total da pergunta as fatias de avaliados que atingiram o mínimo — mesmo
  padrão de `comporMediasPorAvaliado` do Ranking, adaptado de soma/qtd para contador por
  nível/opção), nunca um mínimo único para a pergunta inteira. Para `matriz`, cada
  competência mantém distribuição própria (nunca agregada entre competências, ao
  contrário do Ranking). Para `clima_geral`, gate por ciclo inteiro, gate-primeiro-depois-
  busca. Esta é a tela MAIS ESTRITA do módulo: o payload nunca expõe
  `totalRespondentes`/`minimoNecessario` (diferente de "Avaliações") — só
  `liberado: boolean` + `motivo?: 'aguardando_minimo_respondentes'`;
  `analise-resultados-pergunta.service.ts`) e `GET /api/analise/envios` (sexta tela,
  "Envios" — pipeline completo já concluído: `spec`, `planejamento-backend`/
  `planejamento-frontend`, `backend-developer`/`frontend-developer`,
  `backend-codereviewer`/`frontend-codereviewer` sem achados críticos e `test-engineer`,
  ver `.claude/tasks/analise-envios/`. Único relatório TABULAR do módulo — 1 linha por
  ciclo com contagens agregadas de pendentes/respondidos, sem drill-down por pessoa (isso
  já existe em `CicloDetalhePage`) e sem nenhuma ação/botão (copiar link, marcar como
  enviado, expirar, lembrete continuam exclusivos do detalhe do Ciclo). Filtros de
  período + `cicloId` opcional, mesmo padrão de "Visão Geral"/"Avaliações"/"Nuvem de
  Palavras". Reaproveita `buscarUniversoCiclos`/`classificarPorTipo` de `analise-comum.ts`
  e adiciona `calcularProgressoEmLotePorCiclo` (nova função exportada de
  `analise-comum.ts`, mesmo guard rail de "SÓ CONTAGEM" já usado pelo bloco de progresso
  em lote de `ciclos-avaliacao.service.ts::listar()` — decisão deliberada de duplicar em
  vez de extrair aquele bloco, para não inverter a direção de dependência entre os dois
  módulos); `analise-envios.service.ts`). Lógica compartilhada pelas seis telas (universo
  de ciclos por período, classificação avaliação_360/clima_geral, o gate de
  pares/subordinado, e também as contagens/cálculo de tempo médio e
  `calcularMetricasComplementares` reaproveitados por Visão Geral e Nuvem de Palavras) vive
  em `analise-comum.ts`. Espelhado no frontend por `AnaliseVisaoGeralPage`,
  `AnaliseAvaliacoesPage`, `AnaliseRankingPage`, `AnaliseNuvemPalavrasPage`,
  `AnaliseResultadosPerguntaPage` e `AnaliseEnviosPage` — todas sem atalho no card do
  Ciclo, acessíveis só pelo menu lateral (Análises → Quantitativa para Visão Geral/
  Ranking/Resultados por Pergunta/Envios, Análises → Qualitativa para Avaliações/Nuvem de
  Palavras).

Os agentes/skills do próprio repositório (`.claude/agents/*.md`, `.claude/skills/**/*.md`)
se referem a estes diretórios como `apps/web` e `apps/api` — essa nomenclatura não existe
em disco, os diretórios reais são `frontend/` e `backend/`. Leia os arquivos de
agente/skill com essa substituição em mente.

`docs/schema_avaliacao360_pt_v2.sql` foi removido do repositório (commit `9630ec9`) —
não existe mais em disco, só no histórico do git, e não deve mais ser citado como fonte de
verdade em novo trabalho. Isso deixou de ser um problema prático porque todos os módulos
que este arquivo descrevia já foram implementados (ver lista de módulos no início desta
seção); as migrations existentes em `backend/src/migrations/` (10 arquivos, ver histórico
de nomes lá) são hoje a ÚNICA fonte de verdade de nomes de tabela/coluna do projeto. Se uma
funcionalidade futura precisar de uma tabela/coluna ainda inexistente, ela precisa ser
especificada do zero (via `spec`/`planejamento-backend`) — não há mais um doc de schema
antecipado para consultar. Nenhuma migration rodou contra um banco real ainda —
confirme sempre com o usuário antes de decidir entre editar uma migration in-place ou
gerar uma nova migration de correção em cima (a mais recente,
`1788650000000-TiposRelacionamentoGeradosPorCiclo.ts`, seguiu o mesmo padrão de nova
migration de correção em vez de editar
`1788300000000-CriarCiclosAvaliacaoRelacionamentosEParticipantes.ts` in-place, por já
ser de uma task fechada anteriormente — trate isso como o padrão a seguir: uma vez que
uma migration corresponde a uma task já fechada, prefira uma nova migration de correção,
mesmo que nenhuma tenha rodado ainda). Divergência histórica conhecida e deliberada (o
doc de schema que a descrevia foi removido, mas a decisão continua valendo): o módulo
`perguntas` usa `enunciado` (sem `descricao`) e uma tabela relacional
`perguntas_competencias` para o vínculo matriz↔competência, em vez de `titulo`+`descricao`
e vínculo via jsonb como o schema antigo descrevia — já implementado ponta a ponta
(service, DTOs, 15 arquivos do frontend); não alterar isso sem confirmação explícita do
usuário.

`backend/scripts/` é o diretório convencional para scripts pontuais de diagnóstico/
verificação (não é suite de teste formal, não roda em CI, não faz parte do build) — hoje
nem existe em disco (o único script que já existiu aqui,
`verificar-resolver-opcoes-pessoa.ts`, foi removido, e o git não versiona diretório
vazio); crie-o de novo se precisar de um script pontual. Um script desse
diretório tipicamente semeia dados prefixados `ZTeste_` via funções de service reais e
compara o resultado de uma função contra um gabarito calculado à mão, imprimindo (sem
executar) o SQL de limpeza ao final. Mesma regra de nunca rodar contra um banco real sem
confirmação explícita se aplica a qualquer script desse diretório que grave dado.

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
`relacionamentos_avaliacao.avaliador_id` para linhas `pares`/`subordinado` — replique a
separação de `respostas_identificadas`/`respostas_pares_agregadas` (nomes de views que
estavam definidas só no antigo `docs/schema_avaliacao360_pt_v2.sql`, removido do repo —
nenhuma migration real chegou a criá-las — o módulo `analise` implementa essa mesma
separação diretamente em TypeORM,
gate primeiro via `calcularGateParesSubordinado`/`calcularGateClima` em
`analise-comum.ts`, busca de texto só depois, nunca buscar-depois-filtrar). Abaixo do
mínimo, retorne um estado explícito (ex.:
`{ liberado: false, motivo: "aguardando_minimo_respondentes" }`), nunca um array
vazio/parcial.

**Papéis:** `admin`, `gestor_rh`, `colaborador`. Toda rota protegida do backend deve
checar o papel do usuário autenticado (JWT do Supabase Auth); toda tela/ação do frontend
deve se adaptar ou se esconder conforme o papel.

**Tipos de pergunta:** 5 — `likert`, `texto_aberto`, `matriz`, `pessoa` e `caixa_selecao`
(este último adicionado depois dos 4 originais do MVP; ver `common/enums.ts` nos dois
lados). Outros tipos (CSAT, NPS, KPI, CES, NVS, Imagem, Indicação) foram deliberadamente
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
  `ciclo_participantes`, `envios_pesquisa`, `respostas`, `itens_resposta`,
  `respostas_clima`, `itens_resposta_clima`) — nunca traduzir de volta para inglês nem
  inventar nomes. Para toda tabela/coluna já criada por uma migration em
  `backend/src/migrations/` — o que hoje cobre todos os módulos listados na seção
  "Projeto", incluindo `respostas`/`itens_resposta`/`respostas_clima`/
  `itens_resposta_clima` (mesmo só com a escrita implementada) — a migration é a ÚNICA
  referência de fato hoje; o antigo `docs/schema_avaliacao360_pt_v2.sql` foi removido do
  repo e não deve mais ser citado (ver seção "Projeto" sobre a divergência histórica
  conhecida no módulo `perguntas`, e sobre o que fazer se uma tabela/coluna futura ainda
  não tiver migration).
- Enums do Postgres (`papel_colaborador`, `tipo_pergunta`, `status_pesquisa`,
  `status_ciclo`, `tipo_relacionamento`, `status_envio` e `tipo_pesquisa` já existem)
  mapeiam para union types TypeScript (`src/common/enums.ts`, ver `PapelColaborador`) com
  os mesmos valores em português — não usar `enum` nominal do TS para evitar atrito com
  union types usados em DTOs/tipos de request.
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
- Assets estáticos referenciados por URL (`/logo.jpg`, `/imagem-tela-login.png`) ficam em
  `public/`, não importados de `src/assets`.
- Nenhuma regra de negócio sensível (agregação, anonimização) no frontend — precisa vir
  pré-computada da API. Se a fonte de dados de uma tela de resultados não estiver
  claramente identificada como identificada-vs-agregada na task, isso é motivo para
  parar e perguntar, não para assumir.
- O client do Supabase fica em `frontend/src/lib/supabaseClient.ts`, lê
  `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — nunca hardcodear
  esses valores. `frontend/.env.example` é intencionalmente versionado (com
  placeholders vazios); o `.env` real permanece no gitignore.
- Qualquer lista que pode crescer com volume de dados variável (não um número fixo
  pequeno de itens, tipo um cabeçalho fixo de poucas colunas) deve ter altura máxima
  com rolagem interna (`overflow-y: auto` + `maxHeight`, tipicamente 500-600px) em vez
  de crescer livremente e empurrar o resto da página — exceto quando a lista já tem
  paginação (client-side ou vinda da API), que já resolve o mesmo problema. Em
  container MUI (`TableContainer`, `Box`, `Paper`, `List`), aplique via `sx`; em `div`
  puro de layout, classes Tailwind (`max-h-[…] overflow-y-auto`) bastam. Exemplos já
  implementados: participantes/relacionamentos gerados/envios na tela de detalhe do
  Ciclo (`CicloDetalhePage`) e a lista de Palavras Mais Frequentes na tela de Nuvem de
  Palavras (`ListaFrequenciaPalavras`).
