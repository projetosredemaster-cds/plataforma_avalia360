import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  FormControlLabel,
  Paper,
  Radio,
  RadioGroup,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog'
import { StatusCicloChip } from '../../components/ciclos/StatusCicloChip/StatusCicloChip'
import { ApiError } from '../../lib/apiClient'
import { listarCiclos, removerCiclo } from '../../services/ciclosService'
import type { Ciclo, StatusCiclo } from '../../types/ciclo'

type FiltroStatus = 'todas' | StatusCiclo

const FORMATADOR_DATA = new Intl.DateTimeFormat('pt-BR')

/** `'YYYY-MM-DD'` tratado como data local (nunca `new Date(data)` puro, que pode deslocar um dia por fuso). */
function formatarData(data: string): string {
  return FORMATADOR_DATA.format(new Date(`${data}T00:00:00`))
}

/**
 * `GET /api/ciclos` não pagina/filtra no servidor — busca e filtro de status
 * desta tela são 100% client-side sobre o array completo, mesmo padrão de
 * `PesquisasListPage`.
 */
export function CiclosListPage() {
  const navigate = useNavigate()

  const [ciclos, setCiclos] = useState<Ciclo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [buscaInput, setBuscaInput] = useState('')
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<FiltroStatus>('todas')

  const [alvoExcluir, setAlvoExcluir] = useState<Ciclo | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [erroExcluir, setErroExcluir] = useState<string | null>(null)

  const carregarCiclos = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const dados = await listarCiclos()
      setCiclos(dados)
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar os ciclos.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    // Carga inicial dos ciclos via API — não é dado derivável durante a renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarCiclos()
  }, [carregarCiclos])

  useEffect(() => {
    const timer = setTimeout(() => setBusca(buscaInput), 400)
    return () => clearTimeout(timer)
  }, [buscaInput])

  const listaFiltrada = useMemo(() => {
    const buscaNormalizada = busca.trim().toLowerCase()
    return ciclos.filter((ciclo) => {
      if (statusFiltro !== 'todas' && ciclo.status !== statusFiltro) return false
      if (!buscaNormalizada) return true
      return ciclo.nome.toLowerCase().includes(buscaNormalizada)
    })
  }, [ciclos, busca, statusFiltro])

  const filtroAtivo = busca.trim().length > 0 || statusFiltro !== 'todas'

  async function handleConfirmarExcluir() {
    if (!alvoExcluir) return
    setExcluindo(true)
    setErroExcluir(null)
    try {
      await removerCiclo(alvoExcluir.id)
      setAlvoExcluir(null)
      await carregarCiclos()
    } catch (err) {
      setErroExcluir(err instanceof ApiError ? err.message : 'Não foi possível excluir o ciclo.')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="h5" component="h1">
          Ciclos de avaliação
        </Typography>
        <Button variant="contained" color="primary" onClick={() => navigate('/ciclos/novo')}>
          Novo ciclo
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <Paper className="flex flex-col gap-4 p-4" sx={{ height: 'fit-content' }}>
          <TextField
            label="Buscar por nome"
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
              <FormControlLabel value="ativo" control={<Radio size="small" />} label="Ativo" />
              <FormControlLabel value="encerrado" control={<Radio size="small" />} label="Encerrado" />
            </RadioGroup>
          </div>
        </Paper>

        <div>
          {carregando && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, indice) => (
                <Skeleton key={indice} variant="rounded" height={180} />
              ))}
            </div>
          )}

          {!carregando && erro && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <Typography role="alert" color="error">
                {erro}
              </Typography>
              <Button variant="contained" color="primary" onClick={carregarCiclos}>
                Tentar novamente
              </Button>
            </div>
          )}

          {!carregando && !erro && listaFiltrada.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <Typography color="text.secondary">
                {filtroAtivo
                  ? 'Nenhum ciclo encontrado para os filtros aplicados.'
                  : 'Nenhum ciclo cadastrado ainda.'}
              </Typography>
              {!filtroAtivo && (
                <Button variant="contained" color="primary" onClick={() => navigate('/ciclos/novo')}>
                  Novo ciclo
                </Button>
              )}
            </div>
          )}

          {!carregando && !erro && listaFiltrada.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {listaFiltrada.map((ciclo) => (
                <Card key={ciclo.id} className="flex flex-col">
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <Tooltip title={ciclo.nome}>
                        <Typography variant="h6" noWrap sx={{ maxWidth: 200 }}>
                          {ciclo.nome}
                        </Typography>
                      </Tooltip>
                      <StatusCicloChip status={ciclo.status} />
                    </div>
                    <Typography variant="body2" color="text.secondary">
                      {formatarData(ciclo.dataInicio)} — {formatarData(ciclo.dataFim)}
                    </Typography>
                    {ciclo.descricao && (
                      <Tooltip title={ciclo.descricao}>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {ciclo.descricao}
                        </Typography>
                      </Tooltip>
                    )}
                    <div className="flex flex-wrap gap-1">
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Mínimo: ${ciclo.minimoRespostasPares} respondentes`}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Pares anonimizados: ${ciclo.anonimizarRespostasPares ? 'Sim' : 'Não'}`}
                      />
                    </div>
                  </CardContent>
                  <CardActions className="flex flex-wrap justify-end gap-1">
                    <Button size="small" onClick={() => navigate(`/ciclos/${ciclo.id}`)}>
                      Ver detalhes
                    </Button>
                    {ciclo.status === 'rascunho' && (
                      <Button
                        size="small"
                        color="error"
                        onClick={() => {
                          setErroExcluir(null)
                          setAlvoExcluir(ciclo)
                        }}
                      >
                        Excluir
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
        open={Boolean(alvoExcluir)}
        titulo="Excluir ciclo"
        mensagem={`Deseja realmente excluir o ciclo "${alvoExcluir?.nome ?? ''}"?`}
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
    </div>
  )
}
