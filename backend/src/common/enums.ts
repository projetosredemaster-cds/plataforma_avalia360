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
 * Constante TS PROVISÓRIA (não é enum Postgres ainda — `relacionamentos_avaliacao`
 * não existe). Usada só para validar `configuracao.filtroRelacionamento` de
 * perguntas tipo `pessoa` (lista de tipos de relacionamento selecionáveis no
 * formulário, não dado de resposta). Quando o módulo de ciclos/relacionamentos
 * for criado, reconciliar com o enum Postgres real `tipo_relacionamento`.
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
