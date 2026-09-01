import { Autocomplete, FormControlLabel, Switch, TextField } from '@mui/material'
import type { Competencia } from '../../../types/competencia'
import type { ConfiguracaoLikert } from '../../../types/pesquisa'
import { NIVEIS_MAX, NIVEIS_MIN, ajustarRotulosParaNiveis } from '../validacaoPergunta'

export interface PerguntaMatrizValor {
  enunciado: string
  obrigatoria: boolean
  /** Mesmo formato `{ niveis, rotulos }` do likert, aplicado por competência na resposta. */
  configuracao: ConfiguracaoLikert
  /**
   * Campo de nível superior da pergunta (irmão de `configuracao`) — nunca
   * aninhado dentro de `configuracao` (contrato confirmado em
   * `task-backend.md`).
   */
  competenciaIds: string[]
}

interface PerguntaMatrizEditorProps {
  valor: PerguntaMatrizValor
  onChange: (valor: PerguntaMatrizValor) => void
  /** Buscada uma vez pela página pai (`PesquisaConstrutorPage`) — este editor nunca chama a API. */
  competencias: Competencia[]
  somenteLeitura?: boolean
}

export function PerguntaMatrizEditor({
  valor,
  onChange,
  competencias,
  somenteLeitura = false,
}: PerguntaMatrizEditorProps) {
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

  const competenciasSelecionadas = competencias.filter((competencia) => valor.competenciaIds.includes(competencia.id))

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
      <Autocomplete
        multiple
        options={competencias}
        getOptionLabel={(competencia) => competencia.nome}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        value={competenciasSelecionadas}
        onChange={(_, novasCompetencias) => onChange({ ...valor, competenciaIds: novasCompetencias.map((c) => c.id) })}
        disabled={somenteLeitura}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Competências avaliadas"
            placeholder={competenciasSelecionadas.length === 0 ? 'Selecione ao menos 1 competência' : undefined}
            required
          />
        )}
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
