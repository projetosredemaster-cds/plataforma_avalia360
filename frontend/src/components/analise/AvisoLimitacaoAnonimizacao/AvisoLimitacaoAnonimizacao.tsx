import { Alert } from '@mui/material'

export function AvisoLimitacaoAnonimizacao() {
  return (
    <Alert severity="warning">
      Mesmo quando o número mínimo de respondentes é atingido, o texto em si
      pode ser identificável por conteúdo ou estilo de escrita.
    </Alert>
  )
}
