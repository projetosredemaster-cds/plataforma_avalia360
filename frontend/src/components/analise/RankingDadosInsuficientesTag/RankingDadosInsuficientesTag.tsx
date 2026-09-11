import { Chip, Tooltip } from '@mui/material'

/**
 * Célula de nota bloqueada por anonimização (gate de pares/subordinado no
 * modo avaliado; limiar de 5 membros com nota calculável, por métrica, no
 * modo equipe). Deliberadamente SEM NENHUMA PROP — nem número de
 * respondentes, nem de membros, nem de nenhuma outra contagem — para que
 * nenhuma mudança futura descuidada tenha "onde pendurar" um valor sensível.
 * Não reaproveita `EstadoAguardandoMinimo` (esse exige `totalRespondentes`/
 * `minimoNecessario`, que a API de Ranking nunca expõe).
 */
export function RankingDadosInsuficientesTag() {
  return (
    <Tooltip title="Dados insuficientes para exibir essa nota sem risco de identificar quem respondeu.">
      <Chip size="small" variant="outlined" label="Dados insuficientes" />
    </Tooltip>
  )
}
