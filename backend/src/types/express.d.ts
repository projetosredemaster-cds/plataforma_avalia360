import type { PapelColaborador } from '../common/enums'

export interface ColaboradorAutenticado {
  id: string
  papel: PapelColaborador
  nomeCompleto: string
  email: string
}

declare global {
  namespace Express {
    interface Request {
      colaboradorAutenticado?: ColaboradorAutenticado
    }
  }
}
