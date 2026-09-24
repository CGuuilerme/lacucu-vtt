# Lacucu VTT

Projeto para amigos de RPG: uma mesa virtual dark fantasy para jogar juntos online.

## O que já funciona (v0.5)

- Criar uma campanha com código de cinco caracteres e entrar como Mestre ou jogador.
- Lobby com um Mestre e até três jogadores.
- Mesa compartilhada com chat, rolagens de d4, d6, d8, d10, d12, d20 e d100 e PV de 0 a 10.
- Cada jogador pode reduzir os próprios PV. Só o Mestre pode usar os controles para restaurar PV ou alterar os PV de outro personagem; um item de cura criado pelo Mestre pode recuperar os próprios PV do jogador. O servidor valida essas regras.
- Inventário 6×6 de cada jogador, inicialmente vazio. O Mestre cria itens, escolhe o destinatário, nome, descrição, aparência, tamanho, efeito e quantidade de usos. O servidor encontra uma posição livre, valida permissões e impede sobreposição.
- Jogadores podem organizar e usar os próprios itens. Efeitos disponíveis: ação narrativa no histórico, rolagem de dado ou cura dos próprios PV. Itens com usos limitados são removidos quando acabam. O Mestre pode organizar ou retirar itens, mas não tem inventário próprio.
- Foto opcional ao criar ou entrar na sala; aparece no lobby e na mesa.
- Mesa com mapa como área principal, inspirada na experiência de tabuleiro do Owlbear Rodeo, mas com identidade dark fantasy própria. Cada pessoa pode ampliar, centralizar ou arrastar a vista e ligar uma grade visual. O Mestre carrega o PNG (até 5 MB), adiciona até 20 tokens, move e remove; todos acompanham as mudanças.
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

## Próximas melhorias

Aba e ficha própria de cada personagem; atributos, perícias, testes, pontos, nível e distribuição de pontos. Depois: persistência de campanhas, múltiplas cenas e camadas de mapa, ferramentas avançadas para o Mestre e assistência opcional por IA para criação de itens.
