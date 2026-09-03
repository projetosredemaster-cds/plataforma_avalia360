# Plataforma de Avaliação 360° — Brief Atualizado (v4)

> Substitui a v3. Consolida as mudanças de escopo, arquitetura e design
> decididas depois da v3. Seções 1-4 da v3 (modelo de acesso, CPF, RLS)
> continuam válidas e não são repetidas em detalhe aqui — só o que mudou ou
> foi adicionado.

## 1. Stack e design (novo em relação à v3)

- **Estilização**: Tailwind CSS + Material UI (MUI). Em conflito, **MUI tem
  prioridade** (customização via `theme`/`sx`, nunca CSS puro).
- **Fonte**: Figtree, peso Light (300), via `@fontsource/figtree`.
- **Paleta de cores** (substitui a navy/dourado extraída do logo original):
  - `primary`: `#2E5AA7` (Amalfi Tile)
  - `secondary`: `#FFA62B` (Citrus Zest)
  - `info`: `#86C5FF` (Sea Breeze)
  - Fundo suave/destaque (chips, hover, alerts): `#F8E6A0` (Cream Gelato)
- **Estilo de componentes**: cantos bem arredondados (`shape.borderRadius`
  alto), botões e chips em formato pílula, cores suaves (fundo translúcido +
  texto sólido) em vez de blocos de cor sólida em chips/alerts.
- **Wallpaper decorativo** (em avaliação): ilustrações de personagens
  (`frontend/public/pessoas_png`) desfocadas/com opacidade baixa, aplicadas
  só em áreas de baixa densidade de dado (login, dashboard, estados vazios)
  — não nas tabelas densas (colaboradores, ciclos, pesquisas).

## 2. Tipos de pesquisa (novo — expande o construtor de pesquisas)

Toda pesquisa agora tem um `tipo`, escolhido na criação e imutável depois:

| Tipo | O que é | Gera relação avaliador↔avaliado? | Tipo de pergunta "Pessoa" |
|---|---|---|---|
| `avaliacao_360` (padrão) | Avaliação 360 tradicional | Sim | Disponível |
| `clima_geral` | Pesquisa de clima/satisfação, sem avaliar ninguém específico | Não | Bloqueada (422 se tentar usar) |

**Ciclo não escolhe tipo — herda da pesquisa vinculada:**
- `avaliacao_360`: comportamento original — ao ativar, gera
  `relacionamentos_avaliacao` (autoavaliação, gestor, subordinado, pares) e
  um `envio_pesquisa` por relacionamento.
- `clima_geral`: ao ativar, **não** gera `relacionamentos_avaliacao`. Gera
  **um único envio compartilhado** para todo o ciclo (`envios_pesquisa.
  ciclo_id` preenchido, `relacionamento_id` nulo). O mesmo link serve para
  todos os participantes.

**Fluxo de acesso da pesquisa de clima:**
1. Link único é copiado/compartilhado manualmente (ver seção 3).
2. Colaborador acessa e informa o CPF.
3. Backend confere o CPF contra `ciclo_participantes` daquele ciclo.
4. Se bater, libera o formulário e, ao final, marca
   `ciclo_participantes.respondeu_em`.
5. **Anonimato estrutural**: a resposta em si é gravada numa tabela **sem
   nenhuma FK para identidade** (nem colaborador, nem sessão, nem envio) —
   só referencia a pesquisa/ciclo. O rastreio de "quem respondeu" (o
   `respondeu_em`) fica completamente separado do conteúdo da resposta, de
   forma que nem admin/gestor_rh conseguem cruzar as duas informações, nem
   mexendo direto no banco.

## 3. Envio — sem automação (mudança de escopo em relação à v3)

- **Não há envio automático por e-mail/WhatsApp.** O SMTP configurado no
  Supabase serve *só* para redefinição de senha de admin/gestor_rh — não
  para disparo de pesquisa.
- O sistema **gera o link único** (baseado em `token_acesso`) e o
  admin/gestor_rh **copia manualmente** para compartilhar por fora da
  plataforma (e-mail, WhatsApp, etc.).
- Ações de controle manual disponíveis por envio: marcar como enviado,
  registrar lembrete (contador, não dispara nada), expirar.
- O sistema não sabe se o link "chegou" — só sabe quando a pessoa confirma o
  CPF (em andamento) e quando responde (concluído/`respondeu_em`).

## 4. Regra de "pares" no motor de ciclos (esclarecida em relação à v3)

- **Pares** = colaboradores com o **mesmo `gestor_id`**, excluindo a própria
  pessoa (não é por `equipe_id`).
- Participantes de um ciclo são **selecionados manualmente** por
  admin/gestor_rh (pessoa ou equipe inteira) — não é "todos os ativos"
  automaticamente.
- Regras de ativação do ciclo:
  - Só ativa se houver uma pesquisa **publicada** vinculada.
  - Vincular/desvincular pesquisa só é permitido com o ciclo em
    `rascunho` (validado no backend).
  - Participantes/relacionamentos ficam travados após ativação; descrição e
    datas do ciclo continuam editáveis.

## 5. Coleta de respostas — em implementação

- Sessão temporária de resposta (`sessoes_resposta`, expiração curta) emitida
  após confirmação de CPF — nunca referenciada pela tabela de resposta em
  si (preserva o anonimato estrutural do clima).
- Limite de 5 tentativas de CPF inválido por token; ao atingir, bloqueia com
  mensagem genérica orientando a procurar o RH.
- Reenvio bloqueado: envio/participante já respondido não reabre o
  formulário.
- Componentes de resposta dos 4 tipos de pergunta (likert, texto_aberto,
  matriz, pessoa) serão reaproveitados depois na funcionalidade de "Simular
  pesquisa" (preview antes de publicar).

## 6. Modelagem de dados — entidades novas/alteradas desde a v3

- **`colaboradores`**: sem alteração em relação à v3.
- **`ciclos_avaliacao`**: sem alteração estrutural; participantes agora
  vêm de `ciclo_participantes` (seleção manual), com `respondeu_em`
  adicionado para o fluxo de clima.
- **`ciclo_participantes`** (nova): `ciclo_id`, `colaborador_id`,
  `respondeu_em`.
- **`pesquisas`**: novo campo `tipo` (enum `tipo_pesquisa`:
  `avaliacao_360` | `clima_geral`), imutável após criação. `criado_por`
  adicionado (referência a `colaboradores`).
- **`perguntas`**: campo `enunciado` (não `titulo`+`descricao` como
  desenhado originalmente) e `configuracao` jsonb — divergência deliberada
  do schema original, já em uso pelo frontend.
- **`perguntas_competencias`** (nova, tabela de junção): substitui a ideia
  original de vincular competências via jsonb — pergunta tipo matriz
  referencia competências por linha relacional.
- **`envios_pesquisa`**: `relacionamento_id` agora **nullable**; novo
  `ciclo_id` nullable (usado só em `clima_geral`, 1 envio por ciclo,
  índice único parcial). CHECK garante exclusividade mútua entre os dois.
- **`sessoes_resposta`** (planejada, item 6 em andamento): sessão temporária
  pós-confirmação de CPF, sem FK para o conteúdo da resposta.
- **Resposta anônima de clima** (planejada, item 6 em andamento): tabela
  separada de `respostas`/`itens_resposta` do fluxo 360, sem nenhuma FK de
  identidade.

## 7. Status atual do MVP

| Item | Status |
|---|---|
| 1. Auth e papéis (admin/gestor_rh via Supabase Auth) | ✅ Concluído |
| 2. Cadastro de colaboradores/equipes | ✅ Concluído |
| 3. Construtor de pesquisas (4 tipos de pergunta + tipo de pesquisa) | ✅ Concluído |
| 4. Ciclos de avaliação 360 (motor de relacionamentos) | ✅ Concluído |
| 5. Envios e acompanhamento (manual, sem automação) | ✅ Concluído |
| 6. Coleta de respostas (token + CPF, público) | 🔄 Em implementação |
| 7. Análise básica por avaliado | ⏳ Pendente |
| Simular pesquisa (preview) | ⏳ Pendente (depende do item 6) |

## 8. O que NÃO muda desde a v3

Single-tenant, criação manual de pesquisa (sem IA/templates), regra de
anonimização de pares/subordinado no 360 (mínimo de respondentes
configurável por ciclo), arquitetura de service role key para o fluxo
público (nunca RLS de sessão para colaborador comum).
