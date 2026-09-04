import type { CargoColaborador, PapelColaborador } from '../../../common/enums'

// Update parcial — não inclui `ativo` (rota própria: PATCH .../status) e
// qualquer `usuarioAuthId` recebido no body é ignorado silenciosamente
// (campo gerenciado só pelo server, ver colaboradores.service.ts).
//
// `equipeId`/`gestorId`/`email` admitem `string | null` (além de omitido)
// para diferenciar três estados no PUT: chave ausente do body → não mexe no
// campo; chave presente com `null` → limpa o campo (`email` só pode ficar
// `null` se o papel resultante for `colaborador`, checado no service);
// chave presente com um valor → valida e aplica. A distinção "ausente vs.
// null" é feita no service via checagem de presença de chave
// (`'equipeId' in dto`), nunca por `=== undefined`, já que o body chega
// como JSON não tipado.
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
