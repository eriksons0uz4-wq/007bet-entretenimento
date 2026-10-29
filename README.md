# 007BET — plataforma de entretenimento

Projeto inicial com aparência de portal de jogos e funcionalidades administrativas. **É uma plataforma de demonstração com pontos virtuais sem valor monetário.** Não inclui depósitos, apostas em dinheiro, PIX, saques, conversão de pontos ou prêmios financeiros.

## O que já vem funcionando
- Cadastro e login com senha armazenada em hash (bcrypt).
- Sessão de usuário no servidor.
- Banco de dados SQLite persistente.
- Saldo de pontos fictícios e partidas demonstrativas.
- Histórico individual de partidas.
- Formulário de suporte.
- Painel administrativo com contagem de usuários/partidas/chamados.
- Lista de usuários e opção de bloquear/reativar contas.
- Editor de nome, textos, promoções, aviso e cor do site.

## Requisitos
- Node.js 20 ou superior.
- npm.

## Como instalar e iniciar
1. Extraia o ZIP em uma pasta no computador.
2. Abra o terminal dentro da pasta do projeto.
3. Execute `npm install`.
4. Copie `.env.example` para `.env`.
5. Edite `.env`: escolha uma `SESSION_SECRET` longa e defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` fortes.
6. Execute `npm start`.
7. Abra `http://localhost:3000` no navegador.

O primeiro administrador é criado automaticamente na primeira inicialização, caso `ADMIN_EMAIL` e `ADMIN_PASSWORD` estejam definidos. Guarde essas credenciais e não compartilhe o arquivo `.env`.

## Para publicar na internet
Use uma hospedagem que execute Node.js. Configure as variáveis do `.env` no painel da hospedagem, defina `NODE_ENV=production`, habilite HTTPS e use um armazenamento persistente para a pasta `data/`. Faça backup regular do banco `data/platform.sqlite`. Para uso público, configure também política de privacidade, termos, canal de suporte, monitoramento e revisão de segurança.

## Observações importantes
- Os pontos são apenas elementos de jogo, não representam dinheiro e não podem ser comprados, vendidos, transferidos ou resgatados.
- O projeto é uma base inicial, não uma auditoria de segurança nem uma solução pronta para operação comercial.
- O armazenamento de sessão padrão do Express é adequado apenas para desenvolvimento. Antes de produção, configure um session store persistente e políticas de segurança adicionais.
- O banco SQLite é local ao servidor; em hospedagem com múltiplas instâncias, migre para banco gerenciado e sessões compartilhadas.
- Personalização visual pelo painel é salva no banco de dados do servidor.
