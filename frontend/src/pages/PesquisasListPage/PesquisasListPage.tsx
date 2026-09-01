import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  CardActions,
  CardContent,
  FormControlLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Skeleton,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog'
import { StatusPesquisaChip } from '../../components/pesquisas/StatusPesquisaChip/StatusPesquisaChip'
import { ApiError } from '../../lib/apiClient'
import { atualizarStatusPesquisa, duplicarPesquisa, listarPesquisas, removerPesquisa } from '../../services/pesquisasService'
import type { PesquisaResumo, StatusPesquisa } from '../../types/pesquisa'

type FiltroStatus = 'todas' | StatusPesquisa
type Ordenacao = 'titulo_asc' | 'titulo_desc' | 'criacao_recente' | 'criacao_antiga'

const FORMATADOR_DATA = new Intl.DateTimeFormat('pt-BR')

/**
 * `GET /api/pesquisas` não pagina/filtra no servidor — busca, status e
 * ordenação desta tela são 100% client-side sobre o array completo.
 */
export function PesquisasListPage() {
  const navigate = useNavigate()

  const [pesquisas, setPesquisas] = useState<PesquisaResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [buscaInput, setBuscaInput] = useState('')
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<FiltroStatus>('todas')
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('criacao_recente')

  const [alvoEncerrar, setAlvoEncerrar] = useState<PesquisaResumo | null>(null)
  const [encerrando, setEncerrando] = useState(false)
  const [erroEncerrar, setErroEncerrar] = useState<string | null>(null)

  const [alvoExcluir, setAlvoExcluir] = useState<PesquisaResumo | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [erroExcluir, setErroExcluir] = useState<string | null>(null)

  const [duplicandoId, setDuplicandoId] = useState<string | null>(null)
  const [snackbar, setSnackbar] = useState<{ mensagem: string; severidade: 'success' | 'error' } | null>(null)

  const carregarPesquisas = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const dados = await listarPesquisas()
      setPesquisas(dados)
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar as pesquisas.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    // Carga inicial das pesquisas via API — não é dado derivável durante a renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarPesquisas()
  }, [carregarPesquisas])

  useEffect(() => {
    const timer = setTimeout(() => setBusca(buscaInput), 400)
    return () => clearTimeout(timer)
  }, [buscaInput])

  const listaFiltrada = useMemo(() => {
    const buscaNormalizada = busca.trim().toLowerCase()
    const filtradas = pesquisas.filter((pesquisa) => {
      if (statusFiltro !== 'todas' && pesquisa.status !== statusFiltro) return false
      if (!buscaNormalizada) return true
      return pesquisa.titulo.toLowerCase().includes(buscaNormalizada)
    })

    const ordenadas = [...filtradas]
    switch (ordenacao) {
      case 'titulo_asc':
        ordenadas.sort((a, b) => a.titulo.localeCompare(b.titulo))
        break
      case 'titulo_desc':
        ordenadas.sort((a, b) => b.titulo.localeCompare(a.titulo))
        break
      case 'criacao_antiga':
        ordenadas.sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime())
        break
      case 'criacao_recente':
      default:
        ordenadas.sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
        break
    }
    return ordenadas
  }, [pesquisas, busca, statusFiltro, ordenacao])

  const filtroAtivo = busca.trim().length > 0 || statusFiltro !== 'todas'

  async function handleDuplicar(pesquisa: PesquisaResumo) {
    setDuplicandoId(pesquisa.id)
    try {
      await duplicarPesquisa(pesquisa.id)
      setSnackbar({ mensagem: 'Pesquisa duplicada com sucesso.', severidade: 'success' })
      await carregarPesquisas()
    } catch (err) {
      setSnackbar({
        mensagem: err instanceof ApiError ? err.message : 'Não foi possível duplicar a pesquisa.',
        severidade: 'error',
      })
    } finally {
      setDuplicandoId(null)
    }
  }

  async function handleConfirmarEncerrar() {
    if (!alvoEncerrar) return
    setEncerrando(true)
    setErroEncerrar(null)
    try {
      await atualizarStatusPesquisa(alvoEncerrar.id, 'encerrada')
      setAlvoEncerrar(null)
      await carregarPesquisas()
    } catch (err) {
      setErroEncerrar(err instanceof ApiError ? err.message : 'Não foi possível encerrar a pesquisa.')
    } finally {
      setEncerrando(false)
    }
  }

  async function handleConfirmarExcluir() {
    if (!alvoExcluir) return
    setExcluindo(true)
    setErroExcluir(null)
    try {
      await removerPesquisa(alvoExcluir.id)
      setAlvoExcluir(null)
      await carregarPesquisas()
    } catch (err) {
      setErroExcluir(err instanceof ApiError ? err.message : 'Não foi possível excluir a pesquisa.')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="h5" component="h1">
          Pesquisas
        </Typography>
        <Button variant="contained" color="primary" onClick={() => navigate('/pesquisas/nova')}>
          Nova pesquisa
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <Paper className="flex flex-col gap-4 p-4" sx={{ height: 'fit-content' }}>
          <TextField
            label="Buscar por título"
            value={buscaInput}
            onChange={(e) => setBuscaInput(e.target.value)}
            size="small"
            fullWidth
          />

          <div>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Status
            </Typography>
            <RadioGroup value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value as FiltroStatus)}>
              <FormControlLabel value="todas" control={<Radio size="small" />} label="Todas" />
              <FormControlLabel value="rascunho" control={<Radio size="small" />} label="Rascunho" />
              <FormControlLabel value="publicada" control={<Radio size="small" />} label="Publicada" />
              <FormControlLabel value="encerrada" control={<Radio size="small" />} label="Encerrada" />
            </RadioGroup>
          </div>

          <TextField
            select
            label="Ordenar por"
            value={ordenacao}
            onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
            size="small"
            fullWidth
          >
            <MenuItem value="criacao_recente">Criação mais recente</MenuItem>
            <MenuItem value="criacao_antiga">Criação mais antiga</MenuItem>
            <MenuItem value="titulo_asc">Título (A-Z)</MenuItem>
            <MenuItem value="titulo_desc">Título (Z-A)</MenuItem>
          </TextField>
        </Paper>

        <div>
          {carregando && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, indice) => (
                <Skeleton key={indice} variant="rounded" height={160} />
              ))}
            </div>
          )}

          {!carregando && erro && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <Typography role="alert" color="error">
                {erro}
              </Typography>
              <Button variant="contained" color="primary" onClick={carregarPesquisas}>
                Tentar novamente
              </Button>
            </div>
          )}

          {!carregando && !erro && listaFiltrada.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <Typography color="text.secondary">
                {filtroAtivo
                  ? 'Nenhuma pesquisa encontrada para os filtros aplicados.'
                  : 'Nenhuma pesquisa cadastrada ainda.'}
              </Typography>
              {!filtroAtivo && (
                <Button variant="contained" color="primary" onClick={() => navigate('/pesquisas/nova')}>
                  Nova pesquisa
                </Button>
              )}
            </div>
          )}

          {!carregando && !erro && listaFiltrada.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {listaFiltrada.map((pesquisa) => (
                <Card key={pesquisa.id} className="flex flex-col">
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <Tooltip title={pesquisa.titulo}>
                        <Typography variant="h6" noWrap sx={{ maxWidth: 200 }}>
                          {pesquisa.titulo}
                        </Typography>
                      </Tooltip>
                      <StatusPesquisaChip status={pesquisa.status} />
                    </div>
                    <Typography variant="body2" color="text.secondary">
                      Criada em {FORMATADOR_DATA.format(new Date(pesquisa.criadoEm))}
                    </Typography>
                    <Tooltip title={pesquisa.id}>
                      <Typography variant="caption" color="text.secondary">
                        #{pesquisa.id.slice(0, 8)}
                      </Typography>
                    </Tooltip>
                  </CardContent>
                  <CardActions className="flex flex-wrap justify-end gap-1">
                    <Button size="small" onClick={() => navigate(`/pesquisas/${pesquisa.id}/editar`)}>
                      Editar
                    </Button>
                    <Button size="small" onClick={() => handleDuplicar(pesquisa)} disabled={duplicandoId === pesquisa.id}>
                      {duplicandoId === pesquisa.id ? 'Duplicando...' : 'Duplicar'}
                    </Button>
                    {pesquisa.status === 'publicada' && (
                      <Button
                        size="small"
                        color="warning"
                        onClick={() => {
                          setErroEncerrar(null)
                          setAlvoEncerrar(pesquisa)
                        }}
                      >
                        Encerrar
                      </Button>
                    )}
                    {pesquisa.status === 'rascunho' && (
                      <Button
                        size="small"
                        color="error"
                        onClick={() => {
                          setErroExcluir(null)
                          setAlvoExcluir(pesquisa)
                        }}
                      >
                        Deletar
                      </Button>
                    )}
                  </CardActions>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(alvoEncerrar)}
        titulo="Encerrar pesquisa"
        mensagem="Encerrar pesquisa? Não será mais possível coletar ou editar respostas."
        confirmarLabel="Encerrar"
        carregando={encerrando}
        erro={erroEncerrar}
        onConfirmar={handleConfirmarEncerrar}
        onCancelar={() => {
          if (encerrando) return
          setAlvoEncerrar(null)
          setErroEncerrar(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(alvoExcluir)}
        titulo="Excluir pesquisa"
        mensagem={`Deseja realmente excluir a pesquisa "${alvoExcluir?.titulo ?? ''}"?`}
        confirmarLabel="Excluir"
        carregando={excluindo}
        erro={erroExcluir}
        onConfirmar={handleConfirmarExcluir}
        onCancelar={() => {
          if (excluindo) return
          setAlvoExcluir(null)
          setErroExcluir(null)
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
