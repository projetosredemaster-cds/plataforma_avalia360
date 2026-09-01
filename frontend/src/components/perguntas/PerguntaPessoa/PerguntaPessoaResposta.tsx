import { Autocomplete, FormLabel, TextField } from '@mui/material'

export interface ColaboradorOpcao {
  id: string
  nomeCompleto: string
}

export interface RespostaPessoa {
  colaboradorId: string
}

interface PerguntaPessoaRespostaProps {
  enunciado: string
  obrigatoria: boolean
  /** Lista de colaboradores elegíveis, recebida via prop — este componente nunca busca sozinho. */
  opcoes: ColaboradorOpcao[]
  valor: RespostaPessoa | null
  onChange: (valor: RespostaPessoa) => void
}

export function PerguntaPessoaResposta({ enunciado, obrigatoria, opcoes, valor, onChange }: PerguntaPessoaRespostaProps) {
  const selecionado = opcoes.find((opcao) => opcao.id === valor?.colaboradorId) ?? null

  return (
    <div className="flex flex-col gap-2">
      <FormLabel>
        {enunciado}
        {obrigatoria && ' *'}
      </FormLabel>
      <Autocomplete
        options={opcoes}
        getOptionLabel={(opcao) => opcao.nomeCompleto}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        value={selecionado}
        onChange={(_, novoValor) => {
          if (novoValor) onChange({ colaboradorId: novoValor.id })
        }}
        renderInput={(params) => <TextField {...params} label="Colaborador" />}
      />
    </div>
  )
}
