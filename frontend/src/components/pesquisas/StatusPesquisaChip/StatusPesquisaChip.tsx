import { Chip } from '@mui/material'
import type { StatusPesquisa } from '../../../types/pesquisa'

const CONFIG: Record<StatusPesquisa, { label: string; color: 'default' | 'success' | 'warning' }> = {
  rascunho: { label: 'Rascunho', color: 'default' },
  publicada: { label: 'Publicada', color: 'success' },
  encerrada: { label: 'Encerrada', color: 'warning' },
}

interface StatusPesquisaChipProps {
  status: StatusPesquisa
}

/** Reaproveitado no card da listagem e no cabeçalho do construtor. */
export function StatusPesquisaChip({ status }: StatusPesquisaChipProps) {
  const { label, color } = CONFIG[status]
  return <Chip label={label} color={color} size="small" />
}
