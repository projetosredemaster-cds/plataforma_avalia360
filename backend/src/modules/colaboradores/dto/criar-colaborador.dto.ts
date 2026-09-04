import type { CargoColaborador, PapelColaborador } from '../../../common/enums'

// `email` opcional no tipo — obrigatoriedade agora é condicional ao papel
// (`admin`/`gestor_rh` exigem e-mail; `colaborador` não), decidida no
// service (`validarCamposObrigatorios`), não no tipo do DTO.
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
