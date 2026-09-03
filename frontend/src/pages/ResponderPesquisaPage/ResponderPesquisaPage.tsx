import { useCallback, useEffect, useState } from 'react'
import { CircularProgress } from '@mui/material'
import { useParams } from 'react-router-dom'
import { TelaEstadoPublico } from '../../components/publico/TelaEstadoPublico/TelaEstadoPublico'
import { ApiError } from '../../lib/apiClient'
import {
  buscarFormularioPublico,
  consultarStatusEnvio,
  enviarRespostasPublico,
} from '../../services/respostaPublicaService'
import type { TipoPesquisa } from '../../types/pesquisa'
import type {
  CodigoErroColetaPublica,
  FormularioPublicoResposta,
  ItemRespostaPayload,
} from '../../types/respostaPublica'
import { ConfirmarCpfForm } from './ConfirmarCpfForm'
import { FormularioRespostaPublica } from './FormularioRespostaPublica'
import { MENSAGENS_ERRO_PUBLICO } from './mensagensErroPublico'

// Únicos códigos que tornam a sessão irrecuperável no envio final — todo o
// resto (422 já tratado à parte, erro de rede, código desconhecido) é
// recuperável: mantém o formulário preenchido e permite tentar reenviar,
// mesmo tratamento tolerante já dado a falhas de rede em ConfirmarCpfForm.tsx.
const CODIGOS_TERMINAIS_ENVIO: CodigoErroColetaPublica[] = [
  'SESSAO_INVALIDA',
  'SESSAO_EXPIRADA',
  'SESSAO_JA_UTILIZADA',
  'JA_RESPONDIDO',
]

function ehCodigoTerminalEnvio(codigo: string | undefined): codigo is CodigoErroColetaPublica {
  return CODIGOS_TERMINAIS_ENVIO.includes(codigo as CodigoErroColetaPublica)
}

type FaseResposta =
  | { tipo: 'carregando_status' }
  | { tipo: 'erro_terminal'; codigo: CodigoErroColetaPublica | 'ERRO_DESCONHECIDO' }
  | { tipo: 'confirmando_cpf' }
  | { tipo: 'carregando_formulario'; sessaoToken: string; tipoPesquisa: TipoPesquisa }
  | { tipo: 'respondendo'; sessaoToken: string; tipoPesquisa: TipoPesquisa; formulario: FormularioPublicoResposta }
  | { tipo: 'enviando'; sessaoToken: string; formulario: FormularioPublicoResposta }
  | { tipo: 'sucesso' }

/**
 * Rota pública `/responder/:token` — fora de qualquer `RotaProtegida`, sem
 * `useAuth()`. Não checa papel/colaborador, funciona identicamente com ou
 * sem sessão Supabase ativa no navegador. Só ENVIA respostas — nunca lê
 * respostas de terceiros nem calcula agregação/anonimização (isso vem
 * pronto da API).
 */
export function ResponderPesquisaPage() {
  const { token } = useParams<{ token: string }>()
  const [fase, setFase] = useState<FaseResposta>({ tipo: 'carregando_status' })
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)

  const carregarStatus = useCallback(async () => {
    if (!token) {
      setFase({ tipo: 'erro_terminal', codigo: 'LINK_INVALIDO' })
      return
    }
    setFase({ tipo: 'carregando_status' })
    try {
      await consultarStatusEnvio(token)
      setFase({ tipo: 'confirmando_cpf' })
    } catch (erro) {
      if (erro instanceof ApiError && erro.codigo && erro.codigo in MENSAGENS_ERRO_PUBLICO) {
        setFase({ tipo: 'erro_terminal', codigo: erro.codigo as CodigoErroColetaPublica })
      } else {
        setFase({ tipo: 'erro_terminal', codigo: 'ERRO_DESCONHECIDO' })
      }
    }
  }, [token])

  useEffect(() => {
    // Carga inicial via API — não é dado derivável durante a renderização.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregarStatus()
  }, [carregarStatus])

  async function handleConfirmado({
    sessaoToken,
    tipoPesquisa,
  }: {
    sessaoToken: string
    tipoPesquisa: TipoPesquisa
  }) {
    setFase({ tipo: 'carregando_formulario', sessaoToken, tipoPesquisa })
    try {
      const formulario = await buscarFormularioPublico(sessaoToken)
      setFase({ tipo: 'respondendo', sessaoToken, tipoPesquisa, formulario })
    } catch (erro) {
      if (erro instanceof ApiError && erro.codigo && erro.codigo in MENSAGENS_ERRO_PUBLICO) {
        setFase({ tipo: 'erro_terminal', codigo: erro.codigo as CodigoErroColetaPublica })
      } else {
        setFase({ tipo: 'erro_terminal', codigo: 'ERRO_DESCONHECIDO' })
      }
    }
  }

  function handleErroTerminal(codigo: CodigoErroColetaPublica) {
    setFase({ tipo: 'erro_terminal', codigo })
  }

  async function handleEnviar(itens: ItemRespostaPayload[]) {
    if (fase.tipo !== 'respondendo') return
    const { sessaoToken, formulario } = fase
    setErroEnvio(null)
    setFase({ tipo: 'enviando', sessaoToken, formulario })
    try {
      await enviarRespostasPublico(sessaoToken, { itens })
      setFase({ tipo: 'sucesso' })
    } catch (erro) {
      if (erro instanceof ApiError && erro.status === 422) {
        // Race condition ou payload divergente que a validação de UX não
        // pegou — recuperável, mantém as respostas já digitadas em memória.
        setErroEnvio(erro.message)
        setFase({ tipo: 'respondendo', sessaoToken, tipoPesquisa: fase.tipoPesquisa, formulario })
        return
      }
      if (erro instanceof ApiError && ehCodigoTerminalEnvio(erro.codigo)) {
        // Sessão morreu entre o carregamento do formulário e o envio
        // (404/410/409 de sessão, ou "já respondido") — perda de progresso
        // aceita pela spec só para esses casos.
        setFase({ tipo: 'erro_terminal', codigo: erro.codigo })
        return
      }
      // Erro de rede genuíno ou código não reconhecido — recuperável, não
      // descarta o formulário já preenchido. Mesmo tratamento tolerante dado
      // a falhas de rede em ConfirmarCpfForm.tsx.
      setErroEnvio('Não foi possível enviar suas respostas. Verifique sua conexão e tente novamente.')
      setFase({ tipo: 'respondendo', sessaoToken, tipoPesquisa: fase.tipoPesquisa, formulario })
    }
  }

  if (fase.tipo === 'carregando_status' || fase.tipo === 'carregando_formulario') {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <CircularProgress color="primary" />
      </div>
    )
  }

  if (fase.tipo === 'erro_terminal') {
    const info = MENSAGENS_ERRO_PUBLICO[fase.codigo]
    return (
      <TelaEstadoPublico
        severidade={info.severidade}
        titulo={info.titulo}
        mensagem={info.mensagem}
        acaoSecundaria={
          fase.codigo === 'ERRO_DESCONHECIDO' ? { rotulo: 'Tentar novamente', onClick: carregarStatus } : undefined
        }
      />
    )
  }

  if (fase.tipo === 'confirmando_cpf') {
    return (
      <ConfirmarCpfForm
        token={token ?? ''}
        onConfirmado={handleConfirmado}
        onErroTerminal={handleErroTerminal}
      />
    )
  }

  if (fase.tipo === 'sucesso') {
    return (
      <TelaEstadoPublico
        severidade="sucesso"
        titulo="Resposta enviada"
        mensagem="Obrigado por participar. Sua resposta foi registrada."
      />
    )
  }

  // fase.tipo === 'respondendo' | 'enviando'
  return (
    <FormularioRespostaPublica
      formulario={fase.formulario}
      enviando={fase.tipo === 'enviando'}
      erroEnvio={erroEnvio}
      onEnviar={handleEnviar}
    />
  )
}
