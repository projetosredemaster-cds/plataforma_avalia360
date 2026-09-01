-- ======================================================================
-- SCHEMA v2 -- Plataforma de Avaliação 360°
-- Modelo de acesso: admin/gestor_rh têm login (Supabase Auth) via
-- colaboradores.usuario_auth_id; colaborador comum acessa só via link do
-- envio + confirmação de CPF (sem conta). Ver brief_avaliacao360_v3.md.
-- ======================================================================
-- SCHEMA — Plataforma de Avaliação 360°
-- Supabase (Postgres + Auth). Single-tenant (uma única empresa).
-- Criação de pesquisas sempre manual (sem IA / sem templates).
-- Nomenclatura em português do Brasil.
-- =====================================================================

-- ---------------------------------------------------------------------
-- EXTENSÕES
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type papel_colaborador as enum ('admin', 'gestor_rh', 'colaborador');

create type status_ciclo as enum ('rascunho', 'ativo', 'encerrado');

create type status_pesquisa as enum ('rascunho', 'publicada', 'encerrada');

create type tipo_pergunta as enum ('likert', 'texto_aberto', 'matriz', 'pessoa');

create type tipo_relacionamento as enum ('autoavaliacao', 'gestor', 'pares', 'subordinado', 'externo');

create type status_envio as enum ('pendente', 'enviado', 'em_andamento', 'concluido', 'expirado');

-- ---------------------------------------------------------------------
-- EQUIPES (equipes/departamentos)
-- ---------------------------------------------------------------------
create table equipes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- COLABORADORES
-- Nem todo colaborador tem login: só admin/gestor_rh acessam via Supabase
-- Auth (usuario_auth_id preenchido). Colaborador comum acessa pesquisas via
-- link do envio + confirmação de CPF, sem conta de autenticação.
-- ---------------------------------------------------------------------
create table colaboradores (
  id uuid primary key default gen_random_uuid(),
  usuario_auth_id uuid unique references auth.users(id) on delete set null,
  nome_completo text not null,
  email text not null unique,
  cpf text not null unique,
  papel papel_colaborador not null default 'colaborador',
  cargo text,
  equipe_id uuid references equipes(id) on delete set null,
  gestor_id uuid references colaboradores(id) on delete set null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_colaboradores_usuario_auth on colaboradores(usuario_auth_id);

create index idx_colaboradores_gestor on colaboradores(gestor_id);
create index idx_colaboradores_equipe on colaboradores(equipe_id);

-- ---------------------------------------------------------------------
-- COMPETÊNCIAS (usadas em perguntas do tipo "matriz")
-- ---------------------------------------------------------------------
create table competencias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CICLOS DE AVALIAÇÃO (ciclos de avaliação 360)
-- ---------------------------------------------------------------------
create table ciclos_avaliacao (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  data_inicio date not null,
  data_fim date not null,
  status status_ciclo not null default 'rascunho',
  -- regra de anonimização: respostas de pares/subordinados só aparecem
  -- agregadas para o avaliado quando houver >= minimo_respostas_pares respondentes
  anonimizar_respostas_pares boolean not null default true,
  minimo_respostas_pares smallint not null default 3,
  criado_por uuid references colaboradores(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint chk_datas_ciclo check (data_fim >= data_inicio)
);

-- ---------------------------------------------------------------------
-- PESQUISAS (formulários — sempre criados manualmente)
-- ---------------------------------------------------------------------
create table pesquisas (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid references ciclos_avaliacao(id) on delete set null,
  titulo text not null,
  mensagem_boas_vindas text,
  logo_url text,
  status status_pesquisa not null default 'rascunho',
  criado_por uuid references colaboradores(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index idx_pesquisas_ciclo on pesquisas(ciclo_id);

-- ---------------------------------------------------------------------
-- PÁGINAS DA PESQUISA (blocos de perguntas)
-- ---------------------------------------------------------------------
create table paginas_pesquisa (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null references pesquisas(id) on delete cascade,
  titulo text,
  ordem smallint not null default 0
);

create index idx_paginas_pesquisa on paginas_pesquisa(pesquisa_id);

-- ---------------------------------------------------------------------
-- PERGUNTAS
-- configuracao (jsonb) guarda detalhes específicos por tipo, ex.:
--  likert:       { "niveis": 6, "rotulos": ["Discordo totalmente", ...] }
--  matriz:       { "competencia_ids": ["...", "..."] }
--  pessoa:       { "filtro_relacionamento": ["pares","subordinado"] }
--  texto_aberto: {}
-- ---------------------------------------------------------------------
create table perguntas (
  id uuid primary key default gen_random_uuid(),
  pagina_id uuid not null references paginas_pesquisa(id) on delete cascade,
  tipo tipo_pergunta not null,
  titulo text not null,
  descricao text,
  obrigatoria boolean not null default true,
  ordem smallint not null default 0,
  configuracao jsonb not null default '{}'::jsonb
);

create index idx_perguntas_pagina on perguntas(pagina_id);

-- ---------------------------------------------------------------------
-- RELACIONAMENTOS DE AVALIAÇÃO (quem avalia quem, dentro de um ciclo)
-- ---------------------------------------------------------------------
create table relacionamentos_avaliacao (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references ciclos_avaliacao(id) on delete cascade,
  avaliador_id uuid not null references colaboradores(id) on delete cascade,
  avaliado_id uuid not null references colaboradores(id) on delete cascade,
  tipo_relacionamento tipo_relacionamento not null,
  criado_em timestamptz not null default now(),
  unique (ciclo_id, avaliador_id, avaliado_id, tipo_relacionamento)
);

create index idx_relacionamentos_ciclo on relacionamentos_avaliacao(ciclo_id);
create index idx_relacionamentos_avaliado on relacionamentos_avaliacao(avaliado_id);
create index idx_relacionamentos_avaliador on relacionamentos_avaliacao(avaliador_id);

-- ---------------------------------------------------------------------
-- ENVIOS DE PESQUISA (envio de um formulário a um avaliador específico)
-- ---------------------------------------------------------------------
create table envios_pesquisa (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null references pesquisas(id) on delete cascade,
  relacionamento_id uuid not null references relacionamentos_avaliacao(id) on delete cascade,
  status status_envio not null default 'pendente',
  token_acesso uuid not null default gen_random_uuid() unique,
  enviado_em timestamptz,
  concluido_em timestamptz,
  quantidade_lembretes smallint not null default 0,
  cpf_confirmado_em timestamptz,
  tentativas_cpf_invalidas smallint not null default 0,
  criado_em timestamptz not null default now(),
  unique (pesquisa_id, relacionamento_id)
);

create index idx_envios_pesquisa on envios_pesquisa(pesquisa_id);
create index idx_envios_relacionamento on envios_pesquisa(relacionamento_id);
create index idx_envios_status on envios_pesquisa(status);

-- ---------------------------------------------------------------------
-- RESPOSTAS (uma submissão por envio)
-- ---------------------------------------------------------------------
create table respostas (
  id uuid primary key default gen_random_uuid(),
  envio_id uuid not null unique references envios_pesquisa(id) on delete cascade,
  respondido_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ITENS DE RESPOSTA
-- valor (jsonb) guarda o valor conforme o tipo de pergunta, ex.:
--  likert:       { "nota": 4 }
--  texto_aberto: { "texto": "..." }
--  matriz:       { "notas": { "<competencia_id>": 4, ... } }
--  pessoa:       { "colaborador_id": "..." }
-- ---------------------------------------------------------------------
create table itens_resposta (
  id uuid primary key default gen_random_uuid(),
  resposta_id uuid not null references respostas(id) on delete cascade,
  pergunta_id uuid not null references perguntas(id) on delete cascade,
  valor jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  unique (resposta_id, pergunta_id)
);

create index idx_itens_resposta on itens_resposta(resposta_id);
create index idx_itens_pergunta on itens_resposta(pergunta_id);

-- =====================================================================
-- VIEWS DE ANONIMIZAÇÃO
-- O avaliado (colaborador) nunca deve ver respostas individuais de
-- pares/subordinados — apenas a média/agregado, e só quando o número
-- de respondentes for >= minimo_respostas_pares do ciclo.
-- Autoavaliação, gestor e externo NÃO são anonimizados.
-- =====================================================================

-- Respostas identificadas (autoavaliação + gestor + externo)
create view respostas_identificadas as
select
  ir.id as item_resposta_id,
  ir.pergunta_id,
  ir.valor,
  ra.avaliado_id,
  ra.avaliador_id,
  ra.tipo_relacionamento,
  ra.ciclo_id
from itens_resposta ir
join respostas r on r.id = ir.resposta_id
join envios_pesquisa ep on ep.id = r.envio_id
join relacionamentos_avaliacao ra on ra.id = ep.relacionamento_id
where ra.tipo_relacionamento in ('autoavaliacao', 'gestor', 'externo');

-- Respostas de pares/subordinados — só aparecem agregadas (sem avaliador_id)
-- e só se atingirem o mínimo de respondentes configurado no ciclo.
create view respostas_pares_agregadas as
select
  p.id as pergunta_id,
  ra.avaliado_id,
  ra.ciclo_id,
  ra.tipo_relacionamento,
  count(distinct ra.avaliador_id) as quantidade_respondentes,
  -- para likert/matriz: a média fica a cargo da aplicação (ler os "valor" e calcular),
  -- aqui garantimos apenas o agrupamento correto para não vazar identidade
  jsonb_agg(ir.valor) filter (
    where (
      select ca.minimo_respostas_pares
      from ciclos_avaliacao ca
      where ca.id = ra.ciclo_id
    ) <= (
      select count(distinct ra2.avaliador_id)
      from relacionamentos_avaliacao ra2
      where ra2.avaliado_id = ra.avaliado_id
        and ra2.ciclo_id = ra.ciclo_id
        and ra2.tipo_relacionamento = ra.tipo_relacionamento
    )
  ) as valores_se_minimo_atingido
from itens_resposta ir
join respostas r on r.id = ir.resposta_id
join envios_pesquisa ep on ep.id = r.envio_id
join relacionamentos_avaliacao ra on ra.id = ep.relacionamento_id
join perguntas p on p.id = ir.pergunta_id
where ra.tipo_relacionamento in ('pares', 'subordinado')
group by p.id, ra.avaliado_id, ra.ciclo_id, ra.tipo_relacionamento;

-- Nota: esta view é um ponto de partida. Na prática, recomenda-se mover a
-- lógica de agregação (médias, contagem por competência) para o backend Node,
-- e usar esta view (ou equivalente) só como camada de segurança que nunca
-- expõe avaliador_id para respostas de pares/subordinados.

-- =====================================================================
-- ROW LEVEL SECURITY (esqueleto — ajustar conforme regras finais de negócio)
-- =====================================================================
alter table colaboradores enable row level security;
alter table ciclos_avaliacao enable row level security;
alter table pesquisas enable row level security;
alter table paginas_pesquisa enable row level security;
alter table perguntas enable row level security;
alter table relacionamentos_avaliacao enable row level security;
alter table envios_pesquisa enable row level security;
alter table respostas enable row level security;
alter table itens_resposta enable row level security;

-- Função auxiliar: papel do usuário logado (só admin/gestor_rh têm
-- usuario_auth_id preenchido; colaborador comum não tem sessão Supabase)
create or replace function papel_usuario_atual() returns papel_colaborador as $$
  select papel from colaboradores where usuario_auth_id = auth.uid();
$$ language sql stable;

-- IMPORTANTE: o formulário público de resposta (colaborador comum, sem
-- login) NÃO deve acessar o Postgres via cliente com RLS de usuário
-- autenticado. Toda leitura/escrita desse fluxo passa pelo backend Node
-- usando a service role key (bypassa RLS), que valida token do envio + CPF
-- manualmente antes de liberar qualquer dado ou aceitar qualquer resposta.

-- admin e gestor_rh enxergam tudo (gestão da plataforma)
create policy "rh_acesso_total_colaboradores" on colaboradores
  for select using (papel_usuario_atual() in ('admin', 'gestor_rh') or usuario_auth_id = auth.uid());

create policy "rh_acesso_total_ciclos" on ciclos_avaliacao
  for all using (papel_usuario_atual() in ('admin', 'gestor_rh'));

create policy "rh_acesso_total_pesquisas" on pesquisas
  for all using (papel_usuario_atual() in ('admin', 'gestor_rh'));

-- colaborador só enxerga envios onde ele é o avaliador (para responder)
-- Nota: esta policy só é relevante para admin/gestor_rh que também avaliam
-- (ex.: gestor avaliando liderado) e acessam via sessão autenticada. O
-- colaborador comum (sem login) nunca passa por aqui — ele acessa via
-- backend + service role, validando token+CPF (ver seção de arquitetura).
create policy "avaliador_ve_proprios_envios" on envios_pesquisa
  for select using (
    papel_usuario_atual() in ('admin', 'gestor_rh')
    or exists (
      select 1 from relacionamentos_avaliacao ra
      join colaboradores c on c.id = ra.avaliador_id
      where ra.id = envios_pesquisa.relacionamento_id
        and c.usuario_auth_id = auth.uid()
    )
  );

-- respostas: só quem enviou ou RH/admin
create policy "rh_ou_dono_respostas" on respostas
  for select using (
    papel_usuario_atual() in ('admin', 'gestor_rh')
    or exists (
      select 1 from envios_pesquisa ep
      join relacionamentos_avaliacao ra on ra.id = ep.relacionamento_id
      join colaboradores c on c.id = ra.avaliador_id
      where ep.id = respostas.envio_id
        and c.usuario_auth_id = auth.uid()
    )
  );

-- IMPORTANTE: para o colaborador avaliado consultar SEU PRÓPRIO resultado,
-- ele deve consultar as views (respostas_identificadas / respostas_pares_agregadas)
-- filtradas por avaliado_id = auth.uid(), nunca a tabela "itens_resposta" direto.
-- Isso é o que garante a anonimização de pares/subordinados na prática.
