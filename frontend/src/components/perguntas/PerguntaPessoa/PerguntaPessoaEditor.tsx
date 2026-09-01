import { FormControlLabel, MenuItem, Select, Switch, TextField, type SelectChangeEvent } from '@mui/material'
import type { ConfiguracaoPessoa } from '../../../types/pesquisa'

export interface PerguntaPessoaValor {
  enunciado: string
  obrigatoria: boolean
  configuracao: ConfiguracaoPessoa
}

interface PerguntaPessoaEditorProps {
  valor: PerguntaPessoaValor
  onChange: (valor: PerguntaPessoaValor) => void
  somenteLeitura?: boolean
}

/** Confirmado pelo contrato real do backend (camelCase, não `filtro_relacionamento`). */
const RELACIONAMENTO_OPCOES: { valor: string; label: string }[] = [
  { valor: 'autoavaliacao', label: 'Autoavaliação' },
  { valor: 'gestor', label: 'Gestor' },
  { valor: 'pares', label: 'Pares' },
  { valor: 'subordinado', label: 'Subordinado' },
  { valor: 'externo', label: 'Externo' },
]

export function PerguntaPessoaEditor({ valor, onChange, somenteLeitura = false }: PerguntaPessoaEditorProps) {
  function handleFiltroChange(evento: SelectChangeEvent<string[]>) {
    const selecionados =
      typeof evento.target.value === 'string' ? evento.target.value.split(',') : evento.target.value
    onChange({ ...valor, configuracao: { filtroRelacionamento: selecionados } })
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
      <Select
        multiple
        displayEmpty
        value={valor.configuracao.filtroRelacionamento}
        onChange={handleFiltroChange}
        disabled={somenteLeitura}
        renderValue={(selecionados) =>
          selecionados.length === 0
            ? 'Selecione ao menos 1 relacionamento'
            : selecionados.map((v) => RELACIONAMENTO_OPCOES.find((o) => o.valor === v)?.label ?? v).join(', ')
        }
      >
        {RELACIONAMENTO_OPCOES.map((opcao) => (
          <MenuItem key={opcao.valor} value={opcao.valor}>
            {opcao.label}
          </MenuItem>
        ))}
      </Select>
    </div>
  )
}
