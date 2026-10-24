# Suporte IA — HRISTE BOZE

Integração preparada para a API da nuvem do Ollama, com o modelo **gpt-oss:20b**. O bot e o painel continuam no Render; o modelo é executado no Ollama Cloud.

## Configuração no Render

Em **Environment**, configure:

```dotenv
SUPPORT_AI_ENABLED=true
SUPPORT_ATTENDANT_DISCORD_ID=1480009495915659494
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_API_KEY=SUA_CHAVE_DO_OLLAMA
OLLAMA_MODEL=gpt-oss:20b
OLLAMA_TIMEOUT_MS=60000
```

Crie a chave na [conta Ollama](https://ollama.com/settings/keys). Cole-a somente na variável `OLLAMA_API_KEY` do Render. O navegador não recebe essa chave. A integração usa `Authorization: Bearer` no servidor, conforme a [documentação do Ollama](https://docs.ollama.com/api/authentication).

No **Discord Developer Portal → aplicação do bot → Bot → Privileged Gateway Intents**, habilite **Message Content Intent**. Mantenha **Server Members Intent**, já utilizado pelo projeto. O bot precisa ler e enviar mensagens e gerenciar os canais privados de atendimento. O atendente configurado deve estar no servidor.

Publique esta cópia do projeto e reinicie o serviço no Render. A inicialização cria as tabelas de suporte no PostgreSQL automaticamente. Se o servidor ainda não estiver configurado, execute `/criar` para registrar os canais e a categoria de tickets. O painel de atendimento será atualizado no início do bot.

Para verificar apenas a conexão, execute no ambiente configurado:

```sh
npm run suporte:verificar
```

Esse diagnóstico envia uma pergunta fictícia ao modelo. Ele não envia dados de membros, não cria tickets e não imprime a chave nem a resposta recebida.

## Como usar

O membro entra em **Meus atendimentos** no painel e escreve para o **Assistente HB**. Nos tickets tradicionais, ele pode escrever no canal ou usar **Perguntar à IA**. A carteira e o acesso verificado continuam obrigatórios para os tickets normais; no site, a sessão autenticada identifica o membro.

O assistente usa o nome atual do cadastro e o histórico privado daquele membro. O histórico é salvo no PostgreSQL e continua disponível após reiniciar o bot. Não se trata de treinar o modelo: o servidor envia o contexto relevante em cada pergunta. Conversas de outros membros não são incluídas.

O modelo recebe as últimas 24 mensagens da identidade; o painel apresenta as últimas 100. O histórico completo permanece no banco. A memória não implica que o modelo consulte todo o histórico a cada resposta. Há limite de 2.000 caracteres por mensagem e de 12 consultas à IA por minuto por identidade, compartilhado entre site e Discord. O pedido de atendente continua disponível ao atingir esse limite.

Quando o membro solicita um atendente, a IA informa que não sabe resolver, a pergunta exige ação da liderança ou a API falha, o sistema encaminha o atendimento. No site, cria ou reutiliza o ticket privado; no Discord, utiliza o ticket já aberto. O atendente recebe o contexto e o motivo do encaminhamento. A interface distingue a abertura na fila de um canal já disponível.

Depois do encaminhamento, o membro pode continuar escrevendo no site. As mensagens são encaminhadas ao ticket, e as respostas do atendente no Discord aparecem no painel. A IA fica pausada durante o atendimento humano. Ao encerrar o ticket, um novo contato pode voltar à IA, conservando o histórico.

Os canais novos de suporte concedem acesso ao membro, ao atendente configurado e ao bot. Administradores do servidor mantêm o acesso inerente à permissão Administrador do Discord.

## Conhecimento e limites

O conteúdo oficial usado pelo assistente fica em `src/support-knowledge.js`: jogos da guilda, regra de 50% no tryout, prazo de cadastro de 48 horas, carteira e funcionamento do atendimento. As regras configuráveis são obtidas do servidor.

A IA não recebe permissão para alterar cargos, patentes, senhas ou resultados. Pedidos que exigem essas ações vão para atendimento humano. Não são enviados tokens, senhas nem segredos internos do cadastro ao modelo. O conteúdo digitado no suporte é enviado à API do Ollama para gerar a resposta.

A API da nuvem não exige instalação do modelo no Render. O nome `gpt-oss:20b` consta no [catálogo da API](https://ollama.com/api/tags). A integração lê somente `message.content`; o campo interno de raciocínio não é exibido nem armazenado. A resposta é validada pelo servidor, sem depender do parâmetro de saída estruturada, que a [documentação da nuvem](https://docs.ollama.com/capabilities/structured-outputs) informa não suportar.

## Demonstração e validação

O arquivo `../TESTE-HRISTE-BOZE.html` contém uma simulação offline identificada como tal, para experimentar o chat e o encaminhamento. Ela não utiliza a sua chave, não chama o modelo e não envia mensagens ao Discord.

A configuração real da chave e os testes com a sua conta no Ollama e no Discord ficam para a ativação no Render. Os testes locais usam respostas simuladas da API e do Discord.

Validação local em 24/10/2026: os 37 testes de integração final do núcleo, Discord e rotas passaram, incluindo o fluxo completo de um pedido novo do site até a criação do canal e a resposta do atendente de volta no painel. Os testes da interface e da demonstração verificam memória separada, recuperação de envio, encaminhamento durante uma resposta pendente e limpeza no logout. A conferência visual em navegador não foi concluída: o controle local estava desativado no Work. O HTML pode ser aberto manualmente para essa revisão.

A suíte completa terminou com **366 testes aprovados, 0 falhas e 0 ignorados**. Registro: `teste-suporte-suite-completa.log`. Também foi validada a sintaxe dos 15 arquivos JavaScript envolvidos. Os 165 arquivos da pasta original foram conferidos pelo manifesto SHA-256 e permanecem intactos.
