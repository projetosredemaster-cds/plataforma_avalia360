import { useState, type FormEvent } from 'react'
import { Button, TextField, Typography } from '@mui/material'
import { supabase } from '../../lib/supabaseClient'
import { EsqueciSenhaModal } from '../../components/EsqueciSenhaModal/EsqueciSenhaModal'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    setErrorMsg(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setErrorMsg('Preencha e-mail e senha.')
      return
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setErrorMsg('Informe um e-mail válido.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    })
    setLoading(false)

    if (error) {
      setErrorMsg('E-mail ou senha inválidos.')
      return
    }
  }

  return (
    <div className="flex min-h-svh">
      <div className="hidden min-[900px]:flex flex-1 items-center justify-center bg-white">
        <img
          src="/imagem-tela-login.jpg"
          alt="Ilustração de colaborador acessando a plataforma Avalia360"
          className="block max-w-[60%] max-h-[80%] object-contain"
        />
      </div>

      <div className="flex flex-1 items-center justify-center pr-8">
        <div className="flex w-full max-w-[380px] flex-col items-center">
          <img src="/logo.jpg" alt="Avalia360" className="mb-8 w-[320px]" />

          <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-4">
            <TextField
              id="login-email"
              label="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="email"
              fullWidth
            />
            <TextField
              id="login-senha"
              label="Senha"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
              fullWidth
            />

            {errorMsg && (
              <Typography role="alert" color="error" variant="body2" sx={{ textAlign: 'left' }}>
                {errorMsg}
              </Typography>
            )}

            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={loading}
              size="large"
              sx={{ mt: 1 }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>

            <Button
              type="button"
              variant="text"
              color="primary"
              onClick={() => setModalOpen(true)}
              sx={{
                alignSelf: 'center',
                textDecoration: 'underline',
                '&:hover': { color: 'secondary.main', backgroundColor: 'transparent' },
              }}
            >
              Esqueci minha senha
            </Button>
          </form>
        </div>
      </div>

      <EsqueciSenhaModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
