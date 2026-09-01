import type { TipoPergunta } from '../../../common/enums'

// Todos os campos opcionais. Quando `configuracao` é enviada, o service
// revalida por completo contra o `tipo` vigente (substitui o jsonb inteiro,
// sem merge parcial). Quando `competenciaIds` é enviado, o service substitui
// o conjunto de vínculos por completo (DELETE + INSERT), sem diff incremental.
export interface AtualizarPerguntaDto {
  tipo?: TipoPergunta
  enunciado?: string
  obrigatoria?: boolean
  configuracao?: Record<string, unknown>
  competenciaIds?: string[]
}
