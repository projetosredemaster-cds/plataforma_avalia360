import { FormControlLabel, Switch, TextField } from '@mui/material'
import type { ConfiguracaoLikert } from '../../../types/pesquisa'
import { NIVEIS_MAX, NIVEIS_MIN, ajustarRotulosParaNiveis } from '../validacaoPergunta'

export interface PerguntaLikertValor {
  enunciado: string
  obrigatoria: boolean
  configuracao: ConfiguracaoLikert
}

interface PerguntaLikertEditorProps {
  valor: PerguntaLikertValor
  onChange: (valor: PerguntaLikertValor) => void
  somenteLeitura?: boolean
}

export function PerguntaLikertEditor({ valor, onChange, somenteLeitura = false }: PerguntaLikertEditorProps) {
  function handleNiveisChange(valorBruto: string) {
    const numero = Number(valorBruto)
    const niveis = Number.isFinite(numero)
      ? Math.min(Math.max(Math.trunc(numero), NIVEIS_MIN), NIVEIS_MAX)
      : valor.configuracao.niveis
    onChange({
      ...valor,
      configuracao: { niveis, rotulos: ajustarRotulosParaNiveis(niveis, valor.configuracao.rotulos) },
    })
  }

  function handleRotuloChange(indice: number, novoRotulo: string) {
    const rotulos = [...valor.configuracao.rotulos]
    rotulos[indice] = novoRotulo
    onChange({ ...valor, configuracao: { ...valor.configuracao, rotulos } })
  }

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
      <TextField
        label="Número de níveis da escala"
        type="number"
        value={valor.configuracao.niveis}
        onChange={(e) => handleNiveisChange(e.target.value)}
        disabled={somenteLeitura}
        slotProps={{ htmlInput: { min: NIVEIS_MIN, max: NIVEIS_MAX } }}
        sx={{ maxWidth: 220 }}
      />
      <div className="flex flex-col gap-2">
        {valor.configuracao.rotulos.map((rotulo, indice) => (
          <TextField
            key={indice}
            label={`Rótulo do nível ${indice + 1}`}
            value={rotulo}
            onChange={(e) => handleRotuloChange(indice, e.target.value)}
            disabled={somenteLeitura}
            fullWidth
          />
        ))}
      </div>
    </div>
  )
}
