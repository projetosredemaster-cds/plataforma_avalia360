import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Chip, Paper, Skeleton, TextField, Typography } from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import { MetricaCard } from '../../components/analise/MetricaCard/MetricaCard'
import { ApiError } from '../../lib/apiClient'
import { buscarCiclo } from '../../services/ciclosService'
import { buscarVisaoGeralAnalise } from '../../services/analiseService'
import type { VisaoGeralAnalise } from '../../types/analise'
import { formatarHoras, formatarInteiro, formatarPercentual, hojeYMD, inicioAnoCorrenteYMD } from './formatadores'

/**
 * Painel de métricas agregadas (Visão Geral do módulo Análise). Todo número
 * exibido vem literalmente do payload de `GET /api/analise/visao-geral` —
 * nenhum cálculo de agregação/anonimização é refeito aqui (a única
 * "matemática" client-side é conversão de unidade horas→dias em
 * `formatarHoras`). `admin`/`gestor_rh` veem exatamente a mesma tela, sem
 * nenhuma renderização condicional por papel (a única checagem de papel é
 * `RotaProtegida`, no nível de rota).
 */
export function AnaliseVisaoGeralPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [de, setDe] = useState(() => inicioAnoCorrenteYMD())
  const [ate, setAte] = useState(() => hojeYMD())
  const [cicloId, setCicloId] = useState<string | null>(() => searchParams.get('cicloId'))
  const [nomeCiclo, setNomeCiclo] = useState<string | null>(null)

  const [dados, setDados] = useState<VisaoGeralAnalise | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const periodoInvalido = ate < de

  /**
   * Aceita overrides opcionais para permitir disparar a busca com um valor
   * de `cicloId` que ainda não foi refletido no state (evita depender do
   * timing de `setState`/re-render, ex.: no fluxo de "Remover filtro de
   * ciclo", que precisa buscar com `cicloId: null` imediatamente).
   */
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
    // Carga inicial da visão geral via API — não é dado derivável durante a renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    executarBusca()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!cicloId) return
    let cancelado = false
    buscarCiclo(cicloId)
      .then((ciclo) => {
        if (!cancelado) setNomeCiclo(ciclo.nome)
      })
      .catch(() => {
        // Best-effort — falha aqui nunca vira o `erro` principal da página
        // nem bloqueia a busca de `buscarVisaoGeralAnalise`; cai para exibir
        // o uuid cru no chip.
      })
    return () => {
      cancelado = true
    }
  }, [cicloId])

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    executarBusca()
  }

  function handleRemoverFiltroCiclo() {
    setCicloId(null)
    setNomeCiclo(null)
    setSearchParams({}, { replace: true })
    executarBusca({ cicloId: null })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Typography variant="h5" component="h1">
            Visão Geral
          </Typography>
          {cicloId && (
            <Chip
              label={`Filtrado por ciclo: ${nomeCiclo ?? cicloId}`}
              onDelete={handleRemoverFiltroCiclo}
              size="small"
            />
          )}
        </div>
      </div>

      <Paper component="form" onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 p-4">
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
          slotProps={{ inputLabel: { shrink: true } }}
        />
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
