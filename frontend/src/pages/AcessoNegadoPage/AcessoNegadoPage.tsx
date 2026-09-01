import { Button, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

/**
 * Exibida quando um usuário autenticado (sessão válida) não tem papel
 * permitido para a área acessada. Não lista nem sugere nenhuma das telas
 * protegidas — só orienta a sair.
 */
export function AcessoNegadoPage() {
  const { sair } = useAuth()
  const navigate = useNavigate()

  async function handleSair() {
    await sair()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <Typography variant="h5" component="h1">
        Acesso negado
      </Typography>
      <Typography color="text.secondary">Você não tem permissão para acessar esta área.</Typography>
      <Button variant="contained" color="primary" onClick={handleSair}>
        Sair
      </Button>
    </div>
  )
}
