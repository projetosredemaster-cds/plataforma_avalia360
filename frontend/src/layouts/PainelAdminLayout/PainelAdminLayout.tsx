import { useState } from 'react'
import {
  AppBar,
  Box,
  Button,
  Collapse,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material'
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined'
import PersonOutlineIcon from '@mui/icons-material/PersonOutlineOutlined'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import WorkOutlineIcon from '@mui/icons-material/WorkOutlineOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const SIDEBAR_WIDTH = 240

type MenuItem = {
  to: string
  label: string
  icon: React.ReactNode
}

type MenuGroup = {
  key: string
  label: string
  icon: React.ReactNode
  items: MenuItem[]
}

const GRUPOS: MenuGroup[] = [
  {
    key: 'cadastro',
    label: 'Cadastro',
    icon: <BadgeOutlinedIcon fontSize="small" />,
    items: [
      { to: '/colaboradores', label: 'Colaboradores', icon: <PersonOutlineIcon fontSize="small" /> },
      { to: '/equipes', label: 'Equipes', icon: <GroupsOutlinedIcon fontSize="small" /> },
    ],
  },
  {
    key: 'operacao',
    label: 'Operação',
    icon: <WorkOutlineIcon fontSize="small" />,
    items: [
      { to: '/pesquisas', label: 'Pesquisas', icon: <DescriptionOutlinedIcon fontSize="small" /> },
      { to: '/ciclos', label: 'Ciclos', icon: <AutorenewOutlinedIcon fontSize="small" /> },
    ],
  },
]

function grupoAtivo(pathname: string): string | null {
  const grupo = GRUPOS.find((g) => g.items.some((item) => pathname.startsWith(item.to)))
  return grupo?.key ?? null
}

export function PainelAdminLayout() {
  const { colaborador, sair } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [grupoAberto, setGrupoAberto] = useState<string | null>(() => grupoAtivo(location.pathname))

  async function handleSair() {
    await sair()
    navigate('/login', { replace: true })
  }

  function toggleGrupo(key: string) {
    setGrupoAberto((atual) => (atual === key ? null : key))
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
        <Box className="flex h-full flex-col justify-between">
          <List component="nav" sx={{ px: 1 }}>
            {GRUPOS.map((grupo) => {
              const aberto = grupoAberto === grupo.key
              return (
                <Box key={grupo.key} sx={{ mb: 0.5 }}>
                  <ListItemButton
                    onClick={() => toggleGrupo(grupo.key)}
                    sx={{ borderRadius: 2 }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>{grupo.icon}</ListItemIcon>
                    <ListItemText
                      primary={grupo.label}
                      slotProps={{ primary: { sx: { fontWeight: 600 } } }}
                    />
                    {aberto ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </ListItemButton>
                  <Collapse in={aberto} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                      {grupo.items.map((item) => (
                        <ListItemButton
                          key={item.to}
                          component={NavLink}
                          to={item.to}
                          sx={{
                            pl: 4,
                            borderRadius: 2,
                            '&.active': {
                              fontWeight: 700,
                              backgroundColor: 'action.selected',
                            },
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                          <ListItemText primary={item.label} />
                        </ListItemButton>
                      ))}
                    </List>
                  </Collapse>
                </Box>
              )
            })}
          </List>

          <Box sx={{ px: 1, pb: 2 }}>
            <Divider sx={{ mb: 1 }} />
            <ListItemButton sx={{ borderRadius: 2 }}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <SettingsOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Configurações" />
            </ListItemButton>
          </Box>
        </Box>
      </Drawer>

      <Box component="main" className="p-6" sx={{ marginLeft: `${SIDEBAR_WIDTH}px` }}>
        <Toolbar />
        <Outlet />
      </Box>
    </div>
  )
}
