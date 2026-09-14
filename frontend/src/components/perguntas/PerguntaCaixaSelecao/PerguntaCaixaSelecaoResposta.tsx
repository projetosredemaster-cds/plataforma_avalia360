import { Checkbox, FormControlLabel, FormGroup, FormHelperText, FormLabel } from '@mui/material'
import type { ConfiguracaoCaixaSelecao } from '../../../types/pesquisa'

export interface RespostaCaixaSelecao {
  opcoes: string[]
}

interface PerguntaCaixaSelecaoRespostaProps {
  enunciado: string
  obrigatoria: boolean
  configuracao: ConfiguracaoCaixaSelecao
  valor: RespostaCaixaSelecao | null
  onChange: (valor: RespostaCaixaSelecao) => void
  /** Destaca a pergunta como obrigatória não respondida numa tentativa de envio. */
  erro?: boolean
}

/** Grupo de checkboxes — o colaborador pode marcar quantas opções quiser (zero, uma, várias ou todas). */
export function PerguntaCaixaSelecaoResposta({
  enunciado,
  obrigatoria,
  configuracao,
  valor,
  onChange,
  erro,
}: PerguntaCaixaSelecaoRespostaProps) {
  const selecionadas = valor?.opcoes ?? []

  function handleToggle(opcao: string, marcado: boolean) {
    const novasOpcoes = marcado
      ? [...selecionadas, opcao]
      : selecionadas.filter((selecionada) => selecionada !== opcao)
    onChange({ opcoes: novasOpcoes })
  }

  return (
    <div className="flex flex-col gap-2">
      <FormLabel error={erro} component="legend">
        {enunciado}
        {obrigatoria && ' *'}
      </FormLabel>
      <FormGroup>
        {configuracao.opcoes.map((opcao) => (
          <FormControlLabel
            key={opcao}
            control={
              <Checkbox
                checked={selecionadas.includes(opcao)}
                onChange={(e) => handleToggle(opcao, e.target.checked)}
              />
            }
            label={opcao}
          />
        ))}
      </FormGroup>
      {erro && <FormHelperText error>Marque ao menos uma opção.</FormHelperText>}
    </div>
  )
}
