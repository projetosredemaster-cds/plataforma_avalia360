import { Chip } from '@mui/material'
import type { TipoPesquisa } from '../../../types/pesquisa'

const CONFIG: Record<TipoPesquisa, { label: string; color: 'primary' | 'secondary' }> = {
  avaliacao_360: { label: 'Avaliação 360', color: 'primary' },
  clima_geral: { label: 'Clima e Satisfação', color: 'secondary' },
}

interface TipoPesquisaChipProps {
  tipo: TipoPesquisa
}

/**
 * `tipo` é escolhido na criação da pesquisa e IMUTÁVEL depois — este chip é
 * a representação somente-leitura usada no construtor em modo edição e na
 * seção "Pesquisa vinculada" de `CicloDetalhePage`. Mesmo critério já usado
 * por `PerguntaCard` para o tipo de pergunta: um `Chip` informativo, nunca
 * um seletor editável, uma vez que o valor já existe.
 */
export function TipoPesquisaChip({ tipo }: TipoPesquisaChipProps) {
  const { label, color } = CONFIG[tipo]
  return <Chip label={label} color={color} size="small" variant="outlined" />
}
