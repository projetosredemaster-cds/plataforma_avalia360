import type { TipoRelacionamentoAnonimizado, TipoRelacionamentoIdentificado } from '../../types/analise'

const ROTULOS: Record<TipoRelacionamentoIdentificado | TipoRelacionamentoAnonimizado, string> = {
  autoavaliacao: 'Autoavaliação',
  gestor: 'Gestor',
  externo: 'Externo',
  pares: 'Pares',
  subordinado: 'Subordinados',
}

export function rotuloTipoRelacionamento(tipo: keyof typeof ROTULOS): string {
  return ROTULOS[tipo]
}
