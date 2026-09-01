import type { PapelColaborador } from '../../../common/enums'

// Update parcial — não inclui `ativo` (rota própria: PATCH .../status) e
// qualquer `usuarioAuthId` recebido no body é ignorado silenciosamente
// (campo gerenciado só pelo server, ver colaboradores.service.ts).
//
// `equipeId`/`gestorId` admitem `string | null` (além de omitido) para
// diferenciar três estados no PUT: chave ausente do body → não mexe no
// vínculo; chave presente com `null` → limpa o vínculo; chave presente com
// um id → valida existência e vincula. A distinção "ausente vs. null" é
// feita no service via checagem de presença de chave (`'equipeId' in dto`),
// nunca por `=== undefined`, já que o body chega como JSON não tipado.
export interface AtualizarColaboradorDto {
  nomeCompleto?: string
  email?: string
  cpf?: string
  papel?: PapelColaborador
  cargo?: string
  equipeId?: string | null
  gestorId?: string | null
}
