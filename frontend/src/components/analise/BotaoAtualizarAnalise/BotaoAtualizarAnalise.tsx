import { Button } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'

interface BotaoAtualizarAnaliseProps {
  onClick: () => void
  atualizando: boolean
}

export function BotaoAtualizarAnalise({ onClick, atualizando }: BotaoAtualizarAnaliseProps) {
  return (
    <Button type="button" variant="outlined" startIcon={<RefreshIcon />} onClick={onClick} disabled={atualizando}>
      {atualizando ? 'Atualizando...' : 'Atualizar'}
    </Button>
  )
}
