import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, CircularProgress, TextField, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

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
  const resolvidoRef = useRef(false)

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
    if (senha.length < 6) {
      setErrorMsg('A senha deve ter no mínimo 6 caracteres.')
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
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            disabled={loading}
            autoComplete="new-password"
            fullWidth
          />
          <TextField
            id="definir-senha-confirmar"
            label="Confirmar nova senha"
            type="password"
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            disabled={loading}
            autoComplete="new-password"
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
            {loading ? 'Salvando...' : 'Salvar nova senha'}
          </Button>
        </form>
      </div>
    </div>
  )
}
