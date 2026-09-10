import { Alert } from '@mui/material'

interface EstadoAguardandoMinimoProps {
  totalRespondentes: number
  minimoNecessario: number
}

/**
 * Estado de bloqueio FINAL — nenhum papel (nem admin/gestor_rh) tem bypass
 * deste limiar (spec, seção 2, "DECISÃO CRÍTICA"). Deliberadamente sem
 * nenhuma prop de callback/ação: não deve ser possível, hoje nem numa
 * mudança futura descuidada, pendurar um botão/link "ver mesmo assim" aqui.
 */
export function EstadoAguardandoMinimo({ totalRespondentes, minimoNecessario }: EstadoAguardandoMinimoProps) {
  return (
    <Alert severity="info" variant="outlined">
      Aguardando mínimo de respondentes ({totalRespondentes} de {minimoNecessario}).
    </Alert>
  )
}
