---
name: frontend-componente-pergunta
description: Use sempre que implementar ou alterar o construtor de pesquisas ou a renderização de perguntas em apps/web. Define o padrão de componente por tipo de pergunta (likert, texto_aberto, matriz, pessoa).
---

# Padrão de componentes de pergunta (apps/web)

Existem exatamente 4 tipos de pergunta no MVP. Cada um deve ter um componente
de edição (usado no construtor) e um componente de resposta (usado no
formulário público).

## Estrutura sugerida

```
components/perguntas/
  PerguntaLikert/
    PerguntaLikertEditor.tsx
    PerguntaLikertResposta.tsx
  PerguntaTextoAberto/
    PerguntaTextoAbertoEditor.tsx
    PerguntaTextoAbertoResposta.tsx
  PerguntaMatriz/
    PerguntaMatrizEditor.tsx
    PerguntaMatrizResposta.tsx
  PerguntaPessoa/
    PerguntaPessoaEditor.tsx
    PerguntaPessoaResposta.tsx
```

## Por tipo

- **Likert**: editor configura os níveis/rótulos da escala (`configuracao.niveis`,
  `configuracao.rotulos`). Resposta renderiza os níveis como opções únicas e
  salva `{ nota: number }` em `valor`.
- **Texto aberto**: editor não tem configuração especial além de
  obrigatória/opcional. Resposta é um textarea, salva `{ texto: string }`.
- **Matriz**: editor seleciona quais `competencia_ids` entram na matriz.
  Resposta renderiza uma linha por competência com a mesma escala, salva
  `{ notas: { [competencia_id]: number } }`.
- **Pessoa**: editor define `configuracao.filtro_relacionamento` (quais tipos
  de relacionamento podem ser selecionados). Resposta mostra um seletor de
  colaborador (respeitando o filtro), salva `{ colaborador_id: string }`.

## Estilização

Use Tailwind CSS para layout/espaçamento e componentes MUI (`TextField`,
`RadioGroup`, `Slider`, `Autocomplete`, etc.) para os controles de resposta
em si. Não escreva CSS puro. Em conflito, o `theme`/`sx` do MUI vence sobre
classes Tailwind.

## Regras gerais

- Todo componente de resposta deve tratar `obrigatoria` — não deixar submeter
  o formulário sem preencher perguntas obrigatórias.
- Nenhum componente deve chamar a API diretamente — recebem `valor` e
  `onChange` via props, e quem persiste é a página/formulário pai.
- Não crie um 5º tipo de pergunta sem confirmar explicitamente que isso está
  no escopo da task — os tipos fora desses 4 foram removidos do MVP de
  propósito (CSAT, NPS, KPI, CES, NVS, Imagem, Indicação).
