import { useCallback, useEffect, useState, type FormEvent, type MouseEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  IconButton,
  Paper,
  Skeleton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { ListaFrequenciaPalavras } from '../../components/analise/ListaFrequenciaPalavras/ListaFrequenciaPalavras'
import { MetricaCard } from '../../components/analise/MetricaCard/MetricaCard'
import { NuvemBolhas } from '../../components/analise/NuvemBolhas/NuvemBolhas'
import { SeletorCiclo } from '../../components/analise/SeletorCiclo/SeletorCiclo'
import { useFullscreen } from '../../hooks/useFullscreen'
import { ApiError } from '../../lib/apiClient'
import { buscarNuvemPalavrasAnalise } from '../../services/analiseService'
import type { NuvemPalavrasAnalise } from '../../types/analise'
import { formatarInteiro, formatarTempoMedio, hojeYMD, inicioAnoCorrenteYMD } from './formatadores'

type Visualizacao = 'lista' | 'bolhas'

export function AnaliseNuvemPalavrasPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [deInicial] = useState(() => inicioAnoCorrenteYMD())
  const [ateInicial] = useState(() => hojeYMD())
  const [de, setDe] = useState(deInicial)
  const [ate, setAte] = useState(ateInicial)
  const [cicloId, setCicloId] = useState<string | null>(() => searchParams.get('cicloId'))

  const [dados, setDados] = useState<NuvemPalavrasAnalise | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [visualizacao, setVisualizacao] = useState<Visualizacao>('lista')
  const { containerRef, isFullscreen, isSupported, entrar, sair } = useFullscreen<HTMLDivElement>()

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
        const resultado = await buscarNuvemPalavrasAnalise({
          de: deAtual,
          ate: ateAtual,
          cicloId: cicloIdAtual ?? undefined,
        })
        setDados(resultado)
      } catch (err) {
        if (err instanceof ApiError && err.codigo === 'CICLO_NAO_ENCONTRADO') {
          setErro('O ciclo filtrado não foi encontrado. Remova o filtro de ciclo e tente novamente.')
        } else {
          setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar a nuvem de palavras.')
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

  function handleVisualizacaoChange(_event: MouseEvent<HTMLElement>, novaVisualizacao: Visualizacao | null) {
    if (novaVisualizacao) setVisualizacao(novaVisualizacao)
  }

  function handleEntrarModoTV() {
    setVisualizacao('bolhas')
    void entrar()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-start gap-2">
        <Typography variant="h5" component="h1">
          Nuvem de Palavras
        </Typography>
        <Tooltip
          title="Palavras mais frequentes nas respostas de texto aberto do período selecionado."
          arrow
          placement="top"
        >
          <IconButton size="medium" aria-label="Nuvem de Palavras" sx={{ p: 0.25 }}>
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
              sx: { position: 'absolute', bottom: -20, left: 0, whiteSpace: 'nowrap' },
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
      </Paper>

      {carregando && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton variant="rounded" height={140} />
            <Skeleton variant="rounded" height={140} />
          </div>
          <Skeleton variant="rounded" height={320} />
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

      {!carregando && !erro && dados && (
        <Box
          ref={containerRef}
          className="flex flex-col gap-6"
          sx={
            isFullscreen
              ? { bgcolor: 'background.default', p: 4, height: '100vh', overflowY: 'auto' }
              : undefined
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ToggleButtonGroup
              size="small"
              exclusive
              value={visualizacao}
              onChange={handleVisualizacaoChange}
              aria-label="Alternar visualização das palavras"
            >
              <ToggleButton value="lista">Lista</ToggleButton>
              <ToggleButton value="bolhas">Bolhas</ToggleButton>
            </ToggleButtonGroup>
            {isFullscreen ? (
              <Button
                variant="contained"
                color="secondary"
                startIcon={<FullscreenExitIcon />}
                onClick={() => void sair()}
              >
                Sair do Modo TV
              </Button>
            ) : (
              isSupported && (
                <Button variant="outlined" startIcon={<FullscreenIcon />} onClick={handleEntrarModoTV}>
                  Modo TV
                </Button>
              )
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <MetricaCard
              titulo="Envios e respostas"
              valor={formatarInteiro(dados.metricas.totalEnvios)}
              descricao="envios no período"
              detalhes={[{ rotulo: 'Total de respostas', valor: formatarInteiro(dados.metricas.totalRespostas) }]}
              tooltip="Quantidade de envios de pesquisa no período selecionado, e quantas respostas já foram registradas."
              tamanho={isFullscreen ? 'grande' : 'padrao'}
            />
            <MetricaCard
              titulo="Tempo médio de resposta"
              valor={formatarTempoMedio(dados.metricas.tempoMedioResposta.horas)}
              descricao={`${formatarInteiro(dados.metricas.tempoMedioResposta.amostras)} respostas com tempo registrado`}
              tooltip="Tempo médio que as pessoas levam para responder à pesquisa assim que recebem o link, no período selecionado."
              tamanho={isFullscreen ? 'grande' : 'padrao'}
            />
          </div>

          <div className="flex flex-col gap-3">
            <Typography variant={isFullscreen ? 'h5' : 'subtitle1'}>Palavras mais frequentes</Typography>
            {dados.palavras.length === 0 ? (
              <Alert severity="info">
                {dados.motivoVazio === 'bloqueado_minimo_respondentes'
                  ? 'Este ciclo ainda não atingiu o número mínimo de respondentes necessário para exibir dados de forma anônima.'
                  : 'Nenhuma palavra encontrada para o período/filtro selecionado.'}
              </Alert>
            ) : visualizacao === 'lista' ? (
              <Paper className="p-2">
                <ListaFrequenciaPalavras palavras={dados.palavras} />
              </Paper>
            ) : (
              <Paper className="p-2">
                <NuvemBolhas palavras={dados.palavras} altura={isFullscreen ? '70vh' : 560} />
              </Paper>
            )}
          </div>
        </Box>
      )}
    </div>
  )
}
