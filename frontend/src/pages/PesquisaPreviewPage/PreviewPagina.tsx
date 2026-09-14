import { Alert, Typography } from '@mui/material'
import { PerguntaLikertResposta } from '../../components/perguntas/PerguntaLikert/PerguntaLikertResposta'
import { PerguntaMatrizResposta } from '../../components/perguntas/PerguntaMatriz/PerguntaMatrizResposta'
import { PerguntaPessoaResposta } from '../../components/perguntas/PerguntaPessoa/PerguntaPessoaResposta'
import { PerguntaTextoAbertoResposta } from '../../components/perguntas/PerguntaTextoAberto/PerguntaTextoAbertoResposta'
import { PerguntaCaixaSelecaoResposta } from '../../components/perguntas/PerguntaCaixaSelecao/PerguntaCaixaSelecaoResposta'
import type { Pagina } from '../../types/pesquisa'
import { COLABORADORES_FICTICIOS } from './colaboradoresFicticios'

interface PreviewPaginaProps {
  pagina: Pagina
}

/**
 * Renderiza uma página da pesquisa em modo leitura, reaproveitando os 5
 * componentes `*Resposta` de produção sem alterá-los — sem estado de
 * resposta nenhum (`valor` sempre `null`, `onChange` sempre no-op). Quem
 * bloqueia a interação de fato é o `<fieldset disabled>` da página pai
 * (`PesquisaPreviewPage`), que envolve a árvore inteira de páginas.
 */
export function PreviewPagina({ pagina }: PreviewPaginaProps) {
  return (
    <div className="flex flex-col gap-6">
      {pagina.titulo && (
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {pagina.titulo}
        </Typography>
      )}

      {pagina.perguntas.map((pergunta) => {
        switch (pergunta.tipo) {
          case 'likert':
            return (
              <PerguntaLikertResposta
                key={pergunta.id}
                enunciado={pergunta.enunciado}
                obrigatoria={pergunta.obrigatoria}
                configuracao={pergunta.configuracao}
                valor={null}
                onChange={() => {}}
              />
            )
          case 'texto_aberto':
            return (
              <PerguntaTextoAbertoResposta
                key={pergunta.id}
                enunciado={pergunta.enunciado}
                obrigatoria={pergunta.obrigatoria}
                valor={null}
                onChange={() => {}}
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
                valor={null}
                onChange={() => {}}
              />
            )
          case 'pessoa':
            return (
              <div key={pergunta.id} className="flex flex-col gap-2">
                <PerguntaPessoaResposta
                  enunciado={pergunta.enunciado}
                  obrigatoria={pergunta.obrigatoria}
                  opcoes={COLABORADORES_FICTICIOS}
                  valor={null}
                  onChange={() => {}}
                />
                <Alert severity="info" sx={{ mt: -1 }}>
                  Dados de exemplo — participantes reais aparecerão quando o ciclo for criado.
                </Alert>
              </div>
            )
          case 'caixa_selecao':
            return (
              <PerguntaCaixaSelecaoResposta
                key={pergunta.id}
                enunciado={pergunta.enunciado}
                obrigatoria={pergunta.obrigatoria}
                configuracao={pergunta.configuracao}
                valor={null}
                onChange={() => {}}
              />
            )
          default:
            return null
        }
      })}
    </div>
  )
}
