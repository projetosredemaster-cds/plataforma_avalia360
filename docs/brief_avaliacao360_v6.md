Contexto do projeto

Plataforma de Avaliação 360° "avalia360" (empresa Rede Master), single-tenant. Repositório local em plataforma_avalia360/ (backend/ e frontend/).

Stack: React + Tailwind CSS + Material UI (MUI tem prioridade em conflitos de estilo) + fonte Figtree Light · Node.js + TypeORM · Supabase (Postgres + Auth + Storage).

Paleta: primary #2E5AA7 (Amalfi Tile), secondary #FFA62B (Citrus Zest), info #86C5FF (Sea Breeze), fundo suave #F8E6A0 (Cream Gelato). Estilo: cantos bem arredondados, botões/chips em pílula, cores suaves em chips/alerts.

Como trabalhamos (importante pra manter na conversa nova)

Eu não tenho acesso ao ambiente do usuário (VSCode, banco, terminal). O fluxo é: usuário roda os agentes do Claude Code localmente, me manda prints/erros/resultados, eu decido o que fazer e devolvo prompts prontos pra colar no Claude Code.
Economia de token é prioridade constante: ajustes pontuais pulam planejamento/codereview ("ajuste pontual"); só uso o pipeline completo pra funcionalidades novas maiores; test-engineer fica reservado pra rodadas de final de dia, não por feature.
Erro de código: peço o texto exato do erro (console/terminal) antes de mandar prompt.
Erro de configuração (env, DNS, dependência): resolvo com passos manuais, sem gastar prompt de agente.
REGRA DE MIGRATION (atualizada): o agente NUNCA cria arquivo de migration (.ts) no repositório — nem isso. Só entrega o SQL puro em texto (chat/markdown). O usuário roda esse SQL manualmente no SQL Editor do Supabase e decide se/quando formalizar um arquivo de migration depois, se quiser. Antes de gerar o SQL, sempre confirmar a estrutura real da coluna/tipo consultando information_schema (evita chutar entre enum nativo, CHECK constraint ou só validação em TypeScript).
Decisão de arquitetura ambígua → pergunto com opções antes de mandar prompt.
Nomenclatura do banco/domínio em português.
Brief documentado em arquivos versionados (agora em v6) — atualizo quando há mudança grande de escopo.
"Token" tem dois sentidos distintos na conversa: limite de uso do plano Claude.ai (reinicia periodicamente, visível em Configurações → Uso) vs. orçamento de tokens de uma sessão do Claude Code local. Sempre confirmar qual dos dois antes de dar orientação sobre economizar.

Arquitetura de agentes (Claude Code)

Pipeline customizado em .claude/agents/: orquestrador (opus, só delega) → spec (esclarece ambiguidade) → planejamento-backend/frontend (escrevem plano em .claude/tasks/<slug>/) → backend-developer/frontend-developer (implementam, restritos a apps/api ou apps/web) → backend-codereviewer/frontend-codereviewer (só revisam, não corrigem) → test-engineer (deferido). Skills em .claude/skills/: backend-modulo-crud, backend-anonimizacao-respostas, frontend-componente-pergunta.

Modelo de dados e regras de negócio principais

Acesso: só admin/gestor_rh têm login (Supabase Auth, via colaboradores.usuario_auth_id). colaborador comum não tem conta — acessa pesquisa só via link + confirmação de CPF. E-mail obrigatório só pra admin/gestor_rh; CPF obrigatório pra todos.
Colaboradores: campo cargo é select de opções fixas; campo eh_gestor (checkbox, independente do papel de acesso) filtra quem aparece como opção de "Gestor" no cadastro.
Tipos de pesquisa: avaliacao_360 (padrão) vs clima_geral (imutável após criada). Em clima_geral, o tipo de pergunta "Pessoa" é bloqueado.
Tipos de pergunta (5 no total):
- likert, texto_aberto, matriz (competências via tabela perguntas_competencias), pessoa (filtros: pares, subordinado, externo, todos_gestores — "gestor" foi removido por ser sempre singular) — os 4 originais do MVP.
- caixa_selecao (5º tipo, implementado depois): admin define uma lista de opções de texto ao criar a pergunta; colaborador marca quantas opções quiser (sem mínimo/máximo configurável nesta v1); disponível em avaliacao_360 e clima_geral. Armazenamento: perguntas.configuracao.opcoes (string[]); resposta em itens_resposta.valor = { opcoes: string[] } (múltipla seleção possível).
- Ideia avaliada e descartada por ora: generalizar em "seleção única" (opções de texto customizadas, diferente de likert que é sempre escala numérica) + "múltipla escolha" como dois tipos separados — vetada pelo usuário ("esqueça isso por enquanto") por ser escopo grande demais (builder + fluxo público) para o valor imediato.
Ciclos: participantes selecionados manualmente (pessoa ou equipe). Campo tipos_relacionamento_gerados (text[]) permite escolher quais dos 4 tipos gerar na ativação (não precisa gerar todos sempre). Regra de pares = mesma equipe. Ativação exige pesquisa publicada vinculada; vínculo pesquisa↔ciclo só editável em rascunho (validado no backend). Para "Gestor avalia liderado" ser gerado, tanto o gestor quanto os colaboradores subordinados a ele precisam estar entre os participantes selecionados no ciclo — marcar eh_gestor no cadastro não é suficiente por si só.
Envios: sem automação de e-mail/WhatsApp — link copiado manualmente. 360 = um envio por relacionamento; clima_geral = um único envio compartilhado por ciclo.
Anonimização 360: respostas de pares/subordinado só aparecem agregadas ao avaliado, com mínimo de respondentes configurável (minimo_respostas_pares, default 3).
Anonimato clima: resposta gravada em tabela sem FK de identidade; rastreio de quem respondeu fica separado (ciclo_participantes.respondeu_em).
Campo anonimizar_respostas_pares (ciclos_avaliacao, boolean, default true): DECISÃO CRÍTICA — nunca deve funcionar como interruptor de bypass da anonimização, em nenhuma tela, para nenhum papel (nem admin). Foi removido do formulário de Ciclo (toggle editável virou texto informativo fixo); a coluna permanece no banco sem uso, sempre true, nunca lida por nenhuma feature de Análise.
Mínimo de respondentes (minimo_respostas_pares) só aceita número ÍMPAR maior que 1 (3, 5, 7...) — validado em frontend e backend.
Fluxo público /responder/:token: CPF com limite de 5 tentativas (com botão de desbloqueio manual pelo admin), sessão temporária pós-confirmação, reenvio bloqueado.
Login: split-screen com logo. Redesenhado visualmente (ver seção "Ajustes de UI" abaixo).
Menu lateral: grupos "Cadastro" (Colaboradores, Equipes), "Operação" (Pesquisas, Ciclos), "Análises" (Quantitativa/Qualitativa — detalhado abaixo), "Configurações" (fixo, sem submenu ainda).

Módulo Análise — status por tela

Regra de anonimização geral (mínimo de respondentes)
- minimo_respostas_pares (default 3) é reaproveitado também para clima_geral. Em clima_geral, o mínimo é avaliado POR CICLO INTEIRO — libera tudo ou bloqueia tudo, sem liberação parcial por pergunta/segmento. Em avaliacao_360, o gate é por avaliado + ciclo + tipo_relacionamento.
- RH/admin NUNCA têm bypass do gate, em nenhuma tela — decisão crítica repetida e verificada em cada feature nova do módulo.
- Relações 1:1 (autoavaliação, gestor avalia liderado, externo) sempre entram sem gate — não há terceiro a proteger.
- Limitação conhecida sem solução automática: o mínimo protege contra identificação estatística, não contra identificação pelo conteúdo do texto em si. Avaliações e Nuvem de Palavras exibem aviso disso ao usuário.

### Quantitativa

**Visão Geral** ✅ Implementada — painel-resumo do período selecionado (total de ciclos/respostas, distribuição de pesquisas por tipo, taxa de resposta média ponderada, tempo médio de resposta formatado em dias/horas/minutos). Sem exposição de resposta individual, sem gate de anonimização (dado 100% agregado). Filtro: período (de/ate) + cicloId opcional. Aceita cicloId via deep link do card de Ciclo. Cada métrica tem tooltip explicativo em linguagem simples. Botão "Limpar filtro" (só aparece quando algum filtro não está no padrão). Botão "Atualizar" manual.

**Ranking** ✅ Implementada — classifica avaliados individuais E equipes (toggle), duas notas separadas lado a lado (média likert, média matriz/competências — nunca combinadas), filtros por cargo e equipe (combináveis, AND). Ordenação padrão: maior nota primeiro, com empate explícito (RANK(), pula posição). Escala normalizada em percentual (0-100). SÓ FUNCIONA PARA avaliacao_360 — bloqueado estruturalmente para clima_geral (não há "avaliado" identificável em clima; erro 422 CICLO_NAO_E_AVALIACAO_360 se tentar). cicloId único obrigatório (diferente das outras telas do módulo, que aceitam período+múltiplos ciclos). Regra de cálculo: gate aplicado por avaliado+ciclo+tipo antes de agregar (nunca sobre a nota consolidada); nota de equipe = média simples dos membros com nota calculável, com limiar próprio de mínimo 5 membros por métrica (maior que minimo_respostas_pares, mitiga inferência por subtração numa equipe pequena). Nunca expõe COUNT exato de respondentes/membros — só booleano dadosInsuficientes. Sem atalho no card do Ciclo (só acessível via menu).

**Resultados por Pergunta** ✅ Implementada — tela criada para preencher a lacuna que Ranking deixa (Ranking só mostra MÉDIA e só funciona em 360; esta tela mostra DISTRIBUIÇÃO — contagem de respostas por nível/opção — e funciona em AMBOS avaliacao_360 e clima_geral). Cobre likert, matriz e caixa_selecao (não cobre texto_aberto, coberto por Avaliações/Nuvem de Palavras; não cobre pessoa, reservado para futura Análise de Menções). Filtro: período+múltiplos ciclos (como Visão Geral), não cicloId único como Ranking. Para 360: distribuição separada por tipo de relacionamento, gate aplicado por avaliado+ciclo+tipo (mesmo padrão de Ranking, adaptado de "soma para média" para "contador por nível/opção"). Matriz mantém distribuição SEPARADA por competência (não agregada — agregar esconderia a informação que a tela existe pra mostrar). Caixa_selecao é multiseleção (soma de opções pode superestimar nº de respondentes — propriedade aceitável, mitiga risco). É A TELA MAIS ESTRITA do módulo: nunca expõe nem totalRespondentes/minimoNecessario (diferente de Avaliações) — só liberado (booleano) + motivo categórico. Tabelas de contagem com fundo azul claro (mesmo estilo das caixas de resposta de Avaliações). Botão "Atualizar" manual.

**Performance** ⏳ Pendente — não iniciada. Comparativo entre até 10 pesquisas simultâneas (envios, respostas, tempo médio ao longo do tempo).

**Análise de Menções** ⏳ Pendente — não iniciada. Ranking de quem mais foi citado/selecionado nas perguntas tipo Pessoa.

**Envios** ⏳ Pendente — não iniciada. Listagem de envios por ciclo com status e filtro por período.

### Qualitativa

**Avaliações** ✅ Implementada — lista respostas individuais de texto_aberto. Relações 1:1 sempre identificadas; pares/subordinado só agregado com mínimo atingido (por avaliado+ciclo+tipo); clima_geral com gate por ciclo inteiro, textos sem nenhuma atribuição. Ordem de exibição de textos liberados de pares/subordinado é reembaralhada (Fisher-Yates) a cada carregamento, sem numeração fixa. Corte de período aplicado tanto ao gate quanto aos textos exibidos (evita reidentificação por estreitamento de filtro de data). Reorganizada visualmente: agrupamento por Ciclo (Accordion retrátil, recolhido por padrão quando múltiplos ciclos) e dentro de cada ciclo por Pergunta (enunciado uma vez só, respostas listadas abaixo). Quebra de linha corrigida para textos longos sem espaço. Seletor de ciclo via dropdown (SeletorCiclo, lista só ciclos ativos/finalizados, com largura mínima consistente). Botão "Limpar filtro". Botão "Atualizar" manual. Aviso de limitação de anonimização por conteúdo visível na tela.

**Nuvem de Palavras** ✅ Implementada (Lista, Bolhas e TV Dash) — gerada a partir de texto_aberto liberado (mesma regra de gate de Avaliações — nunca busca texto de grupo bloqueado, só depois filtra). Stopwords em português removidas, mínimo 3 caracteres, top 50 palavras. Visualização Lista (barra de frequência) implementada primeiro; depois Bolhas (via biblioteca d3-cloud, escolhida por não ter peer-dependency de React — evita risco do react-wordcloud abandonado) e Modo TV Dash (botão que expande em tela cheia via Fullscreen API, sem auto-atualização, tipografia grande para exibição em TV/painel de escritório). Paleta de bolhas em escala de intensidade sobre matiz único (não cores alternadas, para não sugerir categorização inexistente). Ao selecionar um cicloId específico sem palavras suficientes, a tela distingue "bloqueado por mínimo de respondentes" de "sem dado" (campo motivoVazio) — só quando cicloId único está no filtro; com período/múltiplos ciclos, mensagem genérica. Métricas complementares (envios, respostas, tempo médio) reaproveitadas de Visão Geral. Barra de rolagem na lista de palavras. Sem atalho no card do Ciclo.

### Fase 2 do módulo (fora do MVP — maior custo/complexidade, dependem de IA)
- Insights e Relatórios — relatório estratégico + dashboard de emoção/sentimento/categoria + lista pesquisável de insights.
- Dashboard de Tags — CRUD de tags manuais primeiro, auto-tagueamento via IA depois.
- Sinalização via IA de comentários potencialmente identificáveis (mitigação da limitação de anonimização por conteúdo).

### Ranking-clima — ideia avaliada, não decidida
Como Ranking não cobre clima_geral, foram levantadas 3 opções para uma futura tela equivalente: (A) Ranking de Ciclos — comparar ciclos de clima entre si por satisfação agregada, sem mudança de schema; (B) Ranking por equipe em clima — exigiria capturar um campo novo (equipe) no momento da resposta, com regra de mínimo por equipe; (C) não fazer, focar em Nuvem de Palavras/Insights. Nenhuma opção foi escolhida ainda — Resultados por Pergunta cobriu parte dessa lacuna (funciona em clima), mas não é ranking por equipe.

Atalho de navegação — Visão Geral e Avaliações a partir do card do Ciclo

Cada card na listagem de Ciclos tem botões de atalho "Visão Geral" e "Avaliações" (com ícones — BarChartIcon e ForumIcon/ChatBubbleOutlineIcon — para dar destaque visual), abrindo a respectiva tela já filtrada por aquele ciclo específico (não por pesquisa — decisão fechada: atalhos vivem no card do Ciclo, nunca no card da Pesquisa, porque o recorte útil é "esta aplicação específica", não o histórico da pesquisa). Ranking, Resultados por Pergunta e Nuvem de Palavras não têm esse atalho — só acessíveis pelo menu lateral, com filtro de ciclo dentro da própria tela.

Regra de cálculo — Ranking (relações 1:1 vs. agregáveis)

O cálculo do Ranking separa a nota por tipo de relacionamento antes de agregar: relações agregáveis (pares, subordinado) só entram se atingirem minimo_respostas_pares (senão ficam de fora da composição, sinalizadas como "dados insuficientes", sem bloquear o resto); relações 1:1 sempre entram, sem mínimo. Mesmo princípio replicado em Resultados por Pergunta (gate por avaliado+ciclo+tipo, nunca por pergunta inteira).

Ajustes de UI implementados (fora do módulo Análise)

- Barra de progresso do ciclo (% de pesquisas/links concluídos, dentro e fora do detalhe do ciclo) — cada conclusão individual (relacionamento 360 ou participante de clima) conta como 1 unidade.
- Botão "Publicar" direto na listagem de Pesquisas (desabilitado com tooltip se regras não atendidas); após publicada, "Editar" vira "Ver detalhes".
- Botão "Ativar ciclo" direto na listagem de Ciclos (mesmo padrão de desabilitado+tooltip).
- Botão de atualizar manual + notificação de nova resposta dentro do detalhe do Ciclo (polling leve de 30s só de contagem, notificação visual+som reposicionada perto de "Participantes e envios"); badge visual (sem som) na listagem de Ciclos.
- Barra de rolagem em listas que crescem sem limite (participantes/relacionamentos gerados, envios) — virou convenção geral do projeto (registrar em qualquer lista de tamanho variável nova).
- Menu lateral "Análises" com submenu mais espaçoso/bonito e ícones por item.
- Login redesenhado: fundo com gradiente das cores da marca (substituindo o branco puro), ilustração da personagem com fundo removido (transparência real, processada e sem auréola residual), imagem maior e ancorada na borda esquerda/inferior do painel (efeito de "segurando a borda").
- Correção de bug: onAuthStateChange remontava toda a árvore de rotas protegidas a cada evento de rotina do Supabase (TOKEN_REFRESHED, SIGNED_IN reemitido no refoco da aba) — corrigido comparando id do usuário antes de disparar resolverColaborador(), e evitando o estado 'carregando' quando já existe colaborador resolvido.
- Validação de data em queries (analise.service.ts e ciclos-avaliacao.service.ts): corrigido rollover silencioso do JS Date para datas de calendário inválidas (ex: "2026-02-30"), agora rejeitado como 422 CAMPO_INVALIDO.

Pendências em aberto

- Testes automatizados (test-engineer) não rodados de forma abrangente — prioridade: anonimato do clima, limite de tentativas CPF, filtros da pergunta Pessoa, e os guard rails de anonimização do módulo Análise (Ranking, Resultados por Pergunta, Nuvem de Palavras já têm cenários de teste desenhados no planejamento, mas execução real fica para rodada de test-engineer).
- Migration de tipos_relacionamento_gerados — confirmar se já rodou.
- Script de seed + verificação automática dos filtros "Pessoa" — resultado ainda não voltou.
- Wallpaper decorativo (ilustrações em pessoas_png) — sem decisão de escopo final (a ilustração do login já foi resolvida à parte, com remoção de fundo).
- Domínio próprio no Resend (redemaster.com.br) — configuração DNS pendente (hoje usando Gmail SMTP, só pra dev).
- Tipo de relacionamento "Externo" sem fonte de dado implementada — fora de escopo por ora.
- Nomenclatura de minimo_respostas_pares: considerar renomear/comentar a coluna para refletir uso também em clima_geral (dívida técnica conhecida, não bloqueante).
- Pré-visualização de pesquisa não publicada: pipeline (spec/planejamento) iniciado — modo leitura (sem interação), perguntas tipo Pessoa mostram lista fictícia de exemplo, acesso via botão na listagem de Pesquisas (qualquer status). Aguardando resultado do planejamento/implementação.
- Inativar Pesquisa/Ciclo: pipeline (spec/planejamento) iniciado — botão "Inativar" só aparece após status "encerrada"/"encerrado", direto no card da listagem, sem abrir. Comportamento: soma da listagem padrão (soft-hide, dado preservado), reversível via botão "Ativar", precisa de filtro novo pra ver itens inativos. Requer nova coluna ativo (boolean, default true) em pesquisas e ciclos_avaliacao — SQL a ser gerado em texto conforme regra de migration atualizada. Aguardando resultado do planejamento/implementação.
- Botão "Atualizar" manual adicionado nas 5 telas do módulo Análise (Visão Geral, Ranking, Resultados por Pergunta, Avaliações, Nuvem de Palavras) — reexecuta a busca com os filtros atuais, sem resetá-los.
- Módulo Análise: Performance, Análise de Menções e Envios ainda não entraram em nenhuma rodada de planejamento — próximas candidatas quando o usuário quiser continuar o módulo.
- Ranking-clima (Opção A/B/C, ver seção acima) — decisão de produto ainda não tomada.
- Funcionalidade de cópia de resposta por e-mail (estilo Google Forms) foi avaliada e descartada por ora — depende do domínio Resend estar configurado e exigiria capturar e-mail do colaborador comum no fluxo público sem quebrar o anonimato do clima_geral.
- Tipos de pergunta "seleção única" (customizada) e "múltipla escolha" generalizados foram avaliados e descartados — usuário optou por implementar só caixa_selecao (que cobre a necessidade de múltipla escolha).
