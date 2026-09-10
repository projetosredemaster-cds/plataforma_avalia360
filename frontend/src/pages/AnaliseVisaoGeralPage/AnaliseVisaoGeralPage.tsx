import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, Paper, Skeleton, TextField, Typography } from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import { MetricaCard } from '../../components/analise/MetricaCard/MetricaCard'
import { SeletorCiclo } from '../../components/analise/SeletorCiclo/SeletorCiclo'
import { ApiError } from '../../lib/apiClient'
import { buscarVisaoGeralAnalise } from '../../services/analiseService'
import type { VisaoGeralAnalise } from '../../types/analise'
import { formatarHoras, formatarInteiro, formatarPercentual, hojeYMD, inicioAnoCorrenteYMD } from './formatadores'

export function AnaliseVisaoGeralPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [de, setDe] = useState(() => inicioAnoCorrenteYMD())
  const [ate, setAte] = useState(() => hojeYMD())
  const [cicloId, setCicloId] = useState<string | null>(() => searchParams.get('cicloId'))

  const [dados, setDados] = useState<VisaoGeralAnalise | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const periodoInvalido = ate < de
  const executarBusca = useCallback(
    async (overrides?: { cicloId?: string | null }) => {
      const cicloIdAtual = overrides?.cicloId !== undefined ? overrides.cicloId : cicloId

      if (ate < de) return

      setCarregando(true)
      setErro(null)
      try {
        const resultado = await buscarVisaoGeralAnalise({ de, ate, cicloId: cicloIdAtual ?? undefined })
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
    // Carga inicial via API — não é dado derivável durante a renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    executarBusca()
    // Fetch intencionalmente só-no-mount: `executarBusca` muda a cada tecla em
    // "De"/"Até"/troca de ciclo, incluí-la no array de deps repetiria a busca a
    // cada edição do formulário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="h5" component="h1">
          Visão Geral
        </Typography>
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
              />
              <MetricaCard
                titulo="Taxa de resposta média"
                valor={formatarPercentual(dados.taxaRespostaMedia)}
                descricao="Ponderada por volume de participantes"
              />
              <MetricaCard
                titulo="Tempo médio de resposta"
                valor={formatarHoras(dados.tempoMedioResposta.geral.horas)}
                descricao={`${formatarInteiro(dados.tempoMedioResposta.geral.amostras)} respostas com tempo registrado`}
                detalhes={[
                  { rotulo: 'Avaliação 360', valor: formatarHoras(dados.tempoMedioResposta.avaliacao_360.horas) },
                  { rotulo: 'Clima e Satisfação', valor: formatarHoras(dados.tempoMedioResposta.clima_geral.horas) },
                ]}
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
              />
              <MetricaCard
                titulo="Clima e Satisfação"
                valor={formatarInteiro(dados.distribuicaoPorTipo.clima_geral.totalCiclos)}
                descricao="ciclos no período"
                detalhes={[
                  { rotulo: 'Respostas', valor: formatarInteiro(dados.distribuicaoPorTipo.clima_geral.totalRespostas) },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
