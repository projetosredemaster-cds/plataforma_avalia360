import { Chip } from '@mui/material'
import type { StatusCiclo } from '../../../types/ciclo'

const CONFIG: Record<StatusCiclo, { label: string; color: 'default' | 'success' | 'warning' }> = {
  rascunho: { label: 'Rascunho', color: 'default' },
  ativo: { label: 'Ativo', color: 'success' },
  encerrado: { label: 'Encerrado', color: 'warning' },
}

interface StatusCicloChipProps {
  status: StatusCiclo
}

/** Reaproveitado no card da listagem e no cabeçalho da tela de detalhe. */
export function StatusCicloChip({ status }: StatusCicloChipProps) {
  const { label, color } = CONFIG[status]
  return <Chip label={label} color={color} size="small" />
}
