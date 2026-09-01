import { FormLabel, TextField } from '@mui/material'

export interface RespostaTextoAberto {
  texto: string
}

interface PerguntaTextoAbertoRespostaProps {
  enunciado: string
  obrigatoria: boolean
  valor: RespostaTextoAberto | null
  onChange: (valor: RespostaTextoAberto) => void
}

export function PerguntaTextoAbertoResposta({
  enunciado,
  obrigatoria,
  valor,
  onChange,
}: PerguntaTextoAbertoRespostaProps) {
  return (
    <div className="flex flex-col gap-2">
      <FormLabel>
        {enunciado}
        {obrigatoria && ' *'}
      </FormLabel>
      <TextField value={valor?.texto ?? ''} onChange={(e) => onChange({ texto: e.target.value })} multiline minRows={3} fullWidth />
    </div>
  )
}
