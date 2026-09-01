import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'

interface ConfirmDialogProps {
  open: boolean
  titulo: string
  mensagem: string
  confirmarLabel?: string
  cancelarLabel?: string
  carregando?: boolean
  /** Mensagem de erro vinda da API (ex.: falha ao excluir equipe vinculada) — exibida dentro do dialog, sem fechá-lo. */
  erro?: string | null
  onConfirmar: () => void
  onCancelar: () => void
}

/**
 * Dialog de confirmação genérico, reaproveitado para inativar/reativar
 * colaborador e excluir equipe. Fecha por ESC/clique fora/cancelar, exceto
 * enquanto `carregando`.
 */
export function ConfirmDialog({
  open,
  titulo,
  mensagem,
  confirmarLabel = 'Confirmar',
  cancelarLabel = 'Cancelar',
  carregando = false,
  erro,
  onConfirmar,
  onCancelar,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={carregando ? undefined : onCancelar} fullWidth maxWidth="xs">
      <DialogTitle>{titulo}</DialogTitle>
      <DialogContent>
        <DialogContentText>{mensagem}</DialogContentText>
        {erro && (
          <Alert severity="error" role="alert" sx={{ mt: 2 }}>
            {erro}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancelar} disabled={carregando}>
          {cancelarLabel}
        </Button>
        <Button onClick={onConfirmar} variant="contained" color="primary" disabled={carregando} autoFocus>
          {carregando ? 'Aguarde...' : confirmarLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
