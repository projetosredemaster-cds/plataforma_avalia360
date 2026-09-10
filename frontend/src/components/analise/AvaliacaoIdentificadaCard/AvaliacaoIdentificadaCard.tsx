import { Chip, Paper, Typography } from '@mui/material'
import type { AvaliacaoIdentificada } from '../../../types/analise'
import { rotuloTipoRelacionamento } from '../rotulosRelacionamento'

interface AvaliacaoIdentificadaCardProps {
  item: AvaliacaoIdentificada
  /** Omite o `Typography` de `perguntaEnunciado` — usado quando o chamador já
   * mostra o enunciado como subtítulo de um grupo por pergunta (evita repetir). */
  ocultarEnunciado?: boolean
}

/**
 * Item identificado (`autoavaliacao`/`gestor`/`externo`) — não há terceiro a
 * proteger nessas relações (spec, seção 3.2), então nome do avaliado + nome
 * do avaliador saem normalmente, sem nenhum aviso de bloqueio/anonimização.
 */
export function AvaliacaoIdentificadaCard({ item, ocultarEnunciado = false }: AvaliacaoIdentificadaCardProps) {
  return (
    <Paper variant="outlined" className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="body2" sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
          <strong>{item.avaliadoNome}</strong> avaliado por <strong>{item.avaliadorNome}</strong>
        </Typography>
        <Chip size="small" label={rotuloTipoRelacionamento(item.tipoRelacionamento)} />
      </div>
      {!ocultarEnunciado && (
        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
          {item.perguntaEnunciado}
        </Typography>
      )}
      <Typography variant="body2" sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
        {item.texto}
      </Typography>
    </Paper>
  )
}
