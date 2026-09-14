import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  IconButton,
  Paper,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useSearchParams } from 'react-router-dom'
import { BotaoAtualizarAnalise } from '../../components/analise/BotaoAtualizarAnalise/BotaoAtualizarAnalise'
import { ResultadoPergunta360Card } from '../../components/analise/ResultadoPergunta360Card/ResultadoPergunta360Card'
import { ResultadoPerguntaClimaCard } from '../../components/analise/ResultadoPerguntaClimaCard/ResultadoPerguntaClimaCard'
import { SeletorCiclo } from '../../components/analise/SeletorCiclo/SeletorCiclo'
import { ApiError } from '../../lib/apiClient'
import { buscarResultadosPerguntaAnalise } from '../../services/analiseService'
import type { ResultadosPerguntaAnalise } from '../../types/analise'
import { agruparPorCiclo } from './agrupamento'
import { hojeYMD, inicioAnoCorrenteYMD } from './formatadores'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'

export function AnaliseResultadosPerguntaPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [deInicial] = useState(() => inicioAnoCorrenteYMD())
  const [ateInicial] = useState(() => hojeYMD())
  const [de, setDe] = useState(deInicial)
  const [ate, setAte] = useState(ateInicial)
  const [cicloId, setCicloId] = useState<string | null>(() => searchParams.get('cicloId'))

  const [dados, setDados] = useState<ResultadosPerguntaAnalise | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [resultadoVersao, setResultadoVersao] = useState(0)

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
        const resultado = await buscarResultadosPerguntaAnalise({
          de: deAtual,
          ate: ateAtual,
          cicloId: cicloIdAtual ?? undefined,
        })
        setDados(resultado)
        setResultadoVersao((v) => v + 1)
      } catch (err) {
        if (err instanceof ApiError && err.codigo === 'CICLO_NAO_ENCONTRADO') {
          setErro('O ciclo filtrado não foi encontrado. Remova o filtro de ciclo e tente novamente.')
        } else {
          setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar os resultados.')
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

  const gruposPorCiclo = useMemo(() => (dados ? agruparPorCiclo(dados) : []), [dados])
  const vazio = !!dados && dados.avaliacao360.length === 0 && dados.climaGeral.length === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-start gap-2">
        <Typography variant="h5" component="h1">
          Resultados por Pergunta
        </Typography>
        <Tooltip title="Distribuição das perguntas de likert, matriz e caixa de seleção por ciclo" arrow placement="top">
          <IconButton size="medium" aria-label="Avaliações" sx={{ p: 0.25 }}>
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
          helperText={periodoInvalido ? 'A data final não pode ser anterior à data inicial.' : ' '}
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

      {carregando && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, indice) => (
            <Skeleton key={indice} variant="rounded" height={120} />
          ))}
        </div>
      )}

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

      {!carregando && !erro && vazio && (
        <Alert severity="info">
          Nenhuma pergunta likert, matriz ou caixa de seleção com respostas encontrada para o período/filtro
          selecionado.
        </Alert>
      )}

      {!carregando && !erro && dados && !vazio && (
        <div className="flex flex-col gap-3">
          {gruposPorCiclo.map((grupo) => (
            <Accordion key={`${resultadoVersao}-${grupo.cicloId}`} defaultExpanded={Boolean(cicloId)}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" sx={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                  {grupo.nomeCiclo}
                </Typography>
              </AccordionSummary>
              <AccordionDetails className="flex flex-col gap-6">
                {grupo.avaliacao360.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <Typography variant="subtitle2">Avaliação 360</Typography>
                    <Box sx={{ maxHeight: 600, overflowY: 'auto' }} className="flex flex-col gap-3">
                      {grupo.avaliacao360.map((r) => (
                        <ResultadoPergunta360Card key={r.perguntaId} resultado={r} />
                      ))}
                    </Box>
                  </div>
                )}
                {grupo.climaGeral.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <Typography variant="subtitle2">Clima e Satisfação</Typography>
                    <Box sx={{ maxHeight: 600, overflowY: 'auto' }} className="flex flex-col gap-3">
                      {grupo.climaGeral.map((r) => (
                        <ResultadoPerguntaClimaCard key={r.perguntaId} resultado={r} />
                      ))}
                    </Box>
                  </div>
                )}
              </AccordionDetails>
            </Accordion>
          ))}
        </div>
      )}
    </div>
  )
}
