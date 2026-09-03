import { useState, type FormEvent } from 'react'
import { Button, TextField, Typography } from '@mui/material'
import { ApiError } from '../../lib/apiClient'
import { confirmarCpf } from '../../services/respostaPublicaService'
import type { TipoPesquisa } from '../../types/pesquisa'
import type { CodigoErroColetaPublica } from '../../types/respostaPublica'
import { cpfValido, formatarCpf, normalizarCpf } from '../../utils/cpf'

interface ConfirmarCpfFormProps {
  token: string
  onConfirmado: (resultado: { sessaoToken: string; tipoPesquisa: TipoPesquisa }) => void
  onErroTerminal: (codigo: CodigoErroColetaPublica) => void
}

const CODIGOS_TERMINAIS: CodigoErroColetaPublica[] = [
  'LINK_INVALIDO',
  'BLOQUEADO_TENTATIVAS_CPF',
  'CICLO_OU_PESQUISA_INATIVOS',
  'ENVIO_EXPIRADO',
  'JA_RESPONDIDO',
]

function ehCodigoTerminal(codigo: string | undefined): codigo is CodigoErroColetaPublica {
  return CODIGOS_TERMINAIS.includes(codigo as CodigoErroColetaPublica)
}

/**
 * Tela de confirmação de CPF do fluxo público. `422 CPF_NAO_CONFERE` é
 * tratado inline (fica nesta mesma tela, campo editável, sem contador de
 * tentativas exibido) — só erros terminais (link/bloqueio/ciclo
 * inativo/expirado/já respondido, incluindo bloqueio por tentativas
 * esgotadas) sobem ao componente pai via `onErroTerminal`.
 */
export function ConfirmarCpfForm({ token, onConfirmado, onErroTerminal }: ConfirmarCpfFormProps) {
  const [cpf, setCpf] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroInline, setErroInline] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (enviando || !cpfValido(cpf)) return

    setEnviando(true)
    setErroInline(null)
    try {
      const resultado = await confirmarCpf(token, normalizarCpf(cpf))
      onConfirmado({ sessaoToken: resultado.sessaoToken, tipoPesquisa: resultado.tipoPesquisa })
    } catch (erro) {
      if (erro instanceof ApiError) {
        if (erro.codigo === 'CPF_NAO_CONFERE') {
          setErroInline('CPF não confere. Verifique e tente novamente.')
          setEnviando(false)
          return
        }
        if (ehCodigoTerminal(erro.codigo)) {
          onErroTerminal(erro.codigo)
          return
        }
      }
      setErroInline('Não foi possível confirmar seus dados. Tente novamente em instantes.')
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <div className="flex w-full max-w-[380px] flex-col items-center">
        <img src="/logo.jpg" alt="Avalia360" className="mb-8 w-[280px]" />

        <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-4">
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            Confirme seu CPF para acessar o formulário.
          </Typography>

          <TextField
            id="responder-cpf"
            label="CPF"
            value={cpf}
            onChange={(e) => setCpf(formatarCpf(e.target.value))}
            disabled={enviando}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            fullWidth
            autoFocus
          />

          {erroInline && (
            <Typography role="alert" color="error" variant="body2" sx={{ textAlign: 'left' }}>
              {erroInline}
            </Typography>
          )}

          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={enviando || !cpfValido(cpf)}
            size="large"
            sx={{ mt: 1 }}
          >
            {enviando ? 'Confirmando...' : 'Confirmar'}
          </Button>
        </form>
      </div>
    </div>
  )
}
