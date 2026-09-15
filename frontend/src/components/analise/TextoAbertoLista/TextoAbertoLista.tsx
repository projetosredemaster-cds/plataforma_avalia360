import { Paper, Typography } from '@mui/material'
import type { TextoAbertoItem } from '../../../types/analise'
import { PAINEL_TEXTO_ABERTO_ARREDONDADO, PAINEL_TEXTO_ABERTO_BASE } from '../estilosPainelTextoAberto'

interface TextoAbertoListaProps {
  textos: TextoAbertoItem[]
  /** Quando `true`, arredonda os cantos do painel (usado pela seção "pares e subordinados"). */
  arredondarPainel?: boolean
}

interface GrupoPerguntaTexto {
  perguntaId: string
  perguntaEnunciado: string
  textos: TextoAbertoItem[]
}

function agruparPorPergunta(textos: TextoAbertoItem[]): GrupoPerguntaTexto[] {
  const mapa = new Map<string, GrupoPerguntaTexto>()
  for (const item of textos) {
    let bucket = mapa.get(item.perguntaId)
    if (!bucket) {
      bucket = { perguntaId: item.perguntaId, perguntaEnunciado: item.perguntaEnunciado, textos: [] }
      mapa.set(item.perguntaId, bucket)
    }
    bucket.textos.push(item)
  }
  return Array.from(mapa.values())
}

export function TextoAbertoLista({ textos, arredondarPainel = false }: TextoAbertoListaProps) {
  const grupos = agruparPorPergunta(textos)
  const classesPainel = arredondarPainel ? PAINEL_TEXTO_ABERTO_ARREDONDADO : PAINEL_TEXTO_ABERTO_BASE
  return (
    <div className="flex flex-col gap-4">
      {grupos.map((grupo) => (
        <div key={grupo.perguntaId} className="flex flex-col gap-2">
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            Pergunta:{' '}
            <Typography component="span" variant="body2" color="text.primary" sx={{ fontWeight: 700 }}>
              {grupo.perguntaEnunciado}
            </Typography>
          </Typography>
          <div className={classesPainel}>
            {grupo.textos.map((item, indice) => (
              <Paper key={`${item.perguntaId}-${indice}`} variant="outlined" className="p-6">
                <Typography variant="body2" sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                  {item.texto}
                </Typography>
              </Paper>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
