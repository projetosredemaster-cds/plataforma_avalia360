# Spec: Módulo Análise — tela "Visão Geral"

## 1. Resumo do pedido

Implementar a primeira tela do módulo Análise (`apps/api`/`apps/web` na
nomenclatura dos agentes = `backend/`/`frontend/` neste repo), chamada "Visão
Geral". O módulo Análise ainda não existe (nem backend nem frontend) — esta
spec cobre SOMENTE a Visão Geral, que serve de base/precedente de layout e
contrato de API para telas futuras do mesmo módulo (Ranking, Performance,
Análise de Menções, Envios, Avaliações, Nuvem de Palavras) — nenhuma dessas
telas futuras é especificada ou implementada aqui.

A Visão Geral é um painel de métricas agregadas, filtrável por período
(data de/até) e opcionalmente por ciclo (deep link a partir do card de ciclo
em `CiclosListPage`), mostrando:

1. Total de ciclos e respostas no período.
2. Distribuição de pesquisas por tipo (`avaliacao_360` vs `clima_geral`) no
   período.
3. Taxa de resposta média (%) no período.
4. Tempo médio de resposta no período (granularidade diferente por tipo de
   pesquisa — ver seção 2.4).

Todas as 4 métricas são sempre exibidas juntas — não há modo "resumido" nem
seleção de quais métricas aparecem.

## 2. Decisões já fechadas pelo usuário (não reabrir)

Esta spec foi precedida por uma rodada de esclarecimento (`AskUserQuestion`)
já concluída. As decisões abaixo estão fechadas — não devem ser
reperguntadas ao usuário; qualquer detalhe remanescente não coberto por elas
vai para a seção "Perguntas em aberto" (nº 9), como sugestão a validar no
planejamento, não como bloqueio.

### 2.1 As 4 métricas, sem descarte de nenhuma

Confirmadas nesta ordem/composição fixa (não é um menu configurável de KPIs):
total de ciclos+respostas, distribuição por tipo de pesquisa, taxa de
resposta média, tempo médio de resposta. Nenhuma quebra por
avaliador/avaliado/competência nesta tela — isso é reservado para telas
futuras do módulo (Ranking, Performance).

### 2.2 Deep link por ciclo — mesma tela, filtro aplicado, não uma tela nova

O botão "Visão Geral" a adicionar ao `CardActions` de cada card de ciclo em
`frontend/src/pages/CiclosListPage/CiclosListPage.tsx` (ver bloco
`CardActions`, linhas ~277–311, ao lado do já existente `Button` "Ver
detalhes") navega para a MESMA tela de Visão Geral, com `cicloId` pré-aplicado
como filtro. Não é um layout, endpoint ou conjunto de métricas separado — é a
mesma tela e o mesmo endpoint, parametrizados. Não fica restrito ao bloco
`status === 'rascunho'` (que hoje só envolve "Ativar ciclo"/"Excluir") — deve
aparecer para ciclos em qualquer status, já que a Visão Geral por ciclo faz
sentido inclusive para ciclos `ativo`/`encerrado`.

### 2.3 Semântica do filtro de período — dois níveis de corte

(a) **Nível ciclo**: só entram na agregação ciclos cuja vigência
(`ciclos_avaliacao.data_inicio`/`data_fim`) SOBREPÕE o período selecionado
(`de`/`ate`) — ou seja, `data_inicio <= ate AND data_fim >= de`, não
"o ciclo inteiro precisa caber dentro do período".

(b) **Nível resposta**: dentro dos ciclos que passaram no corte (a), só
contam respostas/participações cujo carimbo de data efetivo cai dentro do
mesmo período `de`/`ate`:
- `avaliacao_360`: `respostas.respondido_em` (via `envios_pesquisa.envio_id`
  → `relacionamentos_avaliacao.ciclo_id`).
- `clima_geral`: `ciclo_participantes.respondeu_em`.

Um ciclo pode passar no corte (a) mas contribuir zero respostas ao corte (b)
se nenhuma resposta caiu dentro do período — isso é esperado, não um erro.

### 2.4 Tempo médio de resposta — granularidade diferente por tipo, documentar explicitamente

- `avaliacao_360`: `envios_pesquisa.enviado_em` → `envios_pesquisa.
  concluido_em`, por relacionamento de avaliação (1 par por
  `relacionamento_avaliacao` que tenha envio concluído). Envios sem
  `enviado_em` ou sem `concluido_em` (ou sem resposta) ficam fora da média.
- `clima_geral`: data de envio da campanha (`envios_pesquisa.enviado_em` da
  linha única de campanha do ciclo) → `ciclo_participantes.respondeu_em`, por
  participante que já respondeu. Como `enviado_em` é uma única data
  compartilhada por todos os participantes da campanha, cada participante
  respondido contribui `respondeu_em - enviado_em` (a variação entre
  participantes vem só do numerador).
- A métrica final exibida combina os dois tipos numa média geral (ponderada
  por contagem de respostas em cada tipo), mas o payload da API deve expor os
  dois componentes separadamente também (ver "Contrato de API", nº 3) — a UI
  decide se mostra só o agregado ou os dois separados, mas o backend nunca
  deve fingir que a granularidade é a mesma internamente.

### 2.5 Sem filtro por tipo de pesquisa nesta tela

A Visão Geral sempre mostra os dois tipos (`avaliacao_360` e `clima_geral`)
combinados/lado a lado — a métrica "distribuição por tipo" (item 2 da seção
1) já cobre essa quebra. Não há controle de UI para restringir a tela a um
único tipo. Filtro por tipo de pesquisa fica reservado para telas futuras
mais específicas do módulo (Ranking, Performance) — fora de escopo aqui.

### 2.6 Filtro de período no frontend usa inputs nativos, sem nova dependência

`TextField type="date"` do MUI, dois campos (`de`/`ate`), sem instalar
`@mui/x-date-pickers` nem `dayjs`. Confirmado por exploração que hoje nenhuma
tela do projeto filtra por data (datas só são exibidas formatadas) — esta é a
primeira tela a introduzir esse tipo de filtro, e a decisão foi não trazer
dependência nova só para isso. Value/onChange do `TextField type="date"`
trabalham com string `'YYYY-MM-DD'`, consistente com o padrão já usado em
`frontend/src/types/ciclo.ts` (`dataInicio`/`dataFim` como string).

## 3. Regra de anonimização — por que esta tela está fora do limiar `minimo_respostas_pares`

Mesmo sendo dado puramente agregado (contagens e médias, nunca respostas
individuais), a Visão Geral toca dados de ciclos/relacionamentos/respostas —
a regra central do projeto (anonimização de `pares`/`subordinado`, skill
`backend-anonimizacao-respostas`) precisa ser considerada explicitamente
mesmo quando a conclusão é "não se aplica aqui".

**Justificativa de por que o limiar `ciclos_avaliacao.minimo_respostas_pares`
NÃO se aplica a nenhuma das 4 métricas desta tela**: o limiar existe para
proteger a identidade de UM avaliado específico quando os respondentes
`pares`/`subordinado` dele são poucos (evitar que uma média de "1
respondente" vire, na prática, uma resposta identificada por exclusão).
Nenhuma métrica desta tela quebra por avaliado, por avaliador, ou por tipo de
relacionamento — são contagens/médias GLOBAIS (por ciclo, por tipo de
pesquisa, por período). Não existe, nesta tela, nenhum caminho para inferir
"o que a pessoa X respondeu sobre a pessoa Y" a partir dos números exibidos.

**Guard rail obrigatório a documentar e implementar** (mesmo padrão já
comentado em `calcularProgressoCiclo`, `backend/src/modules/
ciclos-avaliacao/ciclos-avaliacao.service.ts`, linha ~154: "SÓ CONTAGEM, nunca
seleciona avaliador_id/avaliado_id/tipo_relacionamento"): o(s) endpoint(s)
desta feature NUNCA devem fazer `SELECT` de `relacionamentos_avaliacao.
avaliador_id`, `relacionamentos_avaliacao.avaliado_id`,
`relacionamentos_avaliacao.tipo_relacionamento` nem de `itens_resposta.valor`
— apenas `COUNT`/`AVG`/`GROUP BY` sobre carimbos de data e chaves de
agrupamento não identificadoras (ciclo, tipo de pesquisa, período). Este
guard rail deve ser reforçado com um comentário no código do service, igual
ao já existente, e é candidato natural a um achado de revisão crítico caso
violado.

**Papel de acesso**: como toda leitura agregada de análise, restrita a
`admin`/`gestor_rh` via `garantirPapel(ator, ['admin', 'gestor_rh'])` como
primeira linha da função de serviço — nenhuma rota desta feature é acessível
por `colaborador`.

## 4. Modelo de dados envolvido (leitura only — nenhuma tabela/coluna nova)

Nenhuma migration é necessária para esta feature — é leitura pura sobre
tabelas já existentes:

- `ciclos_avaliacao` (`id`, `data_inicio`, `data_fim`, `status`) — universo de
  ciclos elegíveis ao corte de período (2.3a).
- `pesquisas` (`id`, `ciclo_id`, `tipo`) — para saber o tipo
  (`avaliacao_360`/`clima_geral`) de cada ciclo e para a métrica de
  distribuição por tipo. Mesma ressalva já documentada em
  `buscarPesquisaVinculada`: não há `UNIQUE` em `pesquisas.ciclo_id`, então
  mais de uma pesquisa pode apontar para o mesmo ciclo — usar a mesma
  convenção de desempate (`ORDER BY criado_em DESC`, pesquisa mais recente)
  para decidir o tipo do ciclo, a menos que o planejamento decida contar
  cada pesquisa do ciclo separadamente (ver "Perguntas em aberto" nº 3).
- `relacionamentos_avaliacao` (`id`, `ciclo_id`) — universo de relacionamentos
  para `avaliacao_360` (contagem via `COUNT`, nunca `SELECT` de colunas de
  identidade, ver seção 3).
- `envios_pesquisa` (`relacionamento_id`, `ciclo_id`, `enviado_em`,
  `concluido_em`) — datas de envio/conclusão para tempo médio de resposta
  (360 via `relacionamento_id`, clima via `ciclo_id`).
- `respostas` (`envio_id`, `respondido_em`) — contagem de respostas 360 e
  filtro de data (2.3b).
- `ciclo_participantes` (`ciclo_id`, `respondeu_em`) — universo/contagem de
  participantes de clima e filtro de data (2.3b).
- `respostas_clima` (`ciclo_id`, `respondido_em`) — contagem de respostas de
  clima. Estruturalmente anônima (sem FK de identidade) — mas para a
  Visão Geral isso é irrelevante, já que só interessa `COUNT`/`ciclo_id`,
  nunca conteúdo (`itens_resposta_clima`).

Nenhuma tabela nova, nenhuma coluna nova, nenhuma view nova é necessária. As
views `respostas_identificadas`/`respostas_pares_agregadas` citadas na skill
`backend-anonimizacao-respostas` não existem fisicamente em nenhuma migration
e não são necessárias para esta tela (que nunca acessa `itens_resposta`
identificado).

## 5. Recorte backend vs frontend

### Backend (`backend/`)

- Módulo novo `backend/src/modules/analise/` (ou nome equivalente a validar
  no planejamento — ver "Perguntas em aberto" nº 1), seguindo o padrão de
  módulo já usado (`*.service.ts` com `garantirPapel` como primeira linha,
  `*.controller.ts` com `asyncHandler`, `*.module.ts` montado com
  `router.use(autenticar)` como os demais módulos protegidos — nunca sob
  `/api/publico`).
- Sem entidade própria — reaproveita entidades existentes só para leitura
  (`CicloAvaliacao`, `Pesquisa`, `RelacionamentoAvaliacao`, `EnvioPesquisa`,
  `Resposta`, `CicloParticipante`, `RespostaClima`), via `QueryBuilder`/
  `AppDataSource`, replicando o padrão de agregação em lote já usado em
  `listar()` de `ciclos-avaliacao.service.ts` (linhas ~346–476: `GROUP BY` +
  `Map` por ciclo, evitando N+1) em vez do padrão de ciclo único
  (`calcularProgressoCiclo`) — como a Visão Geral agrega sobre um universo de
  ciclos (não um só), a versão em lote é a referência de abordagem mais
  próxima, mesmo com filtro de data e sem paginação por ciclo.
- Endpoint novo, sem paginação nem filtro por tipo de pesquisa (ver decisão
  2.5). Parâmetros de query: `de`, `ate` (datas `YYYY-MM-DD`, mesmo formato/
  validação de `validarData` já usado em `ciclos-avaliacao.service.ts`,
  linhas ~241–254) e `cicloId` opcional (uuid).
- Validação: `ate >= de` obrigatório (mesmo padrão de erro 422
  `DATAS_CICLO_INVALIDAS`-like já usado para `dataFim < dataInicio` em
  `criar()` de ciclos — nome de código a definir no planejamento). Se `de`/
  `ate` vierem ausentes, definir um default razoável (ver "Perguntas em
  aberto" nº 2 — não decidido nesta spec).
- Se `cicloId` for informado e não existir, `404 CICLO_NAO_ENCONTRADO` (mesmo
  código já usado em `buscarCicloOuFalhar`).
- Guard rail de anonimização (seção 3) reforçado com comentário no service,
  no mesmo padrão de `calcularProgressoCiclo`.

### Frontend (`frontend/`)

- Nova página `frontend/src/pages/AnaliseVisaoGeralPage/` (ou nome
  equivalente a validar no planejamento), dentro do grupo protegido já
  existente (`RotaProtegida papeis={['admin', 'gestor_rh']}` envolvendo
  `PainelAdminLayout`, ver `frontend/src/App.tsx`) — rota nova, ex.
  `/analise/visao-geral` (path exato a confirmar no planejamento).
- Filtro de período: dois `TextField type="date"` do MUI (`de`/`ate`, ver
  decisão 2.6), sem nova dependência de date-picker. Filtro de `cicloId`:
  populado via query string quando a navegação vem do botão "Visão Geral" do
  card de ciclo (decisão 2.2) — não precisa de um seletor de ciclo na própria
  tela nesta primeira versão (ver "Perguntas em aberto" nº 4: se a tela
  também precisa de um seletor manual de ciclo, independente do deep link).
- Botão novo "Visão Geral" no `CardActions` de cada card de
  `frontend/src/pages/CiclosListPage/CiclosListPage.tsx` (ao lado de "Ver
  detalhes", fora do bloco condicional `status === 'rascunho'`), navegando
  para a rota nova com `?cicloId=<id>` (ou padrão de query equivalente a
  confirmar no planejamento).
- 4 componentes/tiles de métrica — não existe hoje nenhum componente
  "stat tile"/"KPI card" reutilizável no projeto; candidato a criar em
  `frontend/src/components/analise/` (ex. `MetricaCard` ou similar), usando
  MUI (`Card`/`Typography`) + Tailwind para layout em grid, seguindo a
  convenção de estilo do projeto (MUI para controles, Tailwind para
  layout/espaçamento).
- Novo serviço `frontend/src/services/analiseService.ts` (padrão de funções
  soltas chamando `apiFetch<T>`, mesmo estilo de `ciclosService.ts`) e tipo
  novo em `frontend/src/types/analise.ts` espelhando o payload do endpoint.
- Menu lateral: o grupo "Análises" já existe como placeholder em
  `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx` (tipo
  `'submenus'`, submenus "Quantitativa"/"Qualitativa" com
  `opcoes: [{ label: 'Em breve', disabled: true }]`). O tipo `SubmenuOpcao`
  hoje não tem campo de rota (`to`) — para a Visão Geral aparecer como opção
  navegável real (não mais "Em breve"), é necessário estender
  `SubmenuOpcao` com um campo `to?: string` (ou equivalente) e ligar o
  `onClick`/navegação correspondente. Este ajuste de menu faz parte do
  recorte desta feature (é o único jeito hoje de a tela ficar alcançável
  fora do deep link de ciclo) — decisão de em qual submenu ("Quantitativa"
  parece o candidato natural, dado que a Visão Geral é só números agregados,
  mas confirmável no planejamento, ver "Perguntas em aberto" nº 5).
- Nenhuma regra de agregação/cálculo de anonimização no frontend — os 4
  números (e o detalhamento do tempo médio por tipo, decisão 2.4) vêm
  pré-computados da API; a tela só formata/exibe.

## 6. Contrato de API sugerido

Prefixo sugerido: `/api/analise` (atrás de `autenticar`, papéis
`admin`/`gestor_rh`). Nome de recurso e path exatos a confirmar no
`planejamento-backend` — sugestão abaixo é ponto de partida, não mandato.

### `GET /api/analise/visao-geral`

Query params: `de` (string `YYYY-MM-DD`, obrigatório ou com default — ver
"Perguntas em aberto" nº 2), `ate` (idem), `cicloId` (uuid, opcional).

- 200:
  ```json
  {
    "periodo": { "de": "2026-01-01", "ate": "2026-09-10" },
    "cicloId": null,
    "totalCiclos": 12,
    "totalRespostas": 340,
    "distribuicaoPorTipo": {
      "avaliacao_360": { "totalCiclos": 8, "totalRespostas": 220 },
      "clima_geral": { "totalCiclos": 4, "totalRespostas": 120 }
    },
    "taxaRespostaMedia": 78.5,
    "tempoMedioResposta": {
      "geral": { "horas": 36.2 },
      "avaliacao_360": { "horas": 30.1, "amostras": 220 },
      "clima_geral": { "horas": 48.7, "amostras": 120 }
    }
  }
  ```
  Unidade de tempo médio (`horas` acima) a confirmar no planejamento — pode
  fazer mais sentido em dias dado o ciclo de vida de uma avaliação (ver
  "Perguntas em aberto" nº 6).
- 422 `CAMPO_INVALIDO` / `PERIODO_INVALIDO` (nomes exatos a confirmar): `de`/
  `ate` ausentes/mal formatados ou `ate < de`.
- 404 `CICLO_NAO_ENCONTRADO`: `cicloId` informado não existe.
- `taxaRespostaMedia` usa a MESMA base de cálculo de `calcularProgressoCiclo`
  (percentual `concluidos/total`), mas AGREGADA sobre todos os ciclos do
  corte de período (não por ciclo isolado) — média simples entre ciclos ou
  ponderada por total de respondentes é decisão do planejamento (ver
  "Perguntas em aberto" nº 7).

Nenhum campo do payload identifica avaliador, avaliado ou tipo de
relacionamento — só contagens/médias, conforme guard rail da seção 3.

## 7. Perguntas em aberto (não bloqueiam o planejamento — recomendação registrada para cada uma)

1. **Nome definitivo do módulo/endpoint** (`analise` vs `analises`, path
   `/api/analise/visao-geral` vs alternativa). Recomendação: singular
   (`analise`), consistente com o padrão de nomes de módulo já existente no
   projeto (`pesquisas`, `perguntas` são plural por serem entidades; `analise`
   não é uma entidade, é um domínio de leitura — mas trivial de ajustar no
   planejamento se o backend-developer preferir plural).
2. **Default de `de`/`ate` quando ausentes.** Recomendação: exigir os dois
   como obrigatórios nesta primeira versão (422 se ausentes) — mais simples e
   explícito, evita decidir uma janela "default" (ex. últimos 90 dias) sem
   pedido explícito do usuário. Frontend pode pré-preencher os campos de data
   com uma sugestão (ex. início do ano corrente até hoje) só como UX, sem
   depender de um default do backend.
3. **Ciclo com mais de uma `pesquisa` vinculada** (sem `UNIQUE` em
   `pesquisas.ciclo_id`) — como classificar o ciclo em
   `distribuicaoPorTipo`. Recomendação: mesmo critério de desempate já usado
   em `buscarPesquisaVinculada` (pesquisa mais recente por `criado_em`,
   `ORDER BY DESC`), tratando 1 ciclo = 1 tipo para fins desta métrica. Caso
   real de mais de uma pesquisa por ciclo é raro hoje (sem `UNIQUE`, mas sem
   fluxo de UI que crie duas de propósito) — não crítico.
4. **A tela também precisa de um seletor manual de ciclo** (além do deep
   link vindo do card), ou o filtro de ciclo só existe via `?cicloId=` na
   URL? Recomendação: nesta primeira versão, só via query string (deep
   link) — sem `Select`/autocomplete de ciclo na própria tela, para manter o
   escopo pequeno; um seletor manual pode ser adicionado depois sem quebrar
   contrato (o endpoint já aceita `cicloId` opcional).
5. **Em qual submenu do grupo "Análises" a Visão Geral entra** —
   "Quantitativa" ou "Qualitativa" (`frontend/src/layouts/PainelAdminLayout/
   PainelAdminLayout.tsx`, linhas ~56–66). Recomendação: "Quantitativa" (a
   Visão Geral é só números agregados; "Qualitativa" fica mais natural para
   as futuras telas de Análise de Menções/Nuvem de Palavras, que lidam com
   texto aberto).
6. **Unidade de exibição do tempo médio de resposta** (horas vs dias).
   Recomendação: dias com uma casa decimal para ciclos de avaliação (que
   tipicamente duram semanas), deixando o backend retornar um valor numérico
   cru (ex. em horas, mais granular) e o frontend decidir a
   unidade/formatação de exibição — evita ter que decidir isso de novo se um
   valor for muito pequeno (< 1 dia) em ciclos de teste.
7. **Taxa de resposta média — média simples entre ciclos vs ponderada por
   volume de respondentes.** Recomendação: ponderada (soma de `concluidos`
   de todos os ciclos do corte / soma de `total` de todos os ciclos do
   corte) — evita que um ciclo pequeno (ex. 2 participantes, 100%) puxe a
   média geral tanto quanto um ciclo grande (ex. 200 participantes, 60%).
   Alternativa (média simples entre percentuais por ciclo) é mais fácil de
   implementar mas estatisticamente menos representativa — decisão final
   cabe ao planejamento/usuário se a recomendação for questionada.
8. **Ciclos sem nenhuma pesquisa vinculada** (`buscarPesquisaVinculada`
   retorna `null`) — entram em `totalCiclos` mas contribuem 0 para todas as
   outras métricas (mesmo comportamento de `calcularProgressoCiclo`, que
   retorna `{ total: 0, concluidos: 0, percentual: 0 }` quando
   `pesquisaVinculada` é `null`). Recomendação: manter o mesmo
   comportamento aqui, sem tratamento especial nem exclusão desses ciclos do
   `totalCiclos`.
9. **Formato de erro do frontend quando `ate < de`** (validação client-side
   antes de chamar a API, para evitar um round-trip com 422 previsível).
   Recomendação: validar no `onChange`/antes de disparar a busca (desabilitar
   o botão de filtrar ou mostrar erro inline), mas sempre revalidar no
   backend também — mesmo padrão de "validação autoritativa é sempre do
   backend" já usado em outras specs do projeto (ex. `coleta-respostas-
   publica`).
