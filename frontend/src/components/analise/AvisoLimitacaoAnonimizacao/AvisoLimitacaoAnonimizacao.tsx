import { Alert } from '@mui/material'

/**
 * Aviso fixo de limitação conhecida (spec, seção 3.6): mesmo com o mínimo de
 * respondentes atingido, o texto em si pode ser identificável por conteúdo
 * ou estilo de escrita — sem solução automática nesta versão. Renderizado
 * pela página só quando existe pelo menos um grupo LIBERADO de
 * pares/subordinado/clima na resposta (decisão 5) — sem `onClose`/botão de
 * dispensar, sem condição de papel.
 */
export function AvisoLimitacaoAnonimizacao() {
  return (
    <Alert severity="warning">
      Mesmo quando o número mínimo de respondentes é atingido, o texto em si
      pode ser identificável por conteúdo ou estilo de escrita. Esta é uma
      limitação conhecida, sem solução automática nesta versão.
    </Alert>
  )
}
