import type { CargoColaborador, PapelColaborador } from '../../../common/enums'

export interface AtualizarColaboradorDto {
  nomeCompleto?: string
  email?: string | null
  cpf?: string
  papel?: PapelColaborador
  cargo?: CargoColaborador
  equipeId?: string | null
  gestorId?: string | null
  ehGestor?: boolean
}
