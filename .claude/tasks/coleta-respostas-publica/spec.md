# Spec: Coleta pública de respostas via `/responder/:token`

## 1. Resumo do pedido

Implementar o fluxo público (sem login) de resposta a uma pesquisa, cobrindo
os dois tipos de pesquisa hoje suportados:

- `avaliacao_360`: o link do envio é individual (1 envio por
  `relacionamento_avaliacao`, `envios_pesquisa.relacionamento_id`
  preenchido).
- `clima_geral`: o link é único por ciclo (`envios_pesquisa.ciclo_id`
  preenchido, `relacionamento_id` nulo), compartilhado entre todos os
  `ciclo_participantes` daquele ciclo.

O fluxo, nos dois casos: acessar `/responder/:token` → confirmar CPF →
responder o formulário (páginas/perguntas da pesquisa vinculada) → enviar.
Esta é a peça que faltava para fechar o item 6 do roadmap
(`docs/brief_avaliacao360_v4.md`, seção 7) e desbloquear o item 7 (Análise
básica por avaliado) e a futura "Simular pesquisa".

Esta spec cobre só a COLETA (escrita da resposta) — não cobre nenhuma tela ou
endpoint de leitura/análise agregada de respostas já coletadas.

## 2. Decisões já fechadas pelo usuário (não reabrir)

### 2.1 Limite de 5 tentativas de CPF inválido, bloqueio permanente do link

Ao atingir 5 tentativas de CPF que não confere, o token/link fica bloqueado
com mensagem genérica ("Não foi possível confirmar seus dados. Procure o RH.")
— sem desbloqueio automático por tempo (fica para uma Fase 2, se necessário).
`envios_pesquisa.tentativas_cpf_invalidas`/`cpf_confirmado_em` já existem na
entidade (`backend/src/modules/envios-pesquisa/envio-pesquisa.entity.ts`) e
nunca foram escritos por nenhuma rota até agora — esta é a primeira
funcionalidade a escrevê-los.

**Consequência/risco a registrar explicitamente**: para `clima_geral`, o
contador `tentativas_cpf_invalidas` vive na linha ÚNICA de `envios_pesquisa`
da campanha, compartilhada por todos os participantes do ciclo. Isso significa
que 5 tentativas erradas de CPF **de qualquer participante** (não
necessariamente a mesma pessoa) bloqueiam o link **para todo o ciclo**, não
só para quem errou. Este é um comportamento aceito implicitamente pela
decisão do usuário (que descreve "bloquear esse token/link", no singular, e
confirma que a coluna já existe tal como é, sem propor uma tabela de
tentativas por participante) — registrado aqui como risco operacional
conhecido, não como pergunta em aberto (a estrutura de dados já decidida não
permite granularidade por participante sem uma mudança de modelo que não foi
pedida). RH deve estar ciente de que um bloqueio de campanha de clima pode
exigir reset manual (via suporte/admin, mecanismo de desbloqueio fora de
escopo desta spec — ver "Perguntas em aberto").

### 2.2 Sessão temporária de resposta (`sessoes_resposta`)

Após confirmar CPF com sucesso (nos dois tipos de pesquisa), o backend emite
uma sessão temporária de curta duração, usada só para:
(a) autorizar a busca do formulário e o envio final da resposta;
(b) no caso de `clima_geral`, saber qual `ciclo_participante` marcar como
respondido (`respondeu_em`), sem que essa informação chegue à tabela de
resposta.

**Garantia estrutural inegociável**: a tabela de resposta do fluxo de clima
NUNCA é referenciada por `sessoes_resposta` (nem o inverso a partir da tabela
de resposta) — a separação entre "quem confirmou e vai responder" (sessão) e
"o que foi respondido" (tabela de resposta anônima) é o que garante o
anonimato, mesmo para quem tem acesso direto ao banco (admin/gestor_rh via
Supabase, ou um `DUMP` completo do banco).

### 2.3 Componentes de resposta dos 4 tipos de pergunta

**Já implementados integralmente** — achado desta spec, não pendência:

- `frontend/src/components/perguntas/PerguntaLikert/PerguntaLikertResposta.tsx`
- `frontend/src/components/perguntas/PerguntaTextoAberto/PerguntaTextoAbertoResposta.tsx`
- `frontend/src/components/perguntas/PerguntaMatriz/PerguntaMatrizResposta.tsx`
- `frontend/src/components/perguntas/PerguntaPessoa/PerguntaPessoaResposta.tsx`

Todos seguem exatamente o padrão da skill `frontend-componente-pergunta`
(props `valor`/`onChange`, nunca chamam API diretamente, tratam `obrigatoria`
via label com `*`) e já persistem o shape de `valor` documentado em
`docs/schema_avaliacao360_pt_v2.sql` (`{ nota }`, `{ texto }`,
`{ notas: { [competenciaId]: nota } }`, `{ colaboradorId }`).
`frontend/src/components/perguntas/validacaoPergunta.ts` também já contém
`likertRespostaValida`/`textoAbertoRespostaValida`/`matrizRespostaValida`/
`pessoaRespostaValida`, com comentário explícito de que foram escritas para
"o futuro formulário público de resposta".

**O que falta construir não são os componentes de resposta em si**, e sim:
(a) a página/formulário pai que orquestra confirmação de CPF → carregamento
do formulário → renderização em lista desses componentes já existentes →
validação de obrigatoriedade no envio → chamada de API; (b) para `pessoa`,
resolver de onde vem a lista `opcoes: ColaboradorOpcao[]` que o componente
espera receber via prop (ver "Perguntas em aberto" nº 3 — o componente já
está pronto para recebê-la, só falta a API que a monta). O planejamento de
frontend deve tratar isso como "construir o fluxo/página", não "construir os
4 componentes de tipo de pergunta" (já feito).

### 2.4 Reenvio bloqueado

- `avaliacao_360`: se já existe `respostas` para aquele `envio_id` (unicidade
  garantida por `respostas.envio_id UNIQUE`), acessar o link de novo mostra
  "Você já respondeu esta pesquisa." sem reabrir o formulário — checável sem
  precisar de CPF, direto pelo token (o link já identifica 1 pessoa).
- `clima_geral`: só é possível saber "esta pessoa já respondeu" depois de
  confirmar o CPF (o link é compartilhado, não identifica ninguém sozinho) —
  checagem contra `ciclo_participantes.respondeu_em` do participante
  encontrado, feita dentro do próprio passo de confirmação de CPF (ver
  "Contrato de API").

### 2.5 Estados de erro distintos, cada um com mensagem própria

Cinco estados nomeados (mais os dois de 2.1/2.4 acima), detalhados na seção
"Contrato de API": link inválido; ciclo/pesquisa não mais ativos; envio
expirado; bloqueado por excesso de tentativas; já respondido.

## 3. Fluxo por tipo de pesquisa

### 3.1 `avaliacao_360`

1. Colaborador acessa `/responder/:token` (`token` = `envios_pesquisa.
   token_acesso`, um UUID já gerado pelo Postgres na criação do envio).
2. Frontend consulta o estado do token (sem CPF ainda) — se qualquer estado
   terminal (link inválido / bloqueado / inativo / expirado / já respondido)
   já pode ser determinado só pelo token (todos podem, neste caso, porque o
   envio já identifica uma única pessoa/relacionamento), mostra a tela de
   erro correspondente e para.
3. Caso contrário, mostra o formulário de confirmação de CPF. O CPF
   informado deve bater com `colaboradores.cpf` do **avaliador** do
   relacionamento (`relacionamentos_avaliacao.avaliador_id`) daquele envio.
4. CPF confere → emite `sessoes_resposta` (expira em ~45 min, ver "Perguntas
   em aberto" nº 5) vinculada a este `envio_id`; incrementa
   `cpf_confirmado_em` **apenas se ainda estiver `null`** (primeira
   confirmação; ver nota abaixo).
5. Frontend busca o formulário (páginas + perguntas da pesquisa vinculada,
   com competências resolvidas para `matriz` e opções resolvidas para
   `pessoa`) usando a sessão.
6. Colaborador responde e envia. Backend valida obrigatoriedade, cria 1 linha
   em `respostas` (`envio_id`) + N linhas em `itens_resposta` (uma por
   pergunta respondida), marca `envios_pesquisa.status = 'concluido'` e
   `concluido_em = now()`, invalida a sessão (uso único).
7. **Identidade preservada por design**: `avaliador_id`/`relacionamento_id`
   ficam gravados normalmente na cadeia `respostas → envios_pesquisa →
   relacionamentos_avaliacao` — a coleta NUNCA pré-anonimiza. A anonimização
   de `pares`/`subordinado` é uma regra de LEITURA, aplicada só quando a
   futura funcionalidade de análise consultar `respostas_identificadas`/
   `respostas_pares_agregadas` (ou equivalente em TypeScript, por
   `backend-anonimizacao-respostas`). Nenhuma parte desta feature de coleta
   deve tentar ocultar `avaliador_id` na escrita.

### 3.2 `clima_geral`

1. Colaborador acessa `/responder/:token` (`token` = `envios_pesquisa.
   token_acesso` da linha única de campanha do ciclo).
2. Frontend consulta o estado do token — aqui só os estados que NÃO dependem
   de identidade podem ser resolvidos sem CPF: link inválido, bloqueado
   (tentativas excedidas), ciclo/pesquisa inativos, envio expirado. "Já
   respondido" NÃO pode ser determinado nesta etapa (o link não identifica
   ninguém sozinho).
3. Se nenhum desses, mostra a tela de confirmação de CPF. O CPF é conferido
   contra os `colaboradores` vinculados a `ciclo_participantes` daquele
   ciclo (`ciclo_participantes.ciclo_id` = `envios_pesquisa.ciclo_id`).
4. CPF não encontra nenhum participante → erro genérico de CPF (mesmo
   tratamento de tentativa inválida da seção 2.1).
5. CPF encontra um participante:
   - Se `ciclo_participantes.respondeu_em` já preenchido → estado "já
     respondido", mostrado só agora (depois do CPF confirmado).
   - Senão, emite `sessoes_resposta` referenciando `envio_id` (da campanha)
     **e** `ciclo_participante_id` (para saber quem marcar depois) — esta é
     a ÚNICA ponte entre identidade e a intenção de responder; nunca chega
     à tabela de resposta em si.
6. Frontend busca o formulário (mesma pesquisa vinculada ao ciclo,
   `configuracao.filtro_relacionamento`/tipo `pessoa` não se aplica aqui —
   pesquisas `clima_geral` já bloqueiam a criação de perguntas tipo `pessoa`
   com `422` no construtor, então o formulário de clima nunca deveria conter
   esse tipo).
7. Colaborador responde e envia. Backend valida obrigatoriedade, cria 1
   linha na tabela de resposta anônima do clima (ver "Modelo de dados") — **
   sem nenhuma FK de identidade** — e marca `ciclo_participantes.
   respondeu_em = now()` usando o `ciclo_participante_id` da SESSÃO (nunca da
   resposta). Invalida a sessão (uso único).
8. **Anonimato estrutural, não uma regra de leitura**: como a tabela de
   resposta do clima nunca teve `colaborador_id`/`sessão_id`/`envio_id`
   preenchidos, não existe query possível (nem para admin/gestor_rh, nem
   direto no Postgres) que cruze "quem respondeu" com "o que foi
   respondido". Isso é fundamentalmente diferente da anonimização de
   `pares`/`subordinado` do 360 (que é uma política de leitura sobre dados
   que existem identificados) — aqui a identidade simplesmente nunca é
   persistida junto da resposta.
9. **Envio da campanha não é "concluído" por uma resposta individual**: como
   o mesmo `envios_pesquisa` (campanha) é compartilhado por todos os
   participantes, uma resposta de UM participante não deve transicionar
   `envios_pesquisa.status` para `concluido` nem preencher `concluido_em`
   (isso encerraria a campanha para todo mundo). Ver decisão recomendada na
   seção "Perguntas em aberto" nº 1.

## 4. Estados de erro (nomes de código sugeridos, usados no contrato de API)

| Estado | Quando | HTTP | Código sugerido |
|---|---|---|---|
| Link inválido | token não corresponde a nenhum `envios_pesquisa.token_acesso` | 404 | `LINK_INVALIDO` |
| Bloqueado por tentativas | `tentativas_cpf_invalidas >= 5` | 403 | `BLOQUEADO_TENTATIVAS_CPF` |
| Ciclo/pesquisa inativos | `pesquisas.status != 'publicada'` OU `ciclos_avaliacao.status != 'ativo'` | 409 | `CICLO_OU_PESQUISA_INATIVOS` |
| Envio expirado | `envios_pesquisa.status == 'expirado'` | 410 | `ENVIO_EXPIRADO` |
| Já respondido | 360: `envios_pesquisa.status == 'concluido'`. Clima: `ciclo_participantes.respondeu_em != null` (só verificável pós-CPF) | 409 | `JA_RESPONDIDO` |
| CPF não confere | CPF informado não bate com o avaliador (360) ou nenhum participante do ciclo (clima) | 422 | `CPF_NAO_CONFERE` |
| Sessão inválida/expirada/usada | erros equivalentes no passo de formulário/envio | 404/410/409 | `SESSAO_INVALIDA`/`SESSAO_EXPIRADA`/`SESSAO_JA_UTILIZADA` |
| Resposta incompleta | pergunta obrigatória sem valor no envio final | 422 | `RESPOSTA_INCOMPLETA` |

**Ordem de checagem recomendada** (aplicada tanto no endpoint de status
quanto no de confirmação de CPF, para consistência): (1) token existe? (2)
bloqueado por tentativas? (3) ciclo/pesquisa ativos? (4) envio expirado? (5)
avaliação 360: já respondido? (checável sem CPF) — clima: adiado para depois
do match de CPF. (6) CPF confere?

## 5. Recorte backend vs frontend

### Backend (`backend/`)

- Migration nova (não editar as 3 migrations do módulo `envios-pesquisa`
  já fechadas — mesma regra de sempre do projeto): cria `sessoes_resposta`,
  `respostas`, `itens_resposta` e a tabela anônima de clima (ver "Modelo de
  dados"). Nenhuma migration desta feature roda contra banco real sem
  confirmação explícita do usuário.
- Rotas públicas novas, SEM `autenticar` (nenhum JWT do Supabase — o
  colaborador comum não tem conta), usando a service role key
  (`backend/src/lib/supabaseAdmin.ts`) só se necessário para algo além do
  Postgres via TypeORM (provavelmente nada aqui, já que toda leitura/escrita
  é via TypeORM/`AppDataSource`, não via cliente Supabase) — validação de
  token/CPF inteiramente manual na camada de serviço.
- Reaproveita entidades existentes só para leitura: `EnvioPesquisa`,
  `RelacionamentoAvaliacao`, `CicloParticipante`, `CicloAvaliacao`,
  `Pesquisa`, `PaginaPesquisa`, `Pergunta`, `PerguntaCompetencia`,
  `Colaborador`.
- Sugestão de organização de módulo para o `planejamento-backend` avaliar
  (não é mandato desta spec): um módulo novo dedicado à coleta pública (ex.
  `backend/src/modules/coleta-respostas/`), contendo as entidades
  `SessaoResposta`, `Resposta`, `ItemResposta`, `RespostaClima`,
  `ItemRespostaClima` + service/controller/module próprios, montado em
  `app.ts` sob um prefixo distinto (ex. `/api/publico`) para deixar visível,
  já na leitura de `app.ts`, que esse conjunto de rotas nunca passa por
  `autenticar`. Entidades `Resposta`/`ItemResposta` (360) podem
  eventualmente ser reaproveitadas pela futura "Análise básica por
  avaliado" (item 7 do roadmap) — vale ao menos considerar deixá-las num
  módulo que não sugira "só escrita pública" (ex. `respostas/` em vez de
  dentro de `coleta-respostas/`), decisão final cabe ao planejamento.

### Frontend (`frontend/`)

- Nova página pública, rota `/responder/:token` em `frontend/src/App.tsx`,
  **fora** de qualquer `RotaProtegida` (sem guard de papel — rota
  verdadeiramente pública, diferente de todas as rotas existentes hoje).
- Máquina de estados da página: carregando status → tela de erro terminal
  (uma por estado da seção 4) OU tela de confirmação de CPF → carregando
  formulário → formulário (lista de perguntas usando os componentes de
  resposta já existentes, agrupadas por página com navegação entre páginas
  ou rolagem única — a decidir no planejamento) → enviando → tela de
  sucesso.
- Reaproveita CPF: `frontend/src/utils/cpf.ts`
  (`formatarCpf`/`normalizarCpf`/`cpfValido`) já existe e cobre máscara +
  normalização + validação client-side de gate de UX — mesmo padrão já usado
  em `ColaboradorFormPage`. Não criar um novo utilitário de CPF.
- Reaproveita os 4 componentes de resposta (seção 2.3) e as funções de
  `validacaoPergunta.ts` já existentes para validar obrigatoriedade antes de
  habilitar o botão de envio.
- Novo tipo/serviço para consumir os 4 endpoints públicos (ver "Contrato de
  API") — client HTTP simples, sem `Authorization` header (diferente de
  `apiFetch` usado nas rotas autenticadas, se este já injeta o token
  automaticamente; conferir e, se precisar, criar uma variante pública ou um
  parâmetro para omitir o header).
- Sem alteração em telas existentes (`CicloDetalhePage` continua só exibindo
  o link, sem mudança de contrato — o `link` já apontava para
  `/responder/:token` desde a task anterior).

## 6. Contrato de API sugerido

Prefixo sugerido: `/api/publico` (nunca atrás de `autenticar`).

### 6.1 `GET /api/publico/envios/:token/status`

Checagem de estado que não depende de CPF (ver ordem de checagem, seção 4).

- 200: `{ estado: 'aguardando_cpf' }`
- 404 `LINK_INVALIDO` / 403 `BLOQUEADO_TENTATIVAS_CPF` / 409
  `CICLO_OU_PESQUISA_INATIVOS` / 410 `ENVIO_EXPIRADO` / 409 `JA_RESPONDIDO`
  (só possível aqui para `avaliacao_360`; para `clima_geral` este endpoint
  nunca retorna `JA_RESPONDIDO`).

### 6.2 `POST /api/publico/envios/:token/confirmar-cpf`

Body: `{ cpf: string }` (aceita mascarado ou só dígitos; backend normaliza
com a mesma lógica de `normalizarCpf`, ou equivalente em TS puro sem
depender do pacote do frontend).

- 200: `{ sessaoToken: string; expiraEm: string; tipoPesquisa: 'avaliacao_360' | 'clima_geral' }`
- Mesmos erros terminais do status (404/403/409/410), reavaliados aqui
  (o estado pode ter mudado entre as duas chamadas).
- 422 `CPF_NAO_CONFERE`: CPF não bate com o avaliador (360) ou não encontra
  nenhum participante do ciclo com aquele CPF (clima). Incrementa
  `tentativas_cpf_invalidas`. Se o incremento atingir 5, responder
  diretamente `403 BLOQUEADO_TENTATIVAS_CPF` nesta mesma chamada (em vez de
  `422`), para o frontend já mostrar a mensagem final.
- 409 `JA_RESPONDIDO`: só depois do CPF ter batido — `clima_geral`
  (`ciclo_participantes.respondeu_em != null`) ou, redundantemente,
  `avaliacao_360` (mesmo caso já coberto no endpoint de status).

### 6.3 `GET /api/publico/sessoes/:sessaoToken/formulario`

- 200:
  ```json
  {
    "pesquisa": { "titulo": "...", "mensagemBoasVindas": "...", "logoUrl": "..." },
    "paginas": [
      {
        "id": "...", "ordem": 0, "titulo": "...",
        "perguntas": [
          {
            "id": "...", "tipo": "likert", "enunciado": "...",
            "obrigatoria": true, "ordem": 0,
            "configuracao": { "niveis": 5, "rotulos": ["..."] }
          },
          {
            "id": "...", "tipo": "matriz", "enunciado": "...",
            "obrigatoria": true, "ordem": 1,
            "configuracao": { "niveis": 5, "rotulos": ["..."] },
            "competencias": [{ "id": "...", "nome": "..." }]
          },
          {
            "id": "...", "tipo": "pessoa", "enunciado": "...",
            "obrigatoria": false, "ordem": 2,
            "configuracao": { "filtroRelacionamento": ["pares"] },
            "opcoesPessoa": [{ "id": "...", "nomeCompleto": "..." }]
          }
        ]
      }
    ]
  }
  ```
- 404 `SESSAO_INVALIDA` / 410 `SESSAO_EXPIRADA` / 409 `SESSAO_JA_UTILIZADA`.

### 6.4 `POST /api/publico/sessoes/:sessaoToken/respostas`

Body: `{ "itens": [{ "perguntaId": "...", "valor": { /* shape por tipo, ver docs/schema_avaliacao360_pt_v2.sql */ } }] }`

- 200: `{ "sucesso": true }`
- 404 `SESSAO_INVALIDA` / 410 `SESSAO_EXPIRADA` / 409 `SESSAO_JA_UTILIZADA`
- 422 `RESPOSTA_INCOMPLETA`: pergunta obrigatória sem item correspondente ou
  com `valor` inválido para o tipo.
- 422 `PERGUNTA_FORA_DA_PESQUISA`: `perguntaId` não pertence à pesquisa
  vinculada à sessão (defesa contra payload forjado).

Nenhuma rota desta feature aceita `Authorization: Bearer` nem passa por
`autenticar` — autorização é inteiramente via posse do `token`/`sessaoToken`
(capability tokens) + CPF.

## 7. Modelo de dados novo

### 7.1 `sessoes_resposta` (nova)

```
id                    uuid PK default gen_random_uuid()
token                 uuid UNIQUE default gen_random_uuid()   -- o "sessaoToken" devolvido ao cliente
envio_id              uuid NOT NULL REFERENCES envios_pesquisa(id) ON DELETE CASCADE
ciclo_participante_id uuid NULL REFERENCES ciclo_participantes(id) ON DELETE CASCADE
                       -- preenchido só para clima_geral; NULL para avaliacao_360
tipo_pesquisa         tipo_pesquisa NOT NULL   -- denormalizado, evita join extra pra decidir o branch de envio
expira_em             timestamptz NOT NULL
usada_em              timestamptz NULL          -- marca consumo (resposta já enviada), impede reuso
criada_em             timestamptz NOT NULL default now()
```

Nunca referenciada por `respostas`/`itens_resposta` nem pela tabela anônima
de clima (a referência é sempre no sentido sessão → identidade, nunca
identidade/sessão → conteúdo de resposta).

### 7.2 `respostas` / `itens_resposta` (avaliação 360 — greenfield, seguir `docs/schema_avaliacao360_pt_v2.sql` literalmente, sem divergência conhecida)

```
respostas (
  id            uuid PK default gen_random_uuid()
  envio_id      uuid NOT NULL UNIQUE REFERENCES envios_pesquisa(id) ON DELETE CASCADE
  respondido_em timestamptz NOT NULL default now()
)

itens_resposta (
  id            uuid PK default gen_random_uuid()
  resposta_id   uuid NOT NULL REFERENCES respostas(id) ON DELETE CASCADE
  pergunta_id   uuid NOT NULL REFERENCES perguntas(id) ON DELETE CASCADE
  valor         jsonb NOT NULL default '{}'
  criado_em     timestamptz NOT NULL default now()
  UNIQUE (resposta_id, pergunta_id)
)
```

### 7.3 Tabela de resposta anônima de clima (nova, sem equivalente no schema doc — nome proposto)

Nome sugerido: **`respostas_clima`** + **`itens_resposta_clima`** (espelha o
par `respostas`/`itens_resposta`, deixando claro visualmente que é a
contraparte anônima). Alternativas descartadas: `respostas_anonimas`
(menos específico, pode ser confundido com a agregação de pares/subordinado
do 360, que é "anônima" por outro motivo) — nome final confirmável no
planejamento (ver "Perguntas em aberto" nº 4).

```
respostas_clima (
  id            uuid PK default gen_random_uuid()
  pesquisa_id   uuid NOT NULL REFERENCES pesquisas(id) ON DELETE CASCADE
  ciclo_id      uuid NOT NULL REFERENCES ciclos_avaliacao(id) ON DELETE CASCADE
  respondido_em timestamptz NOT NULL default now()
  -- SEM colaborador_id, SEM sessao_id, SEM envio_id — nenhuma FK de identidade.
)

itens_resposta_clima (
  id                  uuid PK default gen_random_uuid()
  resposta_clima_id   uuid NOT NULL REFERENCES respostas_clima(id) ON DELETE CASCADE
  pergunta_id         uuid NOT NULL REFERENCES perguntas(id) ON DELETE CASCADE
  valor               jsonb NOT NULL default '{}'
  criado_em           timestamptz NOT NULL default now()
  UNIQUE (resposta_clima_id, pergunta_id)
)
```

`ciclo_id` é redundante com `pesquisa_id` (a pesquisa já pertence a um só
ciclo via `pesquisas.ciclo_id`), mas incluído explicitamente para permitir
agregação futura sem precisar de join com `pesquisas` — decisão de
conveniência, não estrutural; o revisor de backend pode questionar se vale a
pena manter os dois campos.

## 8. Regra de anonimização — aplicação nesta etapa (reforço explícito)

- **360**: escrita SEMPRE identificada (`avaliador_id`/`relacionamento_id`
  preservados na cadeia). A regra de "nunca expor `pares`/`subordinado`
  identificado ao avaliado, só agregado, só a partir de
  `minimo_respostas_pares`" é uma regra de LEITURA que esta feature não
  implementa nem deve simular/antecipar. Nenhum endpoint desta spec expõe
  `itens_resposta` de volta para ninguém — só cria.
- **Clima**: anonimato ESTRUTURAL. A ausência de qualquer FK de identidade em
  `respostas_clima`/`itens_resposta_clima` é a própria garantia — não
  depende de view, de RLS, nem de checagem de papel. Nenhuma rota, presente
  ou futura, deve adicionar uma coluna de identidade a essas duas tabelas
  "para facilitar uma auditoria" ou propósito semelhante — isso quebraria a
  garantia de design pedida explicitamente pelo usuário.
- Nenhuma rota desta feature é acessível por `colaborador` autenticado nem
  por `admin`/`gestor_rh` autenticado — todas são públicas por token/CPF,
  sem `autenticar`. Não há checagem de papel nesta feature porque não há
  conceito de "papel" nela (quem acessa não tem conta).

## 9. Perguntas em aberto (não bloqueiam o planejamento — recomendação registrada para cada uma)

1. **`envios_pesquisa.status`/`concluido_em` no fluxo de clima, já que o
   envio é compartilhado.** Recomendação: NUNCA transicionar para
   `concluido`/preencher `concluido_em` automaticamente a partir de uma
   resposta individual de clima — esses dois campos continuam
   exclusivamente sob controle manual do admin/gestor_rh
   (`marcar-enviado`/`registrar-lembrete`/`expirar`, já implementados). O
   progresso de quem respondeu fica só em `ciclo_participantes.respondeu_em`
   (já existente, ver `.claude/tasks/envios-clima-link-unico/`).
2. **`cpf_confirmado_em` no fluxo de clima, já que múltiplas pessoas
   confirmam CPF contra a mesma linha de `envios_pesquisa`.**
   Recomendação: gravar apenas na PRIMEIRA confirmação bem-sucedida
   (`WHERE cpf_confirmado_em IS NULL`), como um indicador de "a campanha
   começou a ser respondida por alguém", não como controle por pessoa (esse
   controle por pessoa já existe via `ciclo_participantes.respondeu_em`).
   Alternativa (não recomendada): não gravar nunca para clima, deixando o
   campo `null` para sempre nesse braço — mais simples, mas perde o sinal
   "a campanha já teve alguém confirmando CPF". A escolha final cabe ao
   planejamento de backend.
3. **Origem da lista `opcoes`/`opcoesPessoa` para pergunta tipo `pessoa`.**
   O componente de resposta já espera receber `opcoes: ColaboradorOpcao[]`
   via prop, mas a regra de "quem entra nessa lista" não está definida em
   nenhum artefato lido (`configuracao.filtroRelacionamento` guarda TIPOS de
   relacionamento, ex. `["pares"]`, mas não diz "em relação a quem").
   Recomendação: resolver em relação ao AVALIADO do relacionamento do
   respondente (`relacionamentos_avaliacao.avaliado_id` do envio atual),
   filtrando colaboradores que têm, no mesmo ciclo, um
   `relacionamentos_avaliacao` com aquele `avaliado_id` e
   `tipo_relacionamento` presente em `configuracao.filtroRelacionamento` —
   ou seja, "escolha entre os pares/subordinados/etc. da pessoa que você
   está avaliando". Como perguntas tipo `pessoa` são bloqueadas para
   `clima_geral` (422 no construtor), esta resolução só precisa existir para
   `avaliacao_360`.
4. **Nome definitivo da tabela anônima de clima** (`respostas_clima`/
   `itens_resposta_clima` proposto na seção 7.3) — trivial de renomear no
   planejamento se o usuário/backend-developer preferir outro nome (ex.
   `respostas_clima_geral`).
5. **TTL exato da sessão dentro da faixa 30–60 min pedida.** Recomendação:
   45 minutos, fixo em constante no service (ou variável de ambiente
   opcional, ex. `SESSAO_RESPOSTA_TTL_MINUTOS`, seguindo o padrão de
   variáveis opcionais com default documentado em `backend/src/config/
   env.ts`) — não crítico, ajustável sem migração de schema.
6. **Validação de obrigatoriedade: por página ou só no envio final?**
   Recomendação: só no envio final (`POST .../respostas`), validando TODAS
   as perguntas obrigatórias da pesquisa de uma vez — mais simples para o
   MVP, e evita ter que decidir uma UX de "página bloqueada" sem pedido
   explícito. Se o formulário tiver múltiplas páginas com navegação, o
   bloqueio de avançar página pode ficar só no frontend como UX (soft),
   mas a validação autoritativa (hard) é sempre o envio final no backend —
   mesmo padrão já usado no resto do projeto ("a validação autoritativa é
   sempre do backend", comentário em `frontend/src/utils/cpf.ts`).
7. **Granularidade de salvamento parcial (rascunho entre páginas).**
   Recomendação: NÃO implementar salvamento parcial nesta primeira versão —
   um único `POST` final com todos os itens, mesmo se o formulário tiver
   várias páginas no frontend (navegação client-side, sem round-trip por
   página). Simplifica o modelo de sessão (não precisa de estado
   intermediário de resposta) e evita ter que decidir o que fazer com
   itens parciais de uma sessão expirada.
8. **Formato de exibição do CPF na tela pública.** Recomendação: reaproveitar
   `frontend/src/utils/cpf.ts` tal qual (máscara `000.000.000-00` durante a
   digitação, `normalizarCpf` antes de enviar à API, `cpfValido` como gate
   de UX antes de habilitar o botão) — mesmo padrão já usado em
   `ColaboradorFormPage`, sem criar um novo utilitário.
9. **Mecanismo de desbloqueio manual de um envio com `tentativas_cpf_invalidas
   >= 5`** (mencionado como risco na seção 2.1). Fora de escopo explícito
   desta spec (a decisão do usuário foi "sem desbloqueio automático,
   Fase 2 se precisar") — mas o planejamento de backend deve pelo menos
   confirmar se existe hoje qualquer caminho manual (ex. um `UPDATE` direto
   via suporte, ou reaproveitar uma ação futura de "reenviar"/"resetar
   envio") ou se isso fica deliberadamente sem solução até uma Fase 2.
10. **Cliente HTTP público no frontend** — se `apiFetch`
    (`frontend/src/lib/apiClient.ts`, não lido nesta spec) sempre injeta
    `Authorization`, esta feature precisa de uma variante sem esse header
    (ou um parâmetro para omiti-lo). Sinalizado aqui para o
    `planejamento-frontend` conferir o arquivo antes de decidir se
    reaproveita ou cria um client dedicado.
