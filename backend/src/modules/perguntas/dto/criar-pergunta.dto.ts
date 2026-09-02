import type { TipoPergunta } from '../../../common/enums'

export interface CriarPerguntaDto {
  tipo: TipoPergunta
  enunciado: string
  obrigatoria?: boolean
  configuracao?: Record<string, unknown>
  competenciaIds?: string[]
}
