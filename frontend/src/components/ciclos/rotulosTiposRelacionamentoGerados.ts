import type { TipoRelacionamentoGeravel } from '../../types/ciclo'

export const TIPOS_RELACIONAMENTO_GERAVEL: readonly {
  valor: TipoRelacionamentoGeravel
  rotulo: string
}[] = [
  { valor: 'autoavaliacao', rotulo: 'Autoavaliação' },
  { valor: 'gestor', rotulo: 'Gestor avalia liderado' },
  { valor: 'pares', rotulo: 'Pares avaliam entre si' },
  { valor: 'subordinado', rotulo: 'Liderado avalia gestor' },
]
