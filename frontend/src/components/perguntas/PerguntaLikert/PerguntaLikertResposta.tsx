import { FormControlLabel, FormHelperText, FormLabel, Radio, RadioGroup } from '@mui/material'
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
  /** Destaca a pergunta como obrigatória não respondida numa tentativa de envio. */
  erro?: boolean
}

export function PerguntaLikertResposta({
  enunciado,
  obrigatoria,
  configuracao,
  valor,
  onChange,
  erro,
}: PerguntaLikertRespostaProps) {
  return (
    <div className="flex flex-col gap-2">
      <FormLabel error={erro}>
        {enunciado}
        {obrigatoria && ' *'}
      </FormLabel>
      <RadioGroup row value={valor?.nota ?? ''} onChange={(e) => onChange({ nota: Number(e.target.value) })}>
        {configuracao.rotulos.map((rotulo, indice) => (
          <FormControlLabel key={indice} value={indice + 1} control={<Radio />} label={rotulo} />
        ))}
      </RadioGroup>
      {erro && <FormHelperText error>Resposta obrigatória.</FormHelperText>}
    </div>
  )
}
