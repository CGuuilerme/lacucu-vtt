# Lacucu VTT

Projeto para amigos de RPG: uma mesa virtual dark fantasy para jogar juntos online.

## O que já funciona (v0.6)

- Criar uma campanha com código de cinco caracteres e entrar como Mestre ou jogador.
- Lobby com um Mestre e até três jogadores.
- Mesa compartilhada com chat, rolagens de d4, d6, d8, d10, d12, d20 e d100 e PV de 0 a 10.
- Cada jogador pode reduzir os próprios PV. Só o Mestre pode usar os controles para restaurar PV ou alterar os PV de outro personagem; um item de cura criado pelo Mestre pode recuperar os próprios PV do jogador. O servidor valida essas regras.
- Inventário 6×6 de cada jogador, inicialmente vazio. O Mestre cria itens, escolhe o destinatário, nome, descrição, aparência, tamanho, efeito e quantidade de usos. O servidor encontra uma posição livre, valida permissões e impede sobreposição.
- Jogadores podem organizar e usar os próprios itens. Efeitos disponíveis: ação narrativa no histórico, rolagem de dado ou cura dos próprios PV. Itens com usos limitados são removidos quando acabam. O Mestre pode organizar ou retirar itens, mas não tem inventário próprio.
- Foto opcional ao criar ou entrar na sala; aparece no lobby e na mesa.
- Mesa em tela cheia com mapa como espaço principal, inspirada na organização de um VTT e com identidade dark fantasy própria. Personagens, inventário, chat, dados e ferramentas do Mestre abrem em painéis sob demanda. Em celulares, os botões ficam na barra inferior. Cada pessoa pode ampliar, centralizar ou arrastar a vista e ligar uma grade visual. O Mestre carrega o PNG (até 5 MB), adiciona até 20 tokens, move e remove; todos acompanham as mudanças.
- Interface responsiva para computador e celular.

## Rodar no computador

Requer Node.js 24.

```bash
npm ci
npm run dev
```

Abra o endereço exibido pelo Vite. Para testar com outras abas ou pessoas na mesma rede, elas precisam usar o endereço do mesmo servidor.

## Rodar como serviço web

```bash
npm ci
npm run build
npm start
```

O servidor entrega o site e a API na porta indicada por `PORT` (padrão: 4173). O arquivo [render.yaml](render.yaml) prepara o deploy como serviço web no Render. GitHub Pages publica apenas arquivos estáticos e não executa a API das salas.

As salas, imagens, tokens e o histórico ficam na memória do servidor nesta versão. Reiniciar o processo apaga as campanhas. A próxima etapa de infraestrutura é adicionar persistência antes de depender deste serviço para campanhas longas.

## Caminho até a versão 1.3

- **0.7–0.9:** ficha e aba próprias de cada personagem, atributos, perícias, testes, pontos, nível e distribuição de pontos; reduzir regras fixas para a mesa se adaptar a diferentes sistemas.
- **1.0–1.1:** persistência de campanhas e imagens, múltiplas cenas/mapas, ferramentas de Mestre e permissões mais detalhadas para tokens.
- **1.2–1.3:** revisão de experiência, acessibilidade, testes com grupos, refinamento visual e preparação para uso contínuo. A assistência opcional por IA para criar itens fica como extensão posterior, sem impedir a conclusão da mesa.

O foco é uma mesa de RPG virtual compartilhada, não um jogo de regras fechadas. A sequência poderá ser ajustada conforme os testes com amigos.
