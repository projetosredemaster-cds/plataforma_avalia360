## Plano — Frontend

Pré-requisito: backend já expõe `GET /api/analise/envios` retornando `EnviosAnalise`
(ver spec, seção 4) antes deste passo ser executado — o `frontend-developer` não deve
mockar o endpoint; se ainda não existir, sinalizar bloqueio em vez de prosseguir com dado
fictício.

**BLOQUEADO (2026-09-15):** verificado `backend/src/modules/analise/` — não existe
`analise-envios.service.ts`/`analise-envios.controller.ts`, `analise.module.ts` não
registra a rota `/envios` (só `visao-geral`, `avaliacoes`, `ranking`, `nuvem-palavras`,
`resultados-pergunta`), e `.claude/tasks/analise-envios/task-backend.md` não tem nenhuma
seção "## Revisão"/marcação de conclusão do passo "1. backend-developer" — o endpoint
ainda não foi implementado. Pré-requisito deste passo não satisfeito; nenhuma alteração
de frontend foi feita. Executar `backend-developer` sobre `task-backend.md` primeiro e
então retomar este passo.

**DESBLOQUEADO (2026-09-15):** confirmado `GET /api/analise/envios` já implementado —
`analise-envios.service.ts`, `buscarEnviosAnalise` em `analise.controller.ts`, rota
registrada em `analise.module.ts` dentro de `router.use(autenticar)`. Contrato conferido
contra a seção 4 da spec, idêntico. Passo 1 executado a seguir.

**CONCLUÍDO (2026-09-15) — 1. frontend-developer:**

- `frontend/src/types/analise.ts`: adicionado bloco `LinhaEnvioAnalise`/`EnviosAnalise`
  ao final, reaproveitando `StatusCiclo` (`types/ciclo.ts`) e `TipoPesquisa`
  (`types/pesquisa.ts`) em vez de redeclarar os literais.
- `frontend/src/services/analiseService.ts`: nova `BuscarEnviosAnaliseParams` +
  `buscarEnviosAnalise`, mesmo padrão de `URLSearchParams` das demais funções
  (`cicloId` só enviado quando truthy).
- Novo diretório `frontend/src/pages/AnaliseEnviosPage/`: `AnaliseEnviosPage.tsx`
  (filtro de período + `SeletorCiclo`, tabela MUI com `stickyHeader` e
  `maxHeight: 600`/`overflowY: auto`, sem nenhuma ação/link por linha) e
  `formatadores.ts` local (`hojeYMD`, `inicioAnoCorrenteYMD`, `formatarInteiro`
  duplicados do padrão já usado pelas páginas irmãs; `formatarData` novo, mesma
  implementação de `CiclosListPage`). Reaproveitados sem alteração:
  `SeletorCiclo`, `BotaoAtualizarAnalise`, `StatusCicloChip`, `TipoPesquisaChip`,
  `ProgressoCicloBar` (remapeamento de campos para o shape `ProgressoCiclo`, sem
  recalcular percentual). `tipoPesquisa === null` tratado só dentro da página
  (`Chip` "Sem pesquisa vinculada" inline, sem estender `TipoPesquisaChip`).
- `frontend/src/App.tsx`: import de `AnaliseEnviosPage` + rota
  `/analise/envios` dentro do mesmo bloco protegido
  (`RotaProtegida papeis={['admin', 'gestor_rh']}`) das outras rotas `/analise/*`.
- `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`: novo item
  "Envios" (`MarkEmailReadOutlinedIcon`) ao final de `submenus[0]`
  (`quantitativa`), sem tocar em `qualitativa`.
- `npm run build` (`tsc -b && vite build`) passa sem erros. `npm run lint` reporta
  o mesmo erro `react-hooks/set-state-in-effect` (`executarBusca()` chamado
  direto no `useEffect` de carga inicial) já presente, de forma idêntica, em
  `AnaliseVisaoGeralPage`, `AnaliseResultadosPerguntaPage`, `AnaliseRankingPage`,
  `CiclosListPage` e `CicloDetalhePage` — padrão pré-existente replicado
  deliberadamente por instrução da task (estrutura idêntica às páginas irmãs),
  não uma regressão nova; confirmado comparando a contagem total de
  problemas do lint antes/depois desta mudança (17 problemas em ambos).
- Nenhum arquivo `.css` novo, nenhum `style={{}}` inline. Nenhuma regra de
  agregação/cálculo no frontend — `percentualRespondido`/`totalPendente`
  vêm prontos da API, só remapeados de nome de campo.

1. frontend-developer

   ### 1.1 `frontend/src/types/analise.ts`

   - Adicionar, ao final do arquivo, um novo bloco de comentário no mesmo estilo dos
     existentes (`// ---- "Envios" (GET /api/analise/envios) ----`) explicando a
     natureza do payload: 100% agregado por ciclo (`COUNT`/`GROUP BY ciclo_id`), nenhum
     campo de identidade (`avaliador_id`/`avaliado_id`/`colaborador_id`/
     `tipo_relacionamento`) em nenhum nível, sem gate de anonimização (diferente de
     `AvaliacoesAnalise`/`ResultadosPerguntaAnalise`) porque a menor unidade exposta é o
     ciclo inteiro — nunca um avaliado/respondente individual.
   - Tipos novos, espelhando exatamente a seção 4 da spec (não inventar nem omitir
     campo):
     ```ts
     export type StatusCicloAnalise = 'rascunho' | 'ativo' | 'encerrado'

     export interface LinhaEnvioAnalise {
       cicloId: string
       nome: string
       tipoPesquisa: 'avaliacao_360' | 'clima_geral' | null
       status: StatusCicloAnalise
       dataInicio: string
       dataFim: string
       totalEnvios: number
       totalPendente: number
       totalRespondido: number
       percentualRespondido: number
     }

     export interface EnviosAnalise {
       periodo: { de: string; ate: string }
       cicloId: string | null
       ciclos: LinhaEnvioAnalise[]
     }
     ```
   - Preferir reaproveitar `StatusCiclo` de `types/ciclo.ts` em vez de declarar
     `StatusCicloAnalise` do zero, SE os valores forem idênticos (são:
     `'rascunho' | 'ativo' | 'encerrado'`) — confirmar isso lendo `types/ciclo.ts` antes
     de decidir; se reaproveitar, importar `StatusCiclo` no topo do arquivo e usar
     `status: StatusCiclo` em `LinhaEnvioAnalise` em vez de declarar um tipo novo
     redundante. Da mesma forma, `tipoPesquisa` pode reaproveitar `TipoPesquisa` de
     `types/pesquisa.ts` combinado com `| null` em vez de repetir os literais na mão.
   - Não tocar em nenhum tipo existente no arquivo.

   ### 1.2 `frontend/src/services/analiseService.ts`

   - Adicionar `EnviosAnalise` ao bloco de `import type { ... } from '../types/analise'`
     no topo do arquivo.
   - Nova interface `BuscarEnviosAnaliseParams { de: string; ate: string; cicloId?: string }`
     — mesmo shape de `BuscarVisaoGeralAnaliseParams`.
   - Nova função, ao final do arquivo, seguindo exatamente o padrão de
     `buscarVisaoGeralAnalise`:
     ```ts
     /**
      * `GET /api/analise/envios` — 1 linha por ciclo, contagens agregadas
      * (total/pendente/respondido) por ciclo inteiro. Sem gate de anonimização
      * (ver comentário em `types/analise.ts`) — nunca projeta avaliador/avaliado
      * individual. `de`/`ate` sempre obrigatórios; `cicloId` opcional.
      */
     export function buscarEnviosAnalise(params: BuscarEnviosAnaliseParams): Promise<EnviosAnalise> {
       const query = new URLSearchParams({ de: params.de, ate: params.ate })
       if (params.cicloId) query.set('cicloId', params.cicloId)
       return apiFetch<EnviosAnalise>(`/api/analise/envios?${query.toString()}`)
     }
     ```

   ### 1.3 `frontend/src/pages/AnaliseEnviosPage/AnaliseEnviosPage.tsx` (novo diretório/arquivo)

   - Estrutura de estado/filtro/busca IDÊNTICA a `AnaliseVisaoGeralPage`/
     `AnaliseResultadosPerguntaPage`: `useSearchParams` para `cicloId` na URL,
     `de`/`ate` com default `inicioAnoCorrenteYMD()`/`hojeYMD()`, `executarBusca` com
     `overrides`, `handleSubmit`, `handleCicloChange`, `handleLimparFiltro`,
     `periodoInvalido = ate < de`, `filtroAlterado`. Chamar `buscarEnviosAnalise` em vez
     de `buscarVisaoGeralAnalise`.
   - Tratamento de erro: mesmo padrão (`ApiError`, caso especial
     `err.codigo === 'CICLO_NAO_ENCONTRADO'` → mensagem "O ciclo filtrado não foi
     encontrado. Remova o filtro de ciclo e tente novamente.", fallback genérico
     "Não foi possível carregar os envios.").
   - Cabeçalho: `Typography variant="h5" component="h1"` com texto "Envios" + `Tooltip`/
     `IconButton` com `InfoOutlinedIcon`, texto sugerido: "Contagem de envios pendentes e
     respondidos por ciclo, sem detalhe pessoa a pessoa (isso já existe na tela de
     detalhe do Ciclo)." — mesmo padrão visual das outras 5 telas.
   - Formulário de filtro: `Paper component="form"` com `TextField` de "De"/"Até" (type
     date), `SeletorCiclo`, botão "Aplicar filtro", botão condicional "Limpar filtro",
     `BotaoAtualizarAnalise` — reaproveitar os três componentes existentes
     (`components/analise/SeletorCiclo`, `components/analise/BotaoAtualizarAnalise`) sem
     alterá-los.
   - Estado vazio: `dados.ciclos.length === 0` → `Alert severity="info"` "Nenhum ciclo
     encontrado no período selecionado." (mesmo texto de `AnaliseVisaoGeralPage` para
     `totalCiclos === 0`).
   - Estado de carregamento: `Skeleton` (ex.: `variant="rounded" height={400}` único, já
     que é uma tabela, não vários cards — diferente do grid de skeletons de
     `AnaliseVisaoGeralPage`).
   - Tabela: `TableContainer` (MUI) envolvendo `Table`, dentro de um `Paper`, com `Box`
     aplicando `sx={{ maxHeight: 600, overflowY: 'auto' }}` no `TableContainer` (mesma
     convenção de altura máxima + rolagem interna do CLAUDE.md, mesmo valor de 600px já
     usado em `AnaliseResultadosPerguntaPage`/`CicloDetalhePage`). `stickyHeader` no
     `Table` para o cabeçalho continuar visível durante o scroll.
   - Colunas, na ordem exata da seção 8 da spec: Nome, Tipo de pesquisa, Status,
     Vigência, Total, Pendente, Respondido, % Respondido. Nenhuma coluna de ação, nenhum
     link em nenhuma célula (decisão fechada, seção 9 da spec — não adicionar nem como
     ícone).
   - `key` de cada `TableRow`: `linha.cicloId`.
   - Coluna "Tipo de pesquisa": `linha.tipoPesquisa !== null` → reaproveitar
     `TipoPesquisaChip` (`components/pesquisas/TipoPesquisaChip`) passando
     `tipo={linha.tipoPesquisa}` sem alterações no componente; `linha.tipoPesquisa === null`
     → renderizar um `Chip label="Sem pesquisa vinculada" size="small" variant="outlined"`
     inline na própria página (não criar componente novo só para isso, e não tentar
     estender `TipoPesquisaChip` para aceitar `null` — ele é reaproveitado por outras
     telas com o tipo sempre presente).
   - Coluna "Status": reaproveitar `StatusCicloChip` (`components/ciclos/StatusCicloChip`)
     passando `status={linha.status}` sem alterações.
   - Coluna "Vigência": `${formatarData(linha.dataInicio)} — ${formatarData(linha.dataFim)}`
     usando um formatador de data local (ver 1.4) — mesmo padrão textual de
     `CiclosListPage`.
   - Colunas "Total"/"Pendente"/"Respondido": `formatarInteiro(linha.totalEnvios)` /
     `formatarInteiro(linha.totalPendente)` / `formatarInteiro(linha.totalRespondido)`
     (reaproveitar `formatarInteiro`, ver 1.4) — alinhamento `align="right"` por serem
     números.
   - Coluna "% Respondido": reaproveitar `ProgressoCicloBar`
     (`components/ciclos/ProgressoCicloBar`), montando um objeto no shape `ProgressoCiclo`
     (`{ total, concluidos, percentual }` de `types/ciclo.ts`) a partir dos campos da
     linha: `{ total: linha.totalEnvios, concluidos: linha.totalRespondido, percentual:
     linha.percentualRespondido }` — não recalcular `percentual` no frontend (regra do
     CLAUDE.md: nenhum cálculo de agregação no frontend), só remapear os nomes de campo
     para o shape que o componente espera. Não alterar `ProgressoCicloBar` nem
     `ProgressoCiclo`. Se `linha.totalEnvios === 0`, o próprio `ProgressoCicloBar` já
     trata isso ("Sem dados de progresso ainda") — não duplicar essa lógica na página.
   - Ordenação: a tabela renderiza `dados.ciclos` na ordem em que a API devolve (já
     ordenada por `dataInicio DESC` no backend, seção 5 da spec) — não reordenar no
     frontend com `.sort()`.
   - Nenhuma regra de agregação/cálculo no frontend além do remapeamento de nomes de
     campo acima — todo número exibido vem pronto da API.

   ### 1.4 Novo arquivo `frontend/src/pages/AnaliseEnviosPage/formatadores.ts`

   - Mesmo padrão de arquivo local de formatadores já usado por
     `AnaliseVisaoGeralPage`/`AnaliseResultadosPerguntaPage` (sem criar um util
     compartilhado novo nem importar de outra página).
   - Reexportar/duplicar apenas o necessário: `hojeYMD`, `inicioAnoCorrenteYMD`,
     `formatarInteiro` (copiar de `AnaliseVisaoGeralPage/formatadores.ts` — mesmo padrão
     de pequena duplicação deliberada já usado entre as páginas do módulo, não importar
     cruzado entre pastas de página irmãs).
   - Adicionar `formatarData` (mesma implementação de `CiclosListPage`, com
     `Intl.DateTimeFormat('pt-BR')` e `new Date(`${data}T00:00:00`)` para evitar
     problema de fuso horário na borda da data) — não importar de `CiclosListPage`
     (arquivo de página, não é um módulo compartilhado).
   - Não incluir `formatarPercentual`/`formatarTempoMedio` (não usados nesta tela).

   ### 1.5 `frontend/src/App.tsx`

   - Importar `AnaliseEnviosPage` de `'./pages/AnaliseEnviosPage/AnaliseEnviosPage'`,
     junto dos outros imports de `Analise*Page` (mesmo bloco, ordem alfabética/lógica
     seguindo o que já existe).
   - Adicionar `<Route path="/analise/envios" element={<AnaliseEnviosPage />} />` dentro
     do mesmo `<Route element={<PainelAdminLayout />}>` que já contém as outras rotas de
     `/analise/*` (mesmo bloco protegido por `RotaProtegida papeis={['admin', 'gestor_rh']}`
     — não criar uma proteção de rota nova, reaproveitar a existente).

   ### 1.6 `frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`

   - Novo item dentro de `submenus[0]` (`key: 'quantitativa'`, `label: 'Quantitativa'`),
     no array `opcoes`, junto de "Visão Geral"/"Ranking"/"Resultados por Pergunta" — NÃO
     em `submenus[1]` (`qualitativa`).
   - Item: `{ label: 'Envios', to: '/analise/envios', icon: <???Icon fontSize="small" /> }`.
     Escolher um ícone MUI já não usado no menu e semanticamente ligado a envio/
     correspondência — sugestão: `MarkEmailReadOutlinedIcon` (de
     `@mui/icons-material/MarkEmailReadOutlined`) ou, como alternativa mais neutra,
     `SendOutlinedIcon` (`@mui/icons-material/SendOutlined`) — adicionar o import no
     topo do arquivo junto dos outros ícones de submenu (`BarChartIcon`, `ForumIcon`,
     etc.).
   - Posição sugerida dentro do array: ao final de `quantitativa.opcoes` (depois de
     "Resultados por Pergunta"), para não reordenar os itens já existentes.
   - Não alterar `submenus[1]` (`qualitativa`), não adicionar nenhum atalho em outro
     grupo do menu, não tocar em `GRUPOS` fora deste array.

   ### 1.7 Verificação de reaproveitamento (antes de criar qualquer componente novo)

   - Confirmar que `SeletorCiclo`, `BotaoAtualizarAnalise`, `StatusCicloChip`,
     `TipoPesquisaChip` e `ProgressoCicloBar` já existem e cobrem 100% da necessidade
     desta tela (todos já confirmados no planejamento) — não recriar nenhum deles, não
     copiar sua lógica para dentro de `AnaliseEnviosPage.tsx`.
   - Não criar nenhum componente novo em `components/analise/` ou `components/ciclos/`
     para esta feature — a tabela é simples o suficiente para viver inteira dentro de
     `AnaliseEnviosPage.tsx` (mesmo padrão de "Visão Geral", que não quebra sua grade de
     `MetricaCard` em subcomponentes).

   ### Papéis com acesso

   - `admin` e `gestor_rh` — mesma proteção de rota das outras telas de `/analise/*`
     (`RotaProtegida papeis={['admin', 'gestor_rh']}`, já herdada do bloco de rota em
     `App.tsx`, sem checagem adicional dentro da página). `colaborador` não tem acesso —
     nem rota, nem item de menu (o menu lateral inteiro já é só renderizado dentro do
     `PainelAdminLayout` usado por essas rotas protegidas). Não há diferença de conteúdo
     entre `admin` e `gestor_rh` dentro da tela — ambos veem exatamente as mesmas
     colunas/linhas (mesma regra das outras 5 telas do módulo `analise`, que não têm
     bifurcação de UI por papel dentro do grupo autorizado).

   ### Endpoints consumidos

   - `GET /api/analise/envios?de=...&ate=...&cicloId=...` (novo, backend — pré-requisito
     deste passo).
   - `GET /api/ciclos` (indiretamente, via `SeletorCiclo` já existente — nenhuma mudança
     necessária nele).

   ### Estados a tratar

   - Carregando: skeleton único de tabela.
   - Vazio: `Alert severity="info"` quando `dados.ciclos.length === 0`.
   - Erro: mensagem + botão "Tentar novamente", com caso especial para
     `CICLO_NAO_ENCONTRADO`.
   - Período inválido (`ate < de`): botão "Aplicar filtro" desabilitado + `helperText`
     de erro no campo "Até" (mesmo padrão das outras telas, sem bloquear a digitação).
   - Sucesso com dados: tabela populada, sem paginação (seção 9 da spec — não introduzir
     paginação de servidor nem client-side).

2. frontend-codereviewer

   - Confirmar que nenhuma ação/link foi adicionada a nenhuma célula da tabela (nem um
     ícone de "ver detalhe", nem `onClick` de navegação na `TableRow`) — decisão fechada
     da spec, motivo mais provável de regressão silenciosa nesta tela.
   - Confirmar que nenhum atalho foi adicionado ao card do Ciclo
     (`CiclosListPage`/`CicloDetalhePage`) apontando para `/analise/envios` — fora de
     escopo, spec seção 9.
   - Confirmar que o item de menu novo está em `submenus[0]` (Quantitativa), não em
     `submenus[1]` (Qualitativa).
   - Confirmar que `LinhaEnvioAnalise`/`EnviosAnalise` em `types/analise.ts` espelham
     exatamente a seção 4 da spec (nomes de campo, opcionalidade, união de literais) —
     nenhum campo de identidade (`avaliadorId`, `avaliadoId`, `colaboradorId`, nome de
     pessoa, CPF, e-mail) foi adicionado em nenhum nível, mesmo que "faria sentido" numa
     tela de relatório.
   - Confirmar que a página não reordena `dados.ciclos` no frontend (ordenação é
     responsabilidade do backend, seção 5 da spec) e não recalcula
     `percentualRespondido`/`totalPendente` — só remapeia nomes de campo para o shape de
     `ProgressoCicloBar`.
   - Confirmar que `TipoPesquisaChip`/`StatusCicloChip`/`ProgressoCicloBar` foram
     reaproveitados sem alteração de assinatura/comportamento (nenhum novo caso `null`
     foi empurrado para dentro desses componentes compartilhados — o tratamento de
     `tipoPesquisa === null` deve estar só em `AnaliseEnviosPage.tsx`).
   - Confirmar altura máxima + rolagem interna (`maxHeight: 600, overflowY: 'auto'`) no
     `TableContainer`, já que a lista de ciclos não tem paginação.
   - Confirmar que nenhum arquivo `.css` novo foi criado e que não há `style={{}}`
     inline substituindo `sx`/classes Tailwind.
   - Confirmar que a rota `/analise/envios` está dentro do mesmo grupo protegido
     (`papeis={['admin', 'gestor_rh']}`) das demais rotas de análise — não uma proteção
     nova/mais permissiva.
   - Verificar que `buscarEnviosAnalise` segue exatamente o mesmo formato de
     `URLSearchParams` das demais funções de `analiseService.ts` (sem enviar `cicloId`
     vazio como string `''`).

## Revisão

**2. frontend-codereviewer (2026-09-15):**

Arquivos revisados: `frontend/src/types/analise.ts`, `frontend/src/services/analiseService.ts`,
`frontend/src/pages/AnaliseEnviosPage/AnaliseEnviosPage.tsx`,
`frontend/src/pages/AnaliseEnviosPage/formatadores.ts`, `frontend/src/App.tsx`,
`frontend/src/layouts/PainelAdminLayout/PainelAdminLayout.tsx`. Contra a spec
(`.claude/tasks/analise-envios/spec.md`, seções 4/5/8/9/10) e o checklist de revisão do
próprio agente.

### Crítico

Nenhum achado crítico.

### Deveria corrigir

Nenhum achado.

### Sugestão

Nenhum achado — implementação fiel à spec e ao plano em todos os pontos verificados:

1. **Sem ação/link na tabela**: `AnaliseEnviosPage.tsx` não tem nenhum `onClick` de
   navegação em `TableRow`, nenhum ícone de "ver detalhe", nenhum link para
   `CicloDetalhePage` — a linha 189-216 confirma que todas as 8 colunas são só leitura
   (texto, `Chip`, `ProgressoCicloBar`).
2. **Sem atalho no card do Ciclo**: `grep` por `analise/envios` no frontend só retorna
   `types/analise.ts` (comentário), `analiseService.ts` (comentário/URL),
   `PainelAdminLayout.tsx` (item de menu) e `App.tsx` (rota) — nenhuma ocorrência em
   `CiclosListPage`/`CicloDetalhePage`.
3. **Menu no grupo correto**: item "Envios" (`MarkEmailReadOutlinedIcon`,
   `to: '/analise/envios'`) está ao final de `submenus[0]` (`key: 'quantitativa'`),
   depois de "Resultados por Pergunta"; `submenus[1]` (`qualitativa`) não foi tocado.
4. **Componentes compartilhados intactos**: `TipoPesquisaChip` e `ProgressoCicloBar`
   conferidos linha a linha — sem nenhum caso `null`/parâmetro novo adicionado; o
   tratamento de `tipoPesquisa === null` (`Chip label="Sem pesquisa vinculada"`) fica só
   dentro de `AnaliseEnviosPage.tsx`, exatamente como especificado.
   `SeletorCiclo`/`BotaoAtualizarAnalise`/`StatusCicloChip` não aparecem em `git status`
   como modificados, e são só importados/consumidos na página.
5. **Rolagem interna**: `TableContainer` com `sx={{ maxHeight: 600, overflowY: 'auto' }}`
   + `stickyHeader` no `Table`, mesmo padrão de `AnaliseResultadosPerguntaPage`/
   `CicloDetalhePage`.
6. **Tipos fiéis ao contrato**: `LinhaEnvioAnalise`/`EnviosAnalise` em `types/analise.ts`
   espelham exatamente a seção 4 da spec, campo a campo, sem nenhum campo de identidade
   (nome de pessoa, e-mail, CPF, `avaliadorId`/`avaliadoId`/`colaboradorId`). Reaproveita
   `StatusCiclo` (`types/ciclo.ts`) e `TipoPesquisa` (`types/pesquisa.ts`) em vez de
   redeclarar literais, confirmado que os valores batem.
7. **Sem cálculo/reordenação no frontend**: `dados.ciclos` é renderizado na ordem
   recebida (sem `.sort()`); a célula "% Respondido" só remapeia nomes de campo
   (`{ total: linha.totalEnvios, concluidos: linha.totalRespondido, percentual:
   linha.percentualRespondido }`) para o shape `ProgressoCiclo`, sem recalcular
   percentual.
8. **Proteção de rota**: `<Route path="/analise/envios" element={<AnaliseEnviosPage />} />`
   está dentro do mesmo `<Route element={<RotaProtegida papeis={['admin', 'gestor_rh']} />}>`
   que envolve as demais rotas `/analise/*` — nenhuma proteção nova/mais permissiva.
9. **Ciclo sem pesquisa vinculada tratado de forma visível**: `tipoPesquisa === null`
   renderiza `Chip` "Sem pesquisa vinculada" em vez de célula vazia/omitida.
10. **Stack de estilização**: nenhum arquivo `.css` novo, nenhum `style={{}}` inline —
    só `sx` (MUI) e classes Tailwind de layout (`flex`, `gap`, etc.), sem sobreposição
    Tailwind-sobre-MUI.
11. **`buscarEnviosAnalise`**: mesmo padrão de `URLSearchParams` das demais funções de
    `analiseService.ts` — `cicloId` só é setado via `query.set('cicloId', ...)` dentro de
    `if (params.cicloId)`, nunca enviado como string vazia.

Nota (não bloqueante, sem ação necessária): `frontend/src/hooks/useFullscreen.ts` aparece
modificado em `git status`, mas não está entre os arquivos listados para esta etapa nem
foi mencionado na seção "CONCLUÍDO" do `frontend-developer` — não faz parte do escopo
desta revisão e não foi tocado por esta feature.

**Conclusão: sem achados críticos. Task liberada para prosseguir à etapa 3
(test-engineer).**

## Testes

**3. test-engineer (2026-09-15):** verificado via `Glob` que não existe nenhum arquivo
`*.test.tsx` em `frontend/src/pages/Analise*Page/` nem em nenhuma outra página do
projeto (`AnaliseVisaoGeralPage`, `AnaliseResultadosPerguntaPage`, `CiclosListPage` etc. —
nenhuma das páginas "irmãs" tem teste automatizado hoje). Não há convenção de teste de
frontend estabelecida para replicar nesta tela. Conforme instrução explícita do
orquestrador para este caso, esforço priorizado 100% no backend (onde vive a regra
sensível de anonimização/controle de acesso) — ver "## Testes" em `task-backend.md` para a
suíte completa (27 testes novos em `analise-envios.service.spec.ts`, 307/307 passando na
suíte inteira do backend). Nenhum teste de frontend foi adicionado nesta rodada.
