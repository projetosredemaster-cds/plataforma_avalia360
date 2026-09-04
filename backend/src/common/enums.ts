// Reaproveitado por outros módulos futuros que precisem checar papel
// (equipes, colaboradores e, futuramente, ciclos/pesquisas/etc.).
export type PapelColaborador = 'admin' | 'gestor_rh' | 'colaborador'

export const PAPEL_COLABORADOR_VALORES: PapelColaborador[] = [
  'admin',
  'gestor_rh',
  'colaborador',
]

export type StatusPesquisa = 'rascunho' | 'publicada' | 'encerrada'

export const STATUS_PESQUISA_VALORES: StatusPesquisa[] = [
  'rascunho',
  'publicada',
  'encerrada',
]

export type StatusCiclo = 'rascunho' | 'ativo' | 'encerrado'

export const STATUS_CICLO_VALORES: StatusCiclo[] = ['rascunho', 'ativo', 'encerrado']

// Exatamente 4 tipos de pergunta no MVP — CSAT/NPS/KPI/CES/NVS/Imagem/
// Indicação foram deliberadamente removidos do escopo, não reintroduzir.
export type TipoPergunta = 'likert' | 'texto_aberto' | 'matriz' | 'pessoa'

export const TIPO_PERGUNTA_VALORES: TipoPergunta[] = [
  'likert',
  'texto_aberto',
  'matriz',
  'pessoa',
]

/**
 * Reflete o enum Postgres `tipo_relacionamento`, criado pela migration do
 * módulo `ciclos-avaliacao` (`relacionamentos_avaliacao.tipo_relacionamento`).
 * Para a allowlist de `configuracao.filtroRelacionamento` de perguntas tipo
 * `pessoa` (que inclui a opção adicional `'todos_gestores'`, não um valor
 * deste enum), ver `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES`/
 * `FiltroRelacionamentoPessoa` abaixo.
 */
export type TipoRelacionamento =
  | 'autoavaliacao'
  | 'gestor'
  | 'pares'
  | 'subordinado'
  | 'externo'

export const TIPO_RELACIONAMENTO_VALORES: TipoRelacionamento[] = [
  'autoavaliacao',
  'gestor',
  'pares',
  'subordinado',
  'externo',
]

/**
 * Subconjunto de `TipoRelacionamento` selecionável em
 * `ciclos_avaliacao.tipos_relacionamento_gerados` — os únicos tipos que o
 * motor de ciclos (`gerarRelacionamentos`) sabe gerar automaticamente.
 * Exclui `'externo'` (reservado para avaliador convidado manualmente, nunca
 * gerado por este motor). Não confundir com
 * `TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES` (propósito diferente: filtro
 * de pergunta tipo `pessoa`).
 */
export const TIPO_RELACIONAMENTO_GERACAO_VALORES: TipoRelacionamento[] = [
  'autoavaliacao',
  'gestor',
  'pares',
  'subordinado',
]

/**
 * Allowlist de `configuracao.filtroRelacionamento` (pergunta tipo `pessoa`).
 * Estende `TipoRelacionamento` com `'todos_gestores'`, que NÃO é um tipo de
 * relacionamento real — não existe nem existirá linha em
 * `relacionamentos_avaliacao` com esse valor, e o enum Postgres
 * `tipo_relacionamento` NUNCA deve ganhar esse valor. É uma opção de ESCOPO
 * ("liste todo mundo marcado como gestor no ciclo, independente de relação
 * com quem responde"), não de relação — validada só em aplicação, sobre uma
 * coluna `jsonb` livre.
 */
export type FiltroRelacionamentoPessoa = TipoRelacionamento | 'todos_gestores'

/**
 * Subconjunto de tipos/opções selecionáveis como filtro de pergunta tipo
 * `pessoa` (`configuracao.filtroRelacionamento`) — mais restrito que o enum
 * completo de `TipoRelacionamento` porque `autoavaliacao` nunca contribui
 * nenhuma opção e `gestor` nunca contribui mais de 1 (não agregam como
 * filtro), e estendido com `'todos_gestores'`, que não é um
 * `TipoRelacionamento` real (ver `FiltroRelacionamentoPessoa`) — lista todos
 * os colaboradores marcados como gestor e participantes do ciclo,
 * independente de relação com quem responde. `gestor`/`autoavaliacao`
 * continuam válidos em `relacionamentos_avaliacao.tipo_relacionamento` (motor
 * de ciclos) — só não são mais oferecidos como filtro nesta pergunta.
 */
export const TIPO_RELACIONAMENTO_FILTRO_PESSOA_VALORES: FiltroRelacionamentoPessoa[] = [
  'pares',
  'subordinado',
  'externo',
  'todos_gestores',
]

/**
 * Reflete o enum Postgres `status_envio`, criado pela migration do módulo
 * `envios-pesquisa`. Esta task só implementa as transições
 * pendente→enviado, enviado→enviado (lembrete, sem mudar status) e
 * qualquer-status→expirado. `em_andamento`/`concluido` são reservados para a
 * futura página pública `/responder` (fora de escopo aqui) — nenhuma rota
 * desta task escreve esses dois valores.
 */
export type StatusEnvio = 'pendente' | 'enviado' | 'em_andamento' | 'concluido' | 'expirado'

export const STATUS_ENVIO_VALORES: StatusEnvio[] = [
  'pendente',
  'enviado',
  'em_andamento',
  'concluido',
  'expirado',
]

/**
 * Reflete o enum Postgres `tipo_pesquisa`, criado pela migration desta task
 * (`ALTER TABLE pesquisas ADD COLUMN tipo ...`). Escolhido em
 * `POST /api/pesquisas` e IMUTÁVEL depois — `AtualizarPesquisaDto` não
 * declara este campo (mesmo critério já usado para `status`, que só muda via
 * `PATCH /api/pesquisas/:id/status`). `avaliacao_360` gera
 * `relacionamentos_avaliacao` + envios ligados a eles na ativação do ciclo;
 * `clima_geral` gera envios ligados diretamente a `ciclo_participantes`,
 * SEM `relacionamentos_avaliacao` (ver `ciclos-avaliacao.service.ts`,
 * `atualizarStatus`, e `envios-pesquisa.service.ts`, `gerarEnviosClima`).
 */
export type TipoPesquisa = 'avaliacao_360' | 'clima_geral'

export const TIPO_PESQUISA_VALORES: TipoPesquisa[] = ['avaliacao_360', 'clima_geral']

/**
 * Lista fixa de cargos válidos para `colaboradores.cargo` — validada só em
 * aplicação (a coluna continua `varchar` livre no banco, sem enum
 * Postgres/migration). Adicionar uma opção nova é uma mudança de código
 * (editar este array), nunca uma migration.
 */
export type CargoColaborador =
  | 'Auxiliar de Escritório'
  | 'Auxiliar Administrativo'
  | 'Assistente Administrativo'
  | 'Recepcionista'
  | 'Atendente'
  | 'Auxiliar Financeiro'
  | 'Analista Financeiro'
  | 'Contador'
  | 'Assistente de RH'
  | 'Analista de RH'
  | 'Gerente de RH'
  | 'Coordenador'
  | 'Supervisor'
  | 'Gerente'
  | 'Diretor'
  | 'Gestor'

export const CARGO_COLABORADOR_VALORES: CargoColaborador[] = [
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
]
