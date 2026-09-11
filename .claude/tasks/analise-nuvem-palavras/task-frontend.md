# Task: Módulo Análise — tela "Nuvem de Palavras" (visualização LISTA) — Frontend

Demanda 100% frontend (`frontend/`, equivalente a `apps/web` na nomenclatura dos
agentes/skills — usar sempre os caminhos reais `frontend/**` neste plano). Não
toca `backend/`. Base obrigatória, lida por completo antes deste plano:
`.claude/tasks/analise-nuvem-palavras/spec.md` (todas as decisões, FECHADAS) e
`.claude/tasks/analise-nuvem-palavras/task-backend.md` (contrato definitivo de
`GET /api/analise/nuvem-palavras`, shapes `PalavraFrequencia`/
`NuvemPalavrasAnalise`/`MetricasComplementares`, códigos de erro). **O
contrato de API está FECHADO — este plano só o consome, não o reabre.**
Precedente direto de padrão de código (Nuvem de Palavras é a quarta tela do
mesmo módulo, com o mesmo padrão de filtro de "Avaliações"):
`AnaliseVisaoGeralPage`, `AnaliseAvaliacoesPage`, `AnaliseRankingPage` e todo
`frontend/src/components/analise/`.

Escopo desta rodada, conforme spec (seção 3 e 8) — **não reabrir**:

- Só visualização em **LISTA** (palavra + frequência, ordenada decrescente,
  top 50 já pronto do backend). **Bolhas** e **modo TV Dash** são visões
  futuras, fora de escopo — não implementar nenhum componente de bolha nem
  layout de tela cheia/TV aqui.
- **Sem atalho no card do Ciclo** (`CiclosListPage.tsx` não é tocado) — acesso
  só pelo menu lateral, grupo "Análises" → submenu "Qualitativa" (mesmo
  submenu de "Avaliações"), como segunda opção do array `opcoes`.
- Filtros: `de`/`ate` (período, **obrigatório**) + `cicloId` (**opcional**) —
  mesmo padrão de "Avaliações", diferente de "Ranking" (que exige `cicloId`
  único obrigatório sem período).
- Métricas complementares (`totalEnvios`, `totalRespostas`,
  `tempoMedioResposta`) já vêm prontas no mesmo payload — nunca recalculadas
  no frontend.
- Sem segmentação por pergunta, sem UI de configuração de stopwords — a lista
  é sempre unificada e as stopwords são fixas no backend (spec seção 3.6 e
  8).

---

## LEMBRETE CRÍTICO — nenhuma regra de negócio sensível vive no frontend

> A tokenização, remoção de stopwords, contagem de frequência e o gate de
> anonimização de `pares`/`subordinado`/`clima_geral` já rodam inteiramente no
> backend (spec, seção 2 e 4). O frontend só recebe `palavras: [{ palavra,
> frequencia }]` já agregada, já ordenada, já cortada em top 50 — e só
> formata/exibe. Nenhum componente desta feature reordena, filtra, agrupa ou
> tenta inferir origem (avaliado/ciclo/tipo de relacionamento) de nenhuma
> palavra — o payload, por design, não carrega esse dado (guard rail crítico
> nº 2 do `task-backend.md`), então não há nem como um componente do frontend
> tentar "completar" essa informação sem inventar um campo que a API nunca
> envia.

Consequências práticas, aplicadas neste plano:

- **Nenhum `.sort()`/`.reverse()` sobre `palavras` em nenhum arquivo desta
  feature** — o array já vem ordenado por `frequencia` decrescente do
  backend; renderizar na ordem recebida.
- **Nenhum campo de origem por palavra é inventado ou exibido** — nem
  `avaliadoId`, nem `cicloId` por palavra, nem `tipoRelacionamento`. O
  contrato (`PalavraFrequencia`) só tem `palavra`/`frequencia` — nenhum tipo
  do frontend deve acrescentar campos que a API não envia.
- **Destaque visual proporcional à frequência é só apresentação**: calcular
  a largura de uma barra (ou peso de fonte) a partir de `frequencia` — que já
  é um número público, agregado, sem identidade anexada — não é uma regra de
  negócio sensível, é só escala visual local ao componente de lista. Ainda
  assim, esse cálculo (`Math.max` sobre `frequencia` para achar o valor de
  referência da escala) é o único cálculo numérico permitido no frontend
  desta feature — nunca uma soma/média/contagem que dependa dos textos de
  origem.
- **Métricas complementares são lidas diretamente do payload** (`metricas.
  totalEnvios`, `metricas.totalRespostas`, `metricas.tempoMedioResposta`) —
  nunca recompostas a partir de outra chamada (`/api/analise/visao-geral`)
  nem recalculadas localmente. O backend já decidiu reaproveitar as mesmas
  funções de "Visão Geral" (task-backend.md, decisão 4) — o frontend não
  precisa (e não deve) saber disso, só consome o campo `metricas` deste
  endpoint.

---

## Estado atual verificado (antes do plano)

Todo o código abaixo foi lido por completo antes deste plano.

- `frontend/src/types/analise.ts` (existente): já tem `VisaoGeralAnalise`
  (100% agregado, inclusive a interface `TempoMedioComponente { horas,
  amostras }`, exportada e **reaproveitável tal qual** — o `tempoMedioResposta`
  de "Nuvem de Palavras" tem exatamente esse shape, confirmado por
  `task-backend.md`), o bloco de "Avaliações" (payload misto) e o bloco de
  "Ranking" (identidade do avaliado + nota agregada). "Nuvem de Palavras"
  ganha um quarto bloco, ao final do arquivo, com comentário de topo próprio
  — payload 100% agregado, mais simples que os três anteriores (nenhuma
  identidade em nenhum campo, nem a do avaliado).
- `frontend/src/services/analiseService.ts` (existente): três funções soltas
  (`buscarVisaoGeralAnalise`, `buscarAvaliacoesAnalise`,
  `buscarRankingAnalise`) sobre `apiFetch<T>`, `URLSearchParams` montado a
  mão, parâmetros opcionais via `query.set` condicional.
  `buscarNuvemPalavrasAnalise` entra no mesmo arquivo, mesmo estilo — mesmo
  raciocínio já registrado nas três tasks anteriores (não há lógica
  sensível própria de transporte HTTP que justifique um arquivo dedicado).
- `frontend/src/components/analise/` (existente): `SeletorCiclo` (dropdown
  com opção "Todos os ciclos", `value=""` → `null` — **compatível tal qual**
  com o filtro opcional desta feature, diferente de "Ranking"),
  `MetricaCard` (stat tile — **reaproveitável tal qual** para as métricas
  complementares, mesmo componente já usado em `AnaliseVisaoGeralPage`),
  `AvisoLimitacaoAnonimizacao`, `EstadoAguardandoMinimo`,
  `AvaliacaoIdentificadaCard`, `GrupoClimaCard`, `GrupoParesSubordinadoCard`,
  `RankingDadosInsuficientesTag`, `RankingTabela`, `rotulosRelacionamento.ts`
  — nenhum desses serve para renderizar uma lista de palavra+frequência sem
  modificação. `AvisoLimitacaoAnonimizacao`/`EstadoAguardandoMinimo` **não
  são reaproveitados aqui** (ver decisão 5 abaixo) — o payload desta feature
  não expõe nenhum estado de bloqueio por grupo (spec, seção 2, último
  parágrafo: o gate acontece antes da fusão, nunca é visível no payload
  final), então não há "o que" esses componentes mostrariam.
  `ListaFrequenciaPalavras` é genuinamente novo.
- `frontend/src/components/analise/SeletorCiclo/SeletorCiclo.tsx`: `cicloId:
  string | null`, `onChange(cicloId: string | null)`, opção fixa "Todos os
  ciclos" (`value=""`). **Não será alterado** — mesmo componente, mesmo uso
  de "Visão Geral"/"Avaliações" (filtro opcional, não obrigatório como em
  "Ranking").
- `frontend/src/pages/AnaliseAvaliacoesPage/AnaliseAvaliacoesPage.tsx` e
  `frontend/src/pages/AnaliseVisaoGeralPage/AnaliseVisaoGeralPage.tsx`
  (existentes): mesmo esqueleto — `useSearchParams` só para `cicloId`
  (`de`/`ate` não são persistidos na URL, sempre reiniciam do "ano corrente
  até hoje" a cada carga de página, mesmo comportamento das duas), `Paper
  component="form" onSubmit` com dois `TextField type="date"` +
  `SeletorCiclo` + botão "Aplicar filtro" (desabilitado se `periodoInvalido`)
  + botão "Limpar filtro" (só aparece se `filtroAlterado`), `executarBusca`
  com `overrides` opcionais, tela de erro com `Typography role="alert"` +
  botão "Tentar novamente", `Skeleton`s durante `carregando`. "Nuvem de
  Palavras" segue **literalmente** este mesmo esqueleto (é o único ponto de
  reaproveitamento estrutural mais forte entre as quatro telas, já que
  compartilha o mesmo padrão de filtro de "Avaliações").
- `frontend/src/pages/AnaliseVisaoGeralPage/formatadores.ts` e
  `frontend/src/pages/AnaliseAvaliacoesPage/formatadores.ts` (existentes,
  cada página tem sua própria cópia local — padrão já aceito no projeto,
  confirmado também em `analise-ranking/task-frontend.md`, decisão 10):
  `formatarInteiro`, `formatarPercentual` (não usada aqui — este payload não
  tem percentual), `formatarTempoMedio`, `inicioAnoCorrenteYMD`, `hojeYMD`.
  "Nuvem de Palavras" ganha sua própria cópia local, só das funções que usa
  (`formatarInteiro`, `formatarTempoMedio`, `inicioAnoCorrenteYMD`,
  `hojeYMD`) — mesma pequena duplicação já aceita, evita import cruzando
  entre diretórios de `pages/`.
- `frontend/src/App.tsx`: bloco `<Route element={<RotaProtegida
  papeis={['admin','gestor_rh']} />}><Route element={<PainelAdminLayout
  />}>...` já contém `/analise/visao-geral`, `/analise/avaliacoes` e
  `/analise/ranking` (linhas ~44–46). Rota nova entra no mesmo nível, logo
  abaixo de `/analise/ranking`.
- `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`: `GRUPOS`
  (`analises` → `submenus: [quantitativa, qualitativa]`);
  `qualitativa.opcoes` já tem `{ label: 'Avaliações', to:
  '/analise/avaliacoes' }` (única entrada hoje). "Nuvem de Palavras" entra
  como segunda entrada desse mesmo array — mesmo array citado pela spec
  (seção 3.2). `SubmenuOpcao.to?: string` já existe; `grupoAtivo(pathname)`
  já reconhece genericamente qualquer `to` novo dentro de um grupo `tipo
  === 'submenus'` — nenhuma mudança extra nessa função (mesma confirmação já
  feita em `analise-ranking/task-frontend.md`).
- `frontend/src/pages/CiclosListPage/CiclosListPage.tsx`: **não é tocado**
  nesta feature — decisão fechada da spec (seção 3.2): mesmo padrão de
  "Ranking" (sem atalho de card), diferente de "Visão Geral"/"Avaliações".
- `frontend/src/lib/apiClient.ts` (`ApiError`, `apiFetch`): `codigo` tipado
  opcional — mesmo padrão de mapeamento de código de erro já usado nas três
  telas anteriores.

## Contrato de API a consumir (fechado por `task-backend.md` — não reabrir)

`GET /api/analise/nuvem-palavras?de=&ate=&cicloId=`

- `de`/`ate` (string `YYYY-MM-DD`, **obrigatórios**). `cicloId` (uuid,
  **opcional**) — diferente de "Ranking", aceita qualquer tipo de ciclo
  (avaliação 360 ou clima geral), sem checagem `CICLO_NAO_E_AVALIACAO_360`.
- Erros: `422 CAMPO_INVALIDO` (`de`/`ate` ausentes/mal formatados, `cicloId`
  mal formatado), `422 PERIODO_INVALIDO` (`ate < de`), `404
  CICLO_NAO_ENCONTRADO`, `403 PAPEL_NAO_AUTORIZADO`.
- 200 →
  ```ts
  {
    periodo: { de: string; ate: string }
    cicloId: string | null
    palavras: { palavra: string; frequencia: number }[] // já ordenado desc, máx 50
    metricas: {
      totalEnvios: number
      totalRespostas: number
      tempoMedioResposta: { horas: number; amostras: number }
    }
  }
  ```
- `palavras: []` é resposta `200` válida (nenhum grupo liberado contribuiu
  palavras no período/ciclo, ou todo texto liberado ficou abaixo do piso de
  tamanho) — **nunca erro**, e não é distinguível de "bloqueado por gate" (a
  spec, seção 2, deixa isso deliberadamente indistinto — o frontend não deve
  tentar adivinhar o motivo).
- `metricas` é sempre preenchida (mesmo quando `palavras` é `[]`) — quando o
  universo de ciclos do período/filtro é vazio, o backend retorna
  `metricas` toda zerada (`{ totalEnvios: 0, totalRespostas: 0,
  tempoMedioResposta: { horas: 0, amostras: 0 } }`), nunca omite o campo.
- Nenhum campo do payload expõe `avaliador_id`, `avaliado_id`, `cicloId` por
  palavra, `tipoRelacionamento`, texto original de resposta, nem contagem de
  respondentes por avaliado/grupo/tipo de relacionamento.

## Papéis com acesso

`admin` e `gestor_rh` — **idênticos**, sem nenhuma renderização condicional
por papel dentro de `AnaliseNuvemPalavrasPage` ou de `ListaFrequenciaPalavras`
(mesmo princípio já fechado nas três telas anteriores do módulo — RH/admin
não têm bypass do limiar de anonimização, então também não há nada que a UI
precise mostrar diferente entre os dois papéis). A única checagem de papel é
`RotaProtegida papeis={['admin', 'gestor_rh']}`, no nível de rota;
`colaborador` nunca alcança `/analise/nuvem-palavras`.

## Decisões (com justificativa)

1. **Nome da página e da rota**: `AnaliseNuvemPalavrasPage`,
   `frontend/src/pages/AnaliseNuvemPalavrasPage/`, rota
   `/analise/nuvem-palavras` — mesmo padrão de nomenclatura das três telas
   anteriores (`Analise<Nome>Page`, rota `/analise/<kebab-case>`).
2. **Um único arquivo de tipos, um único arquivo de service** — mesmo
   raciocínio já usado nas três telas anteriores: o frontend não tem lógica
   de tokenização/gate própria, só tipos e uma função de transporte HTTP.
3. **Reaproveitar `TempoMedioComponente` já existente** em `types/analise.ts`
   para `metricas.tempoMedioResposta`, em vez de declarar um tipo novo
   idêntico — mesmo shape (`{ horas, amostras }`) confirmado por
   `task-backend.md`.
4. **Reaproveitar o esqueleto de página de "Avaliações" literalmente** (não
   o de "Ranking", que tem filtros diferentes) — mesmo padrão de filtro
   (`de`/`ate` obrigatório com submit, `cicloId` opcional via
   `SeletorCiclo`), mesmo tratamento de erro, mesmo padrão de
   `Skeleton`/estado vazio. Única diferença estrutural de conteúdo: em vez de
   `Accordion`s por ciclo com cards de texto, a página renderiza um bloco de
   métricas (`MetricaCard`s) + `ListaFrequenciaPalavras`.
5. **`AvisoLimitacaoAnonimizacao`/`EstadoAguardandoMinimo` não são
   reaproveitados** — o payload desta feature nunca expõe um estado de
   bloqueio por grupo (a fusão acontece no backend, antes da resposta; ver
   spec seção 2). Diferente de "Avaliações" (que tem grupos individualmente
   marcados `liberado: false`), aqui não há nada de granular para esses
   componentes mostrarem — adicionar um deles seria inventar uma leitura que
   a API não oferece. Se `palavras` vier vazio, a UI mostra um estado neutro
   de "nenhuma palavra encontrada" (decisão 8), não uma mensagem sobre
   anonimização (a ausência não é atribuível com certeza ao gate).
6. **Destaque visual: barra proporcional, não tamanho de fonte** —
   `ListaFrequenciaPalavras` usa uma barra horizontal (`Box` com `width`
   calculada) ao lado de cada frequência, com largura relativa ao maior
   valor de `frequencia` **da própria lista recebida**
   (`Math.max(...palavras.map(p => p.frequencia))`). Preferido a variar
   `font-size` porque (a) evita problemas de acessibilidade/leiaute com
   textos de tamanhos muito discrepantes numa lista vertical, e (b) é mais
   simples de implementar corretamente numa `Table` do que a variação de
   fonte pediria. Nenhuma bolha, nenhum posicionamento livre — ainda é uma
   lista (spec, seção 3.1/8).
7. **Métricas complementares como 2 `MetricaCard`s**, mesmo componente já
   usado em `AnaliseVisaoGeralPage` (sem nenhuma mudança no componente):
   - "Envios e respostas": `valor = formatarInteiro(metricas.totalEnvios)`,
     `descricao = 'envios no período'`, `detalhes = [{ rotulo: 'Total de
     respostas', valor: formatarInteiro(metricas.totalRespostas) }]`.
   - "Tempo médio de resposta": `valor =
     formatarTempoMedio(metricas.tempoMedioResposta.horas)`, `descricao =
     '${amostras} respostas com tempo registrado'`.
   Só 2 cards porque o contrato desta feature (diferente de "Visão Geral")
   não inclui `taxaRespostaMedia` nem `distribuicaoPorTipo` — não inventar
   esses números aqui.
8. **Estado "vazio" tratado só para a lista, não para a página inteira** —
   `metricas` é sempre exibida quando `dados !== null` (mesmo se `totalEnvios
   === 0`, os cards mostram "0"), independente de `palavras.length`. Só o
   bloco da lista alterna entre `ListaFrequenciaPalavras` (quando `palavras.
   length > 0`) e um `Alert severity="info"` "Nenhuma palavra encontrada
   para o período/filtro selecionado." (quando `palavras.length === 0`).
   Diferente de "Avaliações"/"Visão Geral" (onde o estado vazio cobre a tela
   toda) porque aqui `metricas` e `palavras` são semanticamente
   independentes dentro do mesmo payload — zerar a tela inteira esconderia
   informação real (`totalEnvios`/`totalRespostas` podem ser > 0 mesmo com
   `palavras: []`, ex. todo texto ficou abaixo do piso de tamanho mínimo).
9. **Mapeamento de erro por código**: `CICLO_NAO_ENCONTRADO` → "O ciclo
   filtrado não foi encontrado. Remova o filtro de ciclo e tente novamente."
   (mesma mensagem literal de "Avaliações"/"Visão Geral" para o mesmo
   código); demais erros/rede → mensagem genérica "Não foi possível carregar
   a nuvem de palavras.".
10. **Nenhuma nova dependência** — `@mui/material` (`Table*`, `Box`,
    `Typography`, `Paper`, `TextField`, `Button`, `Alert`, `Skeleton`,
    `Tooltip`, `IconButton`) e `@mui/icons-material`
    (`InfoOutlined`, já usado nas outras três telas) bastam.

## Guard rails obrigatórios (frontend-developer e revisor)

- **Nenhum `.sort()`/`.reverse()`** sobre `palavras` ou qualquer array
  derivado dela em nenhum arquivo novo — renderizar sempre na ordem recebida
  do payload.
- **Nenhum campo de origem por palavra** (`avaliadoId`, `cicloId` por
  palavra, `tipoRelacionamento`, `avaliadorId`/nome) em nenhum tipo, prop ou
  render desta feature — grep por esses nomes dentro dos arquivos novos deve
  retornar zero ocorrências.
- **Nenhuma chamada a `/api/analise/visao-geral` a partir desta feature** —
  as métricas complementares vêm só de `metricas` do próprio payload de
  `/api/analise/nuvem-palavras`.
- **Nenhum recálculo de frequência/contagem de palavra** no frontend —
  `palavra`/`frequencia` são sempre lidos diretamente do payload.
- **`Math.max` sobre `frequencia` é o único cálculo numérico permitido**
  neste conjunto de arquivos, e só para a largura de barra em
  `ListaFrequenciaPalavras` — qualquer outro cálculo numérico (soma, média,
  filtragem por valor) é achado a reportar.
- **Nenhum `if (colaborador.papel === ...)` em nenhum arquivo novo** — a
  única checagem de papel é `RotaProtegida`, no nível de rota.
- **`SeletorCiclo` não é modificado.**
- **`CiclosListPage.tsx` não é tocado** — sem atalho de card para esta
  feature (spec, seção 3.2).
- **Estilo**: Tailwind só para layout/grid/espaçamento; MUI para os
  controles. Nenhum `.css` novo, nenhum `style={{}}` extenso — a barra de
  destaque usa `sx` do MUI (`Box sx={{ width: ... }}`), não `style` inline
  bruto.
- **Import de ícone default por arquivo individual**
  (`import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'`), nunca
  do barrel.

---

## Plano — Frontend

### 1. frontend-developer — CONCLUÍDO

Implementado literalmente conforme o plano acima (seções 1.1–1.7), sem
reabrir nenhuma decisão. Resumo:

- `frontend/src/types/analise.ts`: acrescentado o bloco `PalavraFrequencia`/
  `MetricasComplementaresNuvem`/`NuvemPalavrasAnalise` ao final do arquivo,
  reaproveitando `TempoMedioComponente` já existente.
- `frontend/src/services/analiseService.ts`: acrescentada
  `buscarNuvemPalavrasAnalise`/`BuscarNuvemPalavrasAnaliseParams`, mesmo
  estilo das três funções existentes.
- `frontend/src/components/analise/ListaFrequenciaPalavras/ListaFrequenciaPalavras.tsx`
  (novo): tabela MUI "burra" com barra proporcional (`Math.max` como único
  cálculo numérico), renderiza `palavras` na ordem recebida, sem
  `.sort()`/`.reverse()`, sem campo de origem.
- `frontend/src/pages/AnaliseNuvemPalavrasPage/formatadores.ts` (novo):
  cópia local de `formatarInteiro`/`formatarTempoMedio`/
  `inicioAnoCorrenteYMD`/`hojeYMD`.
- `frontend/src/pages/AnaliseNuvemPalavrasPage/AnaliseNuvemPalavrasPage.tsx`
  (novo): esqueleto literal de `AnaliseAvaliacoesPage` (filtro `de`/`ate` +
  `SeletorCiclo`, `Skeleton`s, erro com retry, mapeamento
  `CICLO_NAO_ENCONTRADO`), com `metricas` sempre exibida via 2
  `MetricaCard`s e a lista alternando entre `ListaFrequenciaPalavras` e
  `Alert` de vazio (decisão 8) — nunca chama
  `/api/analise/visao-geral`.
- `frontend/src/App.tsx`: import + rota
  `/analise/nuvem-palavras` dentro do grupo protegido
  `admin`/`gestor_rh` já existente, logo abaixo de `/analise/ranking`.
- `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`:
  `qualitativa.opcoes` ganhou a segunda entrada `{ label: 'Nuvem de
  Palavras', to: '/analise/nuvem-palavras' }`.
- `frontend/src/pages/CiclosListPage/CiclosListPage.tsx`: não tocado
  (confirmado, spec seção 3.2). `SeletorCiclo`: não modificado.

Guard rails verificados por grep (zero ocorrências) em
`ListaFrequenciaPalavras.tsx` e `AnaliseNuvemPalavrasPage.tsx`:
`avaliadoId`/`avaliadorId`/`tipoRelacionamento`/`.sort(`/`.reverse(`/
`buscarVisaoGeralAnalise`/checagem de papel fora de `RotaProtegida`.

**Build**: `npm run build` (`tsc -b && vite build`) passou sem erros.

**Lint**: `npm run lint` reporta 9 erros/4 avisos pré-existentes na regra
`react-hooks/set-state-in-effect`/`react-hooks/exhaustive-deps`, todos no
mesmo padrão já presente em `AnaliseAvaliacoesPage.tsx`,
`AnaliseRankingPage.tsx`, `AnaliseVisaoGeralPage.tsx`, `CicloDetalhePage.tsx`
e `CiclosListPage.tsx` (nenhum desses arquivos foi tocado por esta task).
`AnaliseNuvemPalavrasPage.tsx` reproduz exatamente 1 instância desse mesmo
padrão (`useEffect(() => { executarBusca() }, [])`) porque o plano mandou
copiar literalmente o esqueleto de `AnaliseAvaliacoesPage` — não é um erro
novo introduzido por esta task, é a mesma convenção já aceita no restante do
módulo Análise. Não corrigido aqui para não divergir do padrão das três
telas irmãs sem instrução explícita.

**Integração ponta a ponta não testada** — o endpoint
`GET /api/analise/nuvem-palavras` estava sendo implementado em paralelo pelo
`backend-developer` no momento desta implementação; código escrito contra o
contrato fechado em `task-backend.md`, mas não validado com o dev server
rodando contra o backend real.

#### 1.1 `frontend/src/types/analise.ts` (editado — acréscimo ao final)

```ts
// ---- "Nuvem de Palavras" (GET /api/analise/nuvem-palavras) ----
// Payload 100% agregado — mais simples que os três blocos acima: NENHUM
// campo identifica avaliador, avaliado, ciclo (por palavra) ou tipo de
// relacionamento. `palavras` já vem ordenada por `frequencia` decrescente
// (top 50) pelo backend — NUNCA reordenar/filtrar no frontend. `metricas`
// reaproveita o mesmo shape de tempo médio já usado por `VisaoGeralAnalise`
// (`TempoMedioComponente`), mas é um subconjunto próprio (só
// totalEnvios/totalRespostas/tempoMedioResposta) — não confundir com
// `VisaoGeralAnalise.tempoMedioResposta`, que tem quebra por tipo de
// pesquisa (esta feature não tem).

export interface PalavraFrequencia {
  palavra: string
  frequencia: number
}

export interface MetricasComplementaresNuvem {
  totalEnvios: number
  totalRespostas: number
  tempoMedioResposta: TempoMedioComponente
}

export interface NuvemPalavrasAnalise {
  periodo: { de: string; ate: string }
  cicloId: string | null
  palavras: PalavraFrequencia[]
  metricas: MetricasComplementaresNuvem
}
```

`TempoMedioComponente` já é exportada (bloco de `VisaoGeralAnalise`, topo do
arquivo) — reaproveitada por import implícito (mesmo arquivo), sem
redeclarar.

#### 1.2 `frontend/src/services/analiseService.ts` (editado — acréscimo)

```ts
import type {
  AvaliacoesAnalise,
  NuvemPalavrasAnalise,
  RankingAnalise,
  VisaoGeralAnalise,
} from '../types/analise'

// ... (buscarVisaoGeralAnalise / buscarAvaliacoesAnalise / buscarRankingAnalise já existentes, inalteradas)

export interface BuscarNuvemPalavrasAnaliseParams {
  de: string // 'YYYY-MM-DD'
  ate: string // 'YYYY-MM-DD'
  cicloId?: string
}

/**
 * `GET /api/analise/nuvem-palavras` — dado 100% agregado (frequência de
 * palavras + métricas complementares), nunca identificado. `de`/`ate` são
 * sempre obrigatórios (sem default no backend); `cicloId` é opcional, mesmo
 * padrão de `buscarAvaliacoesAnalise`. `palavras` já vem ordenada/cortada
 * pelo backend — esta função só transporta, não reordena.
 */
export function buscarNuvemPalavrasAnalise(
  params: BuscarNuvemPalavrasAnaliseParams,
): Promise<NuvemPalavrasAnalise> {
  const query = new URLSearchParams({ de: params.de, ate: params.ate })
  if (params.cicloId) query.set('cicloId', params.cicloId)
  return apiFetch<NuvemPalavrasAnalise>(`/api/analise/nuvem-palavras?${query.toString()}`)
}
```

#### 1.3 `frontend/src/components/analise/ListaFrequenciaPalavras/ListaFrequenciaPalavras.tsx` (novo)

```tsx
import { Box, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material'
import type { PalavraFrequencia } from '../../../types/analise'

interface ListaFrequenciaPalavrasProps {
  palavras: PalavraFrequencia[]
}

/**
 * Componente "burro": `palavras` já vem ordenada por `frequencia`
 * decrescente (top 50) da API — este componente só renderiza na ordem
 * recebida, nunca reordena/filtra/agrupa. A barra de destaque é só
 * apresentação: largura proporcional ao maior valor de `frequencia` da
 * própria lista recebida (`Math.max`) — nenhum outro cálculo numérico
 * acontece aqui. Nenhuma prop carrega origem (avaliado/ciclo/tipo de
 * relacionamento) porque o payload, por design, não tem esse campo.
 */
export function ListaFrequenciaPalavras({ palavras }: ListaFrequenciaPalavrasProps) {
  const frequenciaMaxima = palavras.length > 0 ? Math.max(...palavras.map((item) => item.frequencia)) : 0

  return (
    <TableContainer>
      <Table size="small">
        <TableBody>
          {palavras.map((item) => {
            const largura = frequenciaMaxima > 0 ? Math.round((item.frequencia / frequenciaMaxima) * 100) : 0
            return (
              <TableRow key={item.palavra}>
                <TableCell sx={{ width: '35%', whiteSpace: 'nowrap' }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {item.palavra}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box className="flex items-center gap-3">
                    <Box
                      sx={{
                        height: 10,
                        borderRadius: 1,
                        bgcolor: 'primary.main',
                        width: `${largura}%`,
                        minWidth: 4,
                        flexShrink: 0,
                      }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {item.frequencia}
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
```

#### 1.4 `frontend/src/pages/AnaliseNuvemPalavrasPage/formatadores.ts` (novo, local à página)

```ts
const FORMATADOR_INTEIRO = new Intl.NumberFormat('pt-BR')

/** Duplicado deliberado de `AnaliseVisaoGeralPage/formatadores.ts` — só o que esta tela usa. */
export function formatarInteiro(valor: number): string {
  return FORMATADOR_INTEIRO.format(valor)
}

export function formatarTempoMedio(horas: number): string {
  if (horas <= 0) return '—'

  const totalMinutos = Math.round(horas * 60)

  if (totalMinutos < 60) {
    return `${totalMinutos}min`
  }

  const dias = Math.floor(totalMinutos / 1440)
  const horasRestantes = Math.floor((totalMinutos % 1440) / 60)
  const minutosRestantes = totalMinutos % 60

  if (totalMinutos < 1440) {
    return minutosRestantes === 0 ? `${horasRestantes}h` : `${horasRestantes}h ${minutosRestantes}min`
  }

  const partes = [`${dias}d`]
  if (horasRestantes > 0) partes.push(`${horasRestantes}h`)
  if (minutosRestantes > 0) partes.push(`${minutosRestantes}min`)
  return partes.join(' ')
}

export function inicioAnoCorrenteYMD(): string {
  return `${new Date().getFullYear()}-01-01`
}

export function hojeYMD(): string {
  const hoje = new Date()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')
  return `${hoje.getFullYear()}-${mes}-${dia}`
}
```

Cópia literal das funções equivalentes de `AnaliseVisaoGeralPage/
formatadores.ts` (mesmo padrão de pequena duplicação local-à-página já aceito
no projeto — `formatarPercentual` não é copiada aqui por não ser usada nesta
tela).

#### 1.5 `frontend/src/pages/AnaliseNuvemPalavrasPage/AnaliseNuvemPalavrasPage.tsx` (novo)

Esqueleto literal de `AnaliseAvaliacoesPage`/`AnaliseVisaoGeralPage`
(`useSearchParams` só para `cicloId`, `de`/`ate` reiniciados a cada carga,
`Paper component="form"` com submit, `Skeleton`s, erro com retry), trocando o
conteúdo de sucesso por métricas + lista:

```tsx
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, IconButton, Paper, Skeleton, TextField, Tooltip, Typography } from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { ListaFrequenciaPalavras } from '../../components/analise/ListaFrequenciaPalavras/ListaFrequenciaPalavras'
import { MetricaCard } from '../../components/analise/MetricaCard/MetricaCard'
import { SeletorCiclo } from '../../components/analise/SeletorCiclo/SeletorCiclo'
import { ApiError } from '../../lib/apiClient'
import { buscarNuvemPalavrasAnalise } from '../../services/analiseService'
import type { NuvemPalavrasAnalise } from '../../types/analise'
import { formatarInteiro, formatarTempoMedio, hojeYMD, inicioAnoCorrenteYMD } from './formatadores'

/**
 * Frequência de palavras extraídas de respostas de texto aberto, já
 * tokenizadas/filtradas/agregadas e anonimizadas pelo backend (pares/
 * subordinado/clima só contribuem se atingirem o mínimo do ciclo — sem
 * bypass para nenhum papel). Esta página só formata/exibe `palavras` (já
 * ordenada por frequência decrescente, top 50) e `metricas` — nenhum
 * cálculo de tokenização/contagem/gate acontece aqui.
 */
export function AnaliseNuvemPalavrasPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [deInicial] = useState(() => inicioAnoCorrenteYMD())
  const [ateInicial] = useState(() => hojeYMD())
  const [de, setDe] = useState(deInicial)
  const [ate, setAte] = useState(ateInicial)
  const [cicloId, setCicloId] = useState<string | null>(() => searchParams.get('cicloId'))

  const [dados, setDados] = useState<NuvemPalavrasAnalise | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const periodoInvalido = ate < de
  const filtroAlterado = cicloId !== null || de !== deInicial || ate !== ateInicial

  const executarBusca = useCallback(
    async (overrides?: { de?: string; ate?: string; cicloId?: string | null }) => {
      const deAtual = overrides?.de !== undefined ? overrides.de : de
      const ateAtual = overrides?.ate !== undefined ? overrides.ate : ate
      const cicloIdAtual = overrides?.cicloId !== undefined ? overrides.cicloId : cicloId

      if (ateAtual < deAtual) return

      setCarregando(true)
      setErro(null)
      try {
        const resultado = await buscarNuvemPalavrasAnalise({
          de: deAtual,
          ate: ateAtual,
          cicloId: cicloIdAtual ?? undefined,
        })
        setDados(resultado)
      } catch (err) {
        if (err instanceof ApiError && err.codigo === 'CICLO_NAO_ENCONTRADO') {
          setErro('O ciclo filtrado não foi encontrado. Remova o filtro de ciclo e tente novamente.')
        } else {
          setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar a nuvem de palavras.')
        }
      } finally {
        setCarregando(false)
      }
    },
    [de, ate, cicloId],
  )

  useEffect(() => {
    executarBusca()
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    executarBusca()
  }

  function handleCicloChange(novoCicloId: string | null) {
    setCicloId(novoCicloId)
    setSearchParams(novoCicloId ? { cicloId: novoCicloId } : {}, { replace: true })
    executarBusca({ cicloId: novoCicloId })
  }

  function handleLimparFiltro() {
    setDe(deInicial)
    setAte(ateInicial)
    setCicloId(null)
    setSearchParams({}, { replace: true })
    executarBusca({ de: deInicial, ate: ateInicial, cicloId: null })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-start gap-2">
        <Typography variant="h5" component="h1">
          Nuvem de Palavras
        </Typography>
        <Tooltip
          title="Palavras mais frequentes nas respostas de texto aberto do período selecionado."
          arrow
          placement="top"
        >
          <IconButton size="medium" aria-label="Nuvem de Palavras" sx={{ p: 0.25 }}>
            <InfoOutlinedIcon fontSize="medium" color="action" />
          </IconButton>
        </Tooltip>
      </div>

      <Paper component="form" onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3 p-4">
        <TextField
          label="De"
          type="date"
          size="small"
          value={de}
          onChange={(e) => setDe(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Até"
          type="date"
          size="small"
          value={ate}
          onChange={(e) => setAte(e.target.value)}
          error={periodoInvalido}
          helperText={periodoInvalido ? 'A data final não pode ser anterior à data inicial.' : ' '}
          slotProps={{
            inputLabel: { shrink: true },
            formHelperText: {
              sx: { position: 'absolute', bottom: -20, left: 0, whiteSpace: 'nowrap' },
            },
          }}
        />
        <SeletorCiclo cicloId={cicloId} onChange={handleCicloChange} />
        <Button type="submit" variant="contained" disabled={periodoInvalido || carregando}>
          Aplicar filtro
        </Button>
        {filtroAlterado && (
          <Button variant="text" onClick={handleLimparFiltro} disabled={carregando}>
            Limpar filtro
          </Button>
        )}
      </Paper>

      {carregando && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton variant="rounded" height={140} />
            <Skeleton variant="rounded" height={140} />
          </div>
          <Skeleton variant="rounded" height={320} />
        </div>
      )}

      {!carregando && erro && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <Typography role="alert" color="error">
            {erro}
          </Typography>
          <Button variant="contained" color="primary" onClick={() => executarBusca()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {!carregando && !erro && dados && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricaCard
              titulo="Envios e respostas"
              valor={formatarInteiro(dados.metricas.totalEnvios)}
              descricao="envios no período"
              detalhes={[{ rotulo: 'Total de respostas', valor: formatarInteiro(dados.metricas.totalRespostas) }]}
              tooltip="Quantidade de envios de pesquisa no período selecionado, e quantas respostas já foram registradas."
            />
            <MetricaCard
              titulo="Tempo médio de resposta"
              valor={formatarTempoMedio(dados.metricas.tempoMedioResposta.horas)}
              descricao={`${formatarInteiro(dados.metricas.tempoMedioResposta.amostras)} respostas com tempo registrado`}
              tooltip="Tempo médio que as pessoas levam para responder à pesquisa assim que recebem o link, no período selecionado."
            />
          </div>

          <div className="flex flex-col gap-3">
            <Typography variant="subtitle1">Palavras mais frequentes</Typography>
            {dados.palavras.length === 0 ? (
              <Alert severity="info">Nenhuma palavra encontrada para o período/filtro selecionado.</Alert>
            ) : (
              <Paper className="p-2">
                <ListaFrequenciaPalavras palavras={dados.palavras} />
              </Paper>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

**Papéis com acesso**: `admin`, `gestor_rh` — idênticos (ver seção "Papéis com
acesso" acima).

**Endpoints consumidos**: `GET /api/analise/nuvem-palavras` (palavras +
métricas complementares, dado 100% agregado — ver "Lembrete crítico"); `GET
/api/ciclos` (indiretamente, via `SeletorCiclo`).

**Estados tratados**: (1) carregando → `Skeleton`s (2 tiles de métrica + 1
bloco de lista); (2) erro → texto com `role="alert"` + botão "Tentar
novamente" (mesmo padrão de "Avaliações"/"Visão Geral"); (3) sucesso com
`metricas` sempre visível e a lista alternando entre vazio
(`Alert severity="info"`, quando `palavras.length === 0`) e
`ListaFrequenciaPalavras` (quando há palavras) — ver decisão 8 sobre por que
o estado vazio é só da lista, não da página inteira.

#### 1.6 `frontend/src/App.tsx` (editado)

Import de `AnaliseNuvemPalavrasPage` +
`<Route path="/analise/nuvem-palavras" element={<AnaliseNuvemPalavrasPage />} />`
dentro do `<Route element={<PainelAdminLayout />}>` já existente, logo abaixo
de `/analise/ranking`. Nenhuma outra linha muda.

#### 1.7 `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx` (editado)

Única mudança: `qualitativa.opcoes` ganha uma segunda entrada:

```ts
{
  key: 'qualitativa',
  label: 'Qualitativa',
  opcoes: [
    { label: 'Avaliações', to: '/analise/avaliacoes' },
    { label: 'Nuvem de Palavras', to: '/analise/nuvem-palavras' },
  ],
},
```

Nenhuma outra linha do arquivo muda — `grupoAtivo` já reconhece `opcoes[].to`
de qualquer grupo `tipo === 'submenus'` genericamente (ver "Estado atual
verificado").

#### 1.8 `frontend/src/pages/CiclosListPage/CiclosListPage.tsx` — SEM MUDANÇA

Confirmação explícita (spec seção 3.2): "Nuvem de Palavras" não ganha
botão/atalho no card de Ciclo, mesmo padrão de "Ranking". Nenhuma linha
deste arquivo é tocada por esta feature.

---

### 2. frontend-codereviewer

Pontos de atenção específicos (além da checklist padrão do módulo):

1. **Nenhum `.sort()`/`.reverse()`** sobre `palavras`/`dados.palavras` ou
   qualquer array derivado, em `ListaFrequenciaPalavras.tsx` ou
   `AnaliseNuvemPalavrasPage.tsx`.
2. **Nenhum campo de origem por palavra**: grep por
   `avaliadoId`/`avaliadorId`/`cicloId` (dentro de um item de `palavras`)/
   `tipoRelacionamento` nos arquivos novos — qualquer ocorrência fora de
   comentário explicativo é achado **crítico**. Confirmar que
   `PalavraFrequencia`/`NuvemPalavrasAnalise` em `types/analise.ts` têm
   exatamente os campos do contrato fechado, sem campo extra inventado.
3. **Único cálculo numérico permitido**: confirmar que o único cálculo em
   `ListaFrequenciaPalavras.tsx` é `Math.max(...palavras.map(p =>
   p.frequencia))` para a largura da barra — nenhuma soma, média, filtragem
   por valor ou outro derivado numérico em qualquer arquivo novo.
4. **`metricas` lida só do payload próprio**: confirmar que
   `AnaliseNuvemPalavrasPage.tsx` não importa nem chama
   `buscarVisaoGeralAnalise`/`/api/analise/visao-geral` — as métricas vêm
   exclusivamente de `dados.metricas` do endpoint de nuvem de palavras.
5. **Estado vazio só da lista**: confirmar que o bloco de `MetricaCard`s é
   renderizado sempre que `dados !== null` (independente de
   `palavras.length`), e que só o bloco abaixo (`ListaFrequenciaPalavras`
   vs. `Alert` de vazio) depende de `palavras.length === 0` — não a página
   inteira.
6. **`AvisoLimitacaoAnonimizacao`/`EstadoAguardandoMinimo` nunca importados**
   em nenhum arquivo desta feature (grep) — decisão 5, justificada pela
   ausência de granularidade de bloqueio no payload.
7. **`SeletorCiclo` não foi modificado**: diff não deve tocar
   `components/analise/SeletorCiclo/SeletorCiclo.tsx`.
8. **`CiclosListPage.tsx` intocado** — confirmar que o diff não inclui esse
   arquivo (spec, seção 3.2).
9. **Nenhuma checagem de papel fora de `RotaProtegida`**: grep por
   `colaborador?.papel`/`useAuth()` dentro de `AnaliseNuvemPalavrasPage.tsx`
   e `ListaFrequenciaPalavras.tsx` — não deve haver nenhuma.
10. **Mensagem de erro por código** (`CICLO_NAO_ENCONTRADO`) mapeada
    corretamente, sem depender de string bruta da API para o texto exibido;
    demais erros usam a mensagem genérica.
11. **Menu e rota**: `qualitativa.opcoes` de `PainelAdminLayout.tsx` com
    exatamente a segunda entrada `{ label: 'Nuvem de Palavras', to:
    '/analise/nuvem-palavras' }`, sem alterar `quantitativa`; rota
    `/analise/nuvem-palavras` dentro do mesmo grupo protegido
    (`admin`/`gestor_rh`) das outras três telas de Análise.
12. **Estilo**: nenhum `.css` novo, nenhum `style={{}}` bruto — a barra de
    destaque em `ListaFrequenciaPalavras.tsx` usa `sx` do MUI, layout via
    classes Tailwind (`flex`, `gap-*`, `grid`) só para espaçamento/alinhamento.
13. **Build/lint**: `npm run build` (`tsc -b && vite build`) e `npm run lint`
    dentro de `frontend/` sem novos erros/avisos introduzidos por esta task
    (confirmar quais avisos pré-existentes já eram reportados antes, mesmo
    procedimento já seguido em `analise-ranking/task-frontend.md`).

---

## Revisão

Revisão feita comparando o código real em `frontend/` (não só o texto do
plano) contra a checklist do módulo e o "Foco especial de revisão" da task
de review. Todos os arquivos tocados nesta etapa foram lidos por completo:
os 5 novos/editados de conteúdo (`ListaFrequenciaPalavras.tsx`,
`AnaliseNuvemPalavrasPage.tsx`, `formatadores.ts`, `types/analise.ts`,
`services/analiseService.ts`) e os 2 de wiring (`App.tsx`,
`PainelAdminLayout.tsx`), além de `CiclosListPage.tsx`, `SeletorCiclo.tsx`
e `MetricaCard.tsx` para confirmar não-modificação/reaproveitamento sem
quebra, e `AnaliseAvaliacoesPage.tsx` para comparação de padrão.

**Nenhum achado crítico.** A implementação bate literalmente com o plano
aprovado; nenhuma decisão foi reaberta.

Confirmações específicas (foco de revisão):

1. **Anonimização/agregação**: nenhuma ocorrência de
   `avaliadoId`/`avaliadorId`/`tipoRelacionamento`/`avaliadorNome`/
   `avaliadoNome`/`.sort(`/`.reverse(` em `ListaFrequenciaPalavras.tsx` nem
   em `AnaliseNuvemPalavrasPage.tsx` (grep, zero ocorrências). `palavras` é
   sempre renderizado na ordem recebida do payload. O único cálculo
   numérico em `ListaFrequenciaPalavras.tsx` é `Math.max(...palavras.map(p
   => p.frequencia))` para a largura da barra — nenhuma soma/média/
   filtragem. `PalavraFrequencia`/`NuvemPalavrasAnalise`/
   `MetricasComplementaresNuvem` em `types/analise.ts` batem exatamente com
   o contrato de `task-backend.md` (`{ periodo, cicloId, palavras: [{
   palavra, frequencia }], metricas: { totalEnvios, totalRespostas,
   tempoMedioResposta: { horas, amostras } } }`), sem campo extra
   inventado. `metricas` é lida exclusivamente de `dados.metricas` do
   próprio payload — nenhuma referência a `buscarVisaoGeralAnalise`/
   `/api/analise/visao-geral` em nenhum arquivo novo.
2. **Rota protegida**: `App.tsx`, `/analise/nuvem-palavras` está dentro do
   mesmo `<Route element={<RotaProtegida papeis={['admin', 'gestor_rh']}
   />}>` que envolve as outras três rotas de Análise — nenhuma checagem de
   papel adicional dentro da página/componente (grep por
   `colaborador?.papel`/`useAuth(` em `AnaliseNuvemPalavrasPage.tsx` e
   `ListaFrequenciaPalavras.tsx`: zero ocorrências).
3. **Sem atalho no card do Ciclo**: `CiclosListPage.tsx` não aparece no git
   status como modificado e não contém nenhuma referência a "nuvem" (grep
   confirmando).
4. **`SeletorCiclo`/`MetricaCard` reaproveitados sem modificação**: os dois
   arquivos-fonte não têm nenhuma marca de edição relacionada a esta
   feature; os usos em `AnaliseNuvemPalavrasPage.tsx`
   (`<SeletorCiclo cicloId={cicloId} onChange={handleCicloChange} />`,
   `<MetricaCard titulo=... valor=... descricao=... detalhes=...
   tooltip=... />`) batem exatamente com as props existentes de cada
   componente — nenhum consumidor quebrado.
5. **Estilo**: Tailwind só para layout (`flex`, `gap-*`, `grid`, `p-*`),
   MUI para os controles e para a barra de destaque (`Box sx={{ width:
   ... }}`). Nenhum arquivo `.css` novo, nenhum `style={{}}` inline (grep
   confirmando zero ocorrências em `AnaliseNuvemPalavrasPage.tsx`). Ícone
   importado por arquivo individual
   (`import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'`),
   não do barrel.
6. **Consistência com as páginas irmãs**: `AnaliseNuvemPalavrasPage.tsx` é,
   linha a linha, o mesmo esqueleto de filtro/estado de
   `AnaliseAvaliacoesPage.tsx` (comparado diretamente) — mesmo padrão de
   `useSearchParams` só para `cicloId`, mesmo `Skeleton` durante
   `carregando`, mesmo bloco de erro com `Typography role="alert"` + botão
   "Tentar novamente", mesmo mapeamento de `CICLO_NAO_ENCONTRADO` para a
   mensagem literal já usada nas outras telas, mesmo `aria-label` do botão
   de tooltip do título (`aria-label="Nuvem de Palavras"`, mesmo padrão de
   `aria-label="Avaliações"` na página irmã). O estado vazio tratado só no
   bloco da lista (não na página inteira) está implementado exatamente
   como a decisão 8 do plano descreve: `MetricaCard`s sempre visíveis
   quando `dados !== null`, `Alert severity="info"` só quando
   `palavras.length === 0`.
7. **Qualidade geral**: `ListaFrequenciaPalavras` é um componente "burro"
   sem lógica de negócio, recebe `palavras` via prop. Nenhuma dependência
   nova. `AvisoLimitacaoAnonimizacao`/`EstadoAguardandoMinimo` não são
   importados em nenhum arquivo desta feature, consistente com a decisão 5
   do plano (payload não expõe granularidade de bloqueio).

**Deveria corrigir**: nenhum.

**Sugestão**:
- `formatadores.ts` desta página duplica `formatarInteiro`/
  `formatarTempoMedio`/`inicioAnoCorrenteYMD`/`hojeYMD` de
  `AnaliseVisaoGeralPage/formatadores.ts` — já é um padrão aceito e
  documentado no projeto (repetido em 3+ telas agora), mas se uma quinta
  tela do módulo Análise precisar do mesmo conjunto de funções, pode valer
  a pena extrair para um util compartilhado (ex.
  `src/pages/analise-shared/`) — não é um problema desta task isoladamente,
  só um ponto de atenção para quando a duplicação crescer.
- O aviso de lint pré-existente (`react-hooks/set-state-in-effect` no
  `useEffect(() => { executarBusca() }, [])`) foi replicado de propósito
  para manter consistência com as três telas irmãs, conforme já registrado
  no status desta etapa — nenhuma ação necessária aqui, mas se o projeto
  decidir corrigir esse padrão em algum momento, as 4 telas do módulo
  Análise deveriam ser corrigidas juntas, não uma de cada vez.

**Conclusão**: nenhum achado crítico. A task pode prosseguir para o
`test-engineer`.

## Testes

Nenhum teste automatizado de frontend foi escrito para esta feature.
`frontend/` não tem hoje nenhuma infraestrutura de teste configurada (sem
`vitest`, sem `@testing-library/react`, sem `jsdom`, `package.json` sem
script `test`, nenhum arquivo `*.test.tsx` em nenhuma parte do projeto —
confirmado por busca em todo `frontend/`). Escrever testes para
`AnaliseNuvemPalavrasPage`/`ListaFrequenciaPalavras` exigiria introduzir esse
tooling do zero, o que é uma decisão de infraestrutura fora do escopo desta
rodada de testes (não há "padrão já usado no projeto" para seguir). O
`npm run build`/`npm run lint` já confirmados pelo `frontend-developer`/
`frontend-codereviewer` (ver "Status"/"Revisão" acima) seguem sendo a única
verificação automatizada aplicada a este código nesta rodada.

O foco de testes automatizados desta task ficou inteiramente no backend
(`.claude/tasks/analise-nuvem-palavras/task-backend.md`, seção "## Testes")
— prioridade correta dado que toda a regra de anonimização/gate roda lá; o
frontend só formata/exibe um payload já agregado.
