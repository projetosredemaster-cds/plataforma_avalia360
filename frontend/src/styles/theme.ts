import { createTheme, alpha, darken, lighten } from '@mui/material/styles'

/**
 * Paleta "Coastal Citrus": Amalfi Tile (primary), Citrus Zest (secondary),
 * Sea Breeze (info) e Cream Gelato como tom suave de destaque (cream, usado
 * em chips/hover/alerts — nunca como primary/secondary). Tipografia em
 * Figtree Light (300), cantos bem arredondados e componentes com fundo
 * suave em vez de cores sólidas. Reaproveitável em todo o produto.
 */

const CREAM_MAIN = '#F8E6A0'

declare module '@mui/material/styles' {
  interface Palette {
    cream: Palette['primary']
  }
  interface PaletteOptions {
    cream?: PaletteOptions['primary']
  }
}

export const theme = createTheme({
  palette: {
    primary: {
      main: '#2E5AA7',
    },
    secondary: {
      main: '#FFA62B',
    },
    info: {
      main: '#86C5FF',
    },
    cream: {
      main: CREAM_MAIN,
      light: lighten(CREAM_MAIN, 0.3),
      dark: darken(CREAM_MAIN, 0.2),
      contrastText: '#4A3B12',
    },
  },
  shape: {
    borderRadius: 18,
  },
  typography: {
    fontFamily: ['Figtree', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'].join(','),
    fontWeightLight: 300,
    fontWeightRegular: 300,
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
        root: ({ theme }) => ({
          borderRadius: theme.shape.borderRadius,
        }),
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 500,
        },
      },
      variants: [
        {
          props: { variant: 'filled', color: 'primary' },
          style: ({ theme }) => ({
            backgroundColor: alpha(theme.palette.primary.main, 0.16),
            color: theme.palette.primary.dark ?? theme.palette.primary.main,
          }),
        },
        {
          props: { variant: 'filled', color: 'secondary' },
          style: ({ theme }) => ({
            backgroundColor: alpha(theme.palette.secondary.main, 0.2),
            color: theme.palette.secondary.dark ?? theme.palette.secondary.main,
          }),
        },
        {
          props: { variant: 'filled', color: 'info' },
          style: ({ theme }) => ({
            backgroundColor: alpha(theme.palette.info.main, 0.24),
            color: theme.palette.info.dark ?? theme.palette.info.main,
          }),
        },
        {
          props: { variant: 'filled', color: 'success' },
          style: ({ theme }) => ({
            backgroundColor: alpha(theme.palette.success.main, 0.16),
            color: theme.palette.success.dark,
          }),
        },
        {
          props: { variant: 'filled', color: 'warning' },
          style: ({ theme }) => ({
            backgroundColor: alpha(theme.palette.warning.main, 0.2),
            color: theme.palette.warning.dark,
          }),
        },
        {
          props: { variant: 'filled', color: 'error' },
          style: ({ theme }) => ({
            backgroundColor: alpha(theme.palette.error.main, 0.16),
            color: theme.palette.error.dark,
          }),
        },
      ],
    },
    MuiAlert: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: theme.shape.borderRadius,
        }),
      },
      variants: [
        {
          props: { severity: 'success' },
          style: ({ theme }) => ({
            backgroundColor: alpha(theme.palette.success.main, 0.14),
            color: theme.palette.success.dark,
            '& .MuiAlert-icon': {
              color: theme.palette.success.main,
            },
          }),
        },
        {
          props: { severity: 'warning' },
          style: ({ theme }) => ({
            backgroundColor: alpha(theme.palette.warning.main, 0.16),
            color: theme.palette.warning.dark,
            '& .MuiAlert-icon': {
              color: theme.palette.warning.main,
            },
          }),
        },
        {
          props: { severity: 'error' },
          style: ({ theme }) => ({
            backgroundColor: alpha(theme.palette.error.main, 0.14),
            color: theme.palette.error.dark,
            '& .MuiAlert-icon': {
              color: theme.palette.error.main,
            },
          }),
        },
        {
          props: { severity: 'info' },
          style: ({ theme }) => ({
            backgroundColor: alpha(theme.palette.info.main, 0.2),
            color: darken(theme.palette.info.main, 0.4),
            '& .MuiAlert-icon': {
              color: theme.palette.info.main,
            },
          }),
        },
      ],
    },
  },
})
