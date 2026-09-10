import type { CargoColaborador, PapelColaborador } from '../../../common/enums'

export interface CriarColaboradorDto {
  nomeCompleto: string
  email?: string
  cpf: string
  papel: PapelColaborador
  cargo?: CargoColaborador
  equipeId?: string
  gestorId?: string
  ehGestor?: boolean
}
