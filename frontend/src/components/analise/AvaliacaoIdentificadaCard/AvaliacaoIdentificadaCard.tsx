import { Chip, Paper, Typography } from '@mui/material'
import type { AvaliacaoIdentificada } from '../../../types/analise'
import { rotuloTipoRelacionamento } from '../rotulosRelacionamento'

interface AvaliacaoIdentificadaCardProps {
  item: AvaliacaoIdentificada
}

/**
 * Item identificado (`autoavaliacao`/`gestor`/`externo`) — não há terceiro a
 * proteger nessas relações (spec, seção 3.2), então nome do avaliado + nome
 * do avaliador saem normalmente, sem nenhum aviso de bloqueio/anonimização.
 */
export function AvaliacaoIdentificadaCard({ item }: AvaliacaoIdentificadaCardProps) {
  return (
    <Paper variant="outlined" className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="body2">
          <strong>{item.avaliadoNome}</strong> avaliado por <strong>{item.avaliadorNome}</strong>
        </Typography>
        <Chip size="small" label={rotuloTipoRelacionamento(item.tipoRelacionamento)} />
      </div>
      <Typography variant="caption" color="text.secondary">
        {item.perguntaEnunciado}
      </Typography>
      <Typography variant="body2">{item.texto}</Typography>
    </Paper>
  )
}
