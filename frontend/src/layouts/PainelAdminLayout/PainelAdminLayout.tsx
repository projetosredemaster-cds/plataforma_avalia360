import { AppBar, Box, Button, Toolbar, Typography } from '@mui/material'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

/**
 * Shell simples (AppBar + links) para as telas de cadastro de colaboradores
 * e equipes. Só existe dentro da árvore já protegida por
 * `RotaProtegida papeis={['admin','gestor_rh']}` — por construção um
 * `colaborador` nunca chega a montar este layout. Quando o projeto ganhar um
 * shell de navegação global compartilhado com telas de `colaborador`, esse
 * shell deverá reusar `useAuth().colaborador.papel` para decidir se mostra
 * os links "Colaboradores"/"Equipes" — fora de escopo desta task.
 */
export function PainelAdminLayout() {
  const { colaborador, sair } = useAuth()
  const navigate = useNavigate()

  async function handleSair() {
    await sair()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-svh bg-gray-50">
      <AppBar position="static" color="primary" elevation={0}>
        <Toolbar className="gap-4">
          <img src="/logo.jpg" alt="Avalia360" className="mr-4 h-8 w-auto" />
          <Box className="flex flex-1 gap-2">
            <Button
              component={NavLink}
              to="/colaboradores"
              color="inherit"
              sx={{ '&.active': { fontWeight: 700, textDecoration: 'underline' } }}
            >
              Colaboradores
            </Button>
            <Button
              component={NavLink}
              to="/equipes"
              color="inherit"
              sx={{ '&.active': { fontWeight: 700, textDecoration: 'underline' } }}
            >
              Equipes
            </Button>
          </Box>
          {colaborador && (
            <Typography variant="body2" sx={{ mr: 2 }}>
              {colaborador.nomeCompleto}
            </Typography>
          )}
          <Button color="inherit" onClick={handleSair}>
            Sair
          </Button>
        </Toolbar>
      </AppBar>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
