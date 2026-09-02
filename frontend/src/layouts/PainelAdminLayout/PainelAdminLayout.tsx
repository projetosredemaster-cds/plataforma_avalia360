import {
  AppBar,
  Box,
  Button,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const SIDEBAR_WIDTH = 220

const LINKS = [
  { to: '/colaboradores', label: 'Colaboradores' },
  { to: '/equipes', label: 'Equipes' },
  { to: '/pesquisas', label: 'Pesquisas' },
  { to: '/ciclos', label: 'Ciclos' },
]

export function PainelAdminLayout() {
  const { colaborador, sair } = useAuth()
  const navigate = useNavigate()

  async function handleSair() {
    await sair()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-svh bg-gray-50">
      <AppBar position="fixed" color="primary" elevation={0} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar className="gap-4">
          <img src="/logo.png" alt="Avalia360" className="mr-4 h-8 w-auto" />
          <Box className="flex-1" />
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

      <Drawer
        variant="permanent"
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <List>
          {LINKS.map((link) => (
            <ListItemButton
              key={link.to}
              component={NavLink}
              to={link.to}
              sx={{
                '&.active': {
                  fontWeight: 700,
                  backgroundColor: 'action.selected',
                },
              }}
            >
              <ListItemText primary={link.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      <Box component="main" className="p-6" sx={{ marginLeft: `${SIDEBAR_WIDTH}px` }}>
        <Toolbar />
        <Outlet />
      </Box>
    </div>
  )
}
