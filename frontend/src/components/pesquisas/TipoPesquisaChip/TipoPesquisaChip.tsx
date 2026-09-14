import { Chip } from '@mui/material'
import type { TipoPesquisa } from '../../../types/pesquisa'

const CONFIG: Record<TipoPesquisa, { label: string; color: 'primary' | 'secondary' }> = {
  avaliacao_360: { label: 'Avaliação 360', color: 'primary' },
  clima_geral: { label: 'Clima e Satisfação', color: 'secondary' },
}

interface TipoPesquisaChipProps {
  tipo: TipoPesquisa
}

export function TipoPesquisaChip({ tipo }: TipoPesquisaChipProps) {
  const { label, color } = CONFIG[tipo]
  return <Chip label={label} color={color} size="small" variant="outlined" />
}
