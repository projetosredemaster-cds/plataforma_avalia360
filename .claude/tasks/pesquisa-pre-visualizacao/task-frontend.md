# Plano — Frontend: Pré-visualização de Pesquisa

Base: `.claude/tasks/pesquisa-pre-visualizacao/spec.md` (decisões 1-5 já fechadas,
`planejamento-backend` não necessário — `GET /api/pesquisas/:id` já cobre tudo).

## Decisões técnicas desta task (detalhando o que a spec deixou em aberto)

- **Página nova, não modal.** Nova rota dedicada `/pesquisas/:id/preview` com página
  própria `PesquisaPreviewPage`, dentro do MESMO grupo protegido/`PainelAdminLayout`
  já usado por `/pesquisas/:id/editar` (decisão 4 da spec é explícita: "dentro do
  grupo protegido admin/gestor_rh do painel administrativo" — isso significa manter o
  chrome do painel admin, diferente de `ResponderPesquisaPage`, que é pública e por
  isso não usa `PainelAdminLayout`). Um modal/`Dialog` ficaria espremido para
  reproduzir com fidelidade a navegação por página (Anterior/Próxima) que o formulário
  real tem; uma página cheia também casa com o padrão já usado por toda tela de
  detalhe do projeto (`CicloDetalhePage`, `PesquisaConstrutorPage`).
- **Busca de dados:** reaproveitar `buscarPesquisa(id)` de
  `frontend/src/services/pesquisasService.ts:48-50` (já usada por
  `PesquisaConstrutorPage`), que chama `GET /api/pesquisas/:id` e retorna o tipo
  `Pesquisa` (`frontend/src/types/pesquisa.ts:84-96`) com `paginas[].perguntas[]` já
  contendo `tipo`, `enunciado`, `obrigatoria`, `configuracao` e `competencias`
  (resolvidas de verdade pela API para perguntas `matriz` — nada fictício aí).
- **Sem função de mapeamento para `PerguntaFormularioPublico`.** A spec levantou essa
  possibilidade (seção C), mas na prática o tipo `Pergunta` do construtor já tem tudo
  que os 5 componentes `*Resposta` pedem, exceto a lista de `pessoa` — que é suprida
  inline no próprio `switch` de renderização (passo 3), não via conversão de tipo.
  Não criar nenhum tipo/adapter intermediário novo; renderizar direto a partir de
  `Pergunta` (`types/pesquisa.ts`).
- **Estrutura de arquivos nova** (mesmo padrão de subcomponentes locais usado por
  `PesquisaConstrutorPage/PaginaEditor.tsx`):
  ```
  frontend/src/pages/PesquisaPreviewPage/
    PesquisaPreviewPage.tsx        // página: fetch, loading/erro/vazio, header, paginação, fieldset disabled
    PreviewPagina.tsx              // renderiza 1 Pagina: título + switch por pergunta.tipo
    colaboradoresFicticios.ts      // constante PESSOAS_FICTICIAS: ColaboradorOpcao[]
  ```
- **Aviso de dados fictícios:** inline, logo abaixo de CADA instância de
  `PerguntaPessoaResposta` renderizada em `PreviewPagina.tsx` (pode haver mais de uma
  pergunta `pessoa` na pesquisa) — um `Alert severity="info"` do MUI compacto, não um
  componente novo em arquivo separado (é só um `Alert` com texto fixo, não justifica
  arquivo próprio). Adicionalmente, um banner fixo no topo da própria
  `PesquisaPreviewPage` (abaixo do header, acima das páginas) avisando que é modo
  pré-visualização e nada será salvo — cobre a decisão 1 da spec de forma visível o
  tempo todo, não só na pergunta `pessoa`.
- **Botão na listagem:** `Button size="small" startIcon={<VisibilityIcon fontSize="small" />}`
  (ícone `@mui/icons-material/Visibility`, mesmo padrão `startIcon` já usado em
  `CiclosListPage` para `BarChartIcon`/`ForumIcon`). Label "Pré-visualizar". Visível
  para QUALQUER status (`rascunho`, `publicada`, `encerrada`) — sem condicional de
  status, ao contrário de "Publicar"/"Deletar"/"Encerrar". Posição: logo depois do
  botão "Editar"/"Ver detalhes" existente, antes de "Duplicar", em
  `frontend/src/pages/PesquisasListPage/PesquisasListPage.tsx` (`CardActions`, por
  volta da linha 279-297).

## Passos

1. **frontend-developer** — ✅ Concluído

   **Resumo da implementação:**
   - Criado `frontend/src/pages/PesquisaPreviewPage/colaboradoresFicticios.ts` com
     `COLABORADORES_FICTICIOS: ColaboradorOpcao[]` (3 entradas, IDs `ficticio-1/2/3`).
   - Criado `frontend/src/pages/PesquisaPreviewPage/PreviewPagina.tsx`, renderizando
     título da página + `switch (pergunta.tipo)` reaproveitando os 5 componentes
     `*Resposta` existentes (`likert`, `texto_aberto`, `matriz`, `pessoa`,
     `caixa_selecao`) sem alterá-los, sempre com `valor={null}` e `onChange={() => {}}`.
     Pergunta `pessoa` acompanhada de `Alert severity="info"` avisando dados de exemplo.
   - Criado `frontend/src/pages/PesquisaPreviewPage/PesquisaPreviewPage.tsx`: busca
     `buscarPesquisa(id)`, trata carregando/erro/vazio, header com título +
     `StatusPesquisaChip` + botão "Fechar" (`navigate('/pesquisas')`), banner fixo de
     modo pré-visualização, corpo em `<fieldset disabled>` com indicador "Página X de Y",
     `PreviewPagina` e navegação Anterior/Próxima/Enviar (Enviar sempre desabilitado,
     com `Tooltip`).
   - Alterado `frontend/src/App.tsx`: import de `PesquisaPreviewPage` + rota
     `/pesquisas/:id/preview` dentro do grupo protegido `admin`/`gestor_rh` +
     `PainelAdminLayout` já existente, logo após `/pesquisas/:id/editar`.
   - Alterado `frontend/src/pages/PesquisasListPage/PesquisasListPage.tsx`: import de
     `VisibilityIcon` e botão "Pré-visualizar" (`startIcon`) no `CardActions`, entre
     "Editar"/"Ver detalhes" e "Duplicar", sem condicional de status.
   - Nenhum arquivo em `components/perguntas/*/*Resposta.tsx` foi alterado. Nenhuma
     chamada de API além de `buscarPesquisa`.
   - `npm run build` (tsc -b && vite build): 0 erros. `npm run lint`: 9 erros / 4
     warnings pré-existentes, todos em arquivos não tocados por esta task
     (`AnaliseAvaliacoesPage`, `AnaliseNuvemPalavrasPage`, `AnaliseRankingPage`,
     `AnaliseVisaoGeralPage`, `CicloDetalhePage`, `CiclosListPage`) — nenhum erro novo
     introduzido pelos arquivos criados/alterados nesta task.

   - **Arquivo novo** `frontend/src/pages/PesquisaPreviewPage/colaboradoresFicticios.ts`:
     - Exportar `COLABORADORES_FICTICIOS: ColaboradorOpcao[]` (tipo importado de
       `../../components/perguntas/PerguntaPessoa/PerguntaPessoaResposta`) com 3
       entradas fixas, ex.:
       ```ts
       export const COLABORADORES_FICTICIOS: ColaboradorOpcao[] = [
         { id: 'ficticio-1', nomeCompleto: 'Colaborador Exemplo 1' },
         { id: 'ficticio-2', nomeCompleto: 'Colaborador Exemplo 2' },
         { id: 'ficticio-3', nomeCompleto: 'Colaborador Exemplo 3' },
       ]
       ```
     - IDs com prefixo `ficticio-` deliberadamente não-UUID, para nunca colidir por
       acidente com um `colaborador.id` real caso alguém reaproveite a constante em
       outro lugar por engano.

   - **Arquivo novo** `frontend/src/pages/PesquisaPreviewPage/PreviewPagina.tsx`:
     - Props: `{ pagina: Pagina }` (tipo de `types/pesquisa.ts`).
     - Renderiza `pagina.titulo` (se houver, mesmo estilo `Typography variant="subtitle1"`
       usado em `FormularioRespostaPublica.tsx:155-158`) e, para cada
       `pergunta` de `pagina.perguntas`, um `switch (pergunta.tipo)` análogo ao de
       `FormularioRespostaPublica.tsx:161-227`, mas SEM estado de resposta nenhum:
       - `likert` → `<PerguntaLikertResposta enunciado configuracao valor={null} onChange={() => {}} />`
       - `texto_aberto` → `<PerguntaTextoAbertoResposta enunciado valor={null} onChange={() => {}} />`
       - `matriz` → `<PerguntaMatrizResposta enunciado configuracao competencias={pergunta.competencias} valor={null} onChange={() => {}} />`
       - `pessoa` → `<PerguntaPessoaResposta enunciado opcoes={COLABORADORES_FICTICIOS} valor={null} onChange={() => {}} />`
         seguido imediatamente por um
         `<Alert severity="info" sx={{ mt: -1 }}>Dados de exemplo — participantes reais aparecerão quando o ciclo for criado.</Alert>`
       - `caixa_selecao` → `<PerguntaCaixaSelecaoResposta enunciado configuracao valor={null} onChange={() => {}} />`
     - `obrigatoria` sempre repassada de `pergunta.obrigatoria` (só afeta o `*` visual
       no label, não bloqueia nada aqui). Nunca passar `erro` (deixe `undefined` —
       não existe conceito de tentativa de envio na pré-visualização).
     - NÃO envolver em `fieldset` aqui — o `fieldset disabled` envolve a árvore inteira
       de páginas lá na página pai (próximo passo), não por página individual.

   - **Arquivo novo** `frontend/src/pages/PesquisaPreviewPage/PesquisaPreviewPage.tsx`:
     - `useParams<{ id: string }>()` para o `id`; se ausente, comportamento irrelevante
       na prática (rota sempre chamada com `:id`), não precisa tratar.
     - Estado: `pesquisa: Pesquisa | null`, `carregando: boolean` (inicial `true`),
       `erro: string | null`, `paginaAtual: number` (inicial `0`).
     - `useCallback` + `useEffect` chamando `buscarPesquisa(id)` na montagem, mesmo
       padrão try/catch/`ApiError` já usado em `PesquisasListPage.carregarPesquisas`
       (`err instanceof ApiError ? err.message : 'Não foi possível carregar a pesquisa.'`).
     - **Estados a tratar:**
       - Carregando: `CircularProgress` centralizado (ou `Skeleton`, siga o padrão já
         usado em `PesquisasListPage`) enquanto `carregando`.
       - Erro: `Alert severity="error"` com a mensagem + botão "Tentar novamente" que
         re-chama a busca (mesmo padrão de `PesquisasListPage.tsx:231-240`).
       - Vazio: se `pesquisa.paginas.length === 0`, mostrar
         `Typography color="text.secondary"` com algo como "Esta pesquisa ainda não
         tem páginas ou perguntas cadastradas." em vez de tentar renderizar
         paginação com zero páginas.
     - **Header da página:** `Typography variant="h5"` com o título da pesquisa
       (`pesquisa.titulo`) + `StatusPesquisaChip status={pesquisa.status}` ao lado
       (mesmo componente já usado em `PesquisasListPage`/`PesquisaConstrutorPage`) +
       botão "Fechar" (`variant="outlined"`) que chama `navigate('/pesquisas')` — não
       `navigate(-1)`, para sempre voltar a um lugar previsível independente de como
       o usuário chegou à URL.
     - **Banner fixo de modo pré-visualização:** logo abaixo do header, um
       `Alert severity="info"` (ou `warning`, à escolha, mas deve ser visualmente
       destacado) fixo, tipo "Modo de pré-visualização — as respostas não são salvas
       e o botão Enviar está desabilitado."
     - **Corpo:** dentro de `<fieldset disabled className="border-0 p-0 m-0">`
       (mesmo padrão de `FormularioRespostaPublica.tsx:152`), envolvendo:
       - Indicador "Página X de Y" (`Typography variant="caption"`, mesmo texto usado
         em `FormularioRespostaPublica.tsx:148-150`).
       - `<PreviewPagina pagina={pesquisa.paginas[paginaAtual]} />`.
       - Barra de navegação inferior, espelhando exatamente
         `FormularioRespostaPublica.tsx:231-259`: botão "Anterior" (`disabled` quando
         `paginaAtual === 0`), botão "Próxima" quando não é a última página, e na
         última página um botão "Enviar" **sempre desabilitado** (`disabled` fixo,
         não ligado a nenhum estado de `enviando`) com um `Tooltip` explicando "Envio
         desabilitado na pré-visualização" — não omitir o botão, mantê-lo visível e
         desabilitado para fidelidade visual com o formulário real (decisão 5 da
         spec permite qualquer uma das duas abordagens; desabilitado foi escolhido
         aqui para preservar o layout exatamente igual ao formulário de verdade).
     - Import de todos os 5 componentes `*Resposta` só acontece em `PreviewPagina.tsx`
       (passo anterior) — esta página não os importa diretamente.
     - Nenhuma chamada a `apiFetch`/service além de `buscarPesquisa` — nenhuma
       chamada de API para dados de `pessoa` (são sempre fictícios, gerados no
       frontend, nunca de rede — reforça achado C da spec).

   - **Alterar** `frontend/src/App.tsx`:
     - Importar `PesquisaPreviewPage` de `./pages/PesquisaPreviewPage/PesquisaPreviewPage`.
     - Adicionar `<Route path="/pesquisas/:id/preview" element={<PesquisaPreviewPage />} />`
       logo depois de `<Route path="/pesquisas/:id/editar" .../>` (linha ~41), dentro
       do mesmo grupo `<Route element={<RotaProtegida papeis={['admin', 'gestor_rh']} />}>`
       + `<Route element={<PainelAdminLayout />}>` já existente — não criar nenhum
       grupo de rota novo, não tornar essa rota pública em nenhuma hipótese.

   - **Alterar** `frontend/src/pages/PesquisasListPage/PesquisasListPage.tsx`:
     - Importar `VisibilityIcon` de `@mui/icons-material/Visibility`.
     - No `CardActions` (linha ~279-325), adicionar um botão logo depois do botão
       "Editar"/"Ver detalhes" (linha 280-282) e antes do botão "Duplicar" (linha
       283-285):
       ```tsx
       <Button
         size="small"
         startIcon={<VisibilityIcon fontSize="small" />}
         onClick={() => navigate(`/pesquisas/${pesquisa.id}/preview`)}
       >
         Pré-visualizar
       </Button>
       ```
     - Sem condicional de `status` — aparece para `rascunho`, `publicada` e
       `encerrada` igualmente (único botão do card sem restrição de status, junto
       com "Editar"/"Ver detalhes" e "Duplicar").

   - **Papéis com acesso:** `admin` e `gestor_rh`, idênticos entre si — a tela não
     distingue nada entre os dois papéis (mesma limitação que `PesquisaConstrutorPage`
     já tem hoje). Já garantido pelo grupo `RotaProtegida papeis={['admin', 'gestor_rh']}`
     existente; nenhuma checagem adicional de papel dentro de
     `PesquisaPreviewPage`/`PreviewPagina` é necessária ou deve ser adicionada.
   - **Endpoint consumido:** só `GET /api/pesquisas/:id` via `buscarPesquisa` — nenhum
     endpoint novo, nenhuma alteração de `pesquisasService.ts`.
   - **Fonte dos dados exibidos:** 100% estrutural (títulos, enunciados, tipos,
     configuração, competências vinculadas) — nunca `respostas`/`itens_resposta` reais.
     A única informação fictícia é a lista de nomes para pergunta `pessoa`, gerada
     localmente; não deve, em nenhuma hipótese, ser tratada como dado real em
     nenhum outro ponto da tela (ex.: não contar/somar essas 3 entradas em lugar
     nenhum, é só apresentação visual).

2. **frontend-codereviewer**
   - Confirmar que nenhum dos 5 arquivos `components/perguntas/*/*Resposta.tsx` foi
     alterado — reaproveitamento deve ser 100% via props, zero mudança nesses
     arquivos (fora de escopo explícito da spec).
   - Confirmar que `valor` é sempre `null` (nunca um objeto parcial) e `onChange` é
     sempre no-op nas 5 instâncias de `PreviewPagina.tsx` — qualquer estado de
     resposta real ali seria bug (a pré-visualização não deve simular
     interatividade nenhuma, mesmo que o `fieldset disabled` já bloqueie o clique).
   - Confirmar que o botão "Enviar" na última página está de fato sempre desabilitado
     (não ligado a nenhum estado que possa reabilitá-lo) e que não existe nenhum
     `onEnviar`/chamada de API de envio em lugar nenhum de
     `PesquisaPreviewPage`/`PreviewPagina`.
   - Confirmar que a lista fictícia de `pessoa` (`COLABORADORES_FICTICIOS`) só é
     usada dentro de `PreviewPagina.tsx` e não vaza para nenhum outro componente/tela.
   - Confirmar que a nova rota `/pesquisas/:id/preview` está dentro do mesmo grupo
     protegido `RotaProtegida papeis={['admin', 'gestor_rh']}` + `PainelAdminLayout`
     que as demais rotas de `/pesquisas/*` — nenhuma rota pública nova, nenhum
     caminho de acesso alternativo introduzido em `App.tsx`.
     Endpoint consumido (`GET /api/pesquisas/:id`) já é restrito a admin/gestor_rh no
     backend — checagem client-side é só UX, não segurança, mas ainda assim confirmar
     que não foi duplicada/reinventada dentro da página (deve confiar só no grupo de
     rota, como as demais páginas do painel já fazem).
   - Confirmar Tailwind + MUI (sem `.css` novo, sem `style={{}}` inline grande) e que
     a lista de páginas/perguntas, se ficar muito longa, segue a convenção de
     `max-h-[...] overflow-y-auto` do projeto SE ela crescer livremente sem paginação
     própria — como a pré-visualização já pagina por `Pagina` (uma por vez, com
     Anterior/Próxima), essa convenção provavelmente não se aplica aqui (cada tela
     mostra só uma página por vez, tamanho limitado), mas vale conferir se alguma
     pergunta com lista longa de opções (ex. `caixa_selecao` com muitas opções)
     precisaria dela.
   - Conferir que os 3 estados (carregando/erro/vazio) da spec estão implementados
     em `PesquisaPreviewPage` e que "vazio" (pesquisa sem páginas) não quebra a
     lógica de paginação (`pesquisa.paginas[paginaAtual]` undefined).

## Revisão

Arquivos revisados: `colaboradoresFicticios.ts`, `PreviewPagina.tsx`,
`PesquisaPreviewPage.tsx` (novos), `App.tsx` e `PesquisasListPage.tsx` (alterados). Os 5
componentes `components/perguntas/*/*Resposta.tsx` (`PerguntaLikertResposta`,
`PerguntaTextoAbertoResposta`, `PerguntaMatrizResposta`, `PerguntaPessoaResposta`,
`PerguntaCaixaSelecaoResposta`) também foram lidos na íntegra para conferência de
assinatura de props.

**Crítico:** nenhum.

**Deveria corrigir:** nenhum.

**Sugestão:**
- `PerguntaCaixaSelecaoResposta` (componente de produção reaproveitado, não tocado por
  esta task) não tem rolagem interna para lista longa de opções — se uma pesquisa tiver
  uma `caixa_selecao` com muitas opções, tanto o formulário público quanto a
  pré-visualização crescem livremente. Não é uma regressão introduzida por esta task
  (o comportamento é idêntico ao do fluxo público existente) e o componente está
  explicitamente fora de escopo (spec: "Fora de escopo... Qualquer alteração nos
  componentes `*Resposta.tsx`"), então não bloqueia esta task — só registro para uma
  eventual task futura que toque esse componente.
- Em `PesquisaPreviewPage.tsx`, o estado de erro usa `Typography role="alert"` em vez do
  padrão `Alert severity="error"` do MUI mencionado no passo do plano (que cita
  "mesmo padrão de `PesquisasListPage.tsx:231-240`"). Funcionalmente equivalente
  (mesma mensagem, mesmo botão "Tentar novamente", mesmo comportamento de acessibilidade
  via `role="alert"`), só diverge visualmente do componente `Alert` usado no restante da
  tela (banner de pré-visualização já usa `Alert severity="info"` logo acima). Puramente
  cosmético/consistência visual, não afeta nenhum item do checklist de prioridade alta.

### Conferência item a item do checklist

1. **Zero alteração nos componentes `*Resposta` de produção**: confirmado por leitura
   direta dos 5 arquivos em `components/perguntas/*/` — nenhuma prop nova, nenhuma
   mudança de assinatura; os comentários internos (ex. "este componente nunca busca
   sozinho" em `PerguntaPessoaResposta.tsx`, citados na spec/plano) batem exatamente com
   o que já estava documentado antes desta task, reforçando que não houve edição.
2. **`valor` sempre `null` / `onChange` sempre no-op**: confirmado nas 5 instâncias em
   `PreviewPagina.tsx` — nenhuma tem estado local, todas usam `valor={null}` e
   `onChange={() => {}}` literal.
3. **Botão Enviar sempre desabilitado, sem caminho de reabilitação**: confirmado em
   `PesquisaPreviewPage.tsx` — `disabled` é um literal fixo no JSX (não ligado a
   `carregando`/`enviando`/nenhum estado), envolto em `Tooltip`; nenhum `onEnviar`/chamada
   de API de envio existe em nenhum dos três arquivos novos.
4. **Lista fictícia `COLABORADORES_FICTICIOS` isolada em `PreviewPagina.tsx`**:
   confirmado via busca — só `colaboradoresFicticios.ts` (definição) e
   `PreviewPagina.tsx` (uso) referenciam o símbolo em todo `frontend/src`.
5. **Rota nova dentro do mesmo grupo protegido, sem caminho alternativo**: confirmado em
   `App.tsx` — `/pesquisas/:id/preview` está dentro do mesmo bloco
   `RotaProtegida papeis={['admin', 'gestor_rh']}` → `PainelAdminLayout` que
   `/pesquisas/:id/editar`, nenhuma rota pública nova, nenhuma checagem de papel
   duplicada dentro de `PesquisaPreviewPage`.
6. **Tailwind + MUI, sem CSS puro**: confirmado — nenhum arquivo `.css` novo, nenhum
   `style={{}}` nos três arquivos; usa `sx` (`Alert sx={{ mt: -1 }}`) e classes Tailwind
   só para layout (`flex`, `gap`, `justify-between`), sem sobreposição de propriedade
   visual MUI por Tailwind.
7. **Convenção `max-h-[...] overflow-y-auto`**: não se aplica — a tela pagina por
   `Pagina` (uma por vez, com Anterior/Próxima), então não há lista de volume variável
   crescendo livremente dentro da própria página de preview (ver nota de sugestão acima
   sobre `PerguntaCaixaSelecaoResposta`, que é caso à parte, fora de escopo).
8. **3 estados (carregando/erro/vazio) e paginação segura**: confirmado — os três blocos
   são mutuamente exclusivos por condição (`carregando`, `!carregando && erro`,
   `!carregando && !erro && paginas.length === 0`, `!carregando && !erro &&
   paginas.length > 0`); o acesso a `pesquisa.paginas[paginaAtual]` só acontece dentro do
   último bloco, já com `paginas.length > 0` garantido, e `paginaAtual` é sempre
   clampado entre `0` e `totalPaginas - 1` pelos handlers de Anterior/Próxima — nunca
   fica fora dos limites do array.

**Conclusão:** nenhum achado crítico. A implementação segue o plano linha a linha; pode
prosseguir para `test-engineer`.
