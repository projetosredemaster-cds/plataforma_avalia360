import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Chip,
  MenuItem,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog'
import { TabelaEstado } from '../../components/TabelaEstado/TabelaEstado'
import { ApiError } from '../../lib/apiClient'
import { atualizarStatusColaborador, listarColaboradores } from '../../services/colaboradoresService'
import type { Colaborador } from '../../types/colaborador'

type FiltroStatus = 'ativos' | 'inativos' | 'todos'

interface LocationState {
  successMessage?: string
  warningMessage?: string
}

const PAPEL_LABEL: Record<Colaborador['papel'], string> = {
  admin: 'Administrador',
  gestor_rh: 'Gestor de RH',
  colaborador: 'Colaborador',
}

const NUMERO_COLUNAS = 8

/**
 * `GET /api/colaboradores` retorna um array completo, sem paginação/filtros
 * no servidor (decisão do backend). Busca, status e paginação desta tela são
 * inteiramente client-side, sobre o array completo já carregado.
 */
export function ColaboradoresListPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [buscaInput, setBuscaInput] = useState('')
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<FiltroStatus>('ativos')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)

  const [dialogAlvo, setDialogAlvo] = useState<Colaborador | null>(null)
  const [alterandoStatus, setAlterandoStatus] = useState(false)
  const [erroDialog, setErroDialog] = useState<string | null>(null)

  const [snackbar, setSnackbar] = useState<{ mensagem: string; severidade: 'success' | 'warning' } | null>(null)

  // Lê mensagem de sucesso/aviso transitória vinda da navegação do formulário
  // (criação/edição) e limpa o state da rota para não reexibir em refresh/voltar.
  // Sincroniza com o histórico do router (sistema externo ao React) — não é
  // dado derivável durante a renderização.
  useEffect(() => {
    const state = location.state as LocationState | null
    if (state?.successMessage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSnackbar({ mensagem: state.successMessage, severidade: 'success' })
    } else if (state?.warningMessage) {
      setSnackbar({ mensagem: state.warningMessage, severidade: 'warning' })
    }
    if (state) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate])

  useEffect(() => {
    const timer = setTimeout(() => setBusca(buscaInput), 400)
    return () => clearTimeout(timer)
  }, [buscaInput])

  const carregarColaboradores = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const dados = await listarColaboradores()
      setColaboradores(dados)
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar os colaboradores.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    // Carga inicial dos colaboradores via API — não é dado derivável durante a
    // renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarColaboradores()
  }, [carregarColaboradores])

  const listaFiltrada = useMemo(() => {
    const buscaNormalizada = busca.trim().toLowerCase()
    return colaboradores.filter((colaborador) => {
      if (statusFiltro === 'ativos' && !colaborador.ativo) return false
      if (statusFiltro === 'inativos' && colaborador.ativo) return false
      if (!buscaNormalizada) return true
      return (
        colaborador.nomeCompleto.toLowerCase().includes(buscaNormalizada) ||
        colaborador.email.toLowerCase().includes(buscaNormalizada)
      )
    })
  }, [colaboradores, busca, statusFiltro])

  // Reseta a paginação quando o filtro muda — ajuste de estado durante a
  // renderização (padrão documentado do React), em vez de um efeito.
  const [filtrosAnteriores, setFiltrosAnteriores] = useState({ busca, statusFiltro })
  if (filtrosAnteriores.busca !== busca || filtrosAnteriores.statusFiltro !== statusFiltro) {
    setFiltrosAnteriores({ busca, statusFiltro })
    setPage(0)
  }

  const listaPaginada = useMemo(() => {
    const inicio = page * rowsPerPage
    return listaFiltrada.slice(inicio, inicio + rowsPerPage)
  }, [listaFiltrada, page, rowsPerPage])

  async function handleConfirmarStatus() {
    if (!dialogAlvo) return
    setAlterandoStatus(true)
    setErroDialog(null)
    try {
      await atualizarStatusColaborador(dialogAlvo.id, !dialogAlvo.ativo)
      setDialogAlvo(null)
      await carregarColaboradores()
    } catch (err) {
      setErroDialog(err instanceof ApiError ? err.message : 'Não foi possível alterar o status do colaborador.')
    } finally {
      setAlterandoStatus(false)
    }
  }

  const filtroAtivo = busca.trim().length > 0 || statusFiltro !== 'ativos'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="h5" component="h1">
          Colaboradores
        </Typography>
        <Button variant="contained" color="primary" onClick={() => navigate('/colaboradores/novo')}>
          Novo colaborador
        </Button>
      </div>

      <div className="flex flex-wrap gap-4">
        <TextField
          label="Buscar por nome ou e-mail"
          value={buscaInput}
          onChange={(e) => setBuscaInput(e.target.value)}
          sx={{ minWidth: 280 }}
        />
        <TextField
          select
          label="Status"
          value={statusFiltro}
          onChange={(e) => setStatusFiltro(e.target.value as FiltroStatus)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="ativos">Ativos</MenuItem>
          <MenuItem value="inativos">Inativos</MenuItem>
          <MenuItem value="todos">Todos</MenuItem>
        </TextField>
      </div>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>E-mail</TableCell>
                <TableCell>Papel</TableCell>
                <TableCell>Cargo</TableCell>
                <TableCell>Equipe</TableCell>
                <TableCell>Gestor</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TabelaEstado
                colSpan={NUMERO_COLUNAS}
                carregando={carregando}
                erro={erro}
                vazio={!carregando && !erro && listaFiltrada.length === 0}
                mensagemVazio={
                  filtroAtivo
                    ? 'Nenhum colaborador encontrado para os filtros aplicados.'
                    : 'Nenhum colaborador cadastrado ainda.'
                }
                onTentarNovamente={carregarColaboradores}
              />
              {!carregando &&
                !erro &&
                listaPaginada.map((colaborador) => (
                  <TableRow key={colaborador.id} hover>
                    <TableCell>{colaborador.nomeCompleto}</TableCell>
                    <TableCell>{colaborador.email}</TableCell>
                    <TableCell>{PAPEL_LABEL[colaborador.papel]}</TableCell>
                    <TableCell>{colaborador.cargo ?? '—'}</TableCell>
                    <TableCell>{colaborador.equipe?.nome ?? '—'}</TableCell>
                    <TableCell>{colaborador.gestor?.nomeCompleto ?? '—'}</TableCell>
                    <TableCell>
                      <Chip
                        label={colaborador.ativo ? 'Ativo' : 'Inativo'}
                        color={colaborador.ativo ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => navigate(`/colaboradores/${colaborador.id}/editar`)}>
                        Editar
                      </Button>
                      <Button
                        size="small"
                        color={colaborador.ativo ? 'error' : 'primary'}
                        onClick={() => {
                          setErroDialog(null)
                          setDialogAlvo(colaborador)
                        }}
                      >
                        {colaborador.ativo ? 'Inativar' : 'Reativar'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={listaFiltrada.length}
          page={page}
          onPageChange={(_, novaPagina) => setPage(novaPagina)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(Number.parseInt(e.target.value, 10))
            setPage(0)
          }}
          rowsPerPageOptions={[10, 25, 50]}
          labelRowsPerPage="Linhas por página"
        />
      </Paper>

      <ConfirmDialog
        open={Boolean(dialogAlvo)}
        titulo={dialogAlvo?.ativo ? 'Inativar colaborador' : 'Reativar colaborador'}
        mensagem={
          dialogAlvo
            ? `Deseja realmente ${dialogAlvo.ativo ? 'inativar' : 'reativar'} ${dialogAlvo.nomeCompleto}?`
            : ''
        }
        confirmarLabel={dialogAlvo?.ativo ? 'Inativar' : 'Reativar'}
        carregando={alterandoStatus}
        erro={erroDialog}
        onConfirmar={handleConfirmarStatus}
        onCancelar={() => {
          if (alterandoStatus) return
          setDialogAlvo(null)
          setErroDialog(null)
        }}
      />

      {snackbar && (
        <Snackbar open autoHideDuration={5000} onClose={() => setSnackbar(null)}>
          <Alert severity={snackbar.severidade} onClose={() => setSnackbar(null)} sx={{ width: '100%' }}>
            {snackbar.mensagem}
          </Alert>
        </Snackbar>
      )}
    </div>
  )
}
