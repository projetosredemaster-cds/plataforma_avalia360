import type { TipoRelacionamentoGeravel } from '../../types/ciclo'

/**
 * Rótulos amigáveis para o grupo de checkboxes de
 * `tiposRelacionamentoGerados` — deliberadamente diferentes (mais
 * explicativos) dos rótulos curtos de `ROTULOS_TIPO_RELACIONAMENTO`
 * (usados só na coluna "Tipo" das tabelas de relacionamentos/envios).
 * Ordem fixa = ordem de exibição no formulário, espelha a ordem pedida:
 * autoavaliação, gestor, pares, liderado avalia gestor.
 */
export const TIPOS_RELACIONAMENTO_GERAVEL: readonly {
  valor: TipoRelacionamentoGeravel
  rotulo: string
}[] = [
  { valor: 'autoavaliacao', rotulo: 'Autoavaliação' },
  { valor: 'gestor', rotulo: 'Gestor avalia liderado' },
  { valor: 'pares', rotulo: 'Pares avaliam entre si' },
  { valor: 'subordinado', rotulo: 'Liderado avalia gestor' },
]
