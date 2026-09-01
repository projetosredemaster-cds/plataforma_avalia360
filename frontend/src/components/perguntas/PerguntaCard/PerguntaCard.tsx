import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, CardContent, Chip, CircularProgress } from '@mui/material'
import { ConfirmDialog } from '../../ConfirmDialog/ConfirmDialog'
import type { Competencia } from '../../../types/competencia'
import type { AtualizarPerguntaPayload, Pergunta } from '../../../types/pesquisa'
import { PerguntaLikertEditor, type PerguntaLikertValor } from '../PerguntaLikert/PerguntaLikertEditor'
import { PerguntaTextoAbertoEditor, type PerguntaTextoAbertoValor } from '../PerguntaTextoAberto/PerguntaTextoAbertoEditor'
import { PerguntaMatrizEditor, type PerguntaMatrizValor } from '../PerguntaMatriz/PerguntaMatrizEditor'
import { PerguntaPessoaEditor, type PerguntaPessoaValor } from '../PerguntaPessoa/PerguntaPessoaEditor'
import { validarConfiguracaoLikert, validarConfiguracaoPessoa, validarPerguntaMatriz } from '../validacaoPergunta'

const TIPO_LABEL: Record<Pergunta['tipo'], string> = {
  likert: 'Likert',
  texto_aberto: 'Texto aberto',
  matriz: 'Matriz',
  pessoa: 'Pessoa',
}

/** Tempo de inatividade antes de persistir uma edição de campo automaticamente. */
const DEBOUNCE_MS = 700

type ValorEditavel = PerguntaLikertValor | PerguntaTextoAbertoValor | PerguntaMatrizValor | PerguntaPessoaValor

function paraValorEditavel(pergunta: Pergunta): ValorEditavel {
  if (pergunta.tipo === 'matriz') {
    return {
      enunciado: pergunta.enunciado,
      obrigatoria: pergunta.obrigatoria,
      configuracao: pergunta.configuracao,
      competenciaIds: pergunta.competencias.map((competencia) => competencia.id),
    }
  }
  return {
    enunciado: pergunta.enunciado,
    obrigatoria: pergunta.obrigatoria,
    configuracao: pergunta.configuracao,
  } as ValorEditavel
}

function valorValido(tipo: Pergunta['tipo'], valor: ValorEditavel): boolean {
  if (!valor.enunciado.trim()) return false
  if (tipo === 'likert') return validarConfiguracaoLikert((valor as PerguntaLikertValor).configuracao)
  if (tipo === 'matriz') {
    const matrizValor = valor as PerguntaMatrizValor
    return validarPerguntaMatriz(matrizValor.configuracao, matrizValor.competenciaIds)
  }
  if (tipo === 'pessoa') return validarConfiguracaoPessoa((valor as PerguntaPessoaValor).configuracao)
  return true
}

interface PerguntaCardProps {
  pergunta: Pergunta
  /** Buscada uma vez pela página pai — este card nunca chama a API para listar competências. */
  competencias: Competencia[]
  somenteLeitura: boolean
  podeMoverCima: boolean
  podeMoverBaixo: boolean
  onMoverCima: () => void
  onMoverBaixo: () => void
  onExcluir: () => Promise<void>
  onSalvar: (patch: AtualizarPerguntaPayload) => Promise<void>
}

/**
 * Casco comum de uma pergunta no construtor: cabeçalho com `Chip` do tipo,
 * botões "Mover para cima/baixo" e "Excluir", e o editor correto por
 * `switch` em `pergunta.tipo`. Edições de campo são persistidas
 * automaticamente após um curto período de inatividade (sem um botão
 * "Salvar" separado, ver `task-frontend.md`) — em erro, o card reverte para
 * o último valor confirmado e exibe o erro inline.
 */
export function PerguntaCard({
  pergunta,
  competencias,
  somenteLeitura,
  podeMoverCima,
  podeMoverBaixo,
  onMoverCima,
  onMoverBaixo,
  onExcluir,
  onSalvar,
}: PerguntaCardProps) {
  const [valorAtual, setValorAtual] = useState<ValorEditavel>(() => paraValorEditavel(pergunta))
  const [salvando, setSalvando] = useState(false)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Último valor editado ainda não persistido (debounce pendente) — usado para "flush" no unmount, ver useEffect de limpeza abaixo. */
  const pendingValorRef = useRef<ValorEditavel | null>(null)
  /** Sempre aponta para o `commit` mais recente (props/estado atuais) — evita fechar sobre uma versão desatualizada no cleanup do unmount. */
  const commitRef = useRef<(valor: ValorEditavel) => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    // Reinicializa o rascunho local só quando a pergunta troca de
    // identidade (id) — evita sobrescrever uma edição em digitação com o
    // eco do próprio prop após o commit bem-sucedido do debounce abaixo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValorAtual(paraValorEditavel(pergunta))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pergunta.id])

  async function commit(valorParaSalvar: ValorEditavel) {
    pendingValorRef.current = null
    if (!valorValido(pergunta.tipo, valorParaSalvar)) {
      setErroSalvar('Preencha os campos obrigatórios (enunciado, níveis/rótulos, competências ou relacionamentos, conforme o tipo) antes de salvar.')
      return
    }
    setSalvando(true)
    setErroSalvar(null)
    try {
      const patch: AtualizarPerguntaPayload = {
        enunciado: valorParaSalvar.enunciado,
        obrigatoria: valorParaSalvar.obrigatoria,
        configuracao: valorParaSalvar.configuracao,
        ...(pergunta.tipo === 'matriz'
          ? { competenciaIds: (valorParaSalvar as PerguntaMatrizValor).competenciaIds }
          : {}),
      }
      await onSalvar(patch)
    } catch (err) {
      setErroSalvar(err instanceof Error ? err.message : 'Não foi possível salvar a pergunta.')
      setValorAtual(paraValorEditavel(pergunta))
    } finally {
      setSalvando(false)
    }
  }

  // Mantém `commitRef` sempre apontando para o `commit` da renderização mais
  // recente (props/estado atuais), sem depender de um array de dependências.
  useEffect(() => {
    commitRef.current = commit
  })

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      // Flush da edição pendente: se o usuário editou um campo e navegou para
      // fora (ou o card desmontou) antes do debounce disparar, a edição não
      // pode se perder silenciosamente — dispara o commit imediatamente.
      if (pendingValorRef.current) {
        const valorPendente = pendingValorRef.current
        pendingValorRef.current = null
        void commitRef.current(valorPendente)
      }
    }
  }, [])

  function agendarSalvamento(novoValor: ValorEditavel) {
    setValorAtual(novoValor)
    pendingValorRef.current = novoValor
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void commit(novoValor)
    }, DEBOUNCE_MS)
  }

  async function handleExcluir() {
    setExcluindo(true)
    try {
      await onExcluir()
      setConfirmarExclusao(false)
    } catch (err) {
      setErroSalvar(err instanceof Error ? err.message : 'Não foi possível excluir a pergunta.')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <Card variant="outlined">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Chip label={TIPO_LABEL[pergunta.tipo]} size="small" color="primary" variant="outlined" />
          <div className="flex items-center gap-2">
            {salvando && <CircularProgress size={16} />}
            {!somenteLeitura && (
              <>
                <Button size="small" onClick={onMoverCima} disabled={!podeMoverCima}>
                  Mover para cima
                </Button>
                <Button size="small" onClick={onMoverBaixo} disabled={!podeMoverBaixo}>
                  Mover para baixo
                </Button>
                <Button
                  size="small"
                  color="error"
                  onClick={() => {
                    setErroSalvar(null)
                    setConfirmarExclusao(true)
                  }}
                >
                  Excluir
                </Button>
              </>
            )}
          </div>
        </div>

        {pergunta.tipo === 'likert' && (
          <PerguntaLikertEditor
            valor={valorAtual as PerguntaLikertValor}
            onChange={agendarSalvamento}
            somenteLeitura={somenteLeitura}
          />
        )}
        {pergunta.tipo === 'texto_aberto' && (
          <PerguntaTextoAbertoEditor
            valor={valorAtual as PerguntaTextoAbertoValor}
            onChange={agendarSalvamento}
            somenteLeitura={somenteLeitura}
          />
        )}
        {pergunta.tipo === 'matriz' && (
          <PerguntaMatrizEditor
            valor={valorAtual as PerguntaMatrizValor}
            onChange={agendarSalvamento}
            competencias={competencias}
            somenteLeitura={somenteLeitura}
          />
        )}
        {pergunta.tipo === 'pessoa' && (
          <PerguntaPessoaEditor
            valor={valorAtual as PerguntaPessoaValor}
            onChange={agendarSalvamento}
            somenteLeitura={somenteLeitura}
          />
        )}

        {erroSalvar && (
          <Alert severity="error" role="alert">
            {erroSalvar}
          </Alert>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmarExclusao}
        titulo="Excluir pergunta"
        mensagem="Deseja realmente excluir esta pergunta?"
        confirmarLabel="Excluir"
        carregando={excluindo}
        erro={erroSalvar}
        onConfirmar={handleExcluir}
        onCancelar={() => {
          if (excluindo) return
          setConfirmarExclusao(false)
          setErroSalvar(null)
        }}
      />
    </Card>
  )
}
