import type { PapelColaborador } from '../../../common/enums'

export interface CriarColaboradorDto {
  nomeCompleto: string
  email: string
  cpf: string
  papel: PapelColaborador
  cargo?: string
  equipeId?: string
  gestorId?: string
}
