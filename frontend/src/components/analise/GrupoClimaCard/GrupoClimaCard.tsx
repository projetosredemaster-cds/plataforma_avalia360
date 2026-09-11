import { Paper } from '@mui/material'
import type { GrupoClimaGeral } from '../../../types/analise'
import { TextoAbertoLista } from '../TextoAbertoLista/TextoAbertoLista'
import { EstadoAguardandoMinimo } from '../EstadoAguardandoMinimo/EstadoAguardandoMinimo'

interface GrupoClimaCardProps {
  grupo: GrupoClimaGeral
}

export function GrupoClimaCard({ grupo }: GrupoClimaCardProps) {
  return (
    <Paper variant="outlined" className="flex flex-col gap-2 p-3">
      {grupo.liberado ? (
        <TextoAbertoLista textos={grupo.textos ?? []} />
      ) : (
        <EstadoAguardandoMinimo totalRespondentes={grupo.totalRespondentes} minimoNecessario={grupo.minimoNecessario} />
      )}
    </Paper>
  )
}
