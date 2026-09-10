import { Paper, Typography } from '@mui/material'
import type { TextoAbertoItem } from '../../../types/analise'

interface TextoAbertoListaProps {
  textos: TextoAbertoItem[]
}

/**
 * Lista solta de textos de perguntas `texto_aberto`, SEM numeração/rótulo de
 * posição — a ordem já vem embaralhada do backend a cada chamada, nunca
 * reordenar aqui (nenhum `.sort()`/`.reverse()`) — e SEM qualquer atribuição
 * de autoria por item; quem chama decide se/como identificar o GRUPO
 * (avaliado, ciclo), nunca o texto individual.
 */
export function TextoAbertoLista({ textos }: TextoAbertoListaProps) {
  return (
    <div className="flex flex-col gap-2">
      {textos.map((item, indice) => (
        // key por índice + perguntaId: TextoAbertoItem não tem id próprio (a
        // mesma pergunta pode se repetir entre textos de respondentes
        // diferentes) e a ordem do array não é estável entre carregamentos —
        // é só um identificador técnico de lista, nunca exibido na UI.
        <Paper key={`${item.perguntaId}-${indice}`} variant="outlined" className="flex flex-col gap-1 p-3">
          <Typography variant="caption" color="text.secondary">
            {item.perguntaEnunciado}
          </Typography>
          <Typography variant="body2">{item.texto}</Typography>
        </Paper>
      ))}
    </div>
  )
}
