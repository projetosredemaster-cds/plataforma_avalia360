import { Chip } from '@mui/material'
import type { StatusEnvio } from '../../../types/envio'

const CONFIG: Record<StatusEnvio, { label: string; color: 'default' | 'info' | 'primary' | 'success' | 'error' }> = {
  pendente: { label: 'Pendente', color: 'default' },
  enviado: { label: 'Enviado', color: 'primary' },
  em_andamento: { label: 'Em andamento', color: 'info' },
  concluido: { label: 'Concluído', color: 'success' },
  expirado: { label: 'Expirado', color: 'error' },
}

interface StatusEnvioChipProps {
  status: StatusEnvio
}

/**
 * `em_andamento`/`concluido` nunca são produzidos por esta task (reservados
 * para a futura página `/responder`), mas o mapa cobre os 5 valores do
 * enum do backend por completude de tipo — não é um sinal de que a UI
 * trata esses 2 casos como alcançáveis hoje.
 */
export function StatusEnvioChip({ status }: StatusEnvioChipProps) {
  const { label, color } = CONFIG[status]
  return <Chip label={label} color={color} size="small" />
}
