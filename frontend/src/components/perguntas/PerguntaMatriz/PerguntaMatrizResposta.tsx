import { FormControlLabel, FormLabel, Radio, RadioGroup } from '@mui/material'
import type { Competencia } from '../../../types/competencia'
import type { ConfiguracaoLikert } from '../../../types/pesquisa'

export interface RespostaMatriz {
  notas: Record<string, number>
}

interface PerguntaMatrizRespostaProps {
  enunciado: string
  obrigatoria: boolean
  configuracao: ConfiguracaoLikert
  /** `pergunta.competencias` já resolvido pela API — sem chamada extra. */
  competencias: Competencia[]
  valor: RespostaMatriz | null
  onChange: (valor: RespostaMatriz) => void
}

export function PerguntaMatrizResposta({
  enunciado,
  obrigatoria,
  configuracao,
  competencias,
  valor,
  onChange,
}: PerguntaMatrizRespostaProps) {
  function handleNotaChange(competenciaId: string, nota: number) {
    onChange({ notas: { ...(valor?.notas ?? {}), [competenciaId]: nota } })
  }

  return (
    <div className="flex flex-col gap-3">
      <FormLabel>
        {enunciado}
        {obrigatoria && ' *'}
      </FormLabel>
      {competencias.map((competencia) => (
        <div key={competencia.id} className="flex flex-col gap-1">
          <span className="text-sm font-medium">{competencia.nome}</span>
          <RadioGroup
            row
            value={valor?.notas[competencia.id] ?? ''}
            onChange={(e) => handleNotaChange(competencia.id, Number(e.target.value))}
          >
            {configuracao.rotulos.map((rotulo, indice) => (
              <FormControlLabel key={indice} value={indice + 1} control={<Radio />} label={rotulo} />
            ))}
          </RadioGroup>
        </div>
      ))}
    </div>
  )
}
