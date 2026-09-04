# Task: Configuração de `tiposRelacionamentoGerados` por ciclo — Frontend

Demanda de frontend (`frontend/`, equivalente ao `apps/web` citado nos
agentes/skills). Requisitos já esclarecidos diretamente pelo usuário — sem
etapa de `spec`. Este plano não toca `backend/`. **Sem etapa de
test-engineer nesta demanda** (pedido explícito do usuário) — o pipeline
para nesta task assim que a revisão do passo 2 não reportar achado crítico.

`.claude/tasks/tipos-relacionamento-por-ciclo/task-backend.md` está sendo
escrito em paralelo por `planejamento-backend` e pode não estar 100%
fechado quando este plano for lido pelo `frontend-developer`. Por isso, o
contrato de campo usado abaixo (`tiposRelacionamentoGerados: string[]` com
valores `'autoavaliacao' | 'gestor' | 'pares' | 'subordinado'`) é uma
**referência de shape**, não uma confirmação definitiva — ver passo 0
obrigatório no plano de implementação.

## Estado atual verificado (antes deste plano)

Lido diretamente (podem já ter sido alterados por outra task em paralelo —
o `frontend-developer` deve reconferir antes de implementar):

- `frontend/src/pages/CicloFormPage/CicloFormPage.tsx`: **só criação**. Sem
  `useParams`, sem modo edição, form controla `nome`, `descricao`,
  `dataInicio`, `dataFim`, `minimoRespostasPares`, `anonimizarRespostasPares`
  via `useState`, `validar()` interno, `handleSubmit` chama só `criarCiclo`
  e navega para `/ciclos/:id`. Sempre em rascunho por definição, nunca tem
  pesquisa vinculada — confirma a leitura do pedido do usuário.
- `frontend/src/pages/CicloDetalhePage/CicloDadosForm.tsx`: subcomponente
  local (não exportado fora da pasta) de `CicloDetalhePage`, recebe hoje
  `{ ciclo: Ciclo; onAtualizado: (ciclo: Ciclo) => void }`. Já tem
  `const somenteLeitura = ciclo.status !== 'rascunho'` controlando `disabled`
  em cada `TextField`/`Switch`, e um `Alert severity="info"` visível só
  quando `somenteLeitura`. `handleSalvar` chama `atualizarCiclo(ciclo.id,
  payload)`. **Não recebe hoje nenhuma prop de tipo de pesquisa.**
- `frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx`: já calcula
  `tipoPesquisaCiclo` (linha ~254, `pesquisaVinculada?.tipo ??
  tipoPesquisaEnvios`) e já usa esse valor para decidir a visibilidade de
  outras seções da própria página (`Relacionamentos gerados`, `Envios`, ver
  linhas ~711 e ~755, condição `tipoPesquisaCiclo !== 'clima_geral'`) — mas
  **não passa essa variável para `<CicloDadosForm>`** (linha ~538, hoje só
  `ciclo={ciclo} onAtualizado={setCiclo}`). O módulo de envios/campanha de
  clima já é código real e ativo nesta base (não é uma feature futura —
  outra tarefa já implementou o motor de envios completo), então
  `tipoPesquisaCiclo` já é um dado maduro e confiável para reutilizar aqui.
- `frontend/src/types/ciclo.ts`: `Ciclo` não tem `tiposRelacionamentoGerados`.
  `TipoRelacionamento` já existe como union de 5 valores (`'autoavaliacao' |
  'gestor' | 'pares' | 'subordinado' | 'externo'`) — usado para a tabela de
  relacionamentos e a de envios, **não** é o tipo certo para o campo novo
  (que nunca inclui `'externo'`, o motor não gera esse tipo automaticamente).
- `frontend/src/services/ciclosService.ts`: `CriarCicloPayload` tem `nome`,
  `descricao?`, `dataInicio`, `dataFim`, `anonimizarRespostasPares?`,
  `minimoRespostasPares?`. `AtualizarCicloPayload = Partial<CriarCicloPayload>`
  — herda automaticamente qualquer campo novo adicionado a
  `CriarCicloPayload`, sem precisar editar as duas interfaces separadamente.
- `frontend/src/components/ciclos/rotulosTipoRelacionamento.ts`: mapa puro
  `Record<TipoRelacionamento, string>` já existe, mas com rótulos **curtos**
  (`gestor → "Gestor"`, `pares → "Pares"`, `subordinado → "Subordinado"`) —
  usados só para coluna de tabela. O pedido desta task quer rótulos mais
  longos/explicativos (`"Gestor avalia liderado"`,
  `"Pares avaliam entre si"`, `"Liderado avalia gestor"`) para os
  checkboxes — **não** é o mesmo texto, então não dá para reaproveitar esse
  mapa diretamente; precisa de um mapa novo, próprio para este contexto (ver
  1.2 abaixo). Nenhum componente reaproveitável para grupo de
  checkboxes/toggle já existe em `frontend/src/components/` (confirmado por
  não haver nenhuma pasta `components/**/Checkbox*` ou `**/ToggleButton*`).
- `frontend/src/types/pesquisa.ts`: `TipoPesquisa = 'avaliacao_360' |
  'clima_geral'` — é este o tipo da prop nova a ser passada para
  `CicloDadosForm`.

## Decisão registrada — onde o grupo de checkboxes vive (não é uma pergunta em aberto)

`CicloFormPage.tsx` é uma tela **só de criação** — sem `id` de rota, sem
modo edição, sempre em rascunho por definição, nunca tem pesquisa
vinculada (isso só existe depois de criado, dentro de `CicloDetalhePage`).
Ou seja, as duas condições do pedido do usuário ("desabilitado quando não
está em rascunho" e "ocultar se a pesquisa vinculada for `clima_geral`")
não têm onde se aplicar dentro de `CicloFormPage.tsx` sozinho — não existe
estado "não-rascunho" nem pesquisa vinculada nessa tela.

As duas condições fazem sentido de verdade em
`frontend/src/pages/CicloDetalhePage/CicloDadosForm.tsx`, que já tem acesso
a `ciclo.status` (via `somenteLeitura`) e vai passar a receber o tipo da
pesquisa vinculada como prop nova.

**Plano adotado — grupo de checkboxes em AMBOS os lugares, com papéis
diferentes:**

1. **`CicloFormPage.tsx` (criação)**: sempre habilitado (é sempre rascunho,
   nunca tem pesquisa vinculada ainda — nunca oculta aqui), default com os
   4 tipos marcados (mesmo default assumido do backend), enviado em
   `criarCiclo()`. Cumpre o pedido literal do usuário ("no `CicloFormPage`,
   um grupo de checkboxes...").
2. **`CicloDadosForm.tsx` (edição, dentro de `CicloDetalhePage`)**: mesmo
   grupo de checkboxes, seguindo o padrão `disabled={somenteLeitura ||
   salvando}` já usado nos outros campos deste componente, e a seção
   INTEIRA (rótulo + checkboxes + texto de ajuda) só renderiza quando
   `tipoPesquisa !== 'clima_geral'` (nova prop). Envia no `atualizarCiclo()`
   já existente.

Essa decisão está registrada aqui para o `frontend-developer` não ficar em
dúvida e para o `frontend-codereviewer` conferir contra esta decisão em vez
de reabrir a discussão sobre "onde deveria viver".

## Plano — Frontend

### 1. frontend-developer — CONCLUÍDO

Passo 1.0 confirmado contra `task-backend.md` (etapa 1 já marcada como
CONCLUÍDO lá): contrato bate exatamente com o assumido neste plano —
`tiposRelacionamentoGerados: string[]` (camelCase), valores
`'autoavaliacao' | 'gestor' | 'pares' | 'subordinado'` (sem `'externo'`),
opcional em `CriarCicloDto`/`AtualizarCicloDto` (default de 4 tipos no
servidor quando omitido em `POST`, mantém valor atual quando omitido em
`PUT`), `422 CICLO_SEM_TIPO_RELACIONAMENTO` possível em `PATCH
/api/ciclos/:id/status` (só quando a pesquisa vinculada é `avaliacao_360`),
`422 CAMPO_INVALIDO` em `POST`/`PUT` se a lista vier vazia ou com valor fora
da allowlist. Nenhum ajuste necessário em relação ao plano — implementado
1.1 a 1.7 exatamente como escrito.

**Resumo do que foi feito:**

- `frontend/src/types/ciclo.ts`: novo tipo `TipoRelacionamentoGeravel`
  (`'autoavaliacao' | 'gestor' | 'pares' | 'subordinado'`, sem `'externo'`) e
  campo `tiposRelacionamentoGerados: TipoRelacionamentoGeravel[]` em `Ciclo`.
- `frontend/src/services/ciclosService.ts`: `CriarCicloPayload` ganhou
  `tiposRelacionamentoGerados?: TipoRelacionamentoGeravel[]` (opcional, mesmo
  padrão de `anonimizarRespostasPares`/`minimoRespostasPares`).
  `AtualizarCicloPayload` não editado (continua `Partial<CriarCicloPayload>`,
  herda o campo automaticamente).
- `frontend/src/components/ciclos/rotulosTiposRelacionamentoGerados.ts`
  (novo): `TIPOS_RELACIONAMENTO_GERAVEL`, lista ordenada de
  `{ valor, rotulo }` com os rótulos amigáveis pedidos ("Autoavaliação",
  "Gestor avalia liderado", "Pares avaliam entre si", "Liderado avalia
  gestor").
- `frontend/src/components/ciclos/TiposRelacionamentoCheckboxGroup/TiposRelacionamentoCheckboxGroup.tsx`
  (novo): componente controlado (`value`/`onChange`/`disabled`/`error`/
  `helperText` via props, sem estado interno, sem chamada de API) com
  `FormControl` + `FormLabel` + `FormGroup` de `Checkbox`/`FormControlLabel`.
  Toggle imutável preserva a ordem fixa de `TIPOS_RELACIONAMENTO_GERAVEL`
  (não a ordem de clique).
- `frontend/src/pages/CicloFormPage/CicloFormPage.tsx`: novo estado
  `tiposRelacionamentoGerados` (default com os 4 marcados), validação
  "pelo menos 1 marcado" em `validar()`, grupo de checkboxes sempre visível
  e sempre habilitado (`disabled={salvando}`) posicionado após o `Switch` de
  `anonimizarRespostasPares`, campo incluído no payload de `criarCiclo`.
- `frontend/src/pages/CicloDetalhePage/CicloDadosForm.tsx`: nova prop
  `tipoPesquisa: TipoPesquisa | null`, estado inicializado a partir de
  `ciclo.tiposRelacionamentoGerados`, mesma validação "pelo menos 1
  marcado", seção inteira (rótulo + checkboxes + ajuda) oculta quando
  `tipoPesquisa === 'clima_geral'`, `disabled={somenteLeitura || salvando}`
  quando visível, campo incluído no payload de `atualizarCiclo`.
- `frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx`: chamada de
  `<CicloDadosForm>` passou a receber `tipoPesquisa={tipoPesquisaCiclo}`
  (variável já existente, sem chamada de API nova).

**Verificação:** `npm run build` (tsc -b && vite build) e `npm run lint`
(eslint) dentro de `frontend/` — ambos sem erros/avisos novos.

**Fora de escopo (conforme 1.8 do plano):** `CiclosListPage` não foi
alterada; nenhuma rota/link novo; nenhuma validação cruzada com
participantes/gestor. Sem etapa de `test-engineer` nesta task (pedido
explícito do usuário).

---

Plano original (referência, seguido sem desvios):

#### 1.0 Passo obrigatório antes de escrever qualquer código

Ler `.claude/tasks/tipos-relacionamento-por-ciclo/task-backend.md` por
completo e confirmar, antes de tocar em qualquer arquivo do frontend:

- Nome exato do campo (assumido aqui como `tiposRelacionamentoGerados`).
- Se é de fato `string[]` com os 4 valores literais assumidos aqui
  (`'autoavaliacao' | 'gestor' | 'pares' | 'subordinado'`), sem `'externo'`.
- Se o campo é obrigatório ou opcional (com default no servidor) em
  `POST /api/ciclos` e em `PUT /api/ciclos/:id` — isso decide se
  `tiposRelacionamentoGerados` entra como campo obrigatório ou opcional
  (`?`) em `CriarCicloPayload`.
- Qual o default real do backend quando o campo é omitido na criação
  (assumido aqui como "os 4 marcados") — usado como valor inicial do
  `useState` em `CicloFormPage`.
- Se existe algum código de erro específico (ex. `422` com lista vazia) a
  espelhar na validação client-side.

Se qualquer um desses pontos divergir do assumido neste plano, seguir o
contrato real do `task-backend.md` (fonte de verdade), não este documento —
mas manter a estrutura de telas/decisão de onde o grupo vive (seção acima),
que não depende do contrato de API.

#### 1.1 Tipos e services

- `frontend/src/types/ciclo.ts` (editado):
  - Novo tipo:
    ```ts
    /**
     * Subconjunto de `TipoRelacionamento` que o motor de ciclos pode gerar
     * automaticamente na ativação — nunca inclui `'externo'` (o motor não
     * gera esse tipo automaticamente, confirmado pelo pedido do usuário).
     */
    export type TipoRelacionamentoGeravel = 'autoavaliacao' | 'gestor' | 'pares' | 'subordinado'
    ```
  - Campo novo em `Ciclo`:
    ```ts
    /**
     * Configura quais tipos de relação o motor de ciclos gera na ativação
     * (cada um ligado/desligado independentemente). Editável só com
     * `status === 'rascunho'` (mesma trava de `PUT /api/ciclos/:id` que já
     * vale para os outros campos editáveis do ciclo).
     */
    tiposRelacionamentoGerados: TipoRelacionamentoGeravel[]
    ```
  - Confirmar contra o `task-backend.md` se `TipoRelacionamentoGeravel` bate
    exatamente com os valores aceitos — não inventar um 5º valor.
- `frontend/src/services/ciclosService.ts` (editado): adicionar
  `tiposRelacionamentoGerados?: TipoRelacionamentoGeravel[]` a
  `CriarCicloPayload` (opcional, mesmo padrão de `anonimizarRespostasPares`/
  `minimoRespostasPares`, que também têm default no servidor — ajustar para
  obrigatório apenas se o `task-backend.md` confirmado no passo 1.0 disser
  que o backend exige o campo). `AtualizarCicloPayload` não precisa de
  edição — já é `Partial<CriarCicloPayload>` e herda o campo automaticamente.
  Import de `TipoRelacionamentoGeravel` a partir de `types/ciclo.ts`.

#### 1.2 Componente reaproveitável novo: grupo de checkboxes

Reaproveitado por `CicloFormPage` e `CicloDadosForm` — os dois lugares
precisam exatamente do mesmo grupo de 4 checkboxes com os mesmos rótulos e
a mesma ordem, então vale a pena extrair um componente controlado em vez de
duplicar o JSX duas vezes (diferente da duplicação de `validar()`, já
sancionada em `ciclos-avaliacao/task-frontend.md`, que envolve lógica de
validação inteira do formulário — aqui é só um bloco de UI autocontido e
idêntico nos dois lugares).

- `frontend/src/components/ciclos/rotulosTiposRelacionamentoGerados.ts`
  (novo, arquivo separado — mesmo padrão de
  `rotulosTipoRelacionamento.ts`/`validacaoPergunta.ts`, para não misturar
  exportação de constante utilitária dentro de um arquivo de componente e
  evitar violar `react-refresh/only-export-components`):
  ```ts
  import type { TipoRelacionamentoGeravel } from '../../types/ciclo'

  /**
   * Rótulos amigáveis para o grupo de checkboxes de
   * `tiposRelacionamentoGerados` — deliberadamente diferentes (mais
   * explicativos) dos rótulos curtos de `ROTULOS_TIPO_RELACIONAMENTO`
   * (usados só na coluna "Tipo" das tabelas de relacionamentos/envios).
   * Ordem fixa = ordem de exibição no formulário, espelha a ordem pedida:
   * autoavaliação, gestor, pares, liderado avalia gestor.
   */
  export const TIPOS_RELACIONAMENTO_GERAVEL: readonly {
    valor: TipoRelacionamentoGeravel
    rotulo: string
  }[] = [
    { valor: 'autoavaliacao', rotulo: 'Autoavaliação' },
    { valor: 'gestor', rotulo: 'Gestor avalia liderado' },
    { valor: 'pares', rotulo: 'Pares avaliam entre si' },
    { valor: 'subordinado', rotulo: 'Liderado avalia gestor' },
  ]
  ```
- `frontend/src/components/ciclos/TiposRelacionamentoCheckboxGroup/TiposRelacionamentoCheckboxGroup.tsx`
  (novo componente controlado, sem chamada de API):
  ```ts
  interface TiposRelacionamentoCheckboxGroupProps {
    value: TipoRelacionamentoGeravel[]
    onChange: (value: TipoRelacionamentoGeravel[]) => void
    disabled?: boolean
    error?: boolean
    helperText?: string
  }
  ```
  - `FormControl` (`error` repassado) + `FormLabel` ("Tipos de relação
    gerados automaticamente na ativação") + `FormGroup` +
    `TIPOS_RELACIONAMENTO_GERAVEL.map(...)` renderizando
    `FormControlLabel`/`Checkbox` (`checked={value.includes(item.valor)}`,
    `onChange` faz toggle imutável — adiciona/remove `item.valor` do array,
    preservando a ordem de `TIPOS_RELACIONAMENTO_GERAVEL`, não a ordem de
    clique). `disabled` repassado a cada `Checkbox`. `FormHelperText`
    (`helperText` da prop, default: "Define quais tipos de relação serão
    gerados automaticamente quando o ciclo for ativado — pelo menos um
    precisa estar marcado." quando `helperText` não for passado).
  - **Decisão de componente MUI — checkboxes, não `ToggleButtonGroup`**:
    `FormGroup`/`Checkbox` comunica melhor "4 opções independentes,
    qualquer combinação válida" (é literalmente para isso que o MUI projeta
    esse componente); `ToggleButtonGroup` sem `exclusive` também suporta
    multi-seleção, mas seu padrão visual (botões segmentados lado a lado)
    é mais associado a filtros/modos de visualização no resto do produto, e
    nenhuma das duas telas já usa `ToggleButtonGroup` hoje. As duas telas já
    usam `FormControlLabel` (com `Switch`, para `anonimizarRespostasPares`)
    — `FormControlLabel` com `Checkbox` mantém a mesma família visual/de
    import, só trocando o `control`.
  - Sem chamada de API, sem estado interno de "salvando" — puramente
    controlado, mesmo padrão de um `TextField` controlado pelas duas telas
    que o consomem.

#### 1.3 `CicloFormPage.tsx` (editado)

- Novo estado: `const [tiposRelacionamentoGerados, setTiposRelacionamentoGerados] = useState<TipoRelacionamentoGeravel[]>(['autoavaliacao', 'gestor', 'pares', 'subordinado'])`
  (default com os 4 marcados — mesmo default assumido do backend, confirmar
  no passo 1.0).
- Novo campo em `ErrosCampo`: `tiposRelacionamentoGerados?: string`.
- `validar()`: adicionar checagem `if (tiposRelacionamentoGerados.length === 0) { erros.tiposRelacionamentoGerados = 'Selecione ao menos um tipo de relação.' }`
  — espelha o `422` esperado do backend se a lista vier vazia (confirmar
  código/mensagem exata no `task-backend.md`, mas a mensagem exibida ao
  usuário pode ser em português simples independentemente do código técnico
  do erro).
- JSX: `<TiposRelacionamentoCheckboxGroup value={tiposRelacionamentoGerados} onChange={setTiposRelacionamentoGerados} disabled={salvando} error={Boolean(errosCampo.tiposRelacionamentoGerados)} helperText={errosCampo.tiposRelacionamentoGerados} />`,
  posicionado depois do `Switch` de `anonimizarRespostasPares` (última
  seção do formulário antes dos botões) — **sempre visível e sempre
  habilitado** (só `disabled={salvando}`, nunca oculto: `CicloFormPage` é
  sempre rascunho e nunca tem pesquisa vinculada, conforme a decisão
  registrada acima).
- `handleSubmit`: incluir `tiposRelacionamentoGerados` no payload de
  `criarCiclo(...)`.

#### 1.4 `CicloDadosForm.tsx` (editado)

- Nova prop na interface: `tipoPesquisa: TipoPesquisa | null` (import de
  `types/pesquisa.ts`).
- Novo estado: `const [tiposRelacionamentoGerados, setTiposRelacionamentoGerados] = useState<TipoRelacionamentoGeravel[]>(ciclo.tiposRelacionamentoGerados)`
  (inicializado a partir do ciclo carregado, mesmo padrão dos outros campos
  deste componente — sem default hardcoded aqui, porque o ciclo já existe e
  já tem um valor salvo).
- Novo campo em `ErrosCampo`: `tiposRelacionamentoGerados?: string`, mesma
  checagem de `validar()` do item 1.3.
- JSX: seção inteira (rótulo + `TiposRelacionamentoCheckboxGroup` + texto de
  ajuda) só renderiza **quando `tipoPesquisa !== 'clima_geral'`** — condição
  no nível do bloco JSX, não só `disabled`, mesmo critério de "esconder,
  não apenas desabilitar" já usado para as seções condicionais de
  `CicloDetalhePage`. Quando renderizada:
  `<TiposRelacionamentoCheckboxGroup value={tiposRelacionamentoGerados} onChange={setTiposRelacionamentoGerados} disabled={somenteLeitura || salvando} error={Boolean(errosCampo.tiposRelacionamentoGerados)} helperText={errosCampo.tiposRelacionamentoGerados} />`
  posicionado no mesmo lugar relativo de `CicloFormPage` (depois do
  `Switch` de `anonimizarRespostasPares`), para manter os dois formulários
  visualmente equivalentes.
- **Quando `somenteLeitura` for `true` mas a seção estiver visível** (ciclo
  ativo/encerrado com pesquisa vinculada que não é `clima_geral`): os
  checkboxes ficam com `disabled` (mostrando os valores salvos, sem poder
  editar) — mesmo comportamento que o pedido do usuário descreveu
  literalmente ("desabilitado... mostrando os valores salvos"), e mesmo
  padrão dos outros campos deste componente sob o `Alert` de "não pode mais
  ser editado" já existente (não precisa de um segundo `Alert` duplicado
  específico para este campo).
- `handleSalvar`: incluir `tiposRelacionamentoGerados` no payload de
  `atualizarCiclo(...)`.

#### 1.5 `CicloDetalhePage.tsx` (editado, só para passar a prop nova)

- Alterar a chamada de `<CicloDadosForm ciclo={ciclo} onAtualizado={setCiclo} />`
  (linha ~538) para
  `<CicloDadosForm ciclo={ciclo} onAtualizado={setCiclo} tipoPesquisa={tipoPesquisaCiclo} />`
  — reaproveitando a variável `tipoPesquisaCiclo` já calculada nesta página
  (linha ~254), sem nenhuma chamada de API nova.

#### 1.6 Papéis com acesso (declarado, sem mudança de comportamento entre papéis)

Ambas as telas (`CicloFormPage`, `CicloDetalhePage`) já vivem atrás de
`RotaProtegida papeis={['admin', 'gestor_rh']}` (bloco existente em
`App.tsx`, não tocado por esta task). `admin` e `gestor_rh` veem e editam o
campo `tiposRelacionamentoGerados` da mesma forma — nada nesta task
distingue os dois papéis. `colaborador` nunca alcança nenhuma das duas
telas.

#### 1.7 Estados a tratar

- Nenhum estado novo de carregando/vazio/erro é introduzido por esta task —
  o campo viaja dentro do mesmo `ciclo`/mesmo payload já tratado pelos
  fluxos existentes de `criarCiclo`/`atualizarCiclo` (loading via
  `salvando`, erro via `Alert`/`erroGeral` já existentes nas duas telas).
- Único estado novo genuíno: erro de validação client-side "selecione ao
  menos um tipo" (`errosCampo.tiposRelacionamentoGerados`), tratado com o
  mesmo padrão dos outros campos (`FormHelperText`/`helperText` +
  `error={Boolean(...)}`).

#### 1.8 Fora de escopo explícito (não implementar nesta task)

- Exibir `tiposRelacionamentoGerados` em `CiclosListPage` (cards da
  listagem) — o pedido do usuário menciona só `CicloFormPage`; a exibição
  na tela de detalhe (`CicloDadosForm`) foi adicionada por decorrência
  direta da resolução da discrepância registrada acima, não a listagem.
  Ver "Perguntas em aberto" item 1.
- Qualquer validação cruzada entre `tiposRelacionamentoGerados` e a
  presença/ausência de participantes, gestor definido, etc. — o campo é só
  uma configuração booleana por tipo, sem lógica de negócio adicional no
  frontend.
- Nenhuma mudança em `CiclosListPage.tsx`, `App.tsx`,
  `PainelAdminLayout.tsx` — nenhuma rota nova, nenhum link novo.

### 2. frontend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Contrato de API confirmado, não assumido**: `tiposRelacionamentoGerados`
   em `types/ciclo.ts`/`ciclosService.ts` bate exatamente com o
   `task-backend.md` final (nome do campo, shape `string[]`, valores
   válidos, obrigatoriedade em `POST`/`PUT`) — não com o "assumido" deste
   plano, caso o backend tenha fechado diferente.
2. **`TipoRelacionamentoGeravel` nunca inclui `'externo'`**: nem no tipo,
   nem nos rótulos (`rotulosTiposRelacionamentoGerados.ts`), nem em nenhum
   `useState` default.
3. **Decisão "onde o grupo vive" respeitada**: `CicloFormPage.tsx` mostra o
   grupo sempre habilitado e nunca oculto (é sempre rascunho, nunca tem
   pesquisa vinculada); `CicloDadosForm.tsx` mostra o grupo com
   `disabled={somenteLeitura || salvando}` e a seção inteira **oculta**
   (não só desabilitada) quando `tipoPesquisa === 'clima_geral'`. Nenhuma
   das duas condições foi implementada "ao contrário" (ex. ocultar em
   `CicloFormPage`, que nunca deveria ocultar).
4. **`CicloDetalhePage.tsx` passa `tipoPesquisaCiclo` (variável já
   existente) para `CicloDadosForm`, sem nenhuma chamada de API nova**
   introduzida para calcular isso.
5. **Validação "pelo menos 1 marcado"** presente e funcional nos dois
   `validar()` (`CicloFormPage` e `CicloDadosForm`), bloqueando o submit
   com mensagem visível — não só um `disabled` no botão sem explicação.
6. **Componente `TiposRelacionamentoCheckboxGroup` é puramente controlado**
   (`value`/`onChange`/`disabled`/`error`/`helperText` via props) — sem
   `useState` interno, sem chamada de API, mesmo padrão exigido pela skill
   `frontend-componente-pergunta` para componentes de resposta (mesmo não
   sendo um componente de pergunta, o princípio "recebe valor+onChange,
   nunca chama API" se aplica igual aqui).
7. **Ordem de exibição estável**: o toggle de um checkbox não deve
   reordenar os demais no array `tiposRelacionamentoGerados` — a ordem de
   exibição sempre segue `TIPOS_RELACIONAMENTO_GERAVEL`, independente da
   ordem em que o usuário clicou.
8. **Rótulos amigáveis corretos e não confundidos com
   `ROTULOS_TIPO_RELACIONAMENTO`** (o mapa curto já existente, usado nas
   tabelas de relacionamentos/envios): `"Gestor avalia liderado"`, `"Pares
   avaliam entre si"`, `"Liderado avalia gestor"`, `"Autoavaliação"` — não
   os nomes técnicos do enum (`gestor`, `pares`, `subordinado`,
   `autoavaliacao`), e não os rótulos curtos do outro mapa.
9. **Stack de estilização**: Tailwind + MUI, sem `.css` novo, sem
   `style={{}}` extenso, nenhuma dependência nova instalada (em particular,
   sem lib de toggle/checkbox externa — `FormGroup`/`FormControlLabel`/
   `Checkbox` já fazem parte de `@mui/material`, já usado no projeto).
10. **Reaproveitamento confirmado**: `TiposRelacionamentoCheckboxGroup` é
    de fato usado nas duas telas (não duplicado como JSX inline em cada
    uma); `AtualizarCicloPayload` não foi editado manualmente (continua
    `Partial<CriarCicloPayload>`, herdando o campo automaticamente).
11. **Nenhuma regra de anonimização/negócio sensível tocada**: este campo é
    só configuração de quais tipos de relação são gerados — não é
    `minimoRespostasPares`/`anonimizarRespostasPares`, não tem relação com
    a regra de agregação de `pares`/`subordinado`; confirmar que nenhum
    código novo combina `tiposRelacionamentoGerados` com dado de
    resposta/contagem (não deveria haver nada disso, mas vale grep).
12. **Sem etapa de test-engineer nesta task** (pedido explícito do
    usuário) — a revisão sem achado crítico encerra o pipeline desta
    demanda; não encaminhar para `test-engineer`.

## Revisão

Revisão da etapa "1. frontend-developer" feita lendo `task-backend.md`
(contrato final confirmado) e todos os arquivos citados no resumo: `types/ciclo.ts`,
`services/ciclosService.ts`, `components/ciclos/rotulosTiposRelacionamentoGerados.ts`,
`components/ciclos/TiposRelacionamentoCheckboxGroup/TiposRelacionamentoCheckboxGroup.tsx`,
`pages/CicloFormPage/CicloFormPage.tsx`, `pages/CicloDetalhePage/CicloDadosForm.tsx`,
`pages/CicloDetalhePage/CicloDetalhePage.tsx` (grep dos pontos de uso), `App.tsx`
(rotas) e `pages/CiclosListPage/CiclosListPage.tsx` (confirmando que não foi tocado).

**Nenhum achado crítico.** O contrato de campo bate exatamente com
`task-backend.md` (`tiposRelacionamentoGerados?: string[]`, valores
`'autoavaliacao' | 'gestor' | 'pares' | 'subordinado'`, sem `'externo'`), as
duas telas seguem exatamente a decisão registrada de "onde o grupo vive"
(sempre visível/habilitado em `CicloFormPage`, oculto — não só desabilitado —
em `CicloDadosForm` quando `tipoPesquisa === 'clima_geral'`, com
`disabled={somenteLeitura || salvando}` quando visível), `CicloDetalhePage`
passa a variável já existente `tipoPesquisaCiclo` sem reimplementar a lógica,
os rótulos amigáveis e a ordem batem com o pedido, o componente
`TiposRelacionamentoCheckboxGroup` é puramente controlado (sem `useState`
interno, sem chamada de API) e é de fato reaproveitado nas duas telas sem
duplicação de JSX, a ordem de exibição é estável (o toggle preserva a ordem
de `TIPOS_RELACIONAMENTO_GERAVEL`, nunca a ordem de clique), e o estilo segue
Tailwind + MUI sem CSS novo (nenhum `.css` criado, sem `style={{}}` inline
além do já existente no restante dos dois formulários). Ambas as telas
continuam atrás de `RotaProtegida papeis={['admin', 'gestor_rh']}` em
`App.tsx`, inalterado — `colaborador` nunca alcança nenhuma das duas.
`CiclosListPage.tsx` confirmado não tocado, conforme "fora de escopo".

O orquestrador pode prosseguir — não há etapa de `test-engineer` nesta task
(pedido explícito do usuário registrado no cabeçalho do plano), então a
revisão sem achado crítico encerra o pipeline desta demanda.

### Deveria corrigir

Nenhum.

### Sugestão

1. **`CicloDadosForm.tsx` — validação de "pelo menos 1 marcado" roda mesmo
   com a seção oculta (`tipoPesquisa === 'clima_geral'`), sem forma de o
   usuário ver o erro caso ele dispare.** `validar()` sempre checa
   `tiposRelacionamentoGerados.length === 0` e popula
   `errosCampo.tiposRelacionamentoGerados`, mas o único lugar que exibe essa
   mensagem (`FormHelperText` dentro de `TiposRelacionamentoCheckboxGroup`)
   só é renderizado quando a seção está visível. Na prática isso é
   dificilmente alcançável (o `ciclo.tiposRelacionamentoGerados` carregado do
   backend nunca deveria chegar vazio, dado o default de 4 tipos em `criar()`
   e as duas `CHECK`s de banco descritas em `task-backend.md`), mas, se algum
   dia ocorrer (ex. dado legado, ou um ciclo `clima_geral` cujo campo foi
   zerado por escrita fora do fluxo normal), o `handleSalvar` falharia
   silenciosamente sem nenhuma mensagem visível ao usuário — só o botão
   "Salvar alterações" pareceria não fazer nada. Considerar pular essa
   checagem em `validar()` quando `tipoPesquisa === 'clima_geral'` (o campo
   não se aplica a esse tipo de pesquisa de qualquer forma, mesmo padrão já
   usado no backend em `atualizarStatus`, que só valida o campo para
   `avaliacao_360`).

## Perguntas em aberto

1. **`CiclosListPage` (cards da listagem) não exibe
   `tiposRelacionamentoGerados`** nesta proposta — o pedido do usuário
   menciona só `CicloFormPage` (e, por decorrência da discrepância
   resolvida, `CicloDadosForm`), não a listagem. Se o usuário quiser um
   indicador rápido na listagem (ex. "4/4 tipos" ou chips), isso é uma
   extensão não pedida literalmente — confirmar se é desejada antes de
   implementar.
2. **Mensagem de erro/código exato do `422` de lista vazia** ainda não
   confirmado contra `task-backend.md` (que pode não estar fechado quando
   este plano for lido) — o passo 1.0 obriga o `frontend-developer` a
   confirmar isso antes de implementar; se o código/mensagem divergir do
   assumido aqui, ajustar sem reabrir o resto do plano.
3. **Se o backend tornar o campo obrigatório (sem default) em `POST
   /api/ciclos`** — diferente do assumido aqui (`?` opcional, com default
   "os 4 marcados" no servidor) — `CriarCicloPayload.tiposRelacionamentoGerados`
   deixa de ter `?` e o `useState` inicial de `CicloFormPage` continua
   enviando os 4 marcados por padrão de qualquer forma (não muda o
   comportamento visível ao usuário, só a obrigatoriedade do tipo
   TypeScript do payload).
