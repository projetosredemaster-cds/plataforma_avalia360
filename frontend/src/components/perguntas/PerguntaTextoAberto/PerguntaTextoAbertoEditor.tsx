import { FormControlLabel, Switch, TextField } from '@mui/material'
import type { ConfiguracaoTextoAberto } from '../../../types/pesquisa'

export interface PerguntaTextoAbertoValor {
  enunciado: string
  obrigatoria: boolean
  /** Sempre `{}` — o backend rejeita qualquer chave extra para este tipo. */
  configuracao: ConfiguracaoTextoAberto
}

interface PerguntaTextoAbertoEditorProps {
  valor: PerguntaTextoAbertoValor
  onChange: (valor: PerguntaTextoAbertoValor) => void
  somenteLeitura?: boolean
}

export function PerguntaTextoAbertoEditor({ valor, onChange, somenteLeitura = false }: PerguntaTextoAbertoEditorProps) {
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Enunciado"
        value={valor.enunciado}
        onChange={(e) => onChange({ ...valor, enunciado: e.target.value })}
        disabled={somenteLeitura}
        multiline
        fullWidth
        required
      />
      <FormControlLabel
        control={
          <Switch
            checked={valor.obrigatoria}
            onChange={(e) => onChange({ ...valor, obrigatoria: e.target.checked })}
            disabled={somenteLeitura}
          />
        }
        label="Obrigatória"
      />
    </div>
  )
}
