import { useState } from 'react'
import {
  Button,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteIcon from '@mui/icons-material/Delete'
import type { ConfiguracaoCaixaSelecao } from '../../../types/pesquisa'

export interface PerguntaCaixaSelecaoValor {
  enunciado: string
  obrigatoria: boolean
  configuracao: ConfiguracaoCaixaSelecao
}

interface PerguntaCaixaSelecaoEditorProps {
  valor: PerguntaCaixaSelecaoValor
  onChange: (valor: PerguntaCaixaSelecaoValor) => void
  somenteLeitura?: boolean
}

/** Editor de lista de opções de texto — mesmo padrão de "mover para cima/baixo" já usado no restante do construtor (ver `PerguntaCard`). */
export function PerguntaCaixaSelecaoEditor({
  valor,
  onChange,
  somenteLeitura = false,
}: PerguntaCaixaSelecaoEditorProps) {
  const [novaOpcao, setNovaOpcao] = useState('')

  function atualizarOpcoes(opcoes: string[]) {
    onChange({ ...valor, configuracao: { opcoes } })
  }

  function handleAdicionarOpcao() {
    const texto = novaOpcao.trim()
    if (!texto) return
    atualizarOpcoes([...valor.configuracao.opcoes, texto])
    setNovaOpcao('')
  }

  function handleRemoverOpcao(indice: number) {
    atualizarOpcoes(valor.configuracao.opcoes.filter((_, i) => i !== indice))
  }

  function handleMoverOpcao(indice: number, direcao: -1 | 1) {
    const alvo = indice + direcao
    if (alvo < 0 || alvo >= valor.configuracao.opcoes.length) return
    const copia = [...valor.configuracao.opcoes]
    ;[copia[indice], copia[alvo]] = [copia[alvo], copia[indice]]
    atualizarOpcoes(copia)
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

      <Typography variant="body2" color="text.secondary">
        Opções que o colaborador poderá marcar (nenhum mínimo/máximo de seleções nesta versão).
      </Typography>

      {valor.configuracao.opcoes.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          Nenhuma opção adicionada ainda.
        </Typography>
      )}

      <List dense sx={{ maxHeight: 320, overflowY: 'auto' }}>
        {valor.configuracao.opcoes.map((opcao, indice) => (
          <ListItem
            key={indice}
            disableGutters
            secondaryAction={
              !somenteLeitura && (
                <div className="flex items-center gap-1">
                  <IconButton
                    size="small"
                    aria-label="Mover opção para cima"
                    disabled={indice === 0}
                    onClick={() => handleMoverOpcao(indice, -1)}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label="Mover opção para baixo"
                    disabled={indice === valor.configuracao.opcoes.length - 1}
                    onClick={() => handleMoverOpcao(indice, 1)}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label="Remover opção"
                    color="error"
                    onClick={() => handleRemoverOpcao(indice)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </div>
              )
            }
          >
            <TextField
              value={opcao}
              onChange={(e) => {
                const copia = [...valor.configuracao.opcoes]
                copia[indice] = e.target.value
                atualizarOpcoes(copia)
              }}
              disabled={somenteLeitura}
              fullWidth
              size="small"
              sx={{ mr: 12 }}
            />
          </ListItem>
        ))}
      </List>

      {!somenteLeitura && (
        <div className="flex items-center gap-2">
          <TextField
            label="Nova opção"
            value={novaOpcao}
            onChange={(e) => setNovaOpcao(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAdicionarOpcao()
              }
            }}
            size="small"
            fullWidth
          />
          <Button variant="outlined" onClick={handleAdicionarOpcao} disabled={!novaOpcao.trim()}>
            Adicionar
          </Button>
        </div>
      )}
    </div>
  )
}
