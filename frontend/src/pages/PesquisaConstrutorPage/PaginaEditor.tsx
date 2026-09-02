import { useState } from 'react'
import { Button, Card, CardContent, MenuItem, TextField, Typography } from '@mui/material'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog'
import { PerguntaCard } from '../../components/perguntas/PerguntaCard/PerguntaCard'
import { ApiError } from '../../lib/apiClient'
import { atualizarPagina, removerPagina } from '../../services/paginasService'
import { atualizarPergunta, criarPergunta, removerPergunta, reordenarPerguntas } from '../../services/perguntasService'
import type { Competencia } from '../../types/competencia'
import type { AtualizarPerguntaPayload, Pagina, PerguntaPayload, TipoPergunta, TipoPesquisa } from '../../types/pesquisa'
import { PerguntaRascunhoCard } from './PerguntaRascunhoCard'

const TIPO_OPCOES_BASE: { valor: TipoPergunta; label: string }[] = [
  { valor: 'likert', label: 'Likert' },
  { valor: 'texto_aberto', label: 'Texto aberto' },
  { valor: 'matriz', label: 'Matriz' },
  { valor: 'pessoa', label: 'Pessoa' },
]

interface PaginaEditorProps {
  pesquisaId: string
  pagina: Pagina
  /** Pergunta `pessoa` pressupõe um universo avaliador↔avaliado, que não existe para `clima_geral` — oculta essa opção do seletor de tipo de pergunta abaixo. */
  tipoPesquisa: TipoPesquisa
  /** Buscada uma vez pela página avó (`PesquisaConstrutorPage`), repassada até `PerguntaMatrizEditor`. */
  competencias: Competencia[]
  somenteLeitura: boolean
  podeMoverCima: boolean
  podeMoverBaixo: boolean
  onMoverCima: () => void
  onMoverBaixo: () => void
  onAtualizada: (pagina: Pagina) => void
  onRemovida: () => void
  onErro: (mensagem: string) => void
}

/**
 * Subcomponente local desta página (não precisa ser genérico fora daqui):
 * cabeçalho de página + lista de `PerguntaCard` + controles de
 * adicionar/mover/excluir. Persiste cada ação granularmente, imediatamente
 * (ver `task-frontend.md`).
 */
export function PaginaEditor({
  pesquisaId,
  pagina,
  tipoPesquisa,
  competencias,
  somenteLeitura,
  podeMoverCima,
  podeMoverBaixo,
  onMoverCima,
  onMoverBaixo,
  onAtualizada,
  onRemovida,
  onErro,
}: PaginaEditorProps) {
  const [titulo, setTitulo] = useState(pagina.titulo ?? '')
  const [salvandoTitulo, setSalvandoTitulo] = useState(false)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [erroExclusao, setErroExclusao] = useState<string | null>(null)
  const [tipoNovaPergunta, setTipoNovaPergunta] = useState<TipoPergunta>('likert')
  const [criandoPergunta, setCriandoPergunta] = useState(false)
  const [rascunhoAberto, setRascunhoAberto] = useState(false)
  const [erroRascunho, setErroRascunho] = useState<string | null>(null)
  const [criandoRascunho, setCriandoRascunho] = useState(false)

  async function handleTituloBlur() {
    const novoTitulo = titulo.trim()
    const tituloAtual = pagina.titulo ?? ''
    if (novoTitulo === tituloAtual) return
    setSalvandoTitulo(true)
    try {
      const atualizada = await atualizarPagina(pesquisaId, pagina.id, { titulo: novoTitulo || undefined })
      onAtualizada({ ...pagina, titulo: atualizada.titulo ?? (novoTitulo || null) })
    } catch (err) {
      setTitulo(pagina.titulo ?? '')
      onErro(err instanceof ApiError ? err.message : 'Não foi possível salvar o título da página.')
    } finally {
      setSalvandoTitulo(false)
    }
  }

  async function handleExcluirPagina() {
    setExcluindo(true)
    setErroExclusao(null)
    try {
      await removerPagina(pesquisaId, pagina.id)
      onRemovida()
    } catch (err) {
      setErroExclusao(err instanceof ApiError ? err.message : 'Não foi possível excluir a página.')
    } finally {
      setExcluindo(false)
    }
  }

  function calcularNovaOrdem(perguntaId: string, direcao: 'cima' | 'baixo') {
    const ordenadas = [...pagina.perguntas].sort((a, b) => a.ordem - b.ordem)
    const indice = ordenadas.findIndex((p) => p.id === perguntaId)
    const alvo = direcao === 'cima' ? indice - 1 : indice + 1
    if (indice < 0 || alvo < 0 || alvo >= ordenadas.length) return null
    const copia = [...ordenadas]
    ;[copia[indice], copia[alvo]] = [copia[alvo], copia[indice]]
    return copia.map((p, i) => ({ id: p.id, ordem: i + 1 }))
  }

  async function handleMoverPergunta(perguntaId: string, direcao: 'cima' | 'baixo') {
    const itens = calcularNovaOrdem(perguntaId, direcao)
    if (!itens) return
    try {
      await reordenarPerguntas(pesquisaId, pagina.id, itens)
      const mapaOrdem = new Map(itens.map((item) => [item.id, item.ordem]))
      const perguntasAtualizadas = pagina.perguntas
        .map((p) => ({ ...p, ordem: mapaOrdem.get(p.id) ?? p.ordem }))
        .sort((a, b) => a.ordem - b.ordem)
      onAtualizada({ ...pagina, perguntas: perguntasAtualizadas })
    } catch (err) {
      onErro(err instanceof ApiError ? err.message : 'Não foi possível reordenar as perguntas.')
    }
  }

  async function handleSalvarPergunta(perguntaId: string, patch: AtualizarPerguntaPayload) {
    const perguntaAtualizada = await atualizarPergunta(pesquisaId, pagina.id, perguntaId, patch)
    onAtualizada({
      ...pagina,
      perguntas: pagina.perguntas.map((p) => (p.id === perguntaId ? perguntaAtualizada : p)),
    })
  }

  async function handleExcluirPergunta(perguntaId: string) {
    await removerPergunta(pesquisaId, pagina.id, perguntaId)
    onAtualizada({ ...pagina, perguntas: pagina.perguntas.filter((p) => p.id !== perguntaId) })
  }

  function payloadDefault(tipo: 'likert' | 'texto_aberto'): PerguntaPayload {
    if (tipo === 'likert') {
      return {
        tipo: 'likert',
        enunciado: 'Nova pergunta',
        obrigatoria: true,
        configuracao: { niveis: 5, rotulos: ['1', '2', '3', '4', '5'] },
      }
    }
    return { tipo: 'texto_aberto', enunciado: 'Nova pergunta', obrigatoria: true, configuracao: {} }
  }

  async function handleAdicionarPergunta() {
    if (tipoNovaPergunta === 'matriz' || tipoNovaPergunta === 'pessoa') {
      setErroRascunho(null)
      setRascunhoAberto(true)
      return
    }
    setCriandoPergunta(true)
    try {
      const novaPergunta = await criarPergunta(pesquisaId, pagina.id, payloadDefault(tipoNovaPergunta))
      onAtualizada({ ...pagina, perguntas: [...pagina.perguntas, novaPergunta] })
    } catch (err) {
      onErro(err instanceof ApiError ? err.message : 'Não foi possível adicionar a pergunta.')
    } finally {
      setCriandoPergunta(false)
    }
  }

  async function handleSalvarRascunho(payload: PerguntaPayload) {
    setErroRascunho(null)
    setCriandoRascunho(true)
    try {
      const novaPergunta = await criarPergunta(pesquisaId, pagina.id, payload)
      onAtualizada({ ...pagina, perguntas: [...pagina.perguntas, novaPergunta] })
      setRascunhoAberto(false)
    } catch (err) {
      setErroRascunho(err instanceof ApiError ? err.message : 'Não foi possível adicionar a pergunta.')
    } finally {
      setCriandoRascunho(false)
    }
  }

  const perguntasOrdenadas = [...pagina.perguntas].sort((a, b) => a.ordem - b.ordem)

  // "Pessoa" pressupõe um universo avaliador↔avaliado (relacionamentos_avaliacao),
  // que não existe para pesquisas `clima_geral` — oculta a opção do seletor.
  const tipoOpcoes =
    tipoPesquisa === 'clima_geral'
      ? TIPO_OPCOES_BASE.filter((opcao) => opcao.valor !== 'pessoa')
      : TIPO_OPCOES_BASE

  return (
    <Card variant="outlined">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TextField
            label="Título da página (opcional)"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={handleTituloBlur}
            disabled={somenteLeitura || salvandoTitulo}
            sx={{ minWidth: 260 }}
          />
          {!somenteLeitura && (
            <div className="flex flex-wrap gap-2">
              <Button size="small" onClick={onMoverCima} disabled={!podeMoverCima}>
                Mover página para cima
              </Button>
              <Button size="small" onClick={onMoverBaixo} disabled={!podeMoverBaixo}>
                Mover página para baixo
              </Button>
              <Button size="small" color="error" onClick={() => setConfirmarExclusao(true)}>
                Excluir página
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {perguntasOrdenadas.length === 0 && !rascunhoAberto && (
            <Typography variant="body2" color="text.secondary">
              Nenhuma pergunta nesta página ainda.
            </Typography>
          )}
          {perguntasOrdenadas.map((pergunta, indice) => (
            <PerguntaCard
              key={pergunta.id}
              pergunta={pergunta}
              competencias={competencias}
              somenteLeitura={somenteLeitura}
              podeMoverCima={indice > 0}
              podeMoverBaixo={indice < perguntasOrdenadas.length - 1}
              onMoverCima={() => handleMoverPergunta(pergunta.id, 'cima')}
              onMoverBaixo={() => handleMoverPergunta(pergunta.id, 'baixo')}
              onExcluir={() => handleExcluirPergunta(pergunta.id)}
              onSalvar={(patch) => handleSalvarPergunta(pergunta.id, patch)}
            />
          ))}
          {rascunhoAberto && (tipoNovaPergunta === 'matriz' || tipoNovaPergunta === 'pessoa') && (
            <PerguntaRascunhoCard
              tipo={tipoNovaPergunta}
              competencias={competencias}
              criando={criandoRascunho}
              erro={erroRascunho}
              onSalvar={handleSalvarRascunho}
              onCancelar={() => {
                setRascunhoAberto(false)
                setErroRascunho(null)
              }}
            />
          )}
        </div>

        {!somenteLeitura && !rascunhoAberto && (
          <div className="flex flex-wrap items-center gap-2">
            <TextField
              select
              label="Tipo de pergunta"
              value={tipoNovaPergunta}
              onChange={(e) => setTipoNovaPergunta(e.target.value as TipoPergunta)}
              sx={{ minWidth: 200 }}
              size="small"
            >
              {tipoOpcoes.map((opcao) => (
                <MenuItem key={opcao.valor} value={opcao.valor}>
                  {opcao.label}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" onClick={handleAdicionarPergunta} disabled={criandoPergunta}>
              {criandoPergunta ? 'Adicionando...' : 'Adicionar pergunta'}
            </Button>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmarExclusao}
        titulo="Excluir página"
        mensagem="Deseja realmente excluir esta página e todas as suas perguntas?"
        confirmarLabel="Excluir"
        carregando={excluindo}
        erro={erroExclusao}
        onConfirmar={handleExcluirPagina}
        onCancelar={() => {
          if (excluindo) return
          setConfirmarExclusao(false)
          setErroExclusao(null)
        }}
      />
    </Card>
  )
}
