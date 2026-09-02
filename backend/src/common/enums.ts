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
 * Também usada para validar `configuracao.filtroRelacionamento` de perguntas
 * tipo `pessoa` (lista de tipos de relacionamento selecionáveis no
 * formulário, não dado de resposta).
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
