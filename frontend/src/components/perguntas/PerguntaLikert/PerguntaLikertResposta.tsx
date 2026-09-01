import { FormControlLabel, FormLabel, Radio, RadioGroup } from '@mui/material'
import type { ConfiguracaoLikert } from '../../../types/pesquisa'

export interface RespostaLikert {
  nota: number
}

interface PerguntaLikertRespostaProps {
  enunciado: string
  obrigatoria: boolean
  configuracao: ConfiguracaoLikert
  valor: RespostaLikert | null
  onChange: (valor: RespostaLikert) => void
}

export function PerguntaLikertResposta({
  enunciado,
  obrigatoria,
  configuracao,
  valor,
  onChange,
}: PerguntaLikertRespostaProps) {
  return (
    <div className="flex flex-col gap-2">
      <FormLabel>
        {enunciado}
        {obrigatoria && ' *'}
      </FormLabel>
      <RadioGroup row value={valor?.nota ?? ''} onChange={(e) => onChange({ nota: Number(e.target.value) })}>
        {configuracao.rotulos.map((rotulo, indice) => (
          <FormControlLabel key={indice} value={indice + 1} control={<Radio />} label={rotulo} />
        ))}
      </RadioGroup>
    </div>
  )
}
