import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, IconButton, Paper, Skeleton, TextField, Tooltip, Typography } from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { ListaFrequenciaPalavras } from '../../components/analise/ListaFrequenciaPalavras/ListaFrequenciaPalavras'
import { MetricaCard } from '../../components/analise/MetricaCard/MetricaCard'
import { SeletorCiclo } from '../../components/analise/SeletorCiclo/SeletorCiclo'
import { ApiError } from '../../lib/apiClient'
import { buscarNuvemPalavrasAnalise } from '../../services/analiseService'
import type { NuvemPalavrasAnalise } from '../../types/analise'
import { formatarInteiro, formatarTempoMedio, hojeYMD, inicioAnoCorrenteYMD } from './formatadores'

/**
 * Frequência de palavras extraídas de respostas de texto aberto, já
 * tokenizadas/filtradas/agregadas e anonimizadas pelo backend (pares/
 * subordinado/clima só contribuem se atingirem o mínimo do ciclo — sem
 * bypass para nenhum papel). Esta página só formata/exibe `palavras` (já
 * ordenada por frequência decrescente, top 50) e `metricas` — nenhum
 * cálculo de tokenização/contagem/gate acontece aqui.
 */
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
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricaCard
              titulo="Envios e respostas"
              valor={formatarInteiro(dados.metricas.totalEnvios)}
              descricao="envios no período"
              detalhes={[{ rotulo: 'Total de respostas', valor: formatarInteiro(dados.metricas.totalRespostas) }]}
              tooltip="Quantidade de envios de pesquisa no período selecionado, e quantas respostas já foram registradas."
            />
            <MetricaCard
              titulo="Tempo médio de resposta"
              valor={formatarTempoMedio(dados.metricas.tempoMedioResposta.horas)}
              descricao={`${formatarInteiro(dados.metricas.tempoMedioResposta.amostras)} respostas com tempo registrado`}
              tooltip="Tempo médio que as pessoas levam para responder à pesquisa assim que recebem o link, no período selecionado."
            />
          </div>

          <div className="flex flex-col gap-3">
            <Typography variant="subtitle1">Palavras mais frequentes</Typography>
            {dados.palavras.length === 0 ? (
              <Alert severity="info">Nenhuma palavra encontrada para o período/filtro selecionado.</Alert>
            ) : (
              <Paper className="p-2">
                <ListaFrequenciaPalavras palavras={dados.palavras} />
              </Paper>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
