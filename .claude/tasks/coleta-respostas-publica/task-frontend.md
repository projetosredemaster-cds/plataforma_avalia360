# Task: Coleta pública de respostas via `/responder/:token` — Frontend

Demanda de frontend (`frontend/`, equivalente ao `apps/web` citado nos
agentes/skills — usar sempre os caminhos reais `frontend/**` neste plano).
Baseado em `.claude/tasks/coleta-respostas-publica/spec.md` (lida por
completo). Esta é a primeira rota verdadeiramente pública do produto: sem
login, sem papel, sem `RotaProtegida`, sem depender de sessão do Supabase.

**`task-backend.md` deste mesmo slug ainda não existe** (confirmado via
`Glob` no momento deste plano — só `spec.md` está presente na pasta). O
contrato de API abaixo é montado a partir da seção 6 da spec.
**Atenção obrigatória para o `frontend-developer`**: antes de implementar,
releia `.claude/tasks/coleta-respostas-publica/task-backend.md` se ele já
existir nesse momento, e ajuste nomes de campo/rota que divergirem do que
está descrito aqui — documentando o desvio no resumo da etapa, mesmo
critério já usado em `.claude/tasks/pesquisas/task-frontend.md` e
`.claude/tasks/envios-clima-link-unico/task-frontend.md`.

## Achado crítico que redefine o escopo (confirmado por leitura direta)

Os 4 componentes de RESPOSTA de pergunta **já existem, completos, e seguem a
skill `frontend-componente-pergunta`** — não fazem parte do trabalho desta
task:

- `frontend/src/components/perguntas/PerguntaLikert/PerguntaLikertResposta.tsx`
  → `valor: RespostaLikert | null` (`{ nota: number }`), `onChange`.
- `frontend/src/components/perguntas/PerguntaTextoAberto/PerguntaTextoAbertoResposta.tsx`
  → `RespostaTextoAberto` (`{ texto: string }`).
- `frontend/src/components/perguntas/PerguntaMatriz/PerguntaMatrizResposta.tsx`
  → `RespostaMatriz` (`{ notas: Record<string, number> }`), recebe
  `competencias: Competencia[]` via prop (não busca sozinho).
- `frontend/src/components/perguntas/PerguntaPessoa/PerguntaPessoaResposta.tsx`
  → `RespostaPessoa` (`{ colaboradorId: string }`), recebe
  `opcoes: ColaboradorOpcao[]` via prop (não busca sozinho).
- `frontend/src/components/perguntas/validacaoPergunta.ts` → já contém
  `likertRespostaValida`/`textoAbertoRespostaValida`/`matrizRespostaValida`/
  `pessoaRespostaValida`, com comentário explícito "usada pelo futuro
  formulário público de resposta".

Confirmado por `grep`: nenhum desses 4 componentes é importado em nenhum
lugar hoje — foram construídos antecipadamente pela task `pesquisas`
justamente para esta task consumir. **O trabalho real aqui é construir a
página/fluxo pública que orquestra esses componentes já prontos** (status →
CPF → formulário → envio), não recriá-los.

Uma lacuna real foi encontrada neles e é tratada como ajuste pontual
justificado (não uma reescrita): nenhum dos 4 aceita hoje uma prop de
"erro/pendência" para destacar visualmente uma pergunta obrigatória não
respondida na tentativa de envio. Ver decisão 6 abaixo.

## Estado atual verificado

- `frontend/src/App.tsx`: hoje só `/login`, `/definir-senha`,
  `/acesso-negado` ficam fora de `RotaProtegida`; todo o resto vive sob
  `RotaProtegida papeis={['admin','gestor_rh']}` + `PainelAdminLayout`.
  `/responder/:token` precisa ser uma rota solta, no mesmo nível de
  `/login` — **fora** de qualquer `RotaProtegida`/`PainelAdminLayout`, sem
  guard de papel (não existe conceito de papel aqui).
- `frontend/src/main.tsx`: `AuthProvider` envolve `<App />` globalmente,
  mas só é **consumido** via `useAuth()` dentro de `RotaProtegida`. A nova
  página não deve chamar `useAuth()` em nenhum momento — sua renderização
  não pode depender do estado (`carregando`/`autenticado`/`erro`) resolvido
  por aquele provider, que resolve sessão Supabase em paralelo e é
  irrelevante para um visitante anônimo.
- `frontend/src/lib/apiClient.ts` (`apiFetch`): **já injeta `Authorization`
  apenas condicionalmente** (`...(token ? { Authorization: ... } : {})`) —
  se não houver sessão Supabase ativa no navegador, nenhum header é
  enviado. Isso resolve a pergunta em aberto nº 10 da spec parcialmente,
  mas não totalmente: se a página `/responder/:token` for aberta no mesmo
  navegador/aba onde um admin/gestor_rh já está logado (cenário real: RH
  testando o próprio link antes de enviar), `apiFetch` chamaria
  `supabase.auth.getSession()` e **enviaria o Bearer token desse admin**
  para uma rota pública que não o espera. Isso é inofensivo no backend (as
  rotas `/api/publico/**` nunca passam por `autenticar`, então o header
  seria ignorado), mas viola a exigência explícita de que "a página não
  deve depender de sessão do Supabase" e é uma prática de higiene ruim
  (vazar um token de sessão real para uma chamada que não deveria carregar
  nenhuma credencial). Decisão registrada abaixo (item 1).
- `frontend/src/utils/cpf.ts` (`formatarCpf`/`normalizarCpf`/`cpfValido`):
  reaproveitado tal qual, mesmo padrão já usado em
  `ColaboradorFormPage.tsx` (`TextField` com
  `onChange={(e) => setCpf(formatarCpf(e.target.value))}`,
  `slotProps={{ htmlInput: { inputMode: 'numeric' } }}`). Nenhum novo
  utilitário de CPF.
- `frontend/src/types/pesquisa.ts`: `TipoPesquisa`, `ConfiguracaoLikert`,
  `ConfiguracaoTextoAberto`, `ConfiguracaoPessoa` já existem e batem
  exatamente com os shapes de `configuracao` do contrato público (seção
  6.3 da spec) — reaproveitados por import, não redefinidos.
  `frontend/src/types/competencia.ts` (`Competencia { id, nome }`) também
  bate exatamente com `pergunta.competencias` do contrato.
- `frontend/src/styles/theme.ts`: paleta "Coastal Citrus" (primary
  `#2E5AA7`, secondary `#FFA62B`, info `#86C5FF`, cream `#F8E6A0`), Figtree
  300, `shape.borderRadius: 18`, botões em pílula (`borderRadius: 999`) —
  já global via `ThemeProvider` em `main.tsx`. A página pública herda o
  tema automaticamente (nenhum tema novo a criar); usar `Card`/`Paper`/
  `Button`/`TextField` do MUI normalmente, sem `.css` novo.
- `frontend/src/pages/LoginPage/LoginPage.tsx`: referência de página
  "fora do layout autenticado" — `<div className="flex min-h-svh ...">`
  com imagem/logo de `public/`, formulário MUI, sem `PainelAdminLayout`.
  Estrutura de referência para o "casco" visual da página pública (sem
  reaproveitar o componente em si — conteúdo totalmente diferente).
- `frontend/src/components/perguntas/PerguntaCard/PerguntaCard.tsx`: casco
  usado no **construtor** (chip de tipo + botões "Mover"/"Excluir" +
  `*Editor` por `switch`, com autosave debounced) — **não é reaproveitável
  aqui**: é acoplado a `AtualizarPerguntaPayload`/ações de edição
  administrativas que não existem no fluxo de resposta pública. A página
  nova usa seu próprio `switch` leve sobre os 4 `*Resposta`, sem casco de
  admin.
- Nenhum componente "tela de estado cheio" (erro/sucesso de página inteira,
  fora de uma lista/tabela) existe hoje reaproveitável — `RotaProtegida`
  tem um bloco de erro inline mas é específico do guard de autenticação
  admin, não genérico. Decisão de criar um componente pequeno e dedicado
  (item 5).
- `frontend/package.json`: sem `@mui/icons-material`, sem lib de state
  machine (`xstate` etc.) — a máquina de estados da página é modelada com
  uma única união discriminada em `useState`, sem dependência nova.

## Contrato de API a consumir (seção 6 da spec — CONFERIR contra `task-backend.md` quando existir)

Prefixo `/api/publico`, nenhuma rota atrás de `autenticar`, autorização só
por posse de `token`/`sessaoToken` + CPF.

- `GET /api/publico/envios/:token/status` → 200 `{ estado: 'aguardando_cpf' }`;
  erros terminais via `ApiError.status`/`.codigo`: 404 `LINK_INVALIDO`, 403
  `BLOQUEADO_TENTATIVAS_CPF`, 409 `CICLO_OU_PESQUISA_INATIVOS`, 410
  `ENVIO_EXPIRADO`, 409 `JA_RESPONDIDO` (só possível aqui para
  `avaliacao_360`).
- `POST /api/publico/envios/:token/confirmar-cpf` body `{ cpf }` → 200
  `{ sessaoToken, expiraEm, tipoPesquisa }`; mesmos erros terminais
  reavaliados; 422 `CPF_NAO_CONFERE`; 409 `JA_RESPONDIDO` (aqui é onde
  `clima_geral` primeiro pode revelar esse estado — ver decisão 4).
- `GET /api/publico/sessoes/:sessaoToken/formulario` → 200
  `{ pesquisa: { titulo, mensagemBoasVindas, logoUrl }, paginas: [{ id,
  ordem, titulo, perguntas: [{ id, tipo, enunciado, obrigatoria, ordem,
  configuracao, competencias?, opcoesPessoa? }] }] }`; 404
  `SESSAO_INVALIDA` / 410 `SESSAO_EXPIRADA` / 409 `SESSAO_JA_UTILIZADA`.
- `POST /api/publico/sessoes/:sessaoToken/respostas` body
  `{ itens: [{ perguntaId, valor }] }` → 200 `{ sucesso: true }`; 404/410/409
  de sessão (idem); 422 `RESPOSTA_INCOMPLETA`; 422
  `PERGUNTA_FORA_DA_PESQUISA`.

Nenhuma dessas 4 chamadas deve enviar `Authorization`. Nenhuma delas deve
receber/enviar qualquer campo de identidade do respondente do fluxo de
clima além do `token`/`sessaoToken` da URL (ver "Guard rails").

## Decisões (com justificativa)

1. **`apiFetch` ganha um parâmetro opcional `semAutenticacao?: boolean`
   (default `false`)**, em vez de criar um client HTTP paralelo. Quando
   `true`, a função pula por completo `supabase.auth.getSession()` e nunca
   monta o header `Authorization` — nenhuma outra chamada existente muda de
   comportamento (todos os ~30 call-sites atuais continuam sem passar essa
   opção, portanto idênticos a hoje). Escolhida em vez de um `apiFetchPublico`
   separado porque o resto do transporte (serialização JSON, `ApiError`
   tipado com `status`/`codigo`, tratamento de 204, `extrairErro` para os
   dois formatos de envelope de erro) é idêntico e vale a pena reaproveitar
   — duplicar isso só para omitir 3 linhas relativas à sessão seria pior
   para manutenção. Resolve a pendência nº 10 da spec de forma menos
   invasiva no client existente, e também resolve o risco extra encontrado
   nesta verificação (token de admin vazando para a rota pública quando a
   mesma aba tem uma sessão ativa).
2. **Novo arquivo de tipos `frontend/src/types/respostaPublica.ts`**,
   distinto de `types/envio.ts` (que já modela `EnvioAvaliacao360Resposta`/
   `EnvioCampanhaClima` para a visão **identificada** de admin/gestor_rh
   dentro de `CicloDetalhePage`) e de `types/pesquisa.ts` (que modela a
   pesquisa do ponto de vista do **construtor**, com `competenciaIds` de
   escrita administrativa). O shape do formulário público é
   deliberadamente mais enxuto (sem `id` de página irrelevante à UI, sem
   campos de edição) e adiciona `opcoesPessoa` (que não existe em nenhum
   tipo hoje) — misturar os três contextos no mesmo arquivo/tipo
   confundiria "o que o admin edita" com "o que o respondente vê".
3. **Novo `frontend/src/services/respostaPublicaService.ts`** com as 4
   funções finas sobre `apiFetch(..., { semAutenticacao: true })`, mesmo
   padrão de todo `*Service.ts` existente (`equipesService.ts` etc.) — sem
   lógica de negócio, sem agregação.
4. **`ResponderPesquisaPage` modela o fluxo como uma única união
   discriminada em `useState` (`FaseResposta`)**, não como vários booleanos
   soltos — evita estados impossíveis (ex. "carregando formulário" e "erro
   terminal" simultâneos). Fases: `carregando_status` →
   (`erro_terminal` | `confirmando_cpf`) → (ao confirmar CPF)
   `carregando_formulario` → `respondendo` → `enviando` → `sucesso`, com
   `erro_terminal` alcançável a partir de **qualquer** fase (não só da
   primeira) — isso é o que resolve a advertência da spec sobre
   `clima_geral`: "já respondido" pode chegar tanto em `carregando_status`
   (nunca, para clima — só é possível para `avaliacao_360`) quanto como
   resposta de `confirmar-cpf` (`409 JA_RESPONDIDO`, o caso normal de
   clima). A tela de erro terminal é a mesma (`TelaEstadoPublico`,
   item 5) independentemente de qual fase a originou — o usuário nunca
   percebe "de onde" veio o bloqueio, só o resultado.
5. **Novo componente `frontend/src/components/publico/TelaEstadoPublico/TelaEstadoPublico.tsx`**,
   genérico, full-page, reaproveitado para **todos** os estados terminais
   (link inválido, bloqueado, ciclo/pesquisa inativos, expirado, já
   respondido, sessão inválida/expirada/usada, erro genérico de rede) e
   também para a tela de sucesso final — todos compartilham a mesma
   estrutura visual (ícone/cor + título + mensagem + card centralizado),
   só variando texto/severidade. Props: `severidade: 'erro' | 'bloqueio' |
   'sucesso'`, `titulo: string`, `mensagem: string`,
   `acaoSecundaria?: { rotulo: string; onClick: () => void }` (usado só no
   caso de "CPF não confere", ver item 8 — nesse caso específico não é tela
   terminal, é inline, então não usa este componente; ver nota no item 8).
   Evita duplicar o mesmo `Card` centralizado 8 vezes com textos
   ligeiramente diferentes.
6. **Ajuste pontual e aditivo nos 4 componentes de resposta**: adicionar
   uma prop opcional `erro?: boolean` a cada um (`PerguntaLikertResposta`,
   `PerguntaTextoAbertoResposta`, `PerguntaMatrizResposta`,
   `PerguntaPessoaResposta`), default `undefined`/`false`, usada **apenas**
   para destacar visualmente (via prop nativa `error` do MUI em
   `FormLabel`/`TextField`, mais um `FormHelperText`/`helperText` "Resposta
   obrigatória.") uma pergunta obrigatória sem valor quando o usuário tenta
   enviar o formulário. **Não é uma reescrita**: nenhum comportamento
   existente muda quando a prop é omitida (nenhum outro consumidor existe
   hoje — confirmado por `grep` na seção "Achado crítico" acima — logo não
   há risco de regressão em nenhuma outra tela). Alternativa descartada:
   fazer o destaque só no componente pai (ex. um `Alert` genérico listando
   "faltam responder: pergunta X, Y" sem tocar os componentes) — rejeitada
   por dar uma UX pior (usuário precisa caçar a pergunta na lista/rolagem
   em vez de ver o campo em si destacado).
7. **Paginação client-side pelas `páginas` que já vêm no contrato**
   (`formulario.paginas[]`), com navegação "Anterior"/"Próxima" — não
   rolagem única. Justificativa: o próprio contrato de
   `GET .../formulario` já agrupa perguntas por página (refletindo a
   estrutura que o admin desenhou no construtor); ignorar esse
   agrupamento e jogar tudo em uma rolagem única perderia a intenção de
   quem construiu a pesquisa (páginas podem ter títulos próprios,
   `pagina.titulo`) e tornaria pesquisas longas mais cansativas para o
   avaliador externo. Sem download/round-trip por página (decisão já
   fechada na spec, seção 9 nº 7) — a navegação é 100% em memória sobre o
   array já carregado por inteiro; só o `POST` final é uma chamada de
   rede.
8. **Validação de obrigatoriedade: gate de UX no envio final, navegação
   entre páginas livre (soft)** — exatamente como a spec recomenda (seção
   9 nº 6: "a validação autoritativa é sempre do backend", mesmo
   comentário já presente em `frontend/src/utils/cpf.ts`). O botão
   "Enviar" (só na última página) usa `likertRespostaValida`/
   `textoAbertoRespostaValida`/`matrizRespostaValida`/`pessoaRespostaValida`
   já existentes para computar se **todas** as perguntas obrigatórias de
   **todas** as páginas têm valor; se não, o clique não é bloqueado
   silenciosamente — em vez disso, navega automaticamente para a primeira
   página com pendência e marca `erro: true` (item 6) nas perguntas
   pendentes daquela página, com um `Alert` explicando "Responda as
   perguntas destacadas antes de enviar." Ir de página em página
   ("Anterior"/"Próxima") nunca é bloqueado por perguntas não respondidas —
   só o envio final é. Isso evita ter que inventar uma UX de "página
   travada" não pedida.
   **CPF não confere** (422 `CPF_NAO_CONFERE`) é tratado **inline** dentro
   da tela de confirmação de CPF (`Alert severity="error"` acima do botão,
   campo permanece editável, contador de tentativas nunca exibido ao
   usuário — só o backend sabe quantas tentativas restam), não via
   `TelaEstadoPublico` — só quando o backend responder
   `403 BLOQUEADO_TENTATIVAS_CPF` (tentativas esgotadas) é que a fase
   transiciona para `erro_terminal`.
9. **`enviosPesquisaService.ts`/`CicloDetalhePage.tsx`/`types/envio.ts` não
   são tocados por este plano** — o `link` exibido ao admin já aponta para
   `/responder/:token` desde a task `envios-clima-link-unico`; nenhuma
   mudança de contrato do lado identificado/admin é necessária para esta
   feature existir.
10. **Nenhum tipo de pergunta além dos 4 existentes é adicionado ao
    `switch` de renderização** — `TipoPergunta` reaproveitado de
    `types/pesquisa.ts` sem extensão.

## Guard rails (obrigatórios para o `frontend-developer` e o revisor)

- **Nenhuma regra de negócio sensível (agregação/anonimização) no
  frontend.** Esta página só ENVIA respostas — nunca lê respostas de
  terceiros, nunca calcula média/contagem, nunca decide se um resultado
  está "liberado". Nenhuma chamada desta feature é a nenhum endpoint de
  leitura de `itens_resposta`/resultados agregados (esses nem existem
  ainda — fora de escopo desta spec).
- **Nada sobre outros respondentes é exibido**: nenhum texto, contador,
  lista ou indicador que mencione quantas pessoas já responderam, quem
  mais está no ciclo, ou qualquer metadado de participação de terceiros.
  A tela "já respondido" fala só sobre o próprio respondente atual ("Você
  já respondeu esta pesquisa."), nunca "X de Y participantes já
  responderam".
- **`clima_geral`: nenhum identificador de identidade no body do `POST
  .../respostas`.** O payload é exclusivamente
  `{ itens: [{ perguntaId, valor }] }` — nenhum `colaboradorId`,
  `cpf`, `ciclo_participante_id` ou equivalente é incluído, em nenhum dos
  dois tipos de pesquisa. A identidade (quando existe, no caso de clima)
  fica inteiramente contida no `sessaoToken` da URL, que o backend resolve
  internamente. **Se, ao implementar contra `task-backend.md`, o contrato
  real pedir qualquer campo de identidade nesse body, isso é um erro de
  design do contrato — o `frontend-developer` deve parar e sinalizar ao
  orquestrador antes de implementar, não silenciosamente adicionar o
  campo.**
- **`/responder/:token` fora de qualquer `RotaProtegida`, sem chamar
  `useAuth()`.** A página não redireciona para `/login` em nenhuma
  circunstância, não checa `colaborador`/`papel`, e funciona
  identicamente com ou sem uma sessão Supabase ativa no navegador.
- **`apiFetch(..., { semAutenticacao: true })` em todas as 4 chamadas**
  desta feature — nenhuma delas deve depender de ou enviar
  `Authorization`. Ver decisão 1.
- **Sem salvamento parcial/rascunho** — um único `POST` final com todos os
  itens respondidos; navegação entre páginas é só client-side sobre estado
  em memória. Se a sessão expirar (410 `SESSAO_EXPIRADA`) ou já tiver sido
  usada (409 `SESSAO_JA_UTILIZADA`) no meio do preenchimento, a página
  transiciona para `erro_terminal` e **todo o progresso em memória é
  perdido** — comportamento aceito explicitamente pela spec (seção 9 nº 7),
  não um bug a corrigir nesta task.
- **Nenhum novo tipo de pergunta, nenhum atalho de criação automática de
  pesquisa** — esta feature é só de coleta, não toca o construtor.
- **Stack de estilização: Tailwind + MUI, sem CSS puro.** Reaproveitar
  `theme.ts` (já global via `ThemeProvider`) — nenhum tema novo, nenhum
  arquivo `.css` novo, nenhum `style={{}}` extenso. Onde MUI e Tailwind
  competirem, MUI vence (customizar via `sx`).
- **`link`/token nunca "completados" ou adivinhados no frontend** — o
  `token`/`sessaoToken` usados nas chamadas vêm sempre literalmente de
  `useParams()` (para `token`) ou da resposta de `confirmar-cpf` (para
  `sessaoToken`), nunca montados/concatenados a partir de outras partes.

## Plano — Frontend

### 1. frontend-developer

**Status: concluído.**

Resumo da implementação (todos os subitens 1.1–1.11 aplicados, sem desvio
estrutural do plano):

- Contrato de API conferido linha a linha contra `task-backend.md` (que já
  existia no momento da implementação) — bateu exatamente: mesmos 4
  endpoints/rotas, mesmo shape de `formulario` (`pesquisa`/`paginas`/
  `perguntas`/`competencias`/`opcoesPessoa`), mesmo body de
  `POST .../respostas` (`{ itens: [{ perguntaId, valor }] }`, sem nenhum
  campo de identidade) e os mesmos 11 códigos de erro previstos em 1.2.
  Nenhum ajuste de nome foi necessário.
- **Desvio pontual (não estrutural) registrado**: o backend também pode
  responder `422 CAMPO_INVALIDO` em `enviarRespostas` (payload malformado —
  `itens` não é array, ou item não é objeto), código que não constava nos 11
  do plano original. Como esse caso só ocorre com um cliente HTTP forjado
  (nunca a partir do formulário legítimo), `ResponderPesquisaPage` trata
  qualquer `ApiError.status === 422` no envio final como recuperável (volta
  para `respondendo` com `Alert` de erro), em vez de restringir por lista de
  códigos — cobre `RESPOSTA_INCOMPLETA`/`PERGUNTA_FORA_DA_PESQUISA`/
  `CAMPO_INVALIDO` uniformemente sem precisar adicionar um 12º código ao
  tipo `CodigoErroColetaPublica` (que é usado só para os estados
  terminais/inline nomeados, todos cobertos).
- `frontend/src/lib/apiClient.ts`: `ApiFetchOptions` ganhou
  `semAutenticacao?: boolean`; quando `true`, `apiFetch` pula
  `supabase.auth.getSession()` por completo e nunca monta `Authorization`.
  Nenhum call-site existente foi alterado.
- Novo `frontend/src/types/respostaPublica.ts` (tipos do formulário/erro
  público, reaproveitando `TipoPesquisa`/`ConfiguracaoLikert`/etc. de
  `types/pesquisa.ts`, `Competencia` de `types/competencia.ts` e os 4 tipos
  `Resposta*` importados diretamente dos componentes de resposta).
- Novo `frontend/src/services/respostaPublicaService.ts` com as 4 funções
  finas (`consultarStatusEnvio`, `confirmarCpf`, `buscarFormularioPublico`,
  `enviarRespostasPublico`), todas com `semAutenticacao: true`.
- Ajuste aditivo (prop `erro?: boolean`) nos 4 componentes de resposta já
  existentes (`PerguntaLikertResposta`, `PerguntaTextoAbertoResposta`,
  `PerguntaMatrizResposta`, `PerguntaPessoaResposta`) — nenhuma outra linha
  de comportamento alterada.
- Novo `frontend/src/components/publico/TelaEstadoPublico/TelaEstadoPublico.tsx`
  (casco genérico full-page para todos os estados terminais + sucesso) e
  `frontend/src/pages/ResponderPesquisaPage/mensagensErroPublico.ts` (mapa
  dos 11 códigos + `ERRO_DESCONHECIDO`, com o texto de
  `BLOQUEADO_TENTATIVAS_CPF` deliberadamente genérico).
- Nova página `frontend/src/pages/ResponderPesquisaPage/ResponderPesquisaPage.tsx`
  (máquina de estados `FaseResposta`, união discriminada única) e
  subcomponentes locais `ConfirmarCpfForm.tsx` (CPF inline, sem contador de
  tentativas exibido) e `FormularioRespostaPublica.tsx` (paginação
  client-side, validação de obrigatoriedade só no envio final via
  `*RespostaValida` de `validacaoPergunta.ts`, controles desabilitados via
  `<fieldset disabled>` durante o envio — sem precisar de uma 5ª prop
  `disabled` nos 4 componentes de resposta).
- `frontend/src/App.tsx`: rota `/responder/:token` adicionada no mesmo nível
  de `/login`, fora de `RotaProtegida`. Nenhuma outra rota alterada.
- `npm run build` e `npm run lint` (dentro de `frontend/`) rodados ao final,
  ambos sem erros/avisos novos (1 erro de tipagem MUI `Typography
  fontWeight` corrigido trocando para `sx={{ fontWeight: 600 }}`; 1 erro de
  lint `react-hooks/set-state-in-effect` no `useEffect` de carga inicial
  resolvido com o mesmo padrão `// eslint-disable-next-line` já usado em
  `CicloDetalhePage.tsx`).

Pontos para o `frontend-codereviewer` prestar atenção especial: item 17 do
plano original (comparar nomes de rota/campos com `task-backend.md`) já foi
conferido nesta etapa, mas vale reconferir o tratamento genérico de `422` no
envio final (decisão registrada acima) contra o comportamento real do
backend, e confirmar que `CAMPO_INVALIDO` de fato nunca é alcançável a
partir do formulário legítimo (só payload forjado).

#### 1.1 `frontend/src/lib/apiClient.ts` (editado, mudança mínima e aditiva)

- `ApiFetchOptions` ganha `semAutenticacao?: boolean` (default `false` via
  desestruturação, não obrigatório em nenhum call-site existente).
- Dentro de `apiFetch`, só chamar `supabase.auth.getSession()` (e portanto
  só ler `token`) quando `!semAutenticacao`. Quando `semAutenticacao` for
  `true`, `token` permanece `undefined` e o header `Authorization` nunca é
  montado — sem tocar em nenhuma outra parte da função (serialização,
  `extrairErro`, tratamento de 204, `ApiError`).
- Nenhuma mudança de assinatura para os call-sites existentes — todos
  continuam passando `options` sem essa chave, comportamento idêntico a
  hoje.

#### 1.2 `frontend/src/types/respostaPublica.ts` (novo)

- `CodigoErroColetaPublica`: união com os 8 códigos da seção 4/6 da spec
  (`LINK_INVALIDO`, `BLOQUEADO_TENTATIVAS_CPF`,
  `CICLO_OU_PESQUISA_INATIVOS`, `ENVIO_EXPIRADO`, `JA_RESPONDIDO`,
  `CPF_NAO_CONFERE`, `SESSAO_INVALIDA`, `SESSAO_EXPIRADA`,
  `SESSAO_JA_UTILIZADA`, `RESPOSTA_INCOMPLETA`,
  `PERGUNTA_FORA_DA_PESQUISA`) — usada para o `switch`/mapa de mensagens
  em `TelaEstadoPublico`, indexado por `ApiError.codigo`.
- `StatusEnvioPublicoResposta { estado: 'aguardando_cpf' }`.
- `ConfirmarCpfResposta { sessaoToken: string; expiraEm: string; tipoPesquisa: TipoPesquisa }`
  (`TipoPesquisa` importado de `./pesquisa`, reaproveitado).
- `PerguntaFormularioPublico`: união discriminada por `tipo`, campos
  comuns `{ id, ordem, enunciado, obrigatoria }` — ramo `likert`:
  `configuracao: ConfiguracaoLikert`; ramo `texto_aberto`:
  `configuracao: ConfiguracaoTextoAberto`; ramo `matriz`:
  `configuracao: ConfiguracaoLikert` + `competencias: Competencia[]`; ramo
  `pessoa`: `configuracao: ConfiguracaoPessoa` +
  `opcoesPessoa: ColaboradorOpcao[]` (`ColaboradorOpcao` importado de
  `components/perguntas/PerguntaPessoa/PerguntaPessoaResposta.tsx`, não
  redefinido). Todos os 4 tipos de `configuracao` reaproveitados de
  `types/pesquisa.ts`.
- `PaginaFormularioPublico { id, ordem, titulo: string | null; perguntas: PerguntaFormularioPublico[] }`.
- `FormularioPublicoResposta { pesquisa: { titulo, mensagemBoasVindas: string | null; logoUrl: string | null }; paginas: PaginaFormularioPublico[] }`.
- `ValorRespostaPublica = RespostaLikert | RespostaTextoAberto | RespostaMatriz | RespostaPessoa`
  — os 4 tipos importados dos próprios componentes de resposta (nunca
  redefinidos aqui, para não haver dois shapes divergentes do mesmo
  conceito).
- `ItemRespostaPayload { perguntaId: string; valor: ValorRespostaPublica }`
  e `EnviarRespostasPayload { itens: ItemRespostaPayload[] }`.

#### 1.3 `frontend/src/services/respostaPublicaService.ts` (novo)

Quatro funções finas, todas com `{ semAutenticacao: true }`:

- `consultarStatusEnvio(token: string): Promise<StatusEnvioPublicoResposta>`
  → `GET /api/publico/envios/${token}/status`.
- `confirmarCpf(token: string, cpf: string): Promise<ConfirmarCpfResposta>`
  → `POST /api/publico/envios/${token}/confirmar-cpf`, body `{ cpf }`
  (envia o CPF já normalizado via `normalizarCpf`, decisão de onde
  normalizar cabe à página — ver 1.6).
- `buscarFormularioPublico(sessaoToken: string): Promise<FormularioPublicoResposta>`
  → `GET /api/publico/sessoes/${sessaoToken}/formulario`.
- `enviarRespostasPublico(sessaoToken: string, payload: EnviarRespostasPayload): Promise<{ sucesso: true }>`
  → `POST /api/publico/sessoes/${sessaoToken}/respostas`.

Nenhuma lógica de negócio — só transporte, mesmo padrão de
`equipesService.ts`/`enviosPesquisaService.ts`.

#### 1.4 Ajuste pontual nos 4 componentes de resposta (aditivo, ver decisão 6)

Para cada um dos 4 arquivos em `frontend/src/components/perguntas/Pergunta*/Pergunta*Resposta.tsx`:

- Adicionar `erro?: boolean` à interface de props (último campo,
  opcional).
- `PerguntaLikertResposta`/`PerguntaMatrizResposta`/`PerguntaPessoaResposta`:
  repassar `error={erro}` ao `FormLabel` (suporta a prop nativamente,
  fica vermelho) e adicionar uma linha `{erro && <FormHelperText error>Resposta obrigatória.</FormHelperText>}`
  logo abaixo do controle principal.
- `PerguntaTextoAbertoResposta`: repassar `error={erro}` e
  `helperText={erro ? 'Resposta obrigatória.' : undefined}` diretamente ao
  `TextField` existente (já tem a prop `helperText` disponível nativamente
  no MUI, só não estava sendo usada).
- Nenhuma outra linha desses 4 arquivos muda. Nenhum comportamento visível
  para quem os usa sem passar `erro` (todos os outros consumidores — hoje
  nenhum, mas preservando a garantia para o futuro).

#### 1.5 `frontend/src/components/publico/TelaEstadoPublico/TelaEstadoPublico.tsx` (novo)

- Casco genérico full-page: `<div className="flex min-h-svh items-center justify-center px-4">`
  com um `Card`/`Paper` centralizado (`max-w-[440px]`), logo `/logo.jpg`
  no topo (mesmo asset já usado em `LoginPage`), ícone/cor por
  `severidade` (`'erro' | 'bloqueio' | 'sucesso'` → cores `error.main`/
  `warning.main`/`success.main` do tema, sem `@mui/icons-material` — usar
  só tipografia/cor, ou um emoji-free indicador textual simples como um
  `Chip` colorido, mantendo o padrão do projeto de "sem ícones" já visto
  em `PesquisasListPage`/`CicloDetalhePage`), `Typography` para
  `titulo`/`mensagem`, e um botão opcional (`acaoSecundaria`).
- Mapa `MENSAGENS_ERRO_PUBLICO: Record<CodigoErroColetaPublica, { titulo: string; mensagem: string }>`
  (arquivo próprio ou constante no topo de `ResponderPesquisaPage.tsx` — a
  decidir pelo developer conforme tamanho; se ficar grande, extrair para
  `mensagensErroPublico.ts` ao lado da página), cobrindo os 11 códigos,
  com o texto de `BLOQUEADO_TENTATIVAS_CPF` deliberadamente genérico
  ("Não foi possível confirmar seus dados. Procure o setor de RH.") — sem
  jamais revelar se o bloqueio foi por CPF errado, envio expirado etc.
  quando o código específico for esse.
- Reaproveitado tanto para os estados terminais quanto para a tela de
  sucesso final (`severidade: 'sucesso'`, título "Resposta enviada",
  mensagem "Obrigado por participar. Sua resposta foi registrada." — sem
  qualquer menção a quando/como os resultados serão usados, isso é
  conteúdo institucional fora do escopo técnico desta task).

#### 1.6 `frontend/src/pages/ResponderPesquisaPage/ResponderPesquisaPage.tsx` (novo — página principal)

Rota `/responder/:token`, `useParams<{ token: string }>()`.

**Papéis com acesso**: nenhum — rota pública, sem conceito de papel. Não
usa `useAuth()`, não é afetada por estar ou não logado como
admin/gestor_rh/colaborador em outra aba/sessão.

- Tipo local `FaseResposta` (união discriminada, ver decisão 4):
  ```ts
  type FaseResposta =
    | { tipo: 'carregando_status' }
    | { tipo: 'erro_terminal'; codigo: CodigoErroColetaPublica | 'ERRO_DESCONHECIDO' }
    | { tipo: 'confirmando_cpf' }
    | { tipo: 'carregando_formulario'; sessaoToken: string; tipoPesquisa: TipoPesquisa }
    | { tipo: 'respondendo'; sessaoToken: string; tipoPesquisa: TipoPesquisa; formulario: FormularioPublicoResposta }
    | { tipo: 'enviando'; sessaoToken: string; formulario: FormularioPublicoResposta }
    | { tipo: 'sucesso' }
  ```
- `useEffect` no mount dispara `consultarStatusEnvio(token)`:
  - 200 → `setFase({ tipo: 'confirmando_cpf' })`.
  - erro com `.codigo` conhecido → `setFase({ tipo: 'erro_terminal', codigo })`.
  - erro sem `.codigo` (rede, `ApiError.status === 0`, etc.) →
    `setFase({ tipo: 'erro_terminal', codigo: 'ERRO_DESCONHECIDO' })`, com
    mensagem genérica de conectividade + botão "Tentar novamente" que
    reexecuta a consulta (única `acaoSecundaria` usada em
    `TelaEstadoPublico` nesta página).
- Fase `erro_terminal` → renderiza só `<TelaEstadoPublico severidade={...} .../>`, nada mais.
- Fase `confirmando_cpf` → renderiza `<ConfirmarCpfForm token={token} onConfirmado={...} />`
  (subcomponente, 1.7), que internamente chama `confirmarCpf` e devolve ao
  pai `{ sessaoToken, tipoPesquisa }` em caso de 200. Em caso de 409
  `JA_RESPONDIDO`/qualquer outro erro terminal reavaliado aqui, o
  subcomponente devolve o `codigo` ao pai (via callback `onErroTerminal`),
  que transiciona a fase para `erro_terminal` — CPF não confere (422) é
  tratado **dentro** do subcomponente (inline, decisão 8), sem subir ao
  pai.
- Ao confirmar → `setFase({ tipo: 'carregando_formulario', sessaoToken, tipoPesquisa })`,
  dispara `buscarFormularioPublico(sessaoToken)`:
  - 200 → `setFase({ tipo: 'respondendo', sessaoToken, tipoPesquisa, formulario })`.
  - erro de sessão (404/410/409) → `erro_terminal` com o código
    correspondente (sessão pode ter expirado entre a confirmação de CPF e
    a busca do formulário, ainda que improvável dado o TTL de ~45min).
- Fase `respondendo` → renderiza `<FormularioRespostaPublica formulario={...} onEnviar={...} />`
  (subcomponente, 1.8), que gerencia internamente a paginação e o estado
  de respostas (`Record<perguntaId, ValorRespostaPublica>`), e só chama
  `onEnviar(itens)` (callback do pai) quando o usuário clica "Enviar" na
  última página **e** a validação de UX (decisão 8) passa.
- `onEnviar(itens)` → `setFase({ tipo: 'enviando', ... })`, chama
  `enviarRespostasPublico(sessaoToken, { itens })`:
  - 200 → `setFase({ tipo: 'sucesso' })`.
  - 422 `RESPOSTA_INCOMPLETA`/`PERGUNTA_FORA_DA_PESQUISA` (o backend
    encontrou algo que a validação de UX não pegou — race condition ou
    payload divergente) → **não** é tratado como terminal; volta a fase
    para `respondendo` com um `Alert` de erro visível no topo do
    formulário, mantendo as respostas já digitadas em memória (não perder
    o trabalho do usuário por um erro recuperável).
  - erro de sessão (404/410/409) → `erro_terminal` (sessão morreu entre o
    carregamento do formulário e o envio — perda de progresso aceita pela
    spec, ver guard rails).
- Fase `enviando` → reaproveita a tela do formulário com os controles
  desabilitados + `CircularProgress` no botão "Enviar" (mesmo padrão de
  "Aguarde..." já usado em `CicloDetalhePage`), em vez de uma tela cheia
  separada (evita perder o contexto visual do que foi respondido enquanto
  aguarda).
- Fase `sucesso` → `<TelaEstadoPublico severidade="sucesso" .../>`.

#### 1.7 `frontend/src/pages/ResponderPesquisaPage/ConfirmarCpfForm.tsx` (novo — subcomponente local)

- Props: `token: string`, `onConfirmado: (r: { sessaoToken: string; tipoPesquisa: TipoPesquisa }) => void`,
  `onErroTerminal: (codigo: CodigoErroColetaPublica) => void`.
- Estado local: `cpf` (mascarado, via `formatarCpf` a cada `onChange`),
  `enviando`, `erroInline: string | null`.
- Submit: `cpfValido(cpf)` como gate de UX (desabilita o botão enquanto
  inválido, mesmo padrão de `ColaboradorFormPage`) — a validação
  autoritativa continua sendo do backend. Chama
  `confirmarCpf(token, normalizarCpf(cpf))`:
  - 200 → `onConfirmado({ sessaoToken, tipoPesquisa })`.
  - 422 `CPF_NAO_CONFERE` → `setErroInline('CPF não confere. Verifique e tente novamente.')`,
    campo permanece editável, **nenhum contador de tentativas exibido**.
  - 403 `BLOQUEADO_TENTATIVAS_CPF` (tentativas esgotadas nesta mesma
    chamada) → `onErroTerminal('BLOQUEADO_TENTATIVAS_CPF')`.
  - 409 `JA_RESPONDIDO` → `onErroTerminal('JA_RESPONDIDO')`.
  - qualquer outro erro terminal reavaliado (404/409/410) →
    `onErroTerminal(codigo)`.
- Layout: mesma estrutura visual de `LoginPage` (logo + card centralizado
  + `TextField` + `Button variant="contained"`), com um texto explicativo
  curto ("Confirme seu CPF para acessar o formulário.") acima do campo.

#### 1.8 `frontend/src/pages/ResponderPesquisaPage/FormularioRespostaPublica.tsx` (novo — subcomponente local)

- Props: `formulario: FormularioPublicoResposta`,
  `enviando: boolean`, `erroEnvio: string | null`,
  `onEnviar: (itens: ItemRespostaPayload[]) => void`.
- Estado local: `paginaAtual: number` (índice, começa em 0),
  `respostas: Record<string, ValorRespostaPublica>` (chave = `pergunta.id`),
  `perguntasComErro: Set<string>` (preenchido só na tentativa de envio
  com pendência, ver decisão 8).
- Cabeçalho: `pesquisa.titulo`, `pesquisa.mensagemBoasVindas` (se houver),
  `pesquisa.logoUrl` (se houver, `<img>` — não confundir com `/logo.jpg`
  do produto, este é o logo da pesquisa/empresa cliente, vindo da API).
- Corpo da página atual: `paginas[paginaAtual].titulo` (se houver) +
  `paginas[paginaAtual].perguntas.map(...)`, um `switch (pergunta.tipo)`
  simples renderizando o `*Resposta` correspondente:
  ```tsx
  {pergunta.tipo === 'likert' && (
    <PerguntaLikertResposta
      enunciado={pergunta.enunciado}
      obrigatoria={pergunta.obrigatoria}
      configuracao={pergunta.configuracao}
      valor={(respostas[pergunta.id] as RespostaLikert) ?? null}
      onChange={(valor) => setResposta(pergunta.id, valor)}
      erro={perguntasComErro.has(pergunta.id)}
    />
  )}
  // ramos análogos para texto_aberto/matriz (+ competencias)/pessoa (+ opcoesPessoa)
  ```
- Navegação: "Anterior" (desabilitado na primeira página), "Próxima"
  (desabilitado/oculto na última, onde vira "Enviar") — sem bloqueio por
  obrigatoriedade ao navegar (decisão 8).
- "Enviar" (só na última página): calcula todas as perguntas obrigatórias
  de todas as páginas sem valor válido via
  `likertRespostaValida`/`textoAbertoRespostaValida`/`matrizRespostaValida`/
  `pessoaRespostaValida`; se houver alguma, preenche `perguntasComErro`
  com os ids pendentes, navega para a primeira página que contém uma
  pendência (`setPaginaAtual`), mostra `Alert severity="warning"`
  "Responda as perguntas destacadas antes de enviar." — **não** chama
  `onEnviar`. Se não houver pendências, monta
  `itens: ItemRespostaPayload[]` só com as perguntas que têm valor em
  `respostas` (perguntas opcionais sem resposta são omitidas do array, não
  enviadas como `null`) e chama `onEnviar(itens)`.
- `erroEnvio` (prop, vindo do 422 `RESPOSTA_INCOMPLETA`/
  `PERGUNTA_FORA_DA_PESQUISA` tratado pelo pai) exibido como
  `Alert severity="error"` fixo no topo, sem apagar as respostas já
  preenchidas.
- Indicador de progresso simples: "Página X de N" (texto, sem
  `Stepper`/ícones — consistente com o restante do produto que evita
  `@mui/icons-material`).

#### 1.9 `frontend/src/App.tsx` (editado)

Adicionar, no mesmo nível de `/login`/`/definir-senha`/`/acesso-negado`
(fora de qualquer `RotaProtegida`):

```tsx
<Route path="/responder/:token" element={<ResponderPesquisaPage />} />
```

Import de `ResponderPesquisaPage` de
`./pages/ResponderPesquisaPage/ResponderPesquisaPage`. Nenhuma outra linha
de `App.tsx` muda — em particular, o fallback `*` → `/login` permanece
como está (não afeta `/responder/:token`, que é uma rota explícita e
específica).

#### 1.10 Resolução de `opcoesPessoa` (dependência de backend, não de frontend)

Confirmado pela spec (seção 9 nº 3): a lista de colaboradores elegíveis
para uma pergunta tipo `pessoa` é resolvida inteiramente pelo backend
(baseada no `avaliado_id` do relacionamento do envio atual) e chega pronta
em `pergunta.opcoesPessoa`. O frontend **não** deve tentar montar essa
lista, filtrar colaboradores, ou chamar `colaboradoresService.ts` para
complementar — isso violaria a regra de "nenhuma regra de negócio sensível
no frontend" (aqui não é anonimização, mas é a mesma classe de erro:
decidir no cliente "quem pode ser escolhido" quando isso deveria vir
pronto do servidor). Como perguntas `pessoa` são bloqueadas para
`clima_geral` no construtor (`422` já implementado), esta task só precisa
lidar com esse tipo dentro do ramo `avaliacao_360`.

#### 1.11 Fora de escopo explícito (não implementar nesta task)

- Qualquer tela/endpoint de leitura de resultados/análise agregada — só
  coleta (escrita).
- Mecanismo de desbloqueio manual de `tentativas_cpf_invalidas >= 5` — fora
  de escopo mesmo no backend (spec seção 9 nº 9); o frontend só exibe a
  mensagem genérica de bloqueio, sem nenhum fluxo de "solicitar
  desbloqueio".
- Qualquer mudança em `CicloDetalhePage.tsx`/`enviosPesquisaService.ts`/
  `types/envio.ts` — o link já aponta para a rota correta.
- Salvamento parcial/rascunho entre páginas (decisão já fechada).
- Qualquer novo tipo de pergunta.

Ao terminar: rodar `npm run build` (`tsc -b && vite build`) e `npm run lint`
(`eslint .`) dentro de `frontend/` e confirmar que ambos passam sem
erros/avisos novos. Registrar no resumo da etapa se o contrato consumido
bateu literalmente com `task-backend.md` (se já existir) ou se foi
implementado contra a suposição descrita aqui (e qual ajuste, se algum,
precisou ser feito).

**Endpoints consumidos por esta página**:
`GET /api/publico/envios/:token/status`,
`POST /api/publico/envios/:token/confirmar-cpf`,
`GET /api/publico/sessoes/:sessaoToken/formulario`,
`POST /api/publico/sessoes/:sessaoToken/respostas`.

### 2. frontend-codereviewer

Pontos de atenção específicos para o revisor conferir:

1. **Rota verdadeiramente pública**: `/responder/:token` em `App.tsx` está
   fora de qualquer `<RotaProtegida>`, no mesmo nível de `/login`;
   `ResponderPesquisaPage` e seus subcomponentes não chamam `useAuth()` em
   nenhum lugar (grep por `useAuth` dentro de
   `pages/ResponderPesquisaPage/` não deveria retornar nada); a página
   renderiza e funciona sem exigir uma sessão Supabase presente ou
   ausente.
2. **`semAutenticacao: true` em todas as 4 chamadas** de
   `respostaPublicaService.ts` — nenhuma delas deve, sob nenhuma
   circunstância (com ou sem sessão Supabase ativa na aba), enviar o
   header `Authorization`. Conferir a implementação de `apiFetch` em
   `apiClient.ts`: quando `semAutenticacao` é `true`,
   `supabase.auth.getSession()` não deve sequer ser chamado.
3. **Nenhum identificador de identidade no `POST .../respostas`**: o body
   montado em `FormularioRespostaPublica`/`ResponderPesquisaPage` é
   estritamente `{ itens: [{ perguntaId, valor }] }` — grep por
   `colaboradorId`, `cpf`, `participanteId`, `sessaoToken` **dentro** do
   objeto `itens` (o `sessaoToken` correto vai só na URL, nunca no corpo)
   não deveria encontrar nada.
4. **Nenhum dado sobre outros respondentes exibido**: nenhuma tela desta
   feature menciona contagem de participantes, quem mais está no ciclo,
   status de resposta de terceiros — grep por `participantes`/`respondeu`
   fora do contexto do próprio usuário atual não deveria aparecer.
5. **Máquina de estados sem estados impossíveis**: `FaseResposta` é uma
   união discriminada única (não múltiplos booleanos soltos tipo
   `carregando && !erro && !sucesso`); toda transição de fase passa por
   `setFase` com um objeto completo do tipo, nunca um `set` parcial que
   deixe o objeto inconsistente.
6. **"Já respondido" tratado nos dois pontos certos**: para
   `avaliacao_360`, alcançável a partir de `consultarStatusEnvio` (fase
   inicial, antes do CPF); para `clima_geral`, só alcançável a partir da
   resposta de `confirmarCpf` (depois do CPF) — nunca o contrário (não
   pode haver um caminho em que `clima_geral` mostre "já respondido" antes
   da confirmação de CPF, nem em que `avaliacao_360` exija confirmar CPF
   para descobrir isso, já que o link de 360 identifica uma única pessoa
   desde o início).
7. **CPF não confere é inline, não terminal**: `422 CPF_NAO_CONFERE`
   mantém a fase em `confirmando_cpf` com um `Alert` inline e o campo
   editável — não transiciona para `erro_terminal`. Só
   `403 BLOQUEADO_TENTATIVAS_CPF` (tentativas esgotadas) vira tela
   terminal. Nenhum contador de tentativas restantes é exibido ao usuário
   em nenhum momento.
8. **Mensagem de bloqueio genérica**: o texto de
   `BLOQUEADO_TENTATIVAS_CPF` em `TelaEstadoPublico`/no mapa de mensagens
   não revela o motivo específico do bloqueio (não diz "5 tentativas de
   CPF erradas", só orienta a procurar o RH).
9. **Validação de obrigatoriedade só como gate de UX**: `RESPOSTA_INCOMPLETA`
   vindo do backend (422) é tratado como caminho normal esperado (volta
   para a fase `respondendo` com erro inline, não crasha nem trata como
   bug); a validação client-side (`*RespostaValida`) nunca substitui essa
   resposta do backend, só evita a maioria dos casos previsíveis antes do
   `POST`.
10. **Reaproveitamento confirmado, sem duplicação**: `cpf.ts`
    (`formatarCpf`/`normalizarCpf`/`cpfValido`), os 4 componentes
    `*Resposta` e as 4 funções de `validacaoPergunta.ts` são importados
    tal qual — grep não deveria encontrar uma segunda implementação de
    máscara/validação de CPF nem uma reimplementação paralela dos 4
    componentes de resposta dentro de `ResponderPesquisaPage`.
11. **Ajuste aditivo aos 4 componentes de resposta sem regressão**: diff
    de cada `Pergunta*Resposta.tsx` restrito à prop `erro?: boolean` e seu
    uso (`error=`/`helperText=`); nenhuma outra linha de comportamento
    muda; nenhum outro arquivo que já os importe (hoje nenhum) quebra.
12. **`opcoesPessoa` nunca resolvida no frontend**: nenhuma chamada a
    `colaboradoresService.ts`/filtro local de colaboradores dentro desta
    feature — a lista usada por `PerguntaPessoaResposta` vem sempre
    literalmente de `pergunta.opcoesPessoa` da resposta da API.
13. **Sem salvamento parcial**: grep por qualquer chamada de rede dentro
    do fluxo de navegação "Anterior"/"Próxima" — só o clique final em
    "Enviar" deve disparar `enviarRespostasPublico`.
14. **Exatamente 4 tipos de pergunta no `switch` de renderização** — nenhum
    `case` extra, nenhum tipo fora de `likert`/`texto_aberto`/`matriz`/
    `pessoa`.
15. **Estados tratados**: carregando (status inicial, formulário, envio),
    vazio não se aplica no sentido tradicional (mas conferir que uma
    página sem perguntas, ainda que improvável, não quebra a navegação),
    erro (todas as variantes terminais + erro inline de CPF + erro
    recuperável de envio) — todos com mensagem própria, nenhum
    `Alert`/tela genérica fantasma sem texto.
16. **Stack de estilização**: Tailwind + MUI, sem `.css` novo, sem
    `style={{}}` extenso, sem `@mui/icons-material` novo, nenhuma
    dependência nova em `package.json` (nenhuma lib de state machine).
17. **Contrato de API**: se `task-backend.md` já existir no momento da
    revisão, conferir campo a campo contra ele (nomes de rota, shape de
    `formulario`, nomes dos 11 códigos de erro) — se o `frontend-developer`
    registrou um desvio no resumo da etapa 1, confirmar que o desvio foi
    aplicado corretamente e não deixou nenhum nome antigo/suposto morto no
    código.

## Perguntas em aberto (herdadas da spec, com nota de impacto no frontend)

1. **Nome exato dos códigos de erro/campos do contrato** — dependem de
   `task-backend.md`, ainda não escrito no momento deste plano. Baixo
   risco de retrabalho (são só nomes de união/chaves de objeto), mas o
   `frontend-developer` deve conferir antes de codar, não depois.
2. **TTL da sessão (~45min, spec seção 9 nº 5)** — não afeta o frontend
   além de exibir uma mensagem de expiração adequada; nenhum contador
   regressivo/aviso de "sua sessão expira em X minutos" foi pedido nem é
   necessário para esta primeira versão (poderia ser uma melhoria futura,
   não antecipada aqui).
3. **Texto institucional da tela de sucesso e das mensagens de erro** —
   os textos usados neste plano (`TelaEstadoPublico`, item 5) são
   provisórios/razoáveis; se o usuário/produto tiver uma copy definida
   (ex. mencionar prazo de resultados, contato de suporte), é uma troca de
   string trivial, não estrutural.

## Revisão

Revisão feita lendo por completo `spec.md`, `task-frontend.md` e
`task-backend.md` (incluindo `coleta-respostas-publica.service.ts` reproduzido
no plano de backend, para conferir a ordem real de checagens/códigos de
erro), além de todos os arquivos criados/editados pela etapa 1:
`types/respostaPublica.ts`, `services/respostaPublicaService.ts`,
`components/publico/TelaEstadoPublico/TelaEstadoPublico.tsx`,
`pages/ResponderPesquisaPage/{ResponderPesquisaPage,ConfirmarCpfForm,
FormularioRespostaPublica,mensagensErroPublico}.{ts,tsx}`, `lib/apiClient.ts`,
`App.tsx` e os 4 `Pergunta*Resposta.tsx`.

**Nenhum achado crítico.** Não há vazamento de identidade nem de dados
estruturais de terceiros, a rota é verdadeiramente pública (sem
`RotaProtegida`, sem `useAuth()` em nenhum arquivo de
`pages/ResponderPesquisaPage/`), `semAutenticacao: true` está presente nas 4
chamadas de `respostaPublicaService.ts` e `apiFetch` pula
`supabase.auth.getSession()` por completo quando essa opção é `true` (nenhum
call-site existente foi alterado — comportamento default idêntico). O corpo
de `POST .../respostas` é estritamente `{ itens: [{ perguntaId, valor }] }`
(confirmado por grep: nenhum `colaboradorId`/`cpf`/`participanteId` dentro de
`itens`, `sessaoToken` só na URL). CPF não é persistido em
`localStorage`/`sessionStorage`/URL/console (grep sem resultados). Mensagem
de `BLOQUEADO_TENTATIVAS_CPF` é genérica ("Procure o setor de RH"), sem
revelar o motivo do bloqueio. Nenhuma tela exibe contagem/identidade de
outros respondentes. `opcoesPessoa` nunca é resolvida no frontend (sem
import de `colaboradoresService`). Stack Tailwind+MUI respeitada: nenhum
`.css` novo, nenhum `style={{}}` inline, nenhuma dependência nova em
`package.json`, nenhum `@mui/icons-material`. O ajuste aditivo `erro?:
boolean` nos 4 `Pergunta*Resposta.tsx` está de fato restrito a essa prop e ao
seu uso em `FormLabel`/`TextField`/`FormHelperText` — nenhuma outra linha de
comportamento mudou.

Conferência dos 3 pontos que o developer pediu para observar:

1. **Tratar qualquer `422` do envio final como recuperável**: correto, sem
   degradação. Os únicos 3 códigos que `enviarRespostas` pode responder com
   `422` (`RESPOSTA_INCOMPLETA`, `PERGUNTA_FORA_DA_PESQUISA`, `CAMPO_INVALIDO`
   — os três lidos em `coleta-respostas-publica.service.ts` no
   `task-backend.md`) são semanticamente equivalentes do ponto de vista do
   usuário ("algo no que você enviou não pôde ser processado, revise e tente
   de novo") e nenhum deles deveria ser tratado como terminal. Nenhum caso
   legítimo é degradado.
2. **`<fieldset disabled={enviando}>` em vez de propagar `disabled` aos 4
   componentes**: funcionalmente correto — elementos nativos (`<input>`,
   incluindo os `input radio`/`input text` renderizados por `Radio`,
   `TextField` e `Autocomplete`) dentro de um `<fieldset disabled>` ficam de
   fato não-interativos e essa informação também chega à árvore de
   acessibilidade (o browser aplica `:disabled` de verdade nesses elementos
   listados, não é só uma barreira visual). O ponto fraco é puramente
   cosmético: como o MUI só aplica sua própria classe `Mui-disabled`
   (opacidade reduzida, cursor `not-allowed`) quando a prop `disabled` é
   passada explicitamente ao componente, os campos continuam com aparência
   "ativa" durante o envio, mesmo não respondendo a cliques/teclado — ver
   sugestão abaixo.
3. **`CODIGOS_TERMINAIS` em `ConfirmarCpfForm.tsx`**: bate exatamente com a
   ordem real de checagem do backend. `buscarEnvioValidoOuFalhar` (reutilizada
   por `obterStatusEnvio` e `confirmarCpf`) só pode lançar
   `LINK_INVALIDO`/`BLOQUEADO_TENTATIVAS_CPF`/`CICLO_OU_PESQUISA_INATIVOS`/
   `ENVIO_EXPIRADO`/`JA_RESPONDIDO` (este último só para `avaliacao_360`); o
   branch `clima_geral` de `confirmarCpf` adiciona `JA_RESPONDIDO` de novo,
   via `participante.respondeuEm`. Nenhum desses 5 códigos falta na lista
   local, e nenhum código de sessão (`SESSAO_*`, que só existe nos endpoints
   de formulário/envio) foi incluído por engano — a lista está correta e
   completa.

### Deveria corrigir

1. **Perda de progresso em falha de rede/erro desconhecido no envio final**
   (`frontend/src/pages/ResponderPesquisaPage/ResponderPesquisaPage.tsx`,
   função `handleEnviar`, linhas ~98–113). Qualquer erro do `POST
   .../respostas` que não seja `422` e cujo `codigo` não esteja em
   `MENSAGENS_ERRO_PUBLICO` (o caso mais comum: falha de rede genuína, onde
   `apiFetch` lança `ApiError(0, ...)` sem `codigo`) cai no mesmo
   `erro_terminal: 'ERRO_DESCONHECIDO'` usado para sessão morta — descartando
   **todas** as respostas já preenchidas em memória e obrigando o usuário a
   recomeçar do zero (reconfirmar CPF, preencher o formulário inteiro de
   novo). Isso é inconsistente com o tratamento já dado a esse mesmo tipo de
   falha em `ConfirmarCpfForm.tsx` (uma falha de rede ali cai em
   `setErroInline(...)`, mantendo o usuário na mesma tela, campo preservado,
   sem transicionar para terminal) e vai além do que a spec/plano pedem — o
   guard rail de "perda de progresso aceita" (spec seção 9 nº 7, plano
   decisão 4) cobre explicitamente sessão expirada/já usada (`404/410/409`
   `SESSAO_*`), não uma falha transitória de conectividade sem código
   semântico. Para um formulário multi-página já preenchido por inteiro, uma
   instabilidade momentânea de rede no clique de "Enviar" não deveria
   obrigar a refazer tudo. Sugestão de correção: tratar `ApiError` sem
   `codigo` reconhecido (`status === 0` ou código fora do mapa, exceto os
   `SESSAO_*`/`JA_RESPONDIDO` explícitos) da mesma forma que o `422` —
   mantendo a fase `respondendo` com um `Alert` de erro e as respostas
   preservadas — reservando `erro_terminal` só para os códigos de sessão
   confirmados pelo backend.

### Sugestão

1. **Feedback visual de "desabilitado" ausente nos controles MUI durante o
   envio** (`frontend/src/pages/ResponderPesquisaPage/
   FormularioRespostaPublica.tsx`, `<fieldset disabled={enviando}>`, linha
   144). Ver análise no ponto 2 acima: a proteção funcional contra
   duplo-envio está correta, mas nada nos `Radio`/`TextField`/`Autocomplete`
   fica visualmente acinzentado/com cursor `not-allowed` nesse intervalo — o
   único indício visível é o texto/spinner do próprio botão "Enviar".
   Considerar passar `disabled={enviando}` explicitamente para dentro dos 4
   componentes de resposta (ou, mais simples, um `sx={{ opacity: enviando ?
   0.6 : 1, pointerEvents: enviando ? 'none' : 'auto' }}` no contêiner) caso
   se queira reforçar visualmente o estado, sem que isso seja bloqueante.
2. **`opcoesPessoa` tipado como sempre presente** em
   `types/respostaPublica.ts` (`PerguntaFormularioPublico`, ramo `pessoa`:
   `opcoesPessoa: ColaboradorOpcao[]`, não opcional), enquanto no backend
   (`coleta-respostas-publica.service.ts`, `buscarFormulario`) o campo só é
   preenchido quando `relacionamento` é encontrado (`if (pergunta.tipo ===
   'pessoa' && relacionamento)`) — em teoria pode vir `undefined` se o
   relacionamento do envio não for encontrado (dado inconsistente). Hoje isso
   não quebra nada visível (`PerguntaPessoaResposta` recebe `opcoes={pergunta
   .opcoesPessoa}`, e um `undefined` ali quebraria o `.find`/`options` do
   `Autocomplete`), mas é um ponto de fragilidade de tipagem — um fallback
   `?? []` no ponto de uso ou tornar o campo opcional no tipo (refletindo o
   contrato real) removeria essa suposição.
3. **Formulário com zero páginas** (`FormularioRespostaPublica.tsx`): se
   `formulario.paginas` vier vazio (pesquisa sem nenhuma página/pergunta,
   cenário improvável mas não impedido por tipo), `pagina` fica `undefined`
   e a navegação entra num estado transitório estranho (`paginaAtual` pode
   ir a `-1` antes de `ultimaPagina` virar `true`) até o botão "Enviar"
   aparecer e permitir enviar `{ itens: [] }` — não quebra a UI nem lança
   exceção, mas o rótulo "Página X de N" fica confuso nesse meio-tempo.
   Baixa prioridade (a criação de uma pesquisa sem páginas já deveria ser
   evitada no construtor), mas vale um guard simples (`if (totalPaginas ===
   0) return null` ou mensagem dedicada) se quiser fechar esse edge case.

**Conclusão**: sem achados críticos — a task pode seguir para a etapa de
`test-engineer`. Os itens "Deveria corrigir"/"Sugestão" acima não bloqueiam
o pipeline (nenhum envolve anonimização, controle de acesso ou vazamento de
identidade), mas o item 1 de "Deveria corrigir" (perda de progresso em falha
de rede no envio final) vale a pena resolver antes de considerar esta tela
pronta para produção, dado o custo de UX de reenviar um formulário inteiro
por uma falha transitória.

## Follow-up — correção do achado "Deveria corrigir" nº 1

**Status: concluído.**

`frontend/src/pages/ResponderPesquisaPage/ResponderPesquisaPage.tsx`,
`handleEnviar`: o `catch` agora distingue explicitamente os códigos
genuinamente terminais do envio final (`SESSAO_INVALIDA`, `SESSAO_EXPIRADA`,
`SESSAO_JA_UTILIZADA`, `JA_RESPONDIDO` — únicos que a spec/plano aceitam como
perda de progresso justificada) via um novo array local
`CODIGOS_TERMINAIS_ENVIO` + guarda de tipo `ehCodigoTerminalEnvio`, no mesmo
padrão já usado em `ConfirmarCpfForm.tsx` (`CODIGOS_TERMINAIS`/
`ehCodigoTerminal`). Qualquer outro erro — `ApiError` com `codigo`
desconhecido/ausente (inclusive `status === 0` de falha de rede genuína) —
agora é tratado como recuperável: a fase volta para `respondendo` com o
`sessaoToken`/`tipoPesquisa`/`formulario` (e portanto todas as respostas já
digitadas) preservados, e `erroEnvio` exibe
"Não foi possível enviar suas respostas. Verifique sua conexão e tente
novamente." via o mesmo `Alert` já usado para o `422` recuperável. `422` e
os 4 códigos terminais continuam com o tratamento anterior (nenhuma
regressão nos casos já cobertos).

Nenhum outro arquivo tocado. Nenhuma mudança de contrato de API, nenhum novo
armazenamento de CPF (guard rails da correção mantidos — CPF nunca fica em
`localStorage`/`sessionStorage`/URL, nem é logado). `npm run build` e
`npm run lint` (dentro de `frontend/`) rodados após a correção, ambos sem
erros/avisos.

## Follow-up — ação "Desbloquear tentativas" em `CicloDetalhePage` (ajuste pontual, pedido direto)

**Status: concluído.**

Contexto: o backend adicionou (em paralelo, mesma tarefa lado backend)
`PATCH /api/ciclos/:cicloId/envios/:envioId/desbloquear-tentativas`, um
caminho de recuperação para o bloqueio por 5 tentativas de CPF inválido no
fluxo público (`403 BLOQUEADO_TENTATIVAS_CPF`), inexistente até então —
crítico sobretudo no link único de `clima_geral`, onde 5 erros de qualquer
participante bloqueava a pesquisa inteira para o ciclo todo. Este ajuste é
só do lado admin/gestor_rh (`CicloDetalhePage`), visão já IDENTIFICADA
atrás do mesmo guard de papel de sempre — nenhuma regra de anonimização
tocada.

Ajuste pontual solicitado diretamente pelo usuário (sem planejamento/code
review), implementado exatamente como pedido:

- `frontend/src/types/envio.ts`: `EnvioComum` ganhou
  `bloqueadoPorTentativas: boolean`, herdado por `EnvioAvaliacao360Resposta`
  e `EnvioCampanhaClima`.
- `frontend/src/services/enviosPesquisaService.ts`: nova função
  `desbloquearTentativas(cicloId, envioId): Promise<EnvioPesquisaAcao>`,
  mesmo padrão de `expirarEnvio` (`apiFetch` com `PATCH`).
- `frontend/src/pages/CicloDetalhePage/CicloDetalhePage.tsx`:
  - União `acaoEmAndamento.acao` ampliada com `'desbloquear-tentativas'`.
  - Novo `handleDesbloquearTentativas(envio)`, análogo a
    `handleMarcarComoEnviado`/`handleRegistrarLembrete` (sem
    `ConfirmDialog` — ação de recuperação, não destrutiva, mesmo padrão das
    duas ações não-destrutivas já existentes).
  - Botão "Desbloquear tentativas" adicionado na linha de ações da tabela de
    envios `avaliacao_360` (ao lado de "Expirar") e no card da campanha
    única `clima_geral`, ambos habilitados só quando
    `bloqueadoPorTentativas === true` (com `Tooltip` explicando quando
    desabilitado) e desabilitados também durante a própria chamada
    ("Aguarde...").
- `npm run build` e `npm run lint` (dentro de `frontend/`) rodados ao final,
  ambos sem erros/avisos.

Nota: como o lado backend desta mesma ação pode ainda estar em andamento em
paralelo, o shape real da API só será validado em runtime (não há
dependência de build entre os dois lados neste ajuste).
