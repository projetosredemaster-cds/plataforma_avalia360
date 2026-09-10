import { LinearProgress, Typography } from '@mui/material'
import type { ProgressoCiclo } from '../../../types/ciclo'

interface ProgressoCicloBarProps {
  progresso: ProgressoCiclo
}

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
