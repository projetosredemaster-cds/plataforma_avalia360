export type StatusCiclo = 'rascunho' | 'ativo' | 'encerrado'

export type TipoRelacionamento = 'autoavaliacao' | 'gestor' | 'pares' | 'subordinado' | 'externo'

export interface Ciclo {
  id: string
  nome: string
  descricao: string | null
  dataInicio: string // 'YYYY-MM-DD'
  dataFim: string // 'YYYY-MM-DD'
  status: StatusCiclo
  anonimizarRespostasPares: boolean
  minimoRespostasPares: number
  criadoPor: string | null
  criadoEm: string
  atualizadoEm: string
}

export interface Participante {
  id: string
  colaboradorId: string
  nomeCompleto: string
  email: string
  cargo: string | null
  equipe: { id: string; nome: string } | null
}

/**
 * Dado IDENTIFICADO de quem avalia quem (`avaliadorId`/`avaliadorNome`),
 * inclusive para os tipos `pares`/`subordinado`. Só pode ser consumido
 * dentro de `CicloDetalhePage`, atrás do guard de papel admin/gestor_rh —
 * nunca em uma tela alcançável por `colaborador`. Ver aviso de anonimização
 * em `.claude/tasks/ciclos-avaliacao/task-frontend.md`.
 */
export interface Relacionamento {
  id: string
  avaliadorId: string
  avaliadorNome: string
  avaliadoId: string
  avaliadoNome: string
  tipoRelacionamento: TipoRelacionamento
  criadoEm: string
}
