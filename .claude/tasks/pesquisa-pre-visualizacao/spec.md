# Spec — Pré-visualização de Pesquisa

## Contexto

Hoje só existem duas formas de ver como uma pesquisa aparece para quem responde:
1. Abrir o Construtor (`PesquisaConstrutorPage`, `/pesquisas/:id/editar`) — mostra os
   editores (`*Editor`) das perguntas, não o formulário de resposta real.
2. Responder de fato via `/responder/:token` (`ResponderPesquisaPage`), que exige um
   envio real (`envios_pesquisa`), portanto um ciclo ativo com participantes e CPF.

O usuário quer uma terceira opção: pré-visualizar a pesquisa como ela apareceria para
quem responde, sem precisar criar ciclo nem gerar link/CPF — em modo leitura, acessível
direto da listagem de Pesquisas.

## Decisões já fechadas (não reabrir)

1. Modo leitura, não interativo — componentes de pergunta aparecem desabilitados
   (`disabled`), não persiste nada.
2. Pergunta tipo `pessoa`: lista fictícia de exemplo (ex.: "Colaborador Exemplo 1/2/3")
   com aviso visual explícito de que são dados de exemplo.
3. Acesso via botão de pré-visualização direto no card de `PesquisasListPage`, sem abrir
   a pesquisa antes. Funciona para qualquer status (`rascunho` ou `publicada`) — e,
   por extensão do mesmo achado (ver item D), também `encerrada`, já que o endpoint não
   distingue por status.
4. Rota `/pesquisas/:id/preview`, dentro do grupo protegido admin/gestor_rh do painel
   administrativo — não é rota pública, não tem relação com `/responder/:token`.
5. Sem botão de enviar funcional (oculto ou desabilitado — detalhe para
   `planejamento-frontend`). Precisa de botão "Fechar"/"Voltar" claro.

## Investigação

### A — Onde vivem os componentes de renderização por tipo de pergunta

Os 5 componentes `*Resposta` (note: o projeto já suporta 5 tipos de pergunta em produção —
`likert`, `texto_aberto`, `matriz`, `pessoa`, `caixa_selecao` — ver
`frontend/src/types/pesquisa.ts:9`, comentário "5 tipos de pergunta no MVP". Isso diverge
do texto do `CLAUDE.md` raiz, que ainda descreve só 4; tratado aqui como fato já
implementado e não como introdução de tipo novo por esta task — nada a confirmar com o
usuário sobre isso, é só um registro de divergência de documentação):

- `frontend/src/components/perguntas/PerguntaLikert/PerguntaLikertResposta.tsx`
- `frontend/src/components/perguntas/PerguntaTextoAberto/PerguntaTextoAbertoResposta.tsx`
- `frontend/src/components/perguntas/PerguntaMatriz/PerguntaMatrizResposta.tsx`
- `frontend/src/components/perguntas/PerguntaPessoa/PerguntaPessoaResposta.tsx`
- `frontend/src/components/perguntas/PerguntaCaixaSelecao/PerguntaCaixaSelecaoResposta.tsx`

Orquestrados hoje só por `frontend/src/pages/ResponderPesquisaPage/FormularioRespostaPublica.tsx`
(fluxo público, com paginação, validação de obrigatoriedade via
`components/perguntas/validacaoPergunta.ts` e envio via `onEnviar`).

### B — Acoplamento dos componentes `*Resposta`

Confirmado por leitura direta dos 5 arquivos: todos são componentes de **props puras**.
Nenhum chama API, nenhum lê contexto de sessão pública, nenhum depende de
`sessaoToken`/CPF. Cada um recebe `enunciado`, `obrigatoria`, `configuracao` (quando
aplicável), `valor`, `onChange`, `erro?` — e `PerguntaPessoaResposta` recebe `opcoes:
ColaboradorOpcao[]` via prop, sem buscar sozinho (comentário explícito no arquivo:
"este componente nunca busca sozinho"). `PerguntaMatrizResposta` recebe `competencias:
Competencia[]` já resolvida via prop também.

**Nenhum dos 5 tem hoje uma prop de "somente leitura"/`disabled`** — todos assumem
interatividade (o `RadioGroup`/`TextField`/`Autocomplete`/`Checkbox` internos sempre
respondem a onChange). No fluxo público atual, o "modo leitura" durante o envio é
simulado só por fora, envolvendo tudo num `<fieldset disabled={enviando}>` em
`FormularioRespostaPublica.tsx:152` — os componentes internos do MUI respeitam
`disabled` herdado de `<fieldset>` nativo do HTML.

**Recomendação:** reaproveitar os componentes `*Resposta` existentes tal como estão,
sem adicionar nenhuma prop nova a eles, envolvendo a árvore de perguntas da
pré-visualização no mesmo padrão `<fieldset disabled>` já usado em
`FormularioRespostaPublica.tsx`. Isso cobre `TextField`, `Autocomplete`, `Checkbox` e
`RadioGroup`/`Radio` do MUI (todos respeitam desabilitação herdada de `fieldset`).
Risco/esforço de tocar os 5 componentes de produção (usados no fluxo real de coleta) só
para adicionar uma prop `somenteLeitura` que a pré-visualização precisa e o fluxo real
não é maior que o ganho — reaproveitar sem alterar os arquivos de
`components/perguntas/*/` evita qualquer risco de regressão no fluxo de coleta real.
Duplicar componentes de exibição só para a pré-visualização também foi descartado: geraria
4-5 arquivos novos redundantes com os já existentes, sem ganho, e um risco maior de
desalinhamento visual futuro entre "como a pergunta aparece de verdade" e "como aparece
na pré-visualização" — o objetivo declarado da funcionalidade é justamente mostrar a
pesquisa como ela aparece de verdade.

Isso é recomendação para `planejamento-frontend` avaliar/confirmar tecnicamente
(inclusive validar se `fieldset disabled` é suficiente visualmente para todos os 5, ou
se algum precisa de ajuste local dentro da própria página de preview, sem tocar o
componente compartilhado) — não uma decisão fechada por esta spec.

### C — Endpoint de estrutura da pesquisa

O mesmo endpoint já usado pelo Construtor, `GET /api/pesquisas/:id`
(`pesquisasService.buscarPesquisa` em `frontend/src/services/pesquisasService.ts:48-50`,
consumido por `PesquisaConstrutorPage.tsx:64`), já retorna tudo que a pré-visualização
precisa:

- `backend/src/modules/pesquisas/pesquisas.controller.ts` → `buscarPesquisaPorId`
- `backend/src/modules/pesquisas/pesquisas.service.ts` → `buscarPorId` (linhas 304-313) →
  `montarDetalhe` (linhas 147-216), que já resolve páginas, perguntas (`tipo`,
  `enunciado`, `obrigatoria`, `configuracao`) e competências vinculadas por pergunta
  matriz — tudo que os componentes `*Resposta` precisam, exceto `opcoesPessoa`.

`Pergunta` (`frontend/src/types/pesquisa.ts:47-52`, tipo do Construtor) e
`PerguntaFormularioPublico` (`frontend/src/types/respostaPublica.ts:54-70`, tipo do fluxo
público) têm formatos próximos mas não idênticos — a pré-visualização vai precisar de
uma função de mapeamento local (só no frontend, dentro da própria página/hook de
preview) de `Pergunta` → um shape equivalente a `PerguntaFormularioPublico`, preenchendo
`opcoesPessoa` com a lista fictícia (decisão 2) só para perguntas tipo `pessoa` — sem
nenhuma chamada de API adicional para isso. Confirmado: o endpoint do construtor NUNCA
expõe uma lista real de colaboradores para pergunta `pessoa` (isso só existe hoje via
`resolverOpcoesPessoa`, exclusivo do fluxo público e dependente de relacionamento de
ciclo real) — reforça que os dados fictícios de `pessoa` são necessariamente gerados no
frontend, nunca vindos de uma chamada de API.

### D — Controle de acesso

Confirmado em `backend/src/modules/pesquisas/pesquisas.service.ts`:
- `buscarPorId` (linha 304) chama `garantirPapel(ator, [...PAPEIS_COM_ACESSO])` —
  `PAPEIS_COM_ACESSO = ['admin', 'gestor_rh']` (linha 25) — como primeira linha, sem
  bypass.
- **Nenhuma checagem de `pesquisa.status` existe em `buscarPorId`/`montarDetalhe`** — ao
  contrário de `garantirEditavel` (só usada por rotas de escrita de páginas/perguntas,
  linhas 225-233) e `remover` (só permite excluir em `rascunho`, linha 504). A leitura via
  `GET /api/pesquisas/:id` já funciona hoje para `rascunho`, `publicada` e `encerrada`
  sem qualquer bloqueio adicional.
- A rota é montada com `router.use(autenticar)` em `pesquisas.module.ts:17`, nunca
  pública — compatível com a decisão 4 (grupo protegido admin/gestor_rh).

## Decisão final: `planejamento-backend` NÃO é necessário

Nenhuma lacuna concreta foi encontrada: `GET /api/pesquisas/:id` já entrega estrutura
completa (páginas, perguntas, tipo, configuração, competências) para qualquer status,
já restrito a `admin`/`gestor_rh`, sem exigir ciclo. A única peça que falta (lista
fictícia de "pessoa") é dado estático gerado no frontend, não uma responsabilidade de
API. Esta task segue direto para `planejamento-frontend`.

## Fora de escopo

- Qualquer alteração nos componentes `components/perguntas/*/*Resposta.tsx` usados pelo
  fluxo público real de coleta (`/responder/:token`) — reaproveitar como estão.
- Qualquer alteração em `backend/src/modules/pesquisas/**` ou nos módulos de
  `paginas-pesquisa`/`perguntas` — nenhuma lacuna encontrada que justifique mudança de
  backend.
- Qualquer lista real de colaboradores para pergunta tipo `pessoa` na pré-visualização —
  é sempre fictícia, gerada no frontend.
- Envio/persistência de resposta a partir da tela de pré-visualização — não existe botão
  de enviar funcional (decisão 5).
- Pré-visualização de pesquisa em criação ainda não salva (sem `id`) — a rota
  `/pesquisas/:id/preview` pressupõe pesquisa já existente/persistida.

## Riscos relacionados a anonimização / controle de acesso

- **Anonimização:** não se aplica diretamente — a pré-visualização não lê nem agrega
  nenhuma resposta real (`respostas`/`itens_resposta`), só estrutura de pergunta. Nenhum
  dado de avaliador/avaliado é exposto.
- **Controle de acesso:** a rota `GET /api/pesquisas/:id` já é restrita a
  `admin`/`gestor_rh` (achado D) — consistente com a decisão 4 de manter a
  pré-visualização dentro do grupo protegido do painel administrativo. Importante que
  `planejamento-frontend` não introduza nenhum caminho alternativo de acesso a essa tela
  (ex.: nenhuma rota pública, nenhum link compartilhável) — a pré-visualização é
  ferramenta interna de quem administra a pesquisa, não um link para terceiros.
- Atenção para `planejamento-frontend` não confundir os dados fictícios de "pessoa" com
  dados reais em nenhum outro lugar da tela (ex.: não reaproveitar por engano a lista
  fictícia em nenhum cálculo/contagem exibido) — é só apresentação visual.
