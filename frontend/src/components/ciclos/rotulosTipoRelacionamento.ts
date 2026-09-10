import type { TipoRelacionamento } from '../../types/ciclo'

export const ROTULOS_TIPO_RELACIONAMENTO: Record<TipoRelacionamento, string> = {
  autoavaliacao: 'Autoavaliação',
  gestor: 'Gestor',
  pares: 'Pares',
  subordinado: 'Subordinado',
  externo: 'Externo',
}
