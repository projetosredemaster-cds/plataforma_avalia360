import { Paper, Typography } from '@mui/material'
import type { TextoAbertoItem } from '../../../types/analise'

interface TextoAbertoListaProps {
  textos: TextoAbertoItem[]
}

interface GrupoPerguntaTexto {
  perguntaId: string
  perguntaEnunciado: string
  textos: TextoAbertoItem[]
}

/**
 * Agrupa POR PERGUNTA os textos de UM ÚNICO grupo (avaliado+ciclo+tipo, ou o único
 * grupo de clima do ciclo) recebido via prop — nunca funde `textos` de grupos
 * diferentes (quem chama já passa só um `grupo.textos` por vez). Bucket via `Map`,
 * preserva a ordem de inserção — a ordem das perguntas é a ordem da primeira
 * ocorrência no array já embaralhado pelo backend; a ordem dos textos DENTRO de
 * cada pergunta é exatamente a do array recebido. Nenhum `.sort()`/`.reverse()`.
 */
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

/**
 * Lista de textos de UM grupo, agrupada por pergunta (cabeçalho uma única vez),
 * SEM numeração/rótulo de posição em nenhum texto individual e SEM qualquer
 * atribuição de autoria — quem chama decide se/como identificar o GRUPO (avaliado,
 * ciclo), nunca o texto individual.
 */
export function TextoAbertoLista({ textos }: TextoAbertoListaProps) {
  const grupos = agruparPorPergunta(textos)
  return (
    <div className="flex flex-col gap-4">
      {grupos.map((grupo) => (
        <div key={grupo.perguntaId} className="flex flex-col gap-2">
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            {grupo.perguntaEnunciado}
          </Typography>
          <div className="flex flex-col gap-2">
            {grupo.textos.map((item, indice) => (
              <Paper key={`${item.perguntaId}-${indice}`} variant="outlined" className="p-3">
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
