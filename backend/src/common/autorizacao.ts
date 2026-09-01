import type { ColaboradorAutenticado } from '../types/express'
import { ErroHttp } from './erro-http'

export type PapelPermitido = ColaboradorAutenticado['papel']

/**
 * Checagem de papel centralizada exigida pela convenção do projeto: deve ser
 * chamada como primeira linha de cada função exportada de *.service.ts —
 * nunca duplicada inline em controllers/rotas.
 */
export function garantirPapel(
  colaborador: ColaboradorAutenticado,
  papeisPermitidos: PapelPermitido[],
): void {
  if (!papeisPermitidos.includes(colaborador.papel)) {
    throw new ErroHttp(403, 'PAPEL_NAO_AUTORIZADO', 'Acesso restrito a administradores e RH.')
  }
}
