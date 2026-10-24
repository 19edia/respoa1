# Validação da entrega HRISTE BOZE

Atualização local multijogos em 22/10/2026, dentro da pasta copiada HRISTE-BOZE-DEEPWOKEN-2026-10-15. Jogos: Westbound, Deepwoken e Klase.

## Preservação e conteúdo

- Comparação SHA-256 dos 165 arquivos da pasta original: **0 arquivos alterados**. O inventário está em `../original-sha256.json`.
- Estrutura gerenciada: 14 categorias, 45 canais de texto, 11 canais de voz e 14 cargos. Cada jogo possui área de conversa, grupos, guias e voz.
- Site, portal, embeds e carteiras com identidade HRISTE BOZE em amarelo e preto.
- HTML portátil: `../TESTE-HRISTE-BOZE.html`, com CSS e JavaScript incorporados, sem instalação ou dependências externas para abrir.
- Conferência sintática dos 64 arquivos JavaScript de src, public e scripts aprovada; HTML portátil atualizado com a escolha dos três jogos e simulação dos comandos.

## Cobertura automatizada

Os testes usam PostgreSQL embarcado via PGlite, requisições HTTP reais ao Express e Discord simulado. Nenhuma mensagem foi enviada ao servidor real.

- Aprovação em 50%, reprovação em 0% e 49,99%, aceitação de 100% e rejeição de valores inválidos.
- O painel oferece três jogos antes de criar o canal. A escolha fica salva e aparece no canal, avaliação, resultado e cadastro; opções inválidas não criam uma tentativa. Migração identifica tentativas anteriores como Deepwoken.
- Abrir as opções não bloqueia a seleção imediata do jogo. Cliques repetidos na seleção continuam limitados; uma tentativa ativa não muda de jogo por um novo clique.
- Acesso exclusivo do avaliador confirmado, token do link, origem e CSRF; reenvio idempotente do mesmo resultado.
- Canal privado com permissões explícitas, nomes obtidos do Discord e link automático do avaliador.
- Convite obrigatório vinculado ao participante; outro Discord não pode usá-lo. Login por carteira ou cadastro legado não pula essa etapa.
- Cadastro concluído confirma acesso; 48 horas sem cadastro revogam acesso e sessões, com aviso por DM independente da remoção de cargos.
- Recuperação após reinício, retorno ao servidor e exclusão do canal privado.
- Reconciliação de canais/cargos e persistência dos novos IDs pelo `/criar`.
- `/configurar cargos` recupera IDs e enfileira a sincronização do HB-ID verificado e da patente. A verificação da admissão ocorre novamente ao executar a fila; reprovação, revogação e cadastro vencido não concedem acesso. Promoções e rebaixamentos removem cargos obsoletos e preservam cargos não gerenciados.
- `/configurar permissoes` atualiza somente canais e categorias gerenciados. Canais privados individuais de tryout e atendimento são preservados. Quando um cargo de acesso é recriado, seus novos IDs também são aplicados nas permissões; falhas parciais podem ser retomadas.
- Comandos recusam usuários sem autorização, outra guilda, cargos perigosos ou cargos acima do bot.
- Carteiras reais: renderização e leitura do código de barras em PNG, JPEG, WebP, recorte, redimensionamento e rotação; recusa de assinatura, titular ou revisão inválidos.
- Proteção dos painéis e sessões; manutenção dos identificadores e senhas existentes na migração.

Foram executados **255 testes** na suíte completa, com **255 aprovados, 0 falhas e 0 ignorados**. Registro: `teste-multijogos-final.log`. Comando reproduzível: `node --test --test-concurrency=1`.

Também passaram os conjuntos focados: **20/20 testes de tryout** e **19/19 testes de provisionamento/SBI**. Esses testes estão incluídos nos 255 da suíte completa. A execução geral é sequencial para reduzir a pressão dos módulos WebAssembly no ambiente Windows.

Depois dessa execução foram adicionados e executados **8 testes da demonstração, todos aprovados**, em `test/demo.test.js`. Comando: `node --test test/demo.test.js`. Eles simulam eventos do DOM em Node e verificam login livre, três jogos, cadastro, frente/verso e download SVG, reprovação, expiração de 48 horas, cargos por HB-ID e patente, migração dos dados antigos e correspondência do HTML portátil com o JavaScript/CSS atuais. Não são testes visuais. Ao executar novamente a suíte completa, esses oito testes também serão incluídos: 263 testes no conjunto atual.

## Conferência visual e demonstração

Na entrega anterior foram conferidos no navegador: login livre da demonstração, aprovação no limite de 50%, cadastro obrigatório, criação da carteira, frente e verso e download SVG. As capturas do acesso administrativo em `../EXEMPLOS/` são dessa versão anterior; as cinco carteiras ilustrativas foram regeneradas com a identidade multijogos.

Nesta atualização o controle do navegador recusou a abertura do HTML local pelo protocolo `file:`. Não foi concluída uma nova inspeção visual, inclusive do layout móvel. Os testes automáticos não substituem essa conferência visual; os fluxos reais de seleção de jogo, permissão, cadastro e expiração foram verificados com banco de teste e Discord simulado.

## Ativação e limites

- O bot não foi conectado a Discord/PostgreSQL de produção. Preencha `.env`, inicie a aplicação e execute `/criar` conforme o README para criar as novas áreas. Em seguida, `/configurar cargos` sincroniza os membros; `/configurar permissoes` reaplica as permissões quando necessário.
- Qualquer login funciona apenas no HTML demonstrativo. O painel real continua protegido.
- O avaliador informa o dano; a aplicação compara a porcentagem com o mínimo. Não há captura da vida dentro dos jogos.
- O processo deve permanecer ligado para cumprir o prazo no Discord. Após parada, os vencimentos são processados quando o bot retorna.
- DMs bloqueadas pelo usuário não podem ser entregues; a falha fica registrada e o cadastro também é disponibilizado no canal privado.
- Dono e administradores do Discord conservam suas permissões próprias. Os cargos gerenciados de acesso não recebem Administrator.

As carteiras da pasta EXEMPLOS e as do HTML de teste são ilustrativas, sem validade no bot de produção.
