import { createTheme } from '@mui/material/styles'

/**
 * Paleta extraída do logo (frontend/public/logo.jpg): navy marinho do
 * texto "avalia" e da faixa "REDE MASTER" (primary), e dourado do "360" e
 * das bordas (secondary). Reaproveitável em outras telas do produto.
 */
export const theme = createTheme({
  palette: {
    primary: {
      main: '#16305c',
      dark: '#0e2044',
    },
    secondary: {
      main: '#c9a227',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 999,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 999,
        },
      },
    },
  },
})
