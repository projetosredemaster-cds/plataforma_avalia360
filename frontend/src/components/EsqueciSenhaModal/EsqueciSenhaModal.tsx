import { useRef, useState, type FormEvent } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from '@mui/material'
import { supabase } from '../../lib/supabaseClient'

type Status = 'idle' | 'loading' | 'success' | 'error'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface EsqueciSenhaModalProps {
  open: boolean
  onClose: () => void
}

/**
 * Modal de "Esqueci minha senha". Controlado via `open`/`onClose`. Estado
 * interno (e-mail digitado, status) é resetado sempre que o modal fecha.
 */
export function EsqueciSenhaModal({ open, onClose }: EsqueciSenhaModalProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)

  function resetState() {
    setEmail('')
    setStatus('idle')
    setErrorMsg(null)
  }

  function handleClose() {
    resetState()
    onClose()
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMsg(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setErrorMsg('Informe um e-mail válido.')
      return
    }

    setStatus('loading')
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}/definir-senha`,
    })

    if (error) {
      setStatus('error')
      setErrorMsg('Não foi possível enviar a solicitação. Tente novamente.')
      return
    }

    setStatus('success')
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="esqueci-senha-titulo"
      slotProps={{
        transition: {
          onEntered: () => emailInputRef.current?.focus(),
        },
      }}
    >
      <DialogTitle id="esqueci-senha-titulo" sx={{ color: 'primary.main', pr: 6 }}>
        Esqueci minha senha
      </DialogTitle>

      <IconButton
        aria-label="Fechar"
        onClick={handleClose}
        sx={{
          position: 'absolute',
          top: 12,
          right: 12,
          color: 'text.secondary',
          fontSize: 24,
          lineHeight: 1,
          '&:hover': { color: 'secondary.main' },
        }}
      >
        ×
      </IconButton>

      {status === 'success' ? (
        <>
          <DialogContent>
            <Typography variant="body2">
              Se o e-mail existir em nossa base, enviamos um link de
              redefinição de senha. Verifique sua caixa de entrada.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button
              type="button"
              variant="contained"
              color="primary"
              fullWidth
              onClick={handleClose}
            >
              Fechar
            </Button>
          </DialogActions>
        </>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2">
              Informe seu e-mail para receber um link de redefinição de
              senha.
            </Typography>
            <TextField
              id="esqueci-senha-email"
              label="E-mail"
              type="email"
              inputRef={emailInputRef}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === 'loading'}
              autoComplete="email"
              error={Boolean(errorMsg)}
              helperText={errorMsg}
              fullWidth
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Enviando...' : 'Enviar link'}
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  )
}
