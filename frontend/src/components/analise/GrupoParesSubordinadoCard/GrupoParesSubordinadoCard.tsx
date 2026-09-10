import { Chip, Paper, Typography } from '@mui/material'
import type { GrupoParesSubordinado } from '../../../types/analise'
import { rotuloTipoRelacionamento } from '../rotulosRelacionamento'
import { TextoAbertoLista } from '../TextoAbertoLista/TextoAbertoLista'
import { EstadoAguardandoMinimo } from '../EstadoAguardandoMinimo/EstadoAguardandoMinimo'

interface GrupoParesSubordinadoCardProps {
  grupo: GrupoParesSubordinado
}

export function GrupoParesSubordinadoCard({ grupo }: GrupoParesSubordinadoCardProps) {
  return (
    <Paper variant="outlined" className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="body2" sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
          <strong>{grupo.avaliadoNome}</strong>
        </Typography>
        <Chip size="small" label={rotuloTipoRelacionamento(grupo.tipoRelacionamento)} />
      </div>
      {grupo.liberado ? (
        <TextoAbertoLista textos={grupo.textos ?? []} />
      ) : (
        <EstadoAguardandoMinimo totalRespondentes={grupo.totalRespondentes} minimoNecessario={grupo.minimoNecessario} />
      )}
    </Paper>
  )
}
