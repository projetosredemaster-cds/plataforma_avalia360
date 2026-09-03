import { useState } from 'react'
import { Alert, Button, CircularProgress, Typography } from '@mui/material'
import { PerguntaLikertResposta, type RespostaLikert } from '../../components/perguntas/PerguntaLikert/PerguntaLikertResposta'
import { PerguntaMatrizResposta, type RespostaMatriz } from '../../components/perguntas/PerguntaMatriz/PerguntaMatrizResposta'
import { PerguntaPessoaResposta, type RespostaPessoa } from '../../components/perguntas/PerguntaPessoa/PerguntaPessoaResposta'
import {
  PerguntaTextoAbertoResposta,
  type RespostaTextoAberto,
} from '../../components/perguntas/PerguntaTextoAberto/PerguntaTextoAbertoResposta'
import {
  likertRespostaValida,
  matrizRespostaValida,
  pessoaRespostaValida,
  textoAbertoRespostaValida,
} from '../../components/perguntas/validacaoPergunta'
import type {
  FormularioPublicoResposta,
  ItemRespostaPayload,
  ValorRespostaPublica,
} from '../../types/respostaPublica'

interface FormularioRespostaPublicaProps {
  formulario: FormularioPublicoResposta
  enviando: boolean
  erroEnvio: string | null
  onEnviar: (itens: ItemRespostaPayload[]) => void
}

/**
 * Orquestra a navegação por página e a coleta de respostas usando os 4
 * componentes `*Resposta` já existentes — nunca chama a API diretamente
 * (quem persiste é `ResponderPesquisaPage`, via `onEnviar`). Navegação entre
 * páginas é livre (sem bloqueio por obrigatoriedade); só o envio final valida
 * todas as perguntas obrigatórias de todas as páginas de uma vez.
 */
export function FormularioRespostaPublica({
  formulario,
  enviando,
  erroEnvio,
  onEnviar,
}: FormularioRespostaPublicaProps) {
  const [paginaAtual, setPaginaAtual] = useState(0)
  const [respostas, setRespostas] = useState<Record<string, ValorRespostaPublica>>({})
  const [perguntasComErro, setPerguntasComErro] = useState<Set<string>>(new Set())
  const [avisoPendencia, setAvisoPendencia] = useState(false)

  const pagina = formulario.paginas[paginaAtual]
  const totalPaginas = formulario.paginas.length
  const ultimaPagina = paginaAtual === totalPaginas - 1

  function setResposta(perguntaId: string, valor: ValorRespostaPublica) {
    setRespostas((atual) => ({ ...atual, [perguntaId]: valor }))
    setPerguntasComErro((atual) => {
      if (!atual.has(perguntaId)) return atual
      const proximo = new Set(atual)
      proximo.delete(perguntaId)
      return proximo
    })
  }

  function calcularPendencias(): Set<string> {
    const pendentes = new Set<string>()
    for (const p of formulario.paginas) {
      for (const pergunta of p.perguntas) {
        const valor = respostas[pergunta.id] ?? null
        let valida: boolean
        switch (pergunta.tipo) {
          case 'likert':
            valida = likertRespostaValida(pergunta.obrigatoria, valor as RespostaLikert | null)
            break
          case 'texto_aberto':
            valida = textoAbertoRespostaValida(pergunta.obrigatoria, valor as RespostaTextoAberto | null)
            break
          case 'matriz':
            valida = matrizRespostaValida(
              pergunta.obrigatoria,
              pergunta.competencias,
              valor as RespostaMatriz | null,
            )
            break
          case 'pessoa':
            valida = pessoaRespostaValida(pergunta.obrigatoria, valor as RespostaPessoa | null)
            break
          default:
            valida = true
        }
        if (!valida) pendentes.add(pergunta.id)
      }
    }
    return pendentes
  }

  function handleEnviarClick() {
    const pendentes = calcularPendencias()
    if (pendentes.size > 0) {
      setPerguntasComErro(pendentes)
      setAvisoPendencia(true)
      const indicePendencia = formulario.paginas.findIndex((p) =>
        p.perguntas.some((pergunta) => pendentes.has(pergunta.id)),
      )
      if (indicePendencia >= 0) setPaginaAtual(indicePendencia)
      return
    }

    setAvisoPendencia(false)
    const itens: ItemRespostaPayload[] = []
    for (const p of formulario.paginas) {
      for (const pergunta of p.perguntas) {
        const valor = respostas[pergunta.id]
        if (valor !== undefined) {
          itens.push({ perguntaId: pergunta.id, valor })
        }
      }
    }
    onEnviar(itens)
  }

  return (
    <div className="flex min-h-svh justify-center px-4 py-10">
      <div className="flex w-full max-w-[640px] flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          {formulario.pesquisa.logoUrl && (
            <img src={formulario.pesquisa.logoUrl} alt="" className="mb-2 max-h-[80px] object-contain" />
          )}
          <Typography variant="h5" component="h1">
            {formulario.pesquisa.titulo}
          </Typography>
          {formulario.pesquisa.mensagemBoasVindas && (
            <Typography variant="body2" color="text.secondary">
              {formulario.pesquisa.mensagemBoasVindas}
            </Typography>
          )}
        </div>

        {erroEnvio && <Alert severity="error">{erroEnvio}</Alert>}
        {avisoPendencia && (
          <Alert severity="warning">Responda as perguntas destacadas antes de enviar.</Alert>
        )}

        <Typography variant="caption" color="text.secondary">
          Página {paginaAtual + 1} de {totalPaginas}
        </Typography>

        <fieldset disabled={enviando} className="flex flex-col gap-6 border-0 p-0 m-0">
          {pagina && (
            <div className="flex flex-col gap-6">
              {pagina.titulo && (
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {pagina.titulo}
                </Typography>
              )}

              {pagina.perguntas.map((pergunta) => {
                const erro = perguntasComErro.has(pergunta.id)
                switch (pergunta.tipo) {
                  case 'likert':
                    return (
                      <PerguntaLikertResposta
                        key={pergunta.id}
                        enunciado={pergunta.enunciado}
                        obrigatoria={pergunta.obrigatoria}
                        configuracao={pergunta.configuracao}
                        valor={(respostas[pergunta.id] as RespostaLikert) ?? null}
                        onChange={(valor) => setResposta(pergunta.id, valor)}
                        erro={erro}
                      />
                    )
                  case 'texto_aberto':
                    return (
                      <PerguntaTextoAbertoResposta
                        key={pergunta.id}
                        enunciado={pergunta.enunciado}
                        obrigatoria={pergunta.obrigatoria}
                        valor={(respostas[pergunta.id] as RespostaTextoAberto) ?? null}
                        onChange={(valor) => setResposta(pergunta.id, valor)}
                        erro={erro}
                      />
                    )
                  case 'matriz':
                    return (
                      <PerguntaMatrizResposta
                        key={pergunta.id}
                        enunciado={pergunta.enunciado}
                        obrigatoria={pergunta.obrigatoria}
                        configuracao={pergunta.configuracao}
                        competencias={pergunta.competencias}
                        valor={(respostas[pergunta.id] as RespostaMatriz) ?? null}
                        onChange={(valor) => setResposta(pergunta.id, valor)}
                        erro={erro}
                      />
                    )
                  case 'pessoa':
                    return (
                      <PerguntaPessoaResposta
                        key={pergunta.id}
                        enunciado={pergunta.enunciado}
                        obrigatoria={pergunta.obrigatoria}
                        opcoes={pergunta.opcoesPessoa}
                        valor={(respostas[pergunta.id] as RespostaPessoa) ?? null}
                        onChange={(valor) => setResposta(pergunta.id, valor)}
                        erro={erro}
                      />
                    )
                  default:
                    return null
                }
              })}
            </div>
          )}

          <div className="flex justify-between gap-3">
            <Button
              variant="outlined"
              color="primary"
              disabled={paginaAtual === 0}
              onClick={() => setPaginaAtual((atual) => Math.max(0, atual - 1))}
            >
              Anterior
            </Button>

            {ultimaPagina ? (
              <Button
                variant="contained"
                color="primary"
                onClick={handleEnviarClick}
                startIcon={enviando ? <CircularProgress size={18} color="inherit" /> : undefined}
              >
                {enviando ? 'Enviando...' : 'Enviar'}
              </Button>
            ) : (
              <Button
                variant="contained"
                color="primary"
                onClick={() => setPaginaAtual((atual) => Math.min(totalPaginas - 1, atual + 1))}
              >
                Próxima
              </Button>
            )}
          </div>
        </fieldset>
      </div>
    </div>
  )
}
