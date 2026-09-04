# Task: Opção "Todos os gestores" no filtro de relacionamento da pergunta `pessoa` — Frontend

Demanda de frontend (`frontend/`, equivalente ao `apps/web` citado nos
agentes/skills — usar sempre os caminhos reais `frontend/**` neste plano).
Etapa de spec pulada — escopo já esclarecido diretamente pelo usuário.
`task-backend.md` deste mesmo slug está sendo implementado em paralelo (não
lido aqui: o contrato já foi confirmado no pedido — mesmo array
`configuracao.filtroRelacionamento`, allowlist do backend vira
`['pares','subordinado','externo','todos_gestores']`, sem novo campo, sem
mudança de shape de payload).

## Correção de um ponto citado de memória pelo usuário

O usuário citou `PaginaEditor.tsx` como o arquivo do seletor. Conferido por
leitura direta: **não é esse o arquivo.**
`frontend/src/pages/PesquisaConstrutorPage/PaginaEditor.tsx` só cuida do
casco da página (título, mover/excluir página, seletor de *tipo* de
pergunta a adicionar) e delega inteiramente o tipo `pessoa` para
`PerguntaCard`/`PerguntaRascunhoCard` → `PerguntaPessoaEditor`. O seletor de
filtro de relacionamento de fato vive em
`frontend/src/components/perguntas/PerguntaPessoa/PerguntaPessoaEditor.tsx`,
na constante `RELACIONAMENTO_OPCOES` (linha 17) — confirmado. Nenhuma
alteração cabe em `PaginaEditor.tsx`.

## Levantamento feito (grep + leitura completa antes de planejar)

- `RELACIONAMENTO_OPCOES` (`PerguntaPessoaEditor.tsx`) é usada só dentro do
  próprio arquivo (no `Select`/`MenuItem` e no `renderValue`) — nenhum outro
  arquivo importa essa constante. Ponto único de alteração confirmado.
- `frontend/src/types/pesquisa.ts`: `ConfiguracaoPessoa.filtroRelacionamento: string[]`
  — já é `string[]` solto, não um union literal. Nenhum outro tipo
  (`Pergunta`, `PerguntaPayload`, `AtualizarPerguntaPayload`) precisa mudar;
  todos referenciam `ConfiguracaoPessoa` por composição.
- `frontend/src/components/perguntas/validacaoPergunta.ts`:
  `validarConfiguracaoPessoa` só checa `configuracao.filtroRelacionamento.length > 0`
  — não hardcoda os valores permitidos, continua válida para qualquer
  array não vazio, `'todos_gestores'` incluso. Nenhuma mudança necessária.
- `frontend/src/pages/PesquisaConstrutorPage/PerguntaRascunhoCard.tsx`:
  `CONFIG_PESSOA_DEFAULT = { filtroRelacionamento: [] }` — default
  intencionalmente vazio (força o usuário a escolher; ver comentário na
  linha 38 do arquivo sobre não ter default válido). Não referencia opções
  específicas. Nenhuma mudança necessária.
- `frontend/src/components/perguntas/PerguntaPessoa/PerguntaPessoaResposta.tsx`
  (componente de RESPOSTA, não de edição): recebe `opcoes: ColaboradorOpcao[]`
  já resolvidas pela API via prop — nunca lê `filtroRelacionamento`
  diretamente nem resolve quem é gestor. Nenhuma mudança necessária, e é
  justamente o comportamento que preserva a regra "nenhuma lógica de
  negócio sensível no frontend" (é o backend que decide, a partir do
  filtro configurado, qual lista de colaboradores enviar).
- **Falso positivo descartado, verificado por leitura completa**:
  `frontend/src/components/ciclos/rotulosTipoRelacionamento.ts`
  (`ROTULOS_TIPO_RELACIONAMENTO`) também tem as chaves `pares`/`subordinado`/
  `externo`, mas é um domínio diferente — rotula `TipoRelacionamento`
  (`relacionamentos_avaliacao`, incluindo também `autoavaliacao`/`gestor`),
  usado só na coluna "Tipo" da tabela de relacionamentos gerados de um
  ciclo. Não tem relação com `configuracao.filtroRelacionamento` de uma
  pergunta `pessoa`, e "todos_gestores" não faz sentido como um *tipo de
  relacionamento avaliador↔avaliado* (não é uma relação 1:1, é uma
  seleção de universo). **Não alterar este arquivo.**
- `frontend/src/components/perguntas/PerguntaCard/PerguntaCard.tsx`: usa
  `PerguntaPessoaEditor` tal qual (sem duplicar a lista de opções, sem
  renderizar um preview textual separado do filtro) — nenhuma mudança
  necessária.
- Papéis com acesso à tela onde este seletor aparece (`App.tsx`, rotas
  `/pesquisas/nova` e `/pesquisas/:id/editar`): só `admin` e `gestor_rh`
  (`RotaProtegida papeis={['admin', 'gestor_rh']}`). `colaborador` nunca
  acessa o construtor — não há variação de comportamento por papel dentro
  do próprio editor (quem acessa já é só admin/gestor_rh; não existe modo
  "somente leitura" adicional restrito por papel além da prop
  `somenteLeitura` já existente, que não muda com esta task).

## Decisões (com justificativa)

1. **Uma única entrada nova no array `RELACIONAMENTO_OPCOES`**:
   `{ valor: 'todos_gestores', label: 'Todos os gestores' }`, adicionada
   após `externo` (mantém a ordem "as três que dependem da relação" antes
   da nova opção, que é conceitualmente diferente). Nenhuma mudança de
   `Select`/`MenuItem`/`renderValue` além de consumir a lista maior — o
   `renderValue` já resolve rótulo via `.find(...)`, funciona para o novo
   valor sem alteração de lógica.
2. **`ConfiguracaoPessoa.filtroRelacionamento` permanece `string[]`** (não
   estreitar para um union literal `'pares' | 'subordinado' | 'externo' |
   'todos_gestores'`). Considerado e descartado: o tipo já era solto antes
   desta task (não é uma regressão introduzida agora), a única fonte de
   verdade de quais valores aparecem no seletor já é `RELACIONAMENTO_OPCOES`
   (não o tipo), e o backend é quem valida a allowlist de fato — estreitar
   o tipo aqui só aumentaria a superfície de mudança (teria que tocar
   `types/pesquisa.ts`, possivelmente `types/respostaPublica.ts` que reimporta
   `ConfiguracaoPessoa`) sem ganho real de segurança, já que nenhuma outra
   parte do frontend faz `switch`/lógica condicional sobre esses valores.
3. **Texto de apoio curto abaixo do `Select`**, via `FormHelperText` do MUI
   (mesmo padrão já usado em `PerguntaPessoaResposta.tsx` para o estado de
   erro obrigatório — aqui é informativo, sempre visível, não condicionado
   a erro), explicando a diferença de semântica para quem monta a
   pesquisa:
   > "Pares, Subordinado e Externo dependem da relação do respondente com
   > o avaliado no ciclo. Todos os gestores independe dessa relação: lista
   > todos os colaboradores marcados como gestor que participam do ciclo."

   Exibido sempre (não só quando `'todos_gestores'` está selecionado) —
   decisão deliberada: quem monta a pesquisa precisa entender a diferença
   *antes* de escolher, não depois. Um texto condicional só apareceria
   tarde demais para orientar a decisão inicial. Usa `FormHelperText`
   simples (sem cor customizada via `sx`/Tailwind — herda a cor padrão de
   texto secundário do tema MUI), respeitando "MUI vence" e sem novo
   arquivo `.css`.
4. **Sem lógica de exclusividade mútua entre `'todos_gestores'` e as outras
   três opções.** A demanda não pediu isso, e o contrato confirmado trata
   `'todos_gestores'` como só mais um valor no mesmo array multi-select —
   inventar uma regra de "seleção exclusiva" no frontend seria assumir uma
   regra de negócio não confirmada. Se o backend rejeitar alguma
   combinação, ele responde com erro de validação (`422`), que já é
   propagado pelo fluxo de salvamento existente de `PerguntaCard`/
   `PerguntaRascunhoCard` (`erroSalvar`/`erro` exibido em `Alert`) sem
   nenhuma mudança adicional.
5. **Nenhuma resolução de "quem é gestor" no frontend.** O componente
   continua apenas oferecendo a opção de configuração; a lista real de
   colaboradores correspondente a cada envio (incluindo o caso
   `'todos_gestores'`) continua vindo pronta da API em
   `pergunta.opcoesPessoa`/`opcoes` (ver `PerguntaPessoaResposta.tsx`,
   fora do escopo desta task — ela já recebe a lista via prop e não muda).

## Plano — Frontend

### 1. frontend-developer — CONCLUÍDO

Implementado exatamente conforme o plano, único arquivo alterado:
`frontend/src/components/perguntas/PerguntaPessoa/PerguntaPessoaEditor.tsx`.

- Adicionada a entrada `{ valor: 'todos_gestores', label: 'Todos os
  gestores' }` ao final de `RELACIONAMENTO_OPCOES` (após `externo`) — string
  bate literalmente com `'todos_gestores'` citado no contrato do resumo da
  task (backend ainda não lido, conforme instrução — contrato assumido como
  confirmado pelo usuário no pedido).
- Adicionado `FormHelperText` (import de `@mui/material`) logo abaixo do
  `Select`, sempre visível, com o texto de apoio definido na decisão 3 do
  plano, sem `sx`/cor customizada (herda a cor padrão discreta do tema MUI).
- Nenhuma outra linha do arquivo mudou: `handleFiltroChange`, o `Select
  multiple` e o `renderValue` seguem idênticos (lógica genérica sobre o
  array de opções, sem necessidade de alteração). Nenhuma lógica de
  exclusividade entre opções foi introduzida. Nenhuma resolução de "quem é
  gestor" no frontend.
- Nenhum outro arquivo tocado (`types/pesquisa.ts`, `validacaoPergunta.ts`,
  `PerguntaRascunhoCard.tsx`, `PerguntaCard.tsx`,
  `PerguntaPessoaResposta.tsx`, `rotulosTipoRelacionamento.ts` permanecem
  inalterados, conforme o levantamento do plano).
- `npm run build` (`tsc -b && vite build`) e `npm run lint` (`eslint .`)
  rodados em `frontend/`: ambos passaram sem erros/avisos novos (único
  warning presente é o de chunk size >500kB do Vite, pré-existente e não
  relacionado a esta mudança).

- **Componentes alterados**: só
  `frontend/src/components/perguntas/PerguntaPessoa/PerguntaPessoaEditor.tsx`.
  Nenhum componente novo, nenhum outro arquivo tocado (ver levantamento
  acima — todos os outros pontos candidatos foram conferidos e descartados
  explicitamente).
- **Página(s)/rota(s) afetadas**: `/pesquisas/nova` e `/pesquisas/:id/editar`
  (`PesquisaConstrutorPage` → `PaginaEditor` → `PerguntaCard`/
  `PerguntaRascunhoCard` → `PerguntaPessoaEditor`), sem mudança de rota.
- **Papéis com acesso**: `admin` e `gestor_rh` (via
  `RotaProtegida papeis={['admin', 'gestor_rh']}` já existente em
  `App.tsx`) — inalterado por esta task. `colaborador` não acessa esta
  tela. Nenhuma variação de comportamento adicional por papel dentro do
  editor.
- **Endpoints da API consumidos**: nenhum endpoint novo. A pergunta
  continua sendo persistida via `POST/PUT .../perguntas` já existentes
  (`perguntasService.ts`, chamado por `PaginaEditor.tsx`/`PerguntaCard.tsx`/
  `PerguntaRascunhoCard.tsx`) — o novo valor `'todos_gestores'` só passa a
  trafegar dentro do mesmo array `configuracao.filtroRelacionamento` que já
  era enviado. Nenhuma mudança de client/service necessária.
- **Estados a tratar**: nenhum estado novo de carregando/vazio/erro — o
  `Select` continua síncrono (sem chamada de rede própria); o estado de
  erro de validação (`filtroRelacionamento` vazio) e o estado de erro de
  salvamento (resposta 4xx do backend) já são tratados pelos componentes
  pai (`PerguntaCard`/`PerguntaRascunhoCard`) e continuam funcionando sem
  alteração.

#### 1.1 `frontend/src/components/perguntas/PerguntaPessoa/PerguntaPessoaEditor.tsx` (único arquivo editado)

- Adicionar ao array `RELACIONAMENTO_OPCOES` (após a entrada `externo`):
  ```ts
  { valor: 'todos_gestores', label: 'Todos os gestores' },
  ```
- Adicionar um `FormHelperText` (import de `@mui/material`, já usado em
  outros componentes de pergunta) logo abaixo do `Select`, texto fixo (ver
  decisão 3 acima), sempre visível — não usar `Typography`/`style={{}}`
  solto nem classe Tailwind para cor (deixar a cor padrão de
  `FormHelperText`, que já é discreta o suficiente no tema atual).
- Nenhuma outra linha do arquivo muda — `handleFiltroChange`, o próprio
  `Select multiple`, o `renderValue` e o `TextField`/`Switch` de
  enunciado/obrigatória continuam idênticos, já que a lógica de
  seleção/renderização é genérica sobre o array de opções.
- Confirmar visualmente (ou via leitura do resultado renderizado) que o
  layout `flex flex-col gap-3` existente acomoda a nova linha de texto sem
  quebrar o espaçamento — o `gap-3` do container já se aplica a um novo
  filho direto.

#### 1.2 Fora de escopo explícito (não implementar nesta task)

- Qualquer alteração em `types/pesquisa.ts`, `validacaoPergunta.ts`,
  `PerguntaRascunhoCard.tsx`, `PerguntaCard.tsx`,
  `PerguntaPessoaResposta.tsx` ou `rotulosTipoRelacionamento.ts` — todos
  conferidos e confirmados como não precisando de mudança (ver
  levantamento acima).
- Qualquer lógica de exclusividade entre opções do filtro (decisão 4).
- Qualquer resolução de "quem é gestor" no frontend (decisão 5) — isso é
  responsabilidade exclusiva da API.
- Qualquer novo tipo de pergunta ou atalho de criação automática de
  pesquisa — fora de escopo desta demanda.

Ao terminar: rodar `npm run build` (`tsc -b && vite build`) e `npm run lint`
(`eslint .`) dentro de `frontend/` e confirmar que ambos passam sem
erros/avisos novos. Registrar no resumo da etapa se o contrato de
`task-backend.md` (quando existir/for lido) bateu literalmente com
`'todos_gestores'` como string, ou se algum ajuste de nome foi necessário.

**Endpoints consumidos por esta tela** (inalterados por esta task):
`POST /api/pesquisas/:id/paginas/:paginaId/perguntas`,
`PUT /api/pesquisas/:id/paginas/:paginaId/perguntas/:perguntaId`.

### 2. frontend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Único arquivo alterado**: diff restrito a
   `PerguntaPessoaEditor.tsx` — nenhum outro arquivo do repositório deveria
   aparecer no diff desta task (em particular, confirmar que
   `PaginaEditor.tsx` **não** foi tocado, já que foi a hipótese inicial
   incorreta do usuário).
2. **`RELACIONAMENTO_OPCOES` com exatamente 4 entradas** após a mudança
   (`pares`, `subordinado`, `externo`, `todos_gestores`), valor
   (`valor: 'todos_gestores'`) batendo literalmente com a string que o
   backend passou a aceitar na allowlist — conferir contra
   `task-backend.md` se já existir no momento da revisão.
3. **Nenhuma lógica nova de exclusividade/condicional** foi introduzida no
   `handleFiltroChange` ou em qualquer outro ponto — o multi-select
   continua tratando todas as opções de forma simétrica (decisão 4).
4. **Texto de apoio presente e correto**: `FormHelperText` (ou componente
   MUI equivalente) renderizado sempre, com texto que deixa clara a
   diferença "depende da relação do respondente" vs "independe da
   relação, lista todos os gestores do ciclo" — sem introduzir informação
   sobre identidade de avaliadores específicos (não é uma tela de
   resultado, mas vale confirmar que o texto fala só sobre a *opção de
   configuração*, nunca sobre respostas/avaliadores reais de nenhum
   envio).
5. **Stack de estilização respeitada**: nenhum `.css` novo, nenhum
   `style={{}}` extenso, nenhuma classe Tailwind tentando sobrescrever uma
   propriedade visual já controlada por um componente MUI (`FormHelperText`/
   `Select`).
6. **Nenhuma resolução de "quem é gestor" ou lista de colaboradores
   adicionada ao frontend** — grep por chamadas novas a
   `colaboradoresService.ts` ou qualquer filtro local de colaboradores
   dentro de `PerguntaPessoaEditor.tsx`/arquivos relacionados não deveria
   encontrar nada; a resolução continua 100% no backend.
7. **`ConfiguracaoPessoa.filtroRelacionamento` permanece `string[]`** em
   `types/pesquisa.ts` — confirmar que nenhum estreitamento de tipo foi
   introduzido silenciosamente (decisão 2), e que isso não quebrou nenhuma
   tipagem em `types/respostaPublica.ts` (que reimporta `ConfiguracaoPessoa`
   sem alteração).
8. **`npm run build`/`npm run lint` limpos**, sem novos erros/avisos.

## Revisão

Revisão feita lendo o arquivo de task completo (incluindo o plano e o
levantamento da etapa 1), o único arquivo tocado
(`frontend/src/components/perguntas/PerguntaPessoa/PerguntaPessoaEditor.tsx`,
lido por inteiro), confirmação por `grep` de que `'todos_gestores'` só
aparece nesse arquivo dentro de `frontend/src` (nenhum outro arquivo do
diff), leitura de `rotulosTipoRelacionamento.ts` (confirmado intocado, 5
chaves do enum real `TipoRelacionamento`, sem `todos_gestores` — correto),
leitura de `types/pesquisa.ts` (`ConfiguracaoPessoa.filtroRelacionamento`
permanece `string[]`, sem estreitamento), `grep` de `filtroRelacionamento`
em todo `frontend/src` (só os 4 arquivos já esperados pelo plano) e
conferência de que a string `'todos_gestores'` bate literalmente com o
contrato descrito em `task-backend.md` (allowlist
`['pares','subordinado','externo','todos_gestores']`).

### Crítico

Nenhum achado crítico. Não há vazamento de identidade (o texto do
`FormHelperText` fala apenas sobre a semântica da opção de configuração,
nunca sobre respostas/avaliadores reais de nenhum envio), nenhuma mudança
de controle de acesso (tela continua só acessível a `admin`/`gestor_rh` via
`RotaProtegida`, inalterada por esta task) e nenhuma lógica de negócio
sensível (resolução de "quem é gestor", agregação, anonimização) foi
introduzida no frontend — `handleFiltroChange`, o `Select multiple` e o
`renderValue` permanecem genéricos sobre o array de opções, sem branch
condicional nova para `'todos_gestores'`.

**A etapa pode prosseguir para os testes** (com a ressalva de que o
usuário já pediu para pular a etapa de test-engineer nesta task).

### Deveria corrigir

1. **`FormHelperText` fora de um `FormControl`, sem associação via
   `aria-describedby` ao `Select`.** O `Select` (linhas 60–77) não está
   envolvido por um `FormControl`; o `FormHelperText` novo (linhas 78–82)
   é apenas um filho irmão dentro do `<div className="flex flex-col
   gap-3">`. Visualmente funciona (aparece logo abaixo do `Select`), mas o
   MUI só cablea `aria-describedby` automaticamente quando `Select` e
   `FormHelperText` compartilham o mesmo `FormControl` (ou quando um `id`
   é passado manualmente e referenciado). Como resultado, um usuário de
   leitor de tela que foca o `Select` não terá o texto de apoio anunciado
   junto — o texto fica "solto" para tecnologia assistiva, mesmo sendo
   visualmente óbvio para uso com mouse/teclado padrão. Isso não existia
   antes desta task simplesmente porque não havia `FormHelperText` nenhum;
   a lacuna de acessibilidade é uma consequência direta da mudança, não
   algo puramente pré-existente. Sugestão de correção (não aplicada por
   mim, apenas reportada): envolver o bloco `Select` em um `<FormControl
   fullWidth>` e mover o `FormHelperText` para dentro dele.

   **CORRIGIDO** — `Select` e `FormHelperText` agora são filhos diretos de
   um único `<FormControl disabled={somenteLeitura}>` em
   `PerguntaPessoaEditor.tsx`, permitindo a associação automática via
   `aria-describedby` feita pelo MUI (o `Select` continua também com seu
   próprio `disabled={somenteLeitura}`, preservando o comportamento
   anterior). Nenhum `fullWidth` foi adicionado ao `FormControl` — o
   `Select` original não tinha `fullWidth`, então omiti a prop para
   preservar exatamente a largura/aparência atual (`fullWidth` mudaria o
   layout, o que o achado pediu para evitar). `handleFiltroChange`, a lista
   `RELACIONAMENTO_OPCOES`, o `renderValue` e o texto do `FormHelperText`
   permanecem idênticos — só a estrutura de wrapping mudou. Nenhum arquivo
   além de `PerguntaPessoaEditor.tsx` foi tocado. `npm run build`
   (`tsc -b && vite build`) e `npm run lint` (`eslint .`) rodados em
   `frontend/` após a correção: ambos passaram sem erros/avisos novos
   (mesmo warning pré-existente de chunk size >500kB do Vite).

### Sugestão

1. Nenhuma outra observação de estilo ou consistência: sem novo arquivo
   `.css`, sem `style={{}}` extenso, sem classe Tailwind competindo com
   propriedade visual do MUI (o `FormHelperText` herda a cor padrão do
   tema, como planejado). O container `flex flex-col gap-3` acomoda a
   nova linha sem quebrar espaçamento.
2. `RELACIONAMENTO_OPCOES` ficou com exatamente as 4 entradas esperadas
   (`pares`, `subordinado`, `externo`, `todos_gestores`), na ordem prevista
   pelo plano (nova opção ao final, após `externo`).
3. Nenhuma chamada nova a `colaboradoresService.ts` ou filtro local de
   colaboradores foi introduzida — a resolução de "quem é gestor"
   permanece 100% no backend, como previsto.
4. `PaginaEditor.tsx` (hipótese inicial incorreta do usuário) confirmado
   intocado.

### Re-revisão pontual (correção do item 1 "Deveria corrigir")

Escopo estreito: conferido apenas
`frontend/src/components/perguntas/PerguntaPessoa/PerguntaPessoaEditor.tsx`
após a correção reportada pelo `frontend-developer` (envolver `Select` e
`FormHelperText` em `<FormControl disabled={somenteLeitura}>`).

1. **`FormControl` envolve `Select` e `FormHelperText` (confirmado)**: linhas
   61–85, ambos são filhos diretos do mesmo `<FormControl>`. A associação
   `aria-describedby` volta a ser cabeada automaticamente pelo MUI (padrão
   `FormControl` → `Select`/`FormHelperText` sem `id` manual). **Item
   original resolvido.**
2. **`disabled={somenteLeitura}` no `FormControl` não conflita com o
   `disabled={somenteLeitura}` que já existia no `Select`** (linha 67,
   mantido intocado). Os dois valores são sempre idênticos (mesma prop
   `somenteLeitura` do componente), então não há inconsistência de
   comportamento — o campo fica desabilitado corretamente em modo somente
   leitura, com ou sem o `disabled` duplicado. É redundante (o MUI já
   propagaria `disabled` do `FormControl` para o `Select` via contexto,
   mesmo sem o `disabled` explícito no `Select`), mas redundante não é o
   mesmo que incorreto — não é um achado bloqueante, ver "Sugestão" abaixo.
3. **Sem `InputLabel`, nem dentro nem fora do `FormControl`** — situação
   inalterada em relação à versão anterior à correção (o `Select` já usava
   `displayEmpty` + `renderValue` como próprio mecanismo de rótulo/estado
   vazio, sem `InputLabel` associado antes desta task nem depois). Não há
   inconsistência nova: um `FormControl` sem `InputLabel` mas com
   `displayEmpty`/`renderValue` no `Select` é um padrão válido e já era o
   padrão usado neste arquivo antes da correção.
4. **Nada além do wrapping foi alterado**: `RELACIONAMENTO_OPCOES` continua
   com as 4 entradas (`pares`, `subordinado`, `externo`, `todos_gestores`),
   `handleFiltroChange` idêntico, `renderValue` idêntico, texto do
   `FormHelperText` idêntico. Nenhum arquivo `.css` novo. Nenhum
   `style={{}}` extenso. A única classe Tailwind do arquivo continua sendo
   `flex flex-col gap-3` no container externo, que não compete com nenhuma
   propriedade visual controlada pelo `FormControl`/`Select`/`FormHelperText`
   do MUI.

**Resultado: item 1 de "Deveria corrigir" confirmado como RESOLVIDO.**
Nenhum achado crítico nesta re-revisão. A etapa pode prosseguir.

Sugestão adicional (não bloqueante, novo achado desta re-revisão):

1. O `disabled={somenteLeitura}` do `Select` (linha 67) é redundante agora
   que o `FormControl` pai já recebe `disabled={somenteLeitura}` (linha 61)
   — o MUI propaga `disabled` do `FormControl` para controles filhos via
   contexto (`useFormControl`), então a prop duplicada no `Select` não
   muda comportamento algum hoje, mas é uma linha a mais para manter
   sincronizada caso a prop mude de nome/lógica no futuro. Poderia ser
   removida do `Select`, deixando só o `FormControl` como fonte única da
   flag — troca de estilo, sem impacto funcional atual.
