import { useState, type FormEvent } from 'react'
import { Box, Button, IconButton, InputAdornment, Paper, TextField, Typography } from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { EsqueciSenhaModal } from '../../components/EsqueciSenhaModal/EsqueciSenhaModal'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface LoginLocationState {
  mensagem?: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const successMsg = (location.state as LoginLocationState | null)?.mensagem ?? null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [mostrarSenha, setMostrarSenha] = useState(false)

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

    navigate('/colaboradores', { replace: true })
  }

  return (
    <Box
      className="flex min-h-svh items-center justify-center p-4 sm:p-8"
      sx={{
        background: "url('/wallpaper-login.jpeg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <Paper
        elevation={4}
        className="flex w-full max-w-[960px] flex-col min-[900px]:flex-row"
        sx={{ overflow: 'hidden' }}
      >
        <Box
          className="hidden min-[900px]:flex flex-1"
          sx={{
            background: (t) =>
              `linear-gradient(135deg, ${t.palette.primary.main} 0%, ${t.palette.secondary.main} 100%)`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Box
            component="img"
            src="/imagem.png"
            alt="Ilustração de colaborador acessando a plataforma Avalia360"
            sx={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: 'auto',
              height: '115%',
              maxWidth: 'none',
              objectFit: 'contain',
            }}
          />
        </Box>

        <Box className="flex flex-1 items-center justify-center p-8" sx={{ bgcolor: '#D2ECFA' }}>
          <div className="flex w-full max-w-[380px] flex-col items-center">
            <img src="/logo.png" alt="Avalia360" className="mb-8 w-[320px]" />

            <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-4">
              {successMsg && (
                <Typography role="status" color="success.main" variant="body2" sx={{ textAlign: 'left' }}>
                  {successMsg}
                </Typography>
              )}
              <TextField
                id="login-email"
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
                fullWidth
                sx={{
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                    '& .MuiOutlinedInput-root': {
                    borderRadius: '12px',
                  },
                }}
              />
              <TextField
                id="login-senha"
                label="Senha"
                type={mostrarSenha ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
                fullWidth
                sx={{
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                    '& .MuiOutlinedInput-root': {
                    borderRadius: '12px',
                  },
                }}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                          onClick={() => setMostrarSenha((prev) => !prev)}
                          edge="end"
                        >
                          {mostrarSenha ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
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
                onClick={() => setModalOpen(true)}
                sx={{
                  color: 'unset',
                  fontStyle: 'oblique',
                  alignSelf: 'center',
                  '&:hover': { color:  '#ffffff', backgroundColor: 'transparent' },
                }}
              >
                Esqueci minha senha
              </Button>
            </form>
          </div>
        </Box>
      </Paper>

      <EsqueciSenhaModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </Box>
  )
}
