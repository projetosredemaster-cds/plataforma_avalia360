import { LinearProgress, Typography } from '@mui/material'
import type { ProgressoCiclo } from '../../../types/ciclo'

interface ProgressoCicloBarProps {
  progresso: ProgressoCiclo
}

/**
 * Reaproveitado no card da listagem e no cabeçalho da tela de detalhe.
 * `progresso` já vem 100% calculado pela API (`GET /api/ciclos`/`GET
 * /api/ciclos/:id`) — nunca deriva de `relacionamentos_avaliacao` no
 * frontend, mesmo aviso de anonimização de `types/ciclo.ts`.
 */
export function ProgressoCicloBar({ progresso }: ProgressoCicloBarProps) {
  if (progresso.total === 0) {
    return <Typography color="text.secondary">Sem dados de progresso ainda</Typography>
  }

  return (
    <div className="flex flex-col gap-1">
      <LinearProgress variant="determinate" value={progresso.percentual} />
      <Typography variant="caption" color="text.secondary">
        {`${progresso.concluidos}/${progresso.total} (${progresso.percentual}%)`}
      </Typography>
    </div>
  )
}
