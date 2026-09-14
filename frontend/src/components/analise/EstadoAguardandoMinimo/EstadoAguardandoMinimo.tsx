import { Alert } from '@mui/material'

interface EstadoAguardandoMinimoProps {
  totalRespondentes: number
  minimoNecessario: number
}

export function EstadoAguardandoMinimo({ totalRespondentes, minimoNecessario }: EstadoAguardandoMinimoProps) {
  return (
    <Alert severity="info" variant="outlined">
      Aguardando mínimo de respondentes ({totalRespondentes} de {minimoNecessario}).
    </Alert>
  )
}
