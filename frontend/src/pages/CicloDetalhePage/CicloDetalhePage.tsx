import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Autocomplete,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Snackbar,
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
import { useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog'
import { TabelaEstado } from '../../components/TabelaEstado/TabelaEstado'
import { StatusCicloChip } from '../../components/ciclos/StatusCicloChip/StatusCicloChip'
import { StatusEnvioChip } from '../../components/ciclos/StatusEnvioChip/StatusEnvioChip'
import { ROTULOS_TIPO_RELACIONAMENTO } from '../../components/ciclos/rotulosTipoRelacionamento'
import { StatusPesquisaChip } from '../../components/pesquisas/StatusPesquisaChip/StatusPesquisaChip'
import { TipoPesquisaChip } from '../../components/pesquisas/TipoPesquisaChip/TipoPesquisaChip'
import { ApiError } from '../../lib/apiClient'
import { listarColaboradores } from '../../services/colaboradoresService'
import { listarEquipes } from '../../services/equipesService'
import { atualizarStatusCiclo, buscarCiclo, listarRelacionamentos } from '../../services/ciclosService'
import {
  desbloquearTentativas,
  expirarEnvio,
  listarEnvios,
  marcarComoEnviado,
  registrarLembrete,
} from '../../services/enviosPesquisaService'
import {
  adicionarParticipantesIndividual,
  adicionarParticipantesPorEquipe,
  listarParticipantes,
  removerParticipante,
} from '../../services/participantesCicloService'
import { atualizarPesquisa, listarPesquisas } from '../../services/pesquisasService'
import type { Colaborador, Equipe } from '../../types/colaborador'
import type { Ciclo, Participante, Relacionamento } from '../../types/ciclo'
import { ehEnvioAvaliacao360, ehEnvioCampanhaClima, ehRespostaAvaliacao360, ehRespostaCampanhaClima } from '../../types/envio'
import type {
  EnvioAvaliacao360Resposta,
  EnvioCampanhaClima,
  EnvioPesquisaAcao,
  ParticipanteEnvioClima,
} from '../../types/envio'
import type { PesquisaResumo, TipoPesquisa } from '../../types/pesquisa'
import { CicloDadosForm } from './CicloDadosForm'

const FORMATADOR_DATA = new Intl.DateTimeFormat('pt-BR')
const FORMATADOR_DATA_HORA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/** `'YYYY-MM-DD'`/ISO tratado como data local (nunca `new Date(data)` puro, que pode deslocar um dia por fuso). */
function formatarData(data: string): string {
  return FORMATADOR_DATA.format(new Date(`${data}T00:00:00`))
}

/** Descreve o alvo do `ConfirmDialog` de "Expirar envio" sem assumir avaliador/avaliado (que não existe para clima). */
function rotuloAlvoExpirar(envio: EnvioPesquisaAcao | null): string {
  if (!envio) return ''
  return ehEnvioAvaliacao360(envio)
    ? `de "${envio.avaliadorNome}" para "${envio.avaliadoNome}"`
    : 'da campanha de clima e satisfação deste ciclo'
}

/**
 * Tela central do motor de ciclos: dados do ciclo (editáveis só em
 * rascunho), participantes, pesquisa vinculada, ativação/encerramento e,
 * quando o ciclo já saiu de rascunho, as tabelas de relacionamentos gerados
 * e de envios (ambas dado IDENTIFICADO de quem avalia quem — nunca
 * extraídas daqui, ver `types/ciclo.ts` e `types/envio.ts`).
 */
export function CicloDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [ciclo, setCiclo] = useState<Ciclo | null>(null)
  const [participantes, setParticipantes] = useState<Participante[]>([])
  const [pesquisas, setPesquisas] = useState<PesquisaResumo[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [equipes, setEquipes] = useState<Equipe[]>([])

  const [carregandoInicial, setCarregandoInicial] = useState(true)
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null)

  const [relacionamentos, setRelacionamentos] = useState<Relacionamento[]>([])
  const [carregandoRelacionamentos, setCarregandoRelacionamentos] = useState(false)
  const [erroRelacionamentos, setErroRelacionamentos] = useState<string | null>(null)

  const [enviosAvaliacao360, setEnviosAvaliacao360] = useState<EnvioAvaliacao360Resposta[]>([])
  const [envioCampanhaClima, setEnvioCampanhaClima] = useState<EnvioCampanhaClima | null>(null)
  const [participantesEnvioClima, setParticipantesEnvioClima] = useState<ParticipanteEnvioClima[]>([])
  const [tipoPesquisaEnvios, setTipoPesquisaEnvios] = useState<TipoPesquisa | null>(null)
  const [carregandoEnvios, setCarregandoEnvios] = useState(false)
  const [erroEnvios, setErroEnvios] = useState<string | null>(null)
  const [acaoEmAndamento, setAcaoEmAndamento] = useState<{
    envioId: string
    acao: 'marcar-enviado' | 'registrar-lembrete' | 'desbloquear-tentativas'
  } | null>(null)

  const [alvoExpirar, setAlvoExpirar] = useState<EnvioPesquisaAcao | null>(null)
  const [expirando, setExpirando] = useState(false)
  const [erroExpirar, setErroExpirar] = useState<string | null>(null)

  const [selecionadosIndividual, setSelecionadosIndividual] = useState<Colaborador[]>([])
  const [adicionandoIndividual, setAdicionandoIndividual] = useState(false)
  const [erroAdicionarIndividual, setErroAdicionarIndividual] = useState<string | null>(null)

  const [equipeSelecionada, setEquipeSelecionada] = useState('')
  const [adicionandoEquipe, setAdicionandoEquipe] = useState(false)
  const [erroAdicionarEquipe, setErroAdicionarEquipe] = useState<string | null>(null)

  const [alvoRemoverParticipante, setAlvoRemoverParticipante] = useState<Participante | null>(null)
  const [removendoParticipante, setRemovendoParticipante] = useState(false)
  const [erroRemoverParticipante, setErroRemoverParticipante] = useState<string | null>(null)

  const [snackbar, setSnackbar] = useState<{ mensagem: string; severidade: 'success' | 'info' | 'error' } | null>(
    null,
  )

  const [pesquisaSelecionadaId, setPesquisaSelecionadaId] = useState('')
  const [salvandoPesquisa, setSalvandoPesquisa] = useState(false)
  const [erroPesquisa, setErroPesquisa] = useState<string | null>(null)

  const [confirmarAtivar, setConfirmarAtivar] = useState(false)
  const [ativando, setAtivando] = useState(false)
  const [erroAtivar, setErroAtivar] = useState<string | null>(null)

  const [confirmarEncerrar, setConfirmarEncerrar] = useState(false)
  const [encerrando, setEncerrando] = useState(false)
  const [erroEncerrar, setErroEncerrar] = useState<string | null>(null)

  const carregarRelacionamentos = useCallback(async (cicloId: string) => {
    setCarregandoRelacionamentos(true)
    setErroRelacionamentos(null)
    try {
      const dados = await listarRelacionamentos(cicloId)
      setRelacionamentos(dados)
    } catch (err) {
      setErroRelacionamentos(
        err instanceof ApiError ? err.message : 'Não foi possível carregar os relacionamentos gerados.',
      )
    } finally {
      setCarregandoRelacionamentos(false)
    }
  }, [])

  const carregarEnvios = useCallback(async (cicloId: string) => {
    setCarregandoEnvios(true)
    setErroEnvios(null)
    try {
      const resposta = await listarEnvios(cicloId)
      setTipoPesquisaEnvios(resposta.tipoPesquisa)
      if (ehRespostaCampanhaClima(resposta)) {
        setEnvioCampanhaClima(resposta.campanha)
        setParticipantesEnvioClima(resposta.participantes)
        setEnviosAvaliacao360([])
      } else if (ehRespostaAvaliacao360(resposta)) {
        setEnviosAvaliacao360(resposta.envios)
        setEnvioCampanhaClima(null)
        setParticipantesEnvioClima([])
      } else {
        setEnviosAvaliacao360([])
        setEnvioCampanhaClima(null)
        setParticipantesEnvioClima([])
      }
    } catch (err) {
      setErroEnvios(err instanceof ApiError ? err.message : 'Não foi possível carregar os envios.')
    } finally {
      setCarregandoEnvios(false)
    }
  }, [])

  const carregar = useCallback(async () => {
    if (!id) return
    setCarregandoInicial(true)
    setErroCarregamento(null)
    try {
      const [dadosCiclo, dadosParticipantes, dadosPesquisas, dadosColaboradores, dadosEquipes] = await Promise.all([
        buscarCiclo(id),
        listarParticipantes(id),
        listarPesquisas(),
        listarColaboradores(),
        listarEquipes(),
      ])
      setCiclo(dadosCiclo)
      setParticipantes(dadosParticipantes)
      setPesquisas(dadosPesquisas)
      setColaboradores(dadosColaboradores)
      setEquipes(dadosEquipes)
      // A rota de relacionamentos existe e não erraria em rascunho, mas a
      // lista sempre estaria vazia antes da ativação — evita-se a chamada.
      // Envios são gerados na mesma transação que relacionamentos (na
      // ativação), então seguem a mesma condição — chamadas independentes,
      // uma não bloqueia a outra em caso de falha.
      if (dadosCiclo.status !== 'rascunho') {
        const pesquisaDoCiclo = dadosPesquisas.find((p) => p.cicloId === dadosCiclo.id) ?? null
        // Otimização: pula a chamada de relacionamentos só quando já se SABE
        // (pela pesquisa vinculada) que é clima_geral — que nunca gera
        // relacionamentos_avaliacao. Em qualquer outro caso (avaliacao_360 ou
        // incerto), continua chamando, mesmo comportamento de hoje.
        if (pesquisaDoCiclo?.tipo !== 'clima_geral') {
          carregarRelacionamentos(id)
        }
        carregarEnvios(id)
      }
    } catch (err) {
      setErroCarregamento(err instanceof ApiError ? err.message : 'Não foi possível carregar o ciclo.')
    } finally {
      setCarregandoInicial(false)
    }
  }, [id, carregarRelacionamentos, carregarEnvios])

  useEffect(() => {
    // Carga inicial via API — não é dado derivável durante a renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  const colaboradoresAtivosDisponiveis = useMemo(() => {
    const idsParticipantes = new Set(participantes.map((p) => p.colaboradorId))
    return colaboradores.filter((c) => c.ativo && !idsParticipantes.has(c.id))
  }, [colaboradores, participantes])

  const pesquisaVinculada = useMemo(
    () => (ciclo ? (pesquisas.find((p) => p.cicloId === ciclo.id) ?? null) : null),
    [pesquisas, ciclo],
  )

  const pesquisasCandidatas = useMemo(
    () => pesquisas.filter((p) => p.status === 'publicada' && p.cicloId === null),
    [pesquisas],
  )

  /**
   * Fonte de verdade do tipo de pesquisa desta página (ver "Decisões" no
   * task-frontend.md, item 1): prioriza `pesquisaVinculada` (já carregada,
   * síncrona com `ciclo`); cai para `tipoPesquisaEnvios` (do envelope de
   * `listarEnvios`, autoritativo sobre o que foi de fato gerado) só se a
   * pesquisa tiver sido desvinculada do ciclo depois da ativação — caso
   * residual que a UI de hoje não permite, mas o backend não bloqueia.
   */
  const tipoPesquisaCiclo = pesquisaVinculada?.tipo ?? tipoPesquisaEnvios

  async function handleAdicionarIndividual() {
    if (!ciclo || selecionadosIndividual.length === 0) return
    setAdicionandoIndividual(true)
    setErroAdicionarIndividual(null)
    try {
      const atualizados = await adicionarParticipantesIndividual(
        ciclo.id,
        selecionadosIndividual.map((c) => c.id),
      )
      setParticipantes(atualizados)
      setSelecionadosIndividual([])
    } catch (err) {
      setErroAdicionarIndividual(
        err instanceof ApiError ? err.message : 'Não foi possível adicionar os participantes selecionados.',
      )
    } finally {
      setAdicionandoIndividual(false)
    }
  }

  async function handleAdicionarEquipe() {
    if (!ciclo || !equipeSelecionada) return
    setAdicionandoEquipe(true)
    setErroAdicionarEquipe(null)
    try {
      const atualizados = await adicionarParticipantesPorEquipe(ciclo.id, equipeSelecionada)
      if (atualizados.length === participantes.length) {
        setSnackbar({ mensagem: 'Nenhum colaborador novo foi adicionado desta equipe.', severidade: 'info' })
      }
      setParticipantes(atualizados)
      setEquipeSelecionada('')
    } catch (err) {
      setErroAdicionarEquipe(err instanceof ApiError ? err.message : 'Não foi possível adicionar a equipe.')
    } finally {
      setAdicionandoEquipe(false)
    }
  }

  async function handleConfirmarRemoverParticipante() {
    if (!ciclo || !alvoRemoverParticipante) return
    setRemovendoParticipante(true)
    setErroRemoverParticipante(null)
    try {
      await removerParticipante(ciclo.id, alvoRemoverParticipante.colaboradorId)
      setParticipantes((prev) => prev.filter((p) => p.colaboradorId !== alvoRemoverParticipante.colaboradorId))
      setAlvoRemoverParticipante(null)
    } catch (err) {
      setErroRemoverParticipante(err instanceof ApiError ? err.message : 'Não foi possível remover o participante.')
    } finally {
      setRemovendoParticipante(false)
    }
  }

  /**
   * Vincular/desvincular pesquisa usa exclusivamente `PUT /api/pesquisas/:id`
   * (via `atualizarPesquisa`) — não existe (e não deve ser criada) rota
   * equivalente em `ciclosService.ts`. A restrição "só vincular/desvincular
   * com o ciclo em rascunho" (botões abaixo) é decisão de UX espelhada no
   * backend: esse `PUT`, ao vincular (`cicloId` não nulo), valida tanto o
   * status do ciclo (`409 CICLO_NAO_EDITAVEL` se não estiver em rascunho)
   * quanto o da pesquisa (`409 PESQUISA_NAO_PUBLICADA` se a pesquisa não
   * estiver publicada). Desvincular (`cicloId: null`) continua sempre
   * permitido, independentemente do status de ambos.
   */
  async function handleVincularPesquisa() {
    if (!ciclo || !pesquisaSelecionadaId) return
    setSalvandoPesquisa(true)
    setErroPesquisa(null)
    try {
      const atualizada = await atualizarPesquisa(pesquisaSelecionadaId, { cicloId: ciclo.id })
      setPesquisas((prev) => prev.map((p) => (p.id === atualizada.id ? { ...p, cicloId: atualizada.cicloId } : p)))
      setPesquisaSelecionadaId('')
    } catch (err) {
      setErroPesquisa(err instanceof ApiError ? err.message : 'Não foi possível vincular a pesquisa.')
    } finally {
      setSalvandoPesquisa(false)
    }
  }

  async function handleDesvincularPesquisa() {
    if (!pesquisaVinculada) return
    setSalvandoPesquisa(true)
    setErroPesquisa(null)
    try {
      const atualizada = await atualizarPesquisa(pesquisaVinculada.id, { cicloId: null })
      setPesquisas((prev) => prev.map((p) => (p.id === atualizada.id ? { ...p, cicloId: atualizada.cicloId } : p)))
    } catch (err) {
      setErroPesquisa(err instanceof ApiError ? err.message : 'Não foi possível desvincular a pesquisa.')
    } finally {
      setSalvandoPesquisa(false)
    }
  }

  /**
   * Ativação dispara a geração de `relacionamentos_avaliacao` no backend a
   * partir dos participantes atuais — irreversível, por isso o
   * `ConfirmDialog` abaixo é explícito sobre isso. Esta ação só valida
   * client-side a existência de participantes (espelhando
   * `422 CICLO_SEM_PARTICIPANTES`); não checa se há pesquisa vinculada, mesmo
   * critério do backend (ver "Perguntas em aberto" #1 em task-frontend.md).
   */
  async function handleConfirmarAtivar() {
    if (!ciclo) return
    setAtivando(true)
    setErroAtivar(null)
    try {
      const atualizado = await atualizarStatusCiclo(ciclo.id, 'ativo')
      setCiclo(atualizado)
      setConfirmarAtivar(false)
      if (pesquisaVinculada?.tipo !== 'clima_geral') {
        carregarRelacionamentos(ciclo.id)
      }
      carregarEnvios(ciclo.id)
    } catch (err) {
      setErroAtivar(err instanceof ApiError ? err.message : 'Não foi possível ativar o ciclo.')
    } finally {
      setAtivando(false)
    }
  }

  async function handleConfirmarEncerrar() {
    if (!ciclo) return
    setEncerrando(true)
    setErroEncerrar(null)
    try {
      const atualizado = await atualizarStatusCiclo(ciclo.id, 'encerrado')
      setCiclo(atualizado)
      setConfirmarEncerrar(false)
    } catch (err) {
      setErroEncerrar(err instanceof ApiError ? err.message : 'Não foi possível encerrar o ciclo.')
    } finally {
      setEncerrando(false)
    }
  }

  async function handleCopiarLink(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setSnackbar({ mensagem: 'Link copiado.', severidade: 'success' })
    } catch {
      setSnackbar({
        mensagem: 'Não foi possível copiar o link automaticamente. Copie manualmente.',
        severidade: 'error',
      })
    }
  }

  /** Atualiza o slot de state certo (envio de campanha único ou item da lista de avaliação 360), conforme o guard de origem do envio retornado. */
  function aplicarEnvioAtualizado(atualizado: EnvioPesquisaAcao) {
    if (ehEnvioCampanhaClima(atualizado)) {
      setEnvioCampanhaClima(atualizado)
    } else {
      setEnviosAvaliacao360((prev) => prev.map((e) => (e.id === atualizado.id ? atualizado : e)))
    }
  }

  async function handleMarcarComoEnviado(envio: EnvioPesquisaAcao) {
    if (!ciclo) return
    setAcaoEmAndamento({ envioId: envio.id, acao: 'marcar-enviado' })
    try {
      const atualizado = await marcarComoEnviado(ciclo.id, envio.id)
      aplicarEnvioAtualizado(atualizado)
    } catch (err) {
      setSnackbar({
        mensagem: err instanceof ApiError ? err.message : 'Não foi possível marcar o envio como enviado.',
        severidade: 'error',
      })
    } finally {
      setAcaoEmAndamento(null)
    }
  }

  async function handleRegistrarLembrete(envio: EnvioPesquisaAcao) {
    if (!ciclo) return
    setAcaoEmAndamento({ envioId: envio.id, acao: 'registrar-lembrete' })
    try {
      const atualizado = await registrarLembrete(ciclo.id, envio.id)
      aplicarEnvioAtualizado(atualizado)
    } catch (err) {
      setSnackbar({
        mensagem: err instanceof ApiError ? err.message : 'Não foi possível registrar o lembrete.',
        severidade: 'error',
      })
    } finally {
      setAcaoEmAndamento(null)
    }
  }

  async function handleDesbloquearTentativas(envio: EnvioPesquisaAcao) {
    if (!ciclo) return
    setAcaoEmAndamento({ envioId: envio.id, acao: 'desbloquear-tentativas' })
    try {
      const atualizado = await desbloquearTentativas(ciclo.id, envio.id)
      aplicarEnvioAtualizado(atualizado)
    } catch (err) {
      setSnackbar({
        mensagem: err instanceof ApiError ? err.message : 'Não foi possível desbloquear as tentativas.',
        severidade: 'error',
      })
    } finally {
      setAcaoEmAndamento(null)
    }
  }

  async function handleConfirmarExpirar() {
    if (!ciclo || !alvoExpirar) return
    setExpirando(true)
    setErroExpirar(null)
    try {
      const atualizado = await expirarEnvio(ciclo.id, alvoExpirar.id)
      aplicarEnvioAtualizado(atualizado)
      setAlvoExpirar(null)
    } catch (err) {
      setErroExpirar(err instanceof ApiError ? err.message : 'Não foi possível expirar o envio.')
    } finally {
      setExpirando(false)
    }
  }

  if (carregandoInicial) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <CircularProgress color="primary" />
      </div>
    )
  }

  if (erroCarregamento || !ciclo) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <Typography role="alert" color="error">
          {erroCarregamento ?? 'Não foi possível carregar o ciclo.'}
        </Typography>
        <Button variant="contained" color="primary" onClick={carregar}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Typography variant="h5" component="h1">
            {ciclo.nome}
          </Typography>
          <StatusCicloChip status={ciclo.status} />
        </div>
        <div className="flex flex-col items-end gap-1">
          {ciclo.status === 'rascunho' && (
            <Tooltip title={participantes.length === 0 ? 'Adicione ao menos um participante antes de ativar.' : ''}>
              <span>
                <Button
                  variant="contained"
                  color="primary"
                  disabled={participantes.length === 0}
                  onClick={() => {
                    setErroAtivar(null)
                    setConfirmarAtivar(true)
                  }}
                >
                  Ativar ciclo
                </Button>
              </span>
            </Tooltip>
          )}
          {ciclo.status === 'ativo' && (
            <Button
              variant="contained"
              color="warning"
              onClick={() => {
                setErroEncerrar(null)
                setConfirmarEncerrar(true)
              }}
            >
              Encerrar ciclo
            </Button>
          )}
        </div>
      </div>

      <CicloDadosForm ciclo={ciclo} onAtualizado={setCiclo} tipoPesquisa={tipoPesquisaCiclo} />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Typography variant="subtitle1">Participantes</Typography>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nome</TableCell>
                  <TableCell>E-mail</TableCell>
                  <TableCell>Cargo</TableCell>
                  <TableCell>Equipe</TableCell>
                  {ciclo.status === 'rascunho' && <TableCell align="right">Ação</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                <TabelaEstado
                  colSpan={ciclo.status === 'rascunho' ? 5 : 4}
                  carregando={false}
                  vazio={participantes.length === 0}
                  mensagemVazio="Nenhum participante adicionado ainda."
                />
                {participantes.map((participante) => (
                  <TableRow key={participante.id} hover>
                    <TableCell>{participante.nomeCompleto}</TableCell>
                    <TableCell>{participante.email}</TableCell>
                    <TableCell>{participante.cargo ?? '—'}</TableCell>
                    <TableCell>{participante.equipe?.nome ?? '—'}</TableCell>
                    {ciclo.status === 'rascunho' && (
                      <TableCell align="right">
                        <Button
                          size="small"
                          color="error"
                          onClick={() => {
                            setErroRemoverParticipante(null)
                            setAlvoRemoverParticipante(participante)
                          }}
                        >
                          Remover
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {ciclo.status === 'rascunho' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Typography variant="subtitle2">Adicionar por pessoa</Typography>
                <Autocomplete
                  multiple
                  options={colaboradoresAtivosDisponiveis}
                  getOptionLabel={(colaborador) => colaborador.nomeCompleto}
                  value={selecionadosIndividual}
                  onChange={(_evento, valor) => setSelecionadosIndividual(valor)}
                  disabled={adicionandoIndividual}
                  renderInput={(params) => (
                    <TextField {...params} label="Colaboradores ativos" placeholder="Buscar..." />
                  )}
                />
                <div className="flex justify-end">
                  <Button
                    variant="outlined"
                    onClick={handleAdicionarIndividual}
                    disabled={adicionandoIndividual || selecionadosIndividual.length === 0}
                  >
                    {adicionandoIndividual ? 'Adicionando...' : 'Adicionar selecionados'}
                  </Button>
                </div>
                {erroAdicionarIndividual && (
                  <Alert severity="error" role="alert">
                    {erroAdicionarIndividual}
                  </Alert>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Typography variant="subtitle2">Adicionar por equipe</Typography>
                <TextField
                  select
                  label="Equipe"
                  value={equipeSelecionada}
                  onChange={(e) => setEquipeSelecionada(e.target.value)}
                  disabled={adicionandoEquipe}
                  fullWidth
                >
                  <MenuItem value="">Selecione</MenuItem>
                  {equipes.map((equipe) => (
                    <MenuItem key={equipe.id} value={equipe.id}>
                      {equipe.nome}
                    </MenuItem>
                  ))}
                </TextField>
                <div className="flex justify-end">
                  <Button
                    variant="outlined"
                    onClick={handleAdicionarEquipe}
                    disabled={adicionandoEquipe || !equipeSelecionada}
                  >
                    {adicionandoEquipe ? 'Adicionando...' : 'Adicionar equipe inteira'}
                  </Button>
                </div>
                {erroAdicionarEquipe && (
                  <Alert severity="error" role="alert">
                    {erroAdicionarEquipe}
                  </Alert>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Typography variant="subtitle1">Pesquisa vinculada</Typography>

          {pesquisaVinculada ? (
            <div className="flex flex-wrap items-center gap-2">
              <Typography>{pesquisaVinculada.titulo}</Typography>
              <StatusPesquisaChip status={pesquisaVinculada.status} />
              <TipoPesquisaChip tipo={pesquisaVinculada.tipo} />
              <Button size="small" onClick={() => navigate(`/pesquisas/${pesquisaVinculada.id}/editar`)}>
                Editar pesquisa
              </Button>
              {ciclo.status === 'rascunho' && (
                <Button size="small" color="error" onClick={handleDesvincularPesquisa} disabled={salvandoPesquisa}>
                  {salvandoPesquisa ? 'Removendo...' : 'Desvincular'}
                </Button>
              )}
            </div>
          ) : pesquisasCandidatas.length === 0 ? (
            <Typography color="text.secondary">Nenhuma pesquisa publicada disponível para vincular.</Typography>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <TextField
                select
                label="Pesquisa publicada"
                value={pesquisaSelecionadaId}
                onChange={(e) => setPesquisaSelecionadaId(e.target.value)}
                disabled={salvandoPesquisa}
                sx={{ minWidth: 240 }}
              >
                <MenuItem value="">Selecione</MenuItem>
                {pesquisasCandidatas.map((pesquisa) => (
                  <MenuItem key={pesquisa.id} value={pesquisa.id}>
                    {pesquisa.titulo}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="outlined"
                onClick={handleVincularPesquisa}
                disabled={salvandoPesquisa || !pesquisaSelecionadaId || ciclo.status !== 'rascunho'}
              >
                {salvandoPesquisa ? 'Vinculando...' : 'Vincular'}
              </Button>
            </div>
          )}

          {erroPesquisa && (
            <Alert severity="error" role="alert">
              {erroPesquisa}
            </Alert>
          )}
        </CardContent>
      </Card>

      {ciclo.status !== 'rascunho' && tipoPesquisaCiclo !== 'clima_geral' && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Typography variant="subtitle1">Relacionamentos gerados</Typography>
            <Typography variant="body2" color="text.secondary">
              Vínculo estrutural de quem avalia quem, gerado automaticamente na ativação do ciclo. Dado identificado
              — visível apenas para admin/gestor de RH.
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Avaliador</TableCell>
                    <TableCell>Avaliado</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Data</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TabelaEstado
                    colSpan={4}
                    carregando={carregandoRelacionamentos}
                    erro={erroRelacionamentos}
                    vazio={!carregandoRelacionamentos && !erroRelacionamentos && relacionamentos.length === 0}
                    mensagemVazio="Nenhum relacionamento gerado ainda."
                    onTentarNovamente={() => carregarRelacionamentos(ciclo.id)}
                  />
                  {!carregandoRelacionamentos &&
                    !erroRelacionamentos &&
                    relacionamentos.map((relacionamento) => (
                      <TableRow key={relacionamento.id} hover>
                        <TableCell>{relacionamento.avaliadorNome}</TableCell>
                        <TableCell>{relacionamento.avaliadoNome}</TableCell>
                        <TableCell>{ROTULOS_TIPO_RELACIONAMENTO[relacionamento.tipoRelacionamento]}</TableCell>
                        <TableCell>{FORMATADOR_DATA_HORA.format(new Date(relacionamento.criadoEm))}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {ciclo.status !== 'rascunho' && tipoPesquisaCiclo !== 'clima_geral' && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Typography variant="subtitle1">Envios</Typography>
            <Typography variant="body2" color="text.secondary">
              Controle manual de envio do link de resposta — o link é copiado e compartilhado pelo admin fora da
              plataforma (e-mail, WhatsApp, etc.); esta tela só registra o status. Dado identificado — visível apenas
              para admin/gestor de RH.
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Avaliador</TableCell>
                    <TableCell>Avaliado</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Lembretes</TableCell>
                    <TableCell align="right">Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TabelaEstado
                    colSpan={6}
                    carregando={carregandoEnvios}
                    erro={erroEnvios}
                    vazio={!carregandoEnvios && !erroEnvios && enviosAvaliacao360.length === 0}
                    mensagemVazio="Nenhum envio gerado ainda."
                    onTentarNovamente={() => carregarEnvios(ciclo.id)}
                  />
                  {!carregandoEnvios &&
                    !erroEnvios &&
                    enviosAvaliacao360.map((envio) => {
                      const acaoAtual =
                        acaoEmAndamento?.envioId === envio.id ? acaoEmAndamento.acao : null
                      return (
                        <TableRow key={envio.id} hover>
                          <TableCell>{envio.avaliadorNome}</TableCell>
                          <TableCell>{envio.avaliadoNome}</TableCell>
                          <TableCell>{ROTULOS_TIPO_RELACIONAMENTO[envio.tipoRelacionamento]}</TableCell>
                          <TableCell>
                            <StatusEnvioChip status={envio.status} />
                          </TableCell>
                          <TableCell>{envio.quantidadeLembretes}</TableCell>
                          <TableCell align="right">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Button size="small" onClick={() => handleCopiarLink(envio.link)}>
                                Copiar link
                              </Button>
                              <Tooltip title={envio.status !== 'pendente' ? 'Só disponível a partir de "Pendente".' : ''}>
                                <span>
                                  <Button
                                    size="small"
                                    disabled={envio.status !== 'pendente' || acaoAtual === 'marcar-enviado'}
                                    onClick={() => handleMarcarComoEnviado(envio)}
                                  >
                                    {acaoAtual === 'marcar-enviado' ? 'Aguarde...' : 'Marcar como enviado'}
                                  </Button>
                                </span>
                              </Tooltip>
                              <Tooltip title={envio.status !== 'enviado' ? 'Só disponível a partir de "Enviado".' : ''}>
                                <span>
                                  <Button
                                    size="small"
                                    disabled={envio.status !== 'enviado' || acaoAtual === 'registrar-lembrete'}
                                    onClick={() => handleRegistrarLembrete(envio)}
                                  >
                                    {acaoAtual === 'registrar-lembrete'
                                      ? 'Aguarde...'
                                      : `Lembrete (${envio.quantidadeLembretes})`}
                                  </Button>
                                </span>
                              </Tooltip>
                              <Button
                                size="small"
                                color="error"
                                disabled={envio.status === 'expirado'}
                                onClick={() => {
                                  setErroExpirar(null)
                                  setAlvoExpirar(envio)
                                }}
                              >
                                Expirar
                              </Button>
                              <Tooltip title={!envio.bloqueadoPorTentativas ? 'Envio não está bloqueado por tentativas.' : ''}>
                                <span>
                                  <Button
                                    size="small"
                                    disabled={!envio.bloqueadoPorTentativas || acaoAtual === 'desbloquear-tentativas'}
                                    onClick={() => handleDesbloquearTentativas(envio)}
                                  >
                                    {acaoAtual === 'desbloquear-tentativas' ? 'Aguarde...' : 'Desbloquear tentativas'}
                                  </Button>
                                </span>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {ciclo.status !== 'rascunho' && tipoPesquisaCiclo === 'clima_geral' && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Typography variant="subtitle1">Participantes e envios</Typography>
            <Typography variant="body2" color="text.secondary">
              Pesquisa de clima e satisfação — link único, compartilhado com todos os participantes do ciclo. O
              colaborador acessa o link e confirma o CPF para liberar o formulário. Esta tela só controla o envio
              do link e mostra quem já respondeu. Dado identificado — visível apenas para admin/gestor de RH.
            </Typography>

            {carregandoEnvios && (
              <div className="flex justify-center py-6">
                <CircularProgress size={28} />
              </div>
            )}

            {!carregandoEnvios && erroEnvios && (
              <Alert
                severity="error"
                role="alert"
                action={
                  <Button color="inherit" size="small" onClick={() => carregarEnvios(ciclo.id)}>
                    Tentar novamente
                  </Button>
                }
              >
                {erroEnvios}
              </Alert>
            )}

            {!carregandoEnvios && !erroEnvios && envioCampanhaClima && (
              <>
                <Paper variant="outlined" className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Typography variant="subtitle2">Link da campanha</Typography>
                    <StatusEnvioChip status={envioCampanhaClima.status} />
                  </div>
                  <div className="overflow-x-auto">
                    <TextField
                      value={envioCampanhaClima.link}
                      slotProps={{ input: { readOnly: true } }}
                      size="small"
                      fullWidth
                      sx={{ '& input': { fontFamily: 'monospace' } }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="small" onClick={() => handleCopiarLink(envioCampanhaClima.link)}>
                      Copiar link
                    </Button>
                    <Tooltip
                      title={
                        envioCampanhaClima.status !== 'pendente' ? 'Só disponível a partir de "Pendente".' : ''
                      }
                    >
                      <span>
                        <Button
                          size="small"
                          disabled={
                            envioCampanhaClima.status !== 'pendente' ||
                            (acaoEmAndamento?.envioId === envioCampanhaClima.id &&
                              acaoEmAndamento.acao === 'marcar-enviado')
                          }
                          onClick={() => handleMarcarComoEnviado(envioCampanhaClima)}
                        >
                          {acaoEmAndamento?.envioId === envioCampanhaClima.id &&
                          acaoEmAndamento.acao === 'marcar-enviado'
                            ? 'Aguarde...'
                            : 'Marcar como enviado'}
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip
                      title={
                        envioCampanhaClima.status !== 'enviado' ? 'Só disponível a partir de "Enviado".' : ''
                      }
                    >
                      <span>
                        <Button
                          size="small"
                          disabled={
                            envioCampanhaClima.status !== 'enviado' ||
                            (acaoEmAndamento?.envioId === envioCampanhaClima.id &&
                              acaoEmAndamento.acao === 'registrar-lembrete')
                          }
                          onClick={() => handleRegistrarLembrete(envioCampanhaClima)}
                        >
                          {acaoEmAndamento?.envioId === envioCampanhaClima.id &&
                          acaoEmAndamento.acao === 'registrar-lembrete'
                            ? 'Aguarde...'
                            : `Lembrete (${envioCampanhaClima.quantidadeLembretes})`}
                        </Button>
                      </span>
                    </Tooltip>
                    <Button
                      size="small"
                      color="error"
                      disabled={envioCampanhaClima.status === 'expirado'}
                      onClick={() => {
                        setErroExpirar(null)
                        setAlvoExpirar(envioCampanhaClima)
                      }}
                    >
                      Expirar
                    </Button>
                    <Tooltip
                      title={!envioCampanhaClima.bloqueadoPorTentativas ? 'Envio não está bloqueado por tentativas.' : ''}
                    >
                      <span>
                        <Button
                          size="small"
                          disabled={
                            !envioCampanhaClima.bloqueadoPorTentativas ||
                            (acaoEmAndamento?.envioId === envioCampanhaClima.id &&
                              acaoEmAndamento.acao === 'desbloquear-tentativas')
                          }
                          onClick={() => handleDesbloquearTentativas(envioCampanhaClima)}
                        >
                          {acaoEmAndamento?.envioId === envioCampanhaClima.id &&
                          acaoEmAndamento.acao === 'desbloquear-tentativas'
                            ? 'Aguarde...'
                            : 'Desbloquear tentativas'}
                        </Button>
                      </span>
                    </Tooltip>
                  </div>
                </Paper>

                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Colaborador</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Respondido em</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TabelaEstado
                        colSpan={3}
                        carregando={false}
                        vazio={participantesEnvioClima.length === 0}
                        mensagemVazio="Nenhum participante neste ciclo."
                      />
                      {participantesEnvioClima.map((participante) => (
                        <TableRow key={participante.id} hover>
                          <TableCell>{participante.nomeCompleto}</TableCell>
                          <TableCell>
                            <Chip
                              label={participante.respondeuEm ? 'Respondido' : 'Pendente'}
                              color={participante.respondeuEm ? 'success' : 'default'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            {participante.respondeuEm
                              ? FORMATADOR_DATA_HORA.format(new Date(participante.respondeuEm))
                              : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Typography variant="caption" color="text.secondary">
        Período: {formatarData(ciclo.dataInicio)} — {formatarData(ciclo.dataFim)}
      </Typography>

      <ConfirmDialog
        open={Boolean(alvoRemoverParticipante)}
        titulo="Remover participante"
        mensagem={`Remover "${alvoRemoverParticipante?.nomeCompleto ?? ''}" deste ciclo?`}
        confirmarLabel="Remover"
        carregando={removendoParticipante}
        erro={erroRemoverParticipante}
        onConfirmar={handleConfirmarRemoverParticipante}
        onCancelar={() => {
          if (removendoParticipante) return
          setAlvoRemoverParticipante(null)
          setErroRemoverParticipante(null)
        }}
      />

      <ConfirmDialog
        open={confirmarAtivar}
        titulo="Ativar ciclo"
        mensagem="Ativar este ciclo? Os relacionamentos de avaliação (quem avalia quem) serão gerados automaticamente a partir dos participantes atuais, e não será mais possível editar o ciclo, seus participantes ou a pesquisa vinculada depois disso."
        confirmarLabel="Ativar"
        carregando={ativando}
        erro={erroAtivar}
        onConfirmar={handleConfirmarAtivar}
        onCancelar={() => {
          if (ativando) return
          setConfirmarAtivar(false)
          setErroAtivar(null)
        }}
      />

      <ConfirmDialog
        open={confirmarEncerrar}
        titulo="Encerrar ciclo"
        mensagem="Encerrar este ciclo? Esta ação não pode ser desfeita."
        confirmarLabel="Encerrar"
        carregando={encerrando}
        erro={erroEncerrar}
        onConfirmar={handleConfirmarEncerrar}
        onCancelar={() => {
          if (encerrando) return
          setConfirmarEncerrar(false)
          setErroEncerrar(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(alvoExpirar)}
        titulo="Expirar envio"
        mensagem={`Marcar o envio ${rotuloAlvoExpirar(alvoExpirar)} como expirado? Esta ação normalmente não tem volta nesta tela.`}
        confirmarLabel="Expirar"
        carregando={expirando}
        erro={erroExpirar}
        onConfirmar={handleConfirmarExpirar}
        onCancelar={() => {
          if (expirando) return
          setAlvoExpirar(null)
          setErroExpirar(null)
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
