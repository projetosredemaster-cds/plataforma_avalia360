Contexto do projeto

Plataforma de Avaliação 360° "avalia360" (empresa Rede Master), single-tenant. Repositório local em plataforma_avalia360/ (backend/ e frontend/).

Stack: React + Tailwind CSS + Material UI (MUI tem prioridade em conflitos de estilo) + fonte Figtree Light · Node.js + TypeORM · Supabase (Postgres + Auth + Storage).

Paleta: primary #2E5AA7 (Amalfi Tile), secondary #FFA62B (Citrus Zest), info #86C5FF (Sea Breeze), fundo suave #F8E6A0 (Cream Gelato). Estilo: cantos bem arredondados, botões/chips em pílula, cores suaves em chips/alerts.

Como trabalhamos (importante pra manter na conversa nova)
Eu não tenho acesso ao ambiente do usuário (VSCode, banco, terminal). O fluxo é: usuário roda os agentes do Claude Code localmente, me manda prints/erros/resultados, eu decido o que fazer e devolvo prompts prontos pra colar no Claude Code.
Economia de token é prioridade constante: ajustes pontuais pulam planejamento/codereview ("ajuste pontual"); só uso o pipeline completo pra funcionalidades novas maiores; test-engineer fica reservado pra rodadas de final de dia, não por feature.
Erro de código: peço o texto exato do erro (console/terminal) antes de mandar prompt.
Erro de configuração (env, DNS, dependência): resolvo com passos manuais, sem gastar prompt de agente.
Migrations nunca confiáveis via npm run migration:run (incompatibilidade TypeScript/ts-node não resolvida). REGRA ATUALIZADA: o agente NUNCA cria arquivo de migration (.ts) no repositório — nem isso. Só entrega o SQL puro em texto (chat/markdown), sem criar nenhum arquivo versionado no projeto. O usuário roda esse SQL manualmente no SQL Editor do Supabase e decide se/quando formalizar um arquivo de migration depois, se quiser.
Decisão de arquitetura ambígua → pergunto com opções antes de mandar prompt.
Nomenclatura do banco/domínio em português.
Brief documentado em arquivos versionados (agora em v5) — atualizo quando há mudança grande de escopo.

Arquitetura de agentes (Claude Code)

Pipeline customizado em .claude/agents/: orquestrador (opus, só delega) → spec (esclarece ambiguidade) → planejamento-backend/frontend (escrevem plano em .claude/tasks/<slug>/) → backend-developer/frontend-developer (implementam, restritos a apps/api ou apps/web) → backend-codereviewer/frontend-codereviewer (só revisam, não corrigem) → test-engineer (deferido). Skills em .claude/skills/: backend-modulo-crud, backend-anonimizacao-respostas, frontend-componente-pergunta.

Modelo de dados e regras de negócio principais

Acesso: só admin/gestor_rh têm login (Supabase Auth, via colaboradores.usuario_auth_id). colaborador comum não tem conta — acessa pesquisa só via link + confirmação de CPF. E-mail obrigatório só pra admin/gestor_rh; CPF obrigatório pra todos.
Colaboradores: campo cargo é select de opções fixas; campo eh_gestor (checkbox, independente do papel de acesso) filtra quem aparece como opção de "Gestor" no cadastro.
Tipos de pesquisa: avaliacao_360 (padrão) vs clima_geral (imutável após criada). Em clima_geral, o tipo de pergunta "Pessoa" é bloqueado.
Tipos de pergunta: likert, texto_aberto, matriz (competências via tabela perguntas_competencias), pessoa (filtros: pares, subordinado, externo, todos_gestores — "gestor" foi removido por ser sempre singular).
Ciclos: participantes selecionados manualmente (pessoa ou equipe). Novo campo tipos_relacionamento_gerados (text[]) permite escolher quais dos 4 tipos gerar na ativação (não precisa gerar todos sempre). Regra de pares = mesma equipe (mudou de "mesmo gestor"). Ativação exige pesquisa publicada vinculada; vínculo pesquisa↔ciclo só editável em rascunho (validado no backend). Para o tipo "Gestor avalia liderado" ser gerado, tanto o gestor quanto os colaboradores subordinados a ele precisam estar entre os participantes selecionados no ciclo — marcar eh_gestor no cadastro não é suficiente por si só.
Envios: sem automação de e-mail/WhatsApp — link copiado manualmente. 360 = um envio por relacionamento; clima_geral = um único envio compartilhado por ciclo.
Anonimização 360: respostas de pares/subordinado só aparecem agregadas ao avaliado, com mínimo de respondentes configurável (minimo_respostas_pares, default 3).
Anonimato clima: resposta gravada em tabela sem FK de identidade; rastreio de quem respondeu fica separado (ciclo_participantes.respondeu_em).
Fluxo público /responder/:token: CPF com limite de 5 tentativas (com botão de desbloqueio manual pelo admin), sessão temporária pós-confirmação, reenvio bloqueado.
Login: split-screen com logo, "olhinho" de mostrar senha, "esqueci senha" funcional. Padrão de senha (mín. 6 caracteres, maiúscula, minúscula, caractere especial) com checklist visual, aplicado em /definir-senha e reset.
Menu lateral: grupos "Cadastro" (Colaboradores, Equipes), "Operação" (Pesquisas, Ciclos), "Análises" (Quantitativa/Qualitativa — detalhado abaixo), "Configurações" (fixo, sem submenu ainda).

Módulo Análise (definido na v5)

Quantitativa (dados numéricos das pesquisas)
- Visão Geral — painel-resumo do período selecionado; tela inicial ao entrar em Análises. Sem exposição de resposta individual.
- Ranking — rankings/classificações de avaliados e equipes com campos agrupáveis personalizados. Ver regra de cálculo por tipo de relacionamento abaixo.
- Performance — comparativo entre até 10 pesquisas simultâneas (envios, respostas, tempo médio de resposta ao longo do tempo). Sem exposição de resposta individual.
- Análise de Menções (rebatizado de "Indicações") — ranking de quem mais foi citado/selecionado nas perguntas tipo Pessoa. Não existe indicação livre na plataforma; a fonte de dado é sempre uma seleção fechada entre colaboradores cadastrados.
- Envios (rebatizado de "Abordagens") — listagem de envios por ciclo com status (pendente/respondido) e filtro por período. Não há campanha automatizada (sem automação de e-mail/WhatsApp), então o escopo é consulta de status, não gestão de campanha.

Qualitativa (análise de conteúdo textual/sentimento)
- Avaliações — lista de respostas individuais (texto_aberto). Ver regra de anonimização abaixo.
- Nuvem de Palavras — gerada a partir dos comentários abertos; visualizações em Bolhas, Lista e modo TV Dash; inclui métricas de envios, respostas e tempo médio. Ver regra de anonimização abaixo.

Fase 2 do módulo (fora do MVP — maior custo/complexidade, dependem de IA)
- Insights e Relatórios — relatório estratégico (tópicos, sentimentos, pontos de atenção) + dashboard de emoção/sentimento/categoria ao longo do tempo + lista pesquisável de insights individuais.
- Dashboard de Tags — análise por tags; CRUD de tags manuais primeiro, auto-tagueamento via IA como evolução posterior.

Regra de anonimização — mínimo de respondentes (Análise)
- Campo minimo_respostas_pares (já existente na 360, default 3) é reaproveitado também para clima_geral, mesmo não tendo semântica literal de "pares" nesse contexto (dívida técnica conhecida — considerar renomear/comentar a coluna futuramente, ex: minimo_respostas_agregacao).
- Em clima_geral, o mínimo é avaliado por ciclo inteiro: a pesquisa só libera qualquer exibição agregada (Ranking, Análise de Menções, Avaliações) se o ciclo como um todo atingir esse mínimo de respondentes. Abaixo disso, os dados ficam completamente bloqueados/ocultos — não há liberação parcial por pergunta ou por segmento.
- Limitação conhecida, sem solução automática no MVP: o mínimo de respondentes protege contra identificação estatística (quantos responderam), mas não contra identificação pelo conteúdo do texto em si (ex: um comentário que descreve uma situação específica o suficiente para identificar quem escreveu, mesmo com o mínimo atingido). Em Avaliações e Nuvem de Palavras, exibir aviso ao usuário admin/gestor_rh de que respostas podem conter informações identificáveis mesmo quando o mínimo é atingido. Resolver de forma mais robusta (ex: sinalização via IA de comentários potencialmente identificáveis) fica para a Fase 2, junto de Insights e Relatórios.

Atalho de navegação — Visão Geral e Avaliações a partir do card do Ciclo

As telas Visão Geral e Avaliações do módulo Análise devem aceitar "ciclo" como 
dimensão de filtro (além de período/outros filtros já previstos), permitindo abrir 
a tela já pré-filtrada por um ciclo específico via link direto.

Na listagem de Ciclos, cada card ganha dois botões de atalho: "Visão Geral" e 
"Avaliações". Ao clicar, abre a respectiva tela do módulo Análise com o filtro 
"ciclo = este" pré-aplicado — mostrando dados só daquela aplicação específica, 
mesmo que a pesquisa vinculada já tenha sido usada em outros ciclos. O usuário 
pode alterar o filtro depois de entrar na tela, se quiser ver outro recorte.

Não é uma funcionalidade nova de backend — reaproveita 100% a lógica das telas 
Visão Geral e Avaliações já definidas acima, apenas adicionando suporte a filtro 
por ciclo e um link direto (deep link) a partir da listagem de Ciclos. Este 
requisito deve estar explícito no planejamento dessas duas telas quando a 
implementação do módulo Análise for iniciada, para já nascerem com o parâmetro de 
filtro por ciclo em vez de precisar de retrofit depois.

Regra de cálculo — Ranking (relações 1:1 vs. agregáveis)
O cálculo do Ranking deve separar a nota por tipo de relacionamento antes de agregar, e não aplicar o mínimo de respondentes de forma genérica sobre a nota final consolidada:
- Relações agregáveis (pares, subordinado): só entram na composição da nota do avaliado se atingirem minimo_respostas_pares. Se não atingirem, essa fatia fica de fora da composição (ou é sinalizada como "dados insuficientes"), mas não bloqueia o restante do cálculo.
- Relações 1:1 (autoavaliação, gestor avalia liderado): sempre entram na composição, independente de mínimo — não há anonimato a proteger nessas relações, já que as partes têm identidade conhecida entre si por natureza do relacionamento.
Essa separação precisa estar explícita no planejamento-backend da funcionalidade, para evitar que a implementação aplique o filtro de mínimo de forma genérica em cima da nota consolidada — o que geraria avaliados/gestores desaparecendo do ranking por falta de respostas de pares, mesmo tendo nota válida via relação 1:1.

Status do MVP

✅ Auth/papéis · ✅ Cadastro colaboradores/equipes · ✅ Construtor de pesquisas · ✅ Ciclos 360 · ✅ Envios manuais · 🔄 Coleta de respostas (token+CPF, em ajuste fino) · 🔄 Módulo Análise (escopo definido na v5, implementação não iniciada) · ⏳ Simular pesquisa

Pendências em aberto

Testes automatizados (test-engineer) não rodados — prioridade: anonimato do clima, limite de tentativas CPF, filtros da pergunta Pessoa.
Migration de tipos_relacionamento_gerados — confirmar se já rodou.
Script de seed + verificação automática dos filtros "Pessoa" foi pedido — resultado ainda não voltou.
Wallpaper decorativo (ilustrações em pessoas_png) — sem decisão de escopo final.
Domínio próprio no Resend (redemaster.com.br) — configuração DNS pendente (hoje usando Gmail SMTP, só pra dev).
Tipo de relacionamento "Externo" sem fonte de dado implementada — fora de escopo por ora.
Bug corrigido: AuthContext remontava a árvore de rotas protegidas (RotaProtegida) a cada evento de onAuthStateChange, inclusive revalidações de rotina do Supabase (TOKEN_REFRESHED, e SIGNED_IN reemitido pelo SDK ao recuperar sessão válida no refoco da aba), apagando formulários preenchidos. Corrigido com checagem de mudança real de identidade (id do usuário) antes de disparar resolverColaborador(), além de evitar o estado 'carregando' quando já existe colaborador resolvido.
Nomenclatura de minimo_respostas_pares: considerar renomear/comentar a coluna para refletir uso também em clima_geral (não é exclusiva de "pares").
Módulo Análise: definir ordem de implementação das telas do MVP (Visão Geral, Ranking, Performance, Análise de Menções, Envios, Avaliações, Nuvem de Palavras) e iniciar planejamento-backend da primeira. Visão Geral e Avaliações precisam nascer com suporte a filtro por ciclo, por causa do atalho de navegação a partir do card do Ciclo.
Ajustes de listagem já implementados: barra de progresso do ciclo (dentro e fora do detalhe), botão "Publicar" na listagem de Pesquisas (com "Ver detalhes" substituindo "Editar" após publicação), botão "Ativar ciclo" na listagem de Ciclos, botão de atualizar manual + notificação de nova resposta (visual+som dentro do detalhe do ciclo, reposicionada perto de "Participantes e envios"; badge visual na listagem de Ciclos sem som).
Funcionalidade de cópia de resposta por e-mail (estilo Google Forms) foi avaliada e descartada por ora — depende do domínio Resend estar configurado e exigiria capturar e-mail do colaborador comum no fluxo público sem quebrar o anonimato do clima_geral.
