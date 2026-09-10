import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, IconButton, Paper, Skeleton, TextField, Tooltip, Typography } from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import { MetricaCard } from '../../components/analise/MetricaCard/MetricaCard'
import { SeletorCiclo } from '../../components/analise/SeletorCiclo/SeletorCiclo'
import { ApiError } from '../../lib/apiClient'
import { buscarVisaoGeralAnalise } from '../../services/analiseService'
import type { VisaoGeralAnalise } from '../../types/analise'
import { formatarHoras, formatarInteiro, formatarPercentual, hojeYMD, inicioAnoCorrenteYMD } from './formatadores'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'

export function AnaliseVisaoGeralPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [deInicial] = useState(() => inicioAnoCorrenteYMD())
  const [ateInicial] = useState(() => hojeYMD())
  const [de, setDe] = useState(deInicial)
  const [ate, setAte] = useState(ateInicial)
  const [cicloId, setCicloId] = useState<string | null>(() => searchParams.get('cicloId'))

  const [dados, setDados] = useState<VisaoGeralAnalise | null>(null)
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
        const resultado = await buscarVisaoGeralAnalise({ de: deAtual, ate: ateAtual, cicloId: cicloIdAtual ?? undefined })
        setDados(resultado)
      } catch (err) {
        if (err instanceof ApiError && err.codigo === 'CICLO_NAO_ENCONTRADO') {
          setErro('O ciclo filtrado não foi encontrado. Remova o filtro de ciclo e tente novamente.')
        } else {
          setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar a visão geral.')
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
          Visão Geral
        </Typography>
        <Tooltip title="Resumo dos dados das pesquisas ativas e concluídas no período selecionado." arrow placement="top">
            <IconButton size="medium" aria-label="Visão Geral" sx={{ p: 0.25 }}>
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
      </Paper>

      {carregando && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }).map((_, indice) => (
            <Skeleton key={indice} variant="rounded" height={160} />
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

      {!carregando && !erro && dados && dados.totalCiclos === 0 && (
        <Alert severity="info">Nenhum ciclo encontrado no período selecionado.</Alert>
      )}

      {!carregando && !erro && dados && dados.totalCiclos > 0 && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Typography variant="subtitle1">Visão geral do período</Typography>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <MetricaCard
                titulo="Ciclos e respostas"
                valor={formatarInteiro(dados.totalCiclos)}
                descricao={`${dados.totalCiclos === 1 ? 'ciclo' : 'ciclos'} no período`}
                detalhes={[{ rotulo: 'Total de respostas', valor: formatarInteiro(dados.totalRespostas) }]}
                tooltip="Quantidade de ciclos de avaliação que estavam em andamento nesse período, e quantas pessoas já responderam."
              />
              <MetricaCard
                titulo="Taxa de resposta média"
                valor={formatarPercentual(dados.taxaRespostaMedia)}
                descricao="Ponderada por volume de participantes"
                tooltip="De todas as pessoas que precisavam responder nesse período, esse é o percentual que já respondeu."
              />
              <MetricaCard
                titulo="Tempo médio de resposta"
                valor={formatarHoras(dados.tempoMedioResposta.geral.horas)}
                descricao={`${formatarInteiro(dados.tempoMedioResposta.geral.amostras)} respostas com tempo registrado`}
                detalhes={[
                  { rotulo: 'Avaliação 360', valor: formatarHoras(dados.tempoMedioResposta.avaliacao_360.horas) },
                  { rotulo: 'Clima e Satisfação', valor: formatarHoras(dados.tempoMedioResposta.clima_geral.horas) },
                ]}
                tooltip="Tempo médio entre o momento em que o link da pesquisa foi enviado e o momento em que a pessoa respondeu, calculado com base em todas as respostas do período selecionado. Exibido em horas quando menor que 24 horas, ou em dias quando 24 horas ou mais."
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Typography variant="subtitle1">Distribuição por tipo de pesquisa</Typography>
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricaCard
                titulo="Avaliação 360"
                valor={formatarInteiro(dados.distribuicaoPorTipo.avaliacao_360.totalCiclos)}
                descricao="ciclos no período"
                detalhes={[
                  { rotulo: 'Respostas', valor: formatarInteiro(dados.distribuicaoPorTipo.avaliacao_360.totalRespostas) },
                ]}
                tooltip="Quantos ciclos de Avaliação 360° existem nesse período e quantas respostas já foram registradas neles."
              />
              <MetricaCard
                titulo="Clima e Satisfação"
                valor={formatarInteiro(dados.distribuicaoPorTipo.clima_geral.totalCiclos)}
                descricao="ciclos no período"
                detalhes={[
                  { rotulo: 'Respostas', valor: formatarInteiro(dados.distribuicaoPorTipo.clima_geral.totalRespostas) },
                ]}
                tooltip="Quantos ciclos de Clima e Satisfação existem nesse período e quantas respostas já foram registradas neles."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
