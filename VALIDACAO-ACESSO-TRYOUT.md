# HRISTE BOZE — acessos e resultados de tryout

Atualização de 23/10/2026, na cópia HRISTE-BOZE-DEEPWOKEN-2026-10-15.

## Resultado e encerramento

- **/criar** inclui o canal público **avisos-de-tryout**, na categoria de entrada, com o ID salvo automaticamente. A estrutura passa a ter 14 categorias, 46 canais de texto, 11 canais de voz e 14 cargos.
- Ao registrar a porcentagem, o bot decide pelo mínimo de 50%, publica o resultado e exclui o canal privado. O histórico permanece no banco.
- O aprovado recebe parabéns na DM, seu convite pessoal, o prazo obrigatório de 48 horas e o painel dos membros. O reprovado recebe agradecimento, apoio e a orientação para tentar novamente mais tarde.
- DM, anúncio e exclusão são tarefas independentes. Falhas ficam registradas para nova tentativa. O bot só exclui um canal cujo servidor, tipo e marcador correspondam ao tryout.
- Se a DM estiver bloqueada, o aprovado pode usar novamente **Iniciar tryout** e escolher o jogo para recuperar o convite por uma resposta só para ele. Isso não recria o canal encerrado. O link nunca é publicado no canal público.

## Telas de acesso

Login da equipe, login dos membros e cadastro dos membros recebem uma identidade compartilhada em preto e dourado, com um brasão 3D criado em WebGL e recursos locais. O cenário possui alternativa estática quando WebGL não está disponível e respeita a preferência por movimento reduzido. As regras de autenticação, confirmação do Discord e emissão da carteira permanecem ativas.

O arquivo **../TESTE-HRISTE-BOZE.html** reúne a demonstração offline. Somente essa demonstração aceita qualquer login. A prévia das telas reais pode ser iniciada com `node scripts/preview-access.mjs`; ela usa dados fictícios, não acessa o banco nem o Discord e não cria contas.

## Ativação no servidor

Reinicie o bot com o código desta cópia e execute **/criar** para criar o canal de avisos. O bot precisa de Gerenciar canais para encerrar os tryouts. O cadastro continua obrigatório após a aprovação, mesmo com o canal privado excluído.

Nenhuma alteração foi executada no Discord real durante esta implementação.

## Validação local

- A suíte completa do projeto passou com **316 testes, 0 falhas e 0 ignorados**, em 23/10/2026. Registro em `teste-acessos-tryout-final.log`. O comando `npm test` limita a descoberta a `test/*.test.js`, sem executar testes de outros repositórios aninhados na cópia.
- Os 40 testes de tryout e provisionamento passaram, incluindo DM bloqueada, falha da publicação pública, retomada após reinício, exclusão repetida/404, recusa de excluir canais de outro tryout e cadastro após o fechamento do canal.
- Os 19 testes das entradas, cenário e demonstração passaram: login real com sucesso e erro, integridade dos formulários, três opções de acesso, cadastro fictício completo, fallback sem WebGL, movimento reduzido, perda/restauração do contexto, resultados públicos sem convite e carteiras HBCode.
- Sintaxe validada em 13 arquivos JavaScript; os 165 arquivos da pasta original foram comparados ao manifesto SHA-256 e permanecem intactos.
- Limitação: o controle local do navegador ficou desativado nas configurações do Work durante a revisão. A verificação visual final em desktop/celular não foi concluída. Os testes de interface usam simulação de DOM, não equivalem a screenshots do navegador.
