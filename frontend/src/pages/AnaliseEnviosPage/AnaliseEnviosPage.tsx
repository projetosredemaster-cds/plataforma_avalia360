import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  Alert,
  Button,
  Chip,
  IconButton,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import { BotaoAtualizarAnalise } from '../../components/analise/BotaoAtualizarAnalise/BotaoAtualizarAnalise'
import { SeletorCiclo } from '../../components/analise/SeletorCiclo/SeletorCiclo'
import { ProgressoCicloBar } from '../../components/ciclos/ProgressoCicloBar/ProgressoCicloBar'
import { StatusCicloChip } from '../../components/ciclos/StatusCicloChip/StatusCicloChip'
import { TipoPesquisaChip } from '../../components/pesquisas/TipoPesquisaChip/TipoPesquisaChip'
import { ApiError } from '../../lib/apiClient'
import { buscarEnviosAnalise } from '../../services/analiseService'
import type { EnviosAnalise } from '../../types/analise'
import { formatarData, formatarInteiro, hojeYMD, inicioAnoCorrenteYMD } from './formatadores'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'

export function AnaliseEnviosPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [deInicial] = useState(() => inicioAnoCorrenteYMD())
  const [ateInicial] = useState(() => hojeYMD())
  const [de, setDe] = useState(deInicial)
  const [ate, setAte] = useState(ateInicial)
  const [cicloId, setCicloId] = useState<string | null>(() => searchParams.get('cicloId'))

  const [dados, setDados] = useState<EnviosAnalise | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const periodoInvalido = ate < de
  const filtroAlterado = cicloId !== null || de !== deInicial || ate !== ateInicial

  const executarBusca = useCallback(
    async (overrides?: { de?: string; ate?: string; cicloId?: string | null }) => {
      const deAtual = overrides?.de !== undefined ? overrides.de : de
      const ateAtual = overrides?.ate !== undefined ? overrides.ate : ate
      const cicloIdAtual = overrides?.cicloId !== undefined ? overrides.cicloId : cicloId

      if (ateAtual < deAtual) return

      setCarregando(true)
      setErro(null)
      try {
        const resultado = await buscarEnviosAnalise({ de: deAtual, ate: ateAtual, cicloId: cicloIdAtual ?? undefined })
        setDados(resultado)
      } catch (err) {
        if (err instanceof ApiError && err.codigo === 'CICLO_NAO_ENCONTRADO') {
          setErro('O ciclo filtrado não foi encontrado. Remova o filtro de ciclo e tente novamente.')
        } else {
          setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar os envios.')
        }
      } finally {
        setCarregando(false)
      }
    },
    [de, ate, cicloId],
  )

  useEffect(() => {
    executarBusca()
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    executarBusca()
  }

  function handleCicloChange(novoCicloId: string | null) {
    setCicloId(novoCicloId)
    setSearchParams(novoCicloId ? { cicloId: novoCicloId } : {}, { replace: true })
    executarBusca({ cicloId: novoCicloId })
  }

  function handleLimparFiltro() {
    setDe(deInicial)
    setAte(ateInicial)
    setCicloId(null)
    setSearchParams({}, { replace: true })
    executarBusca({ de: deInicial, ate: ateInicial, cicloId: null })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-start gap-2">
        <Typography variant="h5" component="h1">
          Envios
        </Typography>
        <Tooltip
          title="Contagem de envios pendentes e respondidos por ciclo, sem detalhe pessoa a pessoa (isso já existe na tela de detalhe do Ciclo)."
          arrow
          placement="top"
        >
          <IconButton size="medium" aria-label="Envios" sx={{ p: 0.25 }}>
            <InfoOutlinedIcon fontSize="medium" color="action" />
          </IconButton>
        </Tooltip>
      </div>

      <Paper component="form" onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3 p-4">
        <TextField
          label="De"
          type="date"
          size="small"
          value={de}
          onChange={(e) => setDe(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Até"
          type="date"
          size="small"
          value={ate}
          onChange={(e) => setAte(e.target.value)}
          error={periodoInvalido}
          helperText={periodoInvalido ? 'A data final não pode ser anterior à data inicial.' : undefined}
          slotProps={{
            inputLabel: { shrink: true },
            formHelperText: {
              sx: {
                position: 'absolute',
                bottom: -20,
                left: 0,
                whiteSpace: 'nowrap',
              },
            },
          }}
        />
        <SeletorCiclo cicloId={cicloId} onChange={handleCicloChange} />
        <Button type="submit" variant="contained" disabled={periodoInvalido || carregando}>
          Aplicar filtro
        </Button>
        {filtroAlterado && (
          <Button variant="text" onClick={handleLimparFiltro} disabled={carregando}>
            Limpar filtro
          </Button>
        )}
        <BotaoAtualizarAnalise atualizando={carregando} onClick={() => executarBusca()} />
      </Paper>

      {carregando && <Skeleton variant="rounded" height={400} />}

      {!carregando && erro && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <Typography role="alert" color="error">
            {erro}
          </Typography>
          <Button variant="contained" color="primary" onClick={() => executarBusca()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {!carregando && !erro && dados && dados.ciclos.length === 0 && (
        <Alert severity="info">Nenhum ciclo encontrado no período selecionado.</Alert>
      )}

      {!carregando && !erro && dados && dados.ciclos.length > 0 && (
        <Paper>
          <TableContainer sx={{ maxHeight: 600, overflowY: 'auto' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nome</TableCell>
                  <TableCell>Tipo de pesquisa</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Vigência</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell align="right">Pendente</TableCell>
                  <TableCell align="right">Respondido</TableCell>
                  <TableCell>% Respondido</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {dados.ciclos.map((linha) => (
                  <TableRow key={linha.cicloId}>
                    <TableCell>{linha.nome}</TableCell>
                    <TableCell>
                      {linha.tipoPesquisa !== null ? (
                        <TipoPesquisaChip tipo={linha.tipoPesquisa} />
                      ) : (
                        <Chip label="Sem pesquisa vinculada" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusCicloChip status={linha.status} />
                    </TableCell>
                    <TableCell>
                      {formatarData(linha.dataInicio)} — {formatarData(linha.dataFim)}
                    </TableCell>
                    <TableCell align="right">{formatarInteiro(linha.totalEnvios)}</TableCell>
                    <TableCell align="right">{formatarInteiro(linha.totalPendente)}</TableCell>
                    <TableCell align="right">{formatarInteiro(linha.totalRespondido)}</TableCell>
                    <TableCell sx={{ minWidth: 160 }}>
                      <ProgressoCicloBar
                        progresso={{
                          total: linha.totalEnvios,
                          concluidos: linha.totalRespondido,
                          percentual: linha.percentualRespondido,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </div>
  )
}
