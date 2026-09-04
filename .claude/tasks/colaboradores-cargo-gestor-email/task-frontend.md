# Task: Colaborador — cargo fixo, "É gestor" e e-mail condicional — Frontend

Demanda de frontend (`frontend/`, equivalente ao `apps/web` citado nos
agentes/skills). Requisitos já esclarecidos diretamente pelo usuário — sem
etapa de `spec`. Este plano não toca `backend/`; o contrato de API do qual
depende está sendo definido em paralelo por `planejamento-backend`
(`.claude/tasks/colaboradores-cargo-gestor-email/task-backend.md`), que no
momento em que este plano foi escrito **ainda não existe no repo**. Onde este
plano depende de um endpoint/contrato ainda não confirmado, isso é declarado
explicitamente como pendência de alinhamento — o `frontend-developer` deve
ler `task-backend.md` antes de implementar e ajustar nomes de rota/campo para
bater com o que existir de fato, sem alterar o comportamento de UI descrito
aqui.

## Estado atual verificado (antes do plano)

- `frontend/src/pages/ColaboradorFormPage/ColaboradorFormPage.tsx` já existe
  e implementa criação/edição de colaborador (rotas `/colaboradores/novo` e
  `/colaboradores/:id/editar`, conforme
  `.claude/tasks/cadastro-colaboradores-equipes/task-frontend.md`).
- **Cargo**: hoje é um `TextField` de texto livre (linhas 262–268), sem
  validação, estado `cargo: string`, enviado como `cargo: cargo.trim() ||
  undefined` no payload (`handleSubmit`, linha 121). Não há nenhuma constante
  de opções de cargo em lugar nenhum de `frontend/src/` (`Glob` em
  `frontend/src/constants/**` não retornou nada).
- **Gestor**: já existe um `Select` de gestor (linhas 286–300), campo
  `gestorId`. As opções (`opcoesGestor: Colaborador[]`) vêm hoje de
  `listarColaboradores()` (todos os colaboradores, sem filtro de papel/tipo),
  filtradas só por `c.ativo && c.id !== id` (linha 71) — **não** há hoje
  nenhum filtro por "é gestor", porque esse conceito não existe ainda na
  entidade. Essa é a "solução interina" registrada como pendência no plano
  anterior (reaproveitar a listagem completa de colaboradores em vez de um
  endpoint dedicado de opções).
- `frontend/src/types/colaborador.ts`: `Colaborador` não tem campo
  `ehGestor`. Precisa ganhar `ehGestor: boolean`.
- `frontend/src/services/colaboradoresService.ts`: `ColaboradorPayload` não
  tem `ehGestor`. `listarColaboradores()` chama `GET /api/colaboradores` sem
  nenhum query param — endpoint retorna array puro (sem paginação/filtro no
  servidor, conforme divergência de contrato já registrada na task anterior).
- **E-mail**: hoje é sempre `required` quando `papel !== 'colaborador'`
  (bloco condicional JSX, linhas 224–248, com HTML **duplicado** entre os
  dois ramos — só muda a prop `required`) e sempre validado por
  `EMAIL_REGEX` em `validar()` (linha 100), **independente do papel** — ou
  seja, hoje até um colaborador com papel `colaborador` já é obrigado a
  preencher e-mail válido no client-side, embora o campo não tenha `required`
  visualmente para esse papel. Isso precisa mudar: e-mail vazio +
  papel `colaborador` deixa de ser erro de validação.
- Não existe `.claude/tasks/colaboradores-cargo-gestor-email/spec.md` no
  repo. `task-backend.md` da mesma slug está sendo escrito em paralelo — não
  lido ainda neste plano porque pode não existir no momento em que
  `planejamento-frontend` rodou; **o `frontend-developer` deve reler o
  diretório da task antes de codar**.

## Contrato de API esperado pelo frontend (a confirmar com `task-backend.md`)

- Lista fixa de cargos: o enunciado da demanda já traz a lista completa (16
  itens). Não é necessário um endpoint para isso — a lista vive como
  constante no frontend, espelhando a mesma lista do backend (ver seção 1.1).
  Se `task-backend.md` expuser essa lista via endpoint (ex.:
  `GET /api/colaboradores/cargos`), isso é uma alternativa aceitável, mas
  **não obrigatória** — não bloquear a implementação esperando por isso; a
  constante local resolve o requisito sozinha. Se optar por consumir do
  endpoint, ainda assim manter a constante local como fallback/tipo, nunca
  deixar o `Select` de cargo vazio caso a chamada falhe.
- `eh_gestor`/`ehGestor`: campo booleano novo em `colaboradores`, incluído no
  body de `POST`/`PUT` (`{ ..., ehGestor: boolean }`) e no shape retornado
  por `GET /api/colaboradores` e `GET /api/colaboradores/:id` (camelCase,
  seguindo o padrão já confirmado do resto do contrato).
- Lista de opções de gestor filtrada por `ehGestor=true` e `ativo=true`:
  **pendência a confirmar em `task-backend.md`**. Duas soluções possíveis,
  em ordem de preferência:
  1. Se o backend expuser um endpoint/query param dedicado (ex.:
     `GET /api/colaboradores?ehGestor=true&ativo=true` com filtro real no
     servidor, ou um endpoint leve `GET /api/colaboradores/gestores`), usar
     esse.
  2. Solução interina (mesmo padrão já usado hoje para gestor, ver "Estado
     atual verificado"): continuar chamando `listarColaboradores()` (array
     completo) e filtrar no cliente por `c.ehGestor && c.ativo && c.id !==
     id` (edição). **Só usar esta opção se a opção 1 não existir no momento
     da implementação** — não vale a pena bloquear a task por isso, mas o
     `frontend-developer` deve deixar um comentário no código apontando que é
     solução interina, igual ao padrão já registrado no plano anterior.

## Plano — Frontend

1. frontend-developer

   Antes de codar, reler `.claude/tasks/colaboradores-cargo-gestor-email/`
   (spec.md e task-backend.md, se existirem) para confirmar nomes de campo
   e rota reais; ajustar os nomes usados abaixo se divergirem, sem mudar o
   comportamento de UI descrito.

   ### 1.1 Cargo — `Select` MUI com opções fixas

   - Criar `frontend/src/constants/colaborador.ts` (novo diretório
     `constants/`, não existe hoje em `frontend/src/`) exportando:
     ```ts
     export const CARGO_OPCOES = [
       'Auxiliar de Escritório',
       'Auxiliar Administrativo',
       'Assistente Administrativo',
       'Recepcionista',
       'Atendente',
       'Auxiliar Financeiro',
       'Analista Financeiro',
       'Contador',
       'Assistente de RH',
       'Analista de RH',
       'Gerente de RH',
       'Coordenador',
       'Supervisor',
       'Gerente',
       'Diretor',
       'Gestor',
     ] as const
     ```
     Justificativa de local: mesmo padrão de `types/colaborador.ts` (arquivo
     dedicado por domínio), reaproveitável no futuro por
     `ColaboradoresListPage` (ex.: filtro por cargo) sem duplicar a lista
     dentro de `ColaboradorFormPage.tsx`. Não usar `enum` do TS (consistente
     com a convenção do projeto de evitar `enum` nominal — ver CLAUDE.md,
     mesmo essa regra sendo primariamente sobre o backend, o espírito de
     "union type sobre enum" vale aqui também para uma constante simples).
   - Em `ColaboradorFormPage.tsx`, trocar o `TextField` de cargo (linhas
     262–268) por um `TextField select` (mesmo padrão já usado para
     `papel`/`equipe`/`gestor` no arquivo — não é o componente `<Select>` do
     `@mui/material` puro, é `TextField` com prop `select`, para manter
     consistência visual com o resto do form):
     ```tsx
     <TextField
       select
       label="Cargo"
       value={cargo}
       onChange={(e) => setCargo(e.target.value)}
       disabled={salvando}
       fullWidth
     >
       <MenuItem value="">Nenhum</MenuItem>
       {CARGO_OPCOES.map((opcao) => (
         <MenuItem key={opcao} value={opcao}>
           {opcao}
         </MenuItem>
       ))}
     </TextField>
     ```
   - Continua **não obrigatório** (mantém o comportamento atual — cargo é
     opcional hoje, isso não faz parte da demanda). Continua enviado como
     `string` simples no payload (`cargo: cargo || undefined`, sem `.trim()`
     já que agora vem de uma lista fixa, não de digitação livre).
   - Em modo edição, se o `cargo` carregado do backend não bater com nenhuma
     opção de `CARGO_OPCOES` (dado legado digitado livremente antes desta
     mudança), o `Select` do MUI mostraria um valor sem `MenuItem`
     correspondente (warning do MUI / campo aparentando vazio). Tratar
     explicitamente: adicionar uma opção extra ao topo da lista renderizada
     só quando isso acontecer, ex. `{cargo && !CARGO_OPCOES.includes(cargo)
     && <MenuItem value={cargo}>{cargo} (valor atual)</MenuItem>}`, para não
     apagar silenciosamente o dado existente do colaborador ao abrir a tela
     de edição.

   ### 1.2 Checkbox "É gestor" + filtro do `Select` de gestor

   - Novo estado `ehGestor: boolean` (default `false` na criação; em edição,
     popular a partir de `colaboradorAtual.ehGestor ?? false`).
   - Novo `FormControlLabel` + `Checkbox` do MUI, posicionado logo abaixo do
     campo "Cargo" (antes do `Select` de "Equipe"), **fora** do bloco
     condicional de papel — visível e habilitado para os três papéis
     (`admin`, `gestor_rh`, `colaborador`), já que é hierarquia
     organizacional, não permissão de acesso:
     ```tsx
     <FormControlLabel
       control={
         <Checkbox
           checked={ehGestor}
           onChange={(e) => setEhGestor(e.target.checked)}
           disabled={salvando}
         />
       }
       label="É gestor"
     />
     ```
     Importar `Checkbox` e `FormControlLabel` de `@mui/material` no topo do
     arquivo (não existem hoje nos imports).
   - Incluir `ehGestor` no `ColaboradorPayload` enviado em `handleSubmit`
     (`payload.ehGestor = ehGestor`).
   - Atualizar `frontend/src/types/colaborador.ts`: adicionar `ehGestor:
     boolean` à interface `Colaborador`.
   - Atualizar `frontend/src/services/colaboradoresService.ts`: adicionar
     `ehGestor: boolean` a `ColaboradorPayload`.
   - **Select de gestor** (linhas 286–300 hoje): trocar a fonte de
     `opcoesGestor` para refletir o filtro `ehGestor=true` + `ativo=true`,
     conforme a seção "Contrato de API esperado" acima (usar o
     endpoint/query param dedicado se `task-backend.md` já o definir na hora
     da implementação; senão, filtrar no cliente
     `listaColaboradores.filter(c => c.ehGestor && c.ativo && c.id !== id)`
     em `carregarDadosIniciais`, linha 71, substituindo o filtro atual que só
     considera `c.ativo && c.id !== id`). Deixar comentário no código citando
     esta task se for a solução interina, igual ao padrão do plano anterior.
   - Nenhuma mudança de comportamento para o `Select` de "Equipe" — só o de
     "Gestor" é afetado pelo novo filtro.
   - **Nota**: não impedir marcar `ehGestor = true` para um colaborador que
     já é `gestorId` de outra pessoa nem para o próprio colaborador em edição
     marcar a si mesmo como gestor (isso não bloqueia nada na tela dele
     próprio — só afeta se ele passa a aparecer como opção no `Select` de
     gestor de *outros* colaboradores). Não inventar nenhuma regra adicional
     de consistência aqui além do que foi pedido.

   ### 1.3 E-mail obrigatório condicional por papel

   - **Remover a duplicação de JSX** hoje existente (linhas 224–248, dois
     blocos `TextField` de e-mail quase idênticos diferindo só em `required`)
     e substituir por um único `TextField`, com `required` e o asterisco
     visual controlados por uma variável derivada:
     ```tsx
     const emailObrigatorio = papel === 'admin' || papel === 'gestor_rh'
     ```
     ```tsx
     <TextField
       label="E-mail"
       type="email"
       value={email}
       onChange={(e) => setEmail(e.target.value)}
       error={Boolean(errosCampo.email)}
       helperText={errosCampo.email}
       disabled={salvando}
       required={emailObrigatorio}
       fullWidth
     />
     ```
     (O asterisco "*" do MUI já é desenhado automaticamente pela prop
     `required` do `TextField` — não precisa de lógica extra de exibição.)
   - Atualizar `validar()` (linha 95 em diante) para validação condicional:
     ```ts
     const emailPreenchido = email.trim().length > 0
     if (emailObrigatorio && !emailPreenchido) {
       erros.email = 'Informe o e-mail.'
     } else if (emailPreenchido && !EMAIL_REGEX.test(email.trim())) {
       erros.email = 'Informe um e-mail válido.'
     }
     ```
     Ou seja:
     - `papel` = `admin`/`gestor_rh` + e-mail vazio → erro "obrigatório".
     - `papel` = `colaborador` + e-mail vazio → **sem erro**, submit
       liberado.
     - Qualquer papel + e-mail preenchido mas em formato inválido → erro de
       formato, sempre (independente do papel).
   - Ajustar o payload em `handleSubmit`: hoje `email: email.trim()` sempre.
     Quando `papel === 'colaborador'` e e-mail vazio, enviar `email:
     undefined` (ou string vazia, a confirmar com `task-backend.md` — o
     `frontend-developer` deve checar se o DTO do backend aceita
     `email?: string` opcional/omitido ou exige string vazia explícita;
     documentar a escolha final no resumo desta etapa).
   - Erro `409 EMAIL_DUPLICADO`/`EMAIL_JA_REGISTRADO_AUTH` do backend
     (tratamento já existente em `handleSubmit`, linha 150) continua
     funcionando sem mudança — precisa continuar aparecendo associado ao
     campo `email` mesmo quando o papel é `colaborador` (e-mail opcional mas
     preenchido e duplicado ainda é erro).
   - O `Alert` informativo de papel (linhas 207–211, "não terá login" vs.
     "conta criada + e-mail de senha") não muda de comportamento — só o
     campo de e-mail abaixo dele passa a refletir obrigatoriedade
     condizente com essa mensagem (hoje o texto já dizia "não terá login"
     para `colaborador`, mas o campo abaixo ainda cobrava e-mail via
     `validar()`; essa inconsistência estava lá antes desta task e é
     corrigida por ela).

   ### 1.4 Fora de escopo explícito

   - Nenhuma mudança em `ColaboradoresListPage.tsx` (coluna, filtro por
     cargo/gestor) — fora do pedido, mesmo que `CARGO_OPCOES` fique
     reaproveitável para isso no futuro.
   - Nenhuma mudança de regra de acesso por papel (`RotaProtegida` continua
     `['admin', 'gestor_rh']` para esta tela) — o checkbox "É gestor" não
     altera quem pode acessar o formulário, só um dado de hierarquia exibido
     dentro dele.
   - Nenhum endpoint/lógica de agregação de avaliação tocado — esta task é
     só cadastro de dados mestres.

   ### Resumo a preencher pelo `frontend-developer` ao concluir

   **Status: concluído.**

   - Lido `task-backend.md` antes de implementar. No momento da implementação
     o backend **ainda não tinha sido codado** (`ehGestor`/`eh_gestor` não
     existe em `colaborador.entity.ts`, DTOs nem migrations — só o plano
     estava escrito), então segui o contrato *planejado* lá (nomes
     `ehGestor` camelCase, `email: string | null`, filtro
     `GET /api/colaboradores?ehGestor=true&ativo=true`) como referência de
     shape, mas implementei a opção 2 (interina) para a listagem de gestor,
     já que a opção 1 (filtro real no servidor) não estava disponível ainda —
     comentário deixado em `carregarDadosIniciais` (`ColaboradorFormPage.tsx`)
     apontando isso e como trocar quando o backend publicar o filtro.
   - `frontend/src/constants/colaborador.ts` criado com `CARGO_OPCOES` (16
     valores, mesma grafia do `CARGO_COLABORADOR_VALORES` planejado no
     backend).
   - `ColaboradorFormPage.tsx`: cargo virou `TextField select` (com
     preservação de valor legado fora da lista); checkbox "É gestor" fora de
     qualquer bloco condicional de papel; e-mail unificado em um único
     `TextField` com `required={emailObrigatorio}` (`admin`/`gestor_rh`) e
     validação condicional em `validar()`; `Select` de gestor agora filtra
     `c.ehGestor && c.ativo && c.id !== id` no cliente (era só `c.ativo &&
     c.id !== id`).
   - `types/colaborador.ts`: `Colaborador.email` passou de `string` para
     `string | null` (bate com a entidade nullable planejada no backend);
     adicionado `ehGestor: boolean`.
   - `services/colaboradoresService.ts`: `ColaboradorPayload.email` passou de
     obrigatório para `email?: string` (omitido quando vazio); adicionado
     `ehGestor: boolean` (sempre enviado, default `false`).
   - No payload de `handleSubmit`, e-mail vazio é enviado como campo omitido
     (`undefined`), não string vazia — bate com o DTO `email?: string`
     planejado em `criar-colaborador.dto.ts`.
   - **Efeito colateral necessário fora do escopo original**: mudar
     `Colaborador.email` para `string | null` quebrava a checagem de tipos em
     `ColaboradoresListPage.tsx` (linhas que faziam `.email.toLowerCase()` e
     exibiam `colaborador.email` direto). Ajustado com null-safety mínima
     (`colaborador.email?.toLowerCase() ?? false` no filtro de busca,
     `colaborador.email ?? '—'` na célula da tabela) — nenhuma coluna, filtro
     ou funcionalidade nova adicionada a essa tela, só o ajuste de tipo
     necessário para o build passar.
   - `npm run build` e `npm run lint` (dentro de `frontend/`) rodados sem
     erros ao final.
   - **Ponto de atenção para o code reviewer**: como o backend ainda não
     estava implementado no momento desta etapa, os nomes de campo
     (`ehGestor`, `email: string | null`) não foram confirmados contra código
     real, só contra o plano em `task-backend.md`. Se o backend divergir
     desses nomes/formatos na implementação final, o frontend precisa ser
     ajustado numa correção pontual antes do `frontend-codereviewer` aprovar
     a integração fim a fim.

2. frontend-codereviewer

   Pontos de atenção específicos para o revisor conferir:
   - **Cargo**: `Select` usa `CARGO_OPCOES` com exatamente os 16 valores do
     enunciado (sem digitação livre restante, sem opção fora da lista salvo
     o caso de valor legado tratado explicitamente); nenhum novo tipo de
     pergunta ou enum de banco foi introduzido — cargo continua `string`
     simples no payload.
   - **`ehGestor` é independente de `papel`**: confirmar que o `Checkbox` "É
     gestor" está fora de qualquer bloco condicional por papel e visível/
     editável para `admin`, `gestor_rh` e `colaborador` igualmente — não deve
     haver nenhuma lógica que desabilite ou esconda o checkbox conforme o
     `Select` de papel.
   - **`Select` de gestor realmente filtra `ehGestor && ativo`**: conferir
     se a fonte de `opcoesGestor` mudou de fato (não é só o `Checkbox` novo
     sem uso real no filtro) e se o próprio colaborador em edição continua
     excluído da própria lista de opções (regra pré-existente, não pode
     regredir).
   - **E-mail condicional não regrediu a validação de formato**: e-mail
     preenchido com formato inválido continua bloqueando submit
     **independente do papel**, inclusive para `colaborador`. Só o caso
     "vazio" passou a ser aceito para `colaborador`.
   - **Erro 409 de e-mail duplicado continua tratado** mesmo quando o papel é
     `colaborador` (fluxo de e-mail opcional mas preenchido e duplicado).
   - **Sem duplicação de JSX remanescente**: confirmar que o bloco condicional
     de dois `TextField`s de e-mail quase idênticos foi de fato unificado em
     um só, não apenas um terceiro bloco adicionado por cima.
   - **Estilo**: `Checkbox`/`FormControlLabel`/`TextField select` usados
     (MUI), nenhum CSS puro novo, nenhum `style={{}}` extenso; se qualquer
     cor for necessária para destacar o checkbox, deve vir da paleta do
     `theme.ts` existente, não de hex-code solto.
   - **Consistência com `task-backend.md` real**: se o `frontend-developer`
     precisou desviar do contrato assumido neste plano (nome de campo
     diferente de `ehGestor`, endpoint dedicado de opções de gestor em vez de
     filtro client-side, formato de e-mail vazio no payload), confirmar que
     isso está documentado na seção "Resumo a preencher" desta mesma task e
     que bate com o `task-backend.md` real.
   - **Sem vazamento de escopo**: nenhuma coluna/link/modal de avaliação ou
     resposta foi adicionado a esta tela — mudança estritamente limitada a
     cargo/gestor/e-mail do formulário de colaborador.

## Revisão

Revisado contra `task-frontend.md`, `task-backend.md` (backend já implementado
e testado — 141 testes passando) e o código real de
`frontend/src/pages/ColaboradorFormPage/ColaboradorFormPage.tsx`,
`frontend/src/types/colaborador.ts`,
`frontend/src/services/colaboradoresService.ts`,
`frontend/src/constants/colaborador.ts`,
`frontend/src/pages/ColaboradoresListPage/ColaboradoresListPage.tsx`,
`frontend/src/App.tsx` e
`backend/src/modules/colaboradores/colaboradores.controller.ts` /
`colaborador.entity.ts`.

**Nenhum achado crítico.** Não há vazamento de identidade (esta tela não é
uma tela de resultado de avaliação) e o controle de acesso permanece
`RotaProtegida papeis={['admin', 'gestor_rh']}` em `App.tsx`, inalterado
pela task, para `/colaboradores`, `/colaboradores/novo` e
`/colaboradores/:id/editar`. Pode prosseguir para `test-engineer`.

### Deveria corrigir

- **[Corrigido]** `colaboradoresService.listarColaboradores` agora aceita
  `{ ehGestor?, ativo? }` e monta a query string via `URLSearchParams`;
  `ColaboradorFormPage.tsx` chama `listarColaboradores({ ehGestor: true,
  ativo: true })` e só mantém o filtro client-side de `c.id !== id`
  (exclusão do próprio colaborador em edição, que o backend não faz). O
  comentário de "solução interina" foi removido. `npm run build` e
  `npm run lint` (`frontend/`) rodados sem erros após a mudança.
- **Trocar o filtro client-side de `opcoesGestor` pelo query param real,
  já disponível no backend.** No momento em que o `frontend-developer`
  implementou (`ColaboradorFormPage.tsx`, `carregarDadosIniciais`,
  linhas 70–84), `GET /api/colaboradores` ainda não suportava
  `ehGestor`/`ativo`, então a solução interina (buscar a lista completa via
  `listarColaboradores()` e filtrar `c.ehGestor && c.ativo && c.id !== id`
  no cliente) era razoável e foi corretamente documentada com comentário
  no código e no resumo da task. O backend **já está implementado agora**:
  confirmado em `colaboradores.controller.ts` (`listarColaboradores` lê
  `obterQueryBooleanoOpcional(req, 'ehGestor')` e `obterQueryBooleanoOpcional(req,
  'ativo')`) e em `colaboradores.service.ts` → `listar()` (filtra via
  `FindOptionsWhere`), mantendo a mesma `garantirPapel(['admin', 'gestor_rh'])`
  — sem exposição nova a `colaborador`. A troca é direta: `apiFetch` já
  aceita a query string sem nenhuma infraestrutura nova (não há hoje
  nenhum uso de `URLSearchParams` no projeto, mas para este caso um path
  literal basta), por exemplo:
  ```ts
  // colaboradoresService.ts
  export function listarColaboradores(filtros?: { ehGestor?: boolean; ativo?: boolean }): Promise<Colaborador[]> {
    const params = new URLSearchParams()
    if (filtros?.ehGestor !== undefined) params.set('ehGestor', String(filtros.ehGestor))
    if (filtros?.ativo !== undefined) params.set('ativo', String(filtros.ativo))
    const query = params.toString()
    return apiFetch<Colaborador[]>(`/api/colaboradores${query ? `?${query}` : ''}`)
  }
  ```
  e em `carregarDadosIniciais` (`ColaboradorFormPage.tsx`), trocar a segunda
  chamada `Promise.all` de `listarColaboradores()` para
  `listarColaboradores({ ehGestor: true, ativo: true })` e remover o filtro
  client-side (`.filter((c) => c.ehGestor && c.ativo && c.id !== id)`),
  mantendo só a exclusão do próprio id (`c.id !== id`) — que o backend não
  filtra. Vale a troca por dois motivos: (1) evita buscar/expor a lista
  completa de colaboradores (inclusive inativos e não-gestores) só para
  montar um `<select>` de gestor, o que é desnecessário mesmo não sendo um
  vazamento de identidade (a tela já é restrita a admin/gestor_rh); (2)
  remove o comentário de "solução interina" que hoje fica desatualizado
  assim que o backend publica o filtro real — deixar isso pendente é dívida
  técnica evitável, não um bloqueio funcional.

### Sugestões

- Ao fazer a troca acima, considerar extrair um helper simples de query
  string (ex.: em `apiClient.ts` ou um utilitário novo) caso mais
  services venham a precisar de filtros de listagem no futuro — não é
  necessário agora com só um call-site, mas evita reinventar
  `URLSearchParams` a cada novo filtro se o padrão se repetir.
- O comentário de "valor legado" no `Select` de cargo (linhas 278–283 de
  `ColaboradorFormPage.tsx`) está correto e bem documentado; nenhuma ação
  necessária, só registrando que foi verificado.

### Confirmado sem achados (checklist do orquestrador)

- Nomes de campo batem com o backend real: `ehGestor` (boolean,
  `colaborador.entity.ts` linha 55–56) e `email: string | null`
  (`colaboradores.controller.ts`/entidade `nullable: true`) — o frontend
  (`types/colaborador.ts`, `colaboradoresService.ts`) usa exatamente os
  mesmos nomes/tipos.
- Checkbox "É gestor" (`ColaboradorFormPage.tsx`, linhas 291–300) está fora
  de qualquer bloco condicional de `papel` — visível/editável para os três
  papéis igualmente, sem lógica de desabilitação condicional.
- Asterisco/obrigatoriedade de e-mail: `required={emailObrigatorio}` (linha
  254) e `validar()` (linhas 109–125) só exigem preenchimento quando
  `emailObrigatorio` (`admin`/`gestor_rh`); formato (`EMAIL_REGEX`) é
  validado sempre que preenchido, independente do papel — cobre
  corretamente o caso `colaborador` com e-mail preenchido mas inválido.
- Nenhum JSX duplicado remanescente no campo de e-mail — um único
  `TextField` (linhas 246–256).
- Estilo: Tailwind (layout/espaçamento, ex. `className="flex flex-col gap-4"`)
  + MUI (`TextField select`, `Checkbox`, `FormControlLabel`) sem CSS puro
  novo nem `style={{}}` extenso; nenhuma sobreposição de MUI por Tailwind
  identificada.
- Ajuste de `ColaboradoresListPage.tsx` para `email: string | null`
  (`colaborador.email?.toLowerCase() ?? false` no filtro de busca,
  `colaborador.email ?? '—'` na célula da tabela) é mínimo, correto e
  dentro do que foi declarado como efeito colateral necessário — nenhuma
  funcionalidade nova adicionada a essa tela.
- Erro `409 EMAIL_DUPLICADO`/`EMAIL_JA_REGISTRADO_AUTH` continua tratado em
  `handleSubmit` (linha 172) independente do papel.
