import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material'
import { Check, Close, Visibility, VisibilityOff } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { avaliarCriteriosSenha, senhaValida } from '../../utils/senha'

type SessaoStatus = 'verificando' | 'valida' | 'invalida'

const TIMEOUT_VERIFICACAO_MS = 5000

/**
 * Página acessada a partir do link de "esqueci minha senha" enviado por
 * e-mail (ver EsqueciSenhaModal, `redirectTo`). O client Supabase processa
 * o token de recovery presente no hash da URL automaticamente
 * (`detectSessionInUrl`) e dispara o evento `PASSWORD_RECOVERY`.
 */
export function DefinirSenhaPage() {
  const navigate = useNavigate()
  const [sessaoStatus, setSessaoStatus] = useState<SessaoStatus>('verificando')
  const [senha, setSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [mostrarConfirmarSenha, setMostrarConfirmarSenha] = useState(false)
  const resolvidoRef = useRef(false)

  const criteriosSenha = useMemo(() => avaliarCriteriosSenha(senha), [senha])

  useEffect(() => {
    function marcarValida() {
      if (resolvidoRef.current) return
      resolvidoRef.current = true
      setSessaoStatus('valida')
    }

    function marcarInvalida() {
      if (resolvidoRef.current) return
      resolvidoRef.current = true
      setSessaoStatus('invalida')
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        marcarValida()
      } else if (event === 'SIGNED_OUT') {
        marcarInvalida()
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        marcarValida()
      }
    })

    const timeoutId = setTimeout(marcarInvalida, TIMEOUT_VERIFICACAO_MS)

    return () => {
      clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    setErrorMsg(null)

    if (!senha || !confirmarSenha) {
      setErrorMsg('Preencha os dois campos de senha.')
      return
    }
    if (!senhaValida(senha) || !senhaValida(confirmarSenha)) {
      setErrorMsg('A senha não atende a todos os critérios exigidos.')
      return
    }
    if (senha !== confirmarSenha) {
      setErrorMsg('As senhas não coincidem.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setLoading(false)

    if (error) {
      setErrorMsg('Não foi possível definir a senha. Tente novamente.')
      return
    }

    navigate('/login', {
      replace: true,
      state: { mensagem: 'Senha definida com sucesso. Faça login com sua nova senha.' },
    })
  }

  if (sessaoStatus === 'verificando') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
        <CircularProgress color="primary" />
        <Typography color="text.secondary">Verificando o link...</Typography>
      </div>
    )
  }

  if (sessaoStatus === 'invalida') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
        <Typography variant="h5" component="h1">
          Link inválido
        </Typography>
        <Typography color="text.secondary">
          Este link para definir senha é inválido ou expirou.
        </Typography>
        <Button variant="contained" color="primary" onClick={() => navigate('/login', { replace: true })}>
          Voltar para o login
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center">
      <div className="flex w-full max-w-[380px] flex-col items-center px-4">
        <img src="/logo.jpg" alt="Avalia360" className="mb-8 w-[320px]" />

        <Typography variant="h6" component="h1" sx={{ mb: 2, alignSelf: 'flex-start' }}>
          Definir nova senha
        </Typography>

        <form onSubmit={handleSubmit} noValidate className="flex w-full flex-col gap-4">
          <TextField
            id="definir-senha-senha"
            label="Nova senha"
            type={mostrarSenha ? 'text' : 'password'}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            disabled={loading}
            autoComplete="new-password"
            fullWidth
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

          <List dense disablePadding aria-label="Critérios de senha" className="w-full">
            {[
              { atendido: criteriosSenha.tamanhoMinimo, texto: 'Mínimo de 6 caracteres' },
              { atendido: criteriosSenha.maiuscula, texto: 'Pelo menos 1 letra maiúscula' },
              { atendido: criteriosSenha.minuscula, texto: 'Pelo menos 1 letra minúscula' },
              { atendido: criteriosSenha.caractereEspecial, texto: 'Pelo menos 1 caractere especial' },
            ].map((criterio) => (
              <ListItem key={criterio.texto} disableGutters disablePadding>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {criterio.atendido ? (
                    <Check fontSize="small" color="success" />
                  ) : (
                    <Close fontSize="small" color="disabled" />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={criterio.texto}
                  slotProps={{
                    primary: {
                      variant: 'body2',
                      color: criterio.atendido ? 'success.main' : 'text.secondary',
                    },
                  }}
                />
              </ListItem>
            ))}
          </List>

          <TextField
            id="definir-senha-confirmar"
            label="Confirmar nova senha"
            type={mostrarConfirmarSenha ? 'text' : 'password'}
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            disabled={loading}
            autoComplete="new-password"
            fullWidth
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={mostrarConfirmarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                      onClick={() => setMostrarConfirmarSenha((prev) => !prev)}
                      edge="end"
                    >
                      {mostrarConfirmarSenha ? <VisibilityOff /> : <Visibility />}
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
            {loading ? 'Salvando...' : 'Salvar nova senha'}
          </Button>
        </form>
      </div>
    </div>
  )
}
