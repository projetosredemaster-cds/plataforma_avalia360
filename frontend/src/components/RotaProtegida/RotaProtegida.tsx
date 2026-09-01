import { Button, CircularProgress, Typography } from '@mui/material'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { AcessoNegadoPage } from '../../pages/AcessoNegadoPage/AcessoNegadoPage'
import type { Papel } from '../../types/colaborador'

interface RotaProtegidaProps {
  papeis: Papel[]
}

/**
 * Guard de rota. Nenhuma chamada de dados das telas filhas dispara antes de
 * `status === 'autenticado'` com papel confirmado, porque as rotas
 * protegidas só são montadas (via `<Outlet/>`) nesse caso.
 */
export function RotaProtegida({ papeis }: RotaProtegidaProps) {
  const { status, colaborador, erro, tentarNovamente } = useAuth()

  if (status === 'carregando') {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <CircularProgress color="primary" />
      </div>
    )
  }

  if (status === 'nao_autenticado') {
    return <Navigate to="/login" replace />
  }

  if (status === 'erro') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
        <Typography role="alert" color="error">
          {erro ?? 'Não foi possível confirmar sua sessão.'}
        </Typography>
        <Button variant="contained" color="primary" onClick={tentarNovamente}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  if (!colaborador || !papeis.includes(colaborador.papel)) {
    return <AcessoNegadoPage />
  }

  return <Outlet />
}
