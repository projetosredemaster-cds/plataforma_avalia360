import { Checkbox, FormControl, FormControlLabel, FormGroup, FormHelperText, FormLabel } from '@mui/material'
import { TIPOS_RELACIONAMENTO_GERAVEL } from '../rotulosTiposRelacionamentoGerados'
import type { TipoRelacionamentoGeravel } from '../../../types/ciclo'

interface TiposRelacionamentoCheckboxGroupProps {
  value: TipoRelacionamentoGeravel[]
  onChange: (value: TipoRelacionamentoGeravel[]) => void
  disabled?: boolean
  error?: boolean
  helperText?: string
}

/**
 * Grupo controlado de checkboxes para `tiposRelacionamentoGerados` —
 * reaproveitado por `CicloFormPage` (criação) e `CicloDadosForm` (edição).
 * Puramente controlado (`value`/`onChange` via props), sem estado interno e
 * sem chamada de API — a página/formulário pai persiste.
 */
export function TiposRelacionamentoCheckboxGroup({
  value,
  onChange,
  disabled,
  error,
  helperText,
}: TiposRelacionamentoCheckboxGroupProps) {
  function alternar(valor: TipoRelacionamentoGeravel, marcado: boolean) {
    if (marcado) {
      onChange(TIPOS_RELACIONAMENTO_GERAVEL.map((item) => item.valor).filter((v) => v === valor || value.includes(v)))
    } else {
      onChange(value.filter((v) => v !== valor))
    }
  }

  return (
    <FormControl error={error} component="fieldset" variant="standard">
      <FormLabel component="legend">Tipos de relação gerados automaticamente na ativação</FormLabel>
      <FormGroup>
        {TIPOS_RELACIONAMENTO_GERAVEL.map((item) => (
          <FormControlLabel
            key={item.valor}
            control={
              <Checkbox
                checked={value.includes(item.valor)}
                onChange={(e) => alternar(item.valor, e.target.checked)}
                disabled={disabled}
              />
            }
            label={item.rotulo}
          />
        ))}
      </FormGroup>
      <FormHelperText>
        {helperText ??
          'Define quais tipos de relação serão gerados automaticamente quando o ciclo for ativado — pelo menos um precisa estar marcado.'}
      </FormHelperText>
    </FormControl>
  )
}
