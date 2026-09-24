# Lacucu VTT

Projeto para amigos de RPG: uma mesa virtual dark fantasy para jogar juntos online.

## O que já funciona (v0.4)

- Criar uma campanha com código de cinco caracteres e entrar como Mestre ou jogador.
- Lobby com um Mestre e até três jogadores.
- Mesa compartilhada com chat, rolagens de d4, d6, d8, d10, d12, d20 e d100 e PV de 0 a 10.
- Cada jogador pode reduzir os próprios PV. Só o Mestre pode usar os controles para restaurar PV ou alterar os PV de outro personagem; a poção permite recuperar até 2 PV do próprio jogador. O servidor valida essas regras.
- Inventário 6×6 compartilhado por personagem, com espada, escudo, poção e pergaminho. Cada pessoa organiza apenas a própria mochila, por toque ou arraste; é possível girar itens. O servidor impede sobreposição e itens fora da grade.
- Itens utilizáveis: espada e escudo fazem testes d20 no histórico; pergaminho faz um teste de magia e é consumido; poção recupera até 2 PV do dono e é consumida. Os controles de PV continuam reservados ao Mestre.
- O Mestre não tem inventário. Jogadores veem as mochilas uns dos outros, mas só editam a própria.
- Foto opcional ao criar ou entrar na sala; aparece no lobby e na mesa.
- Mapa PNG compartilhado (até 5 MB), carregado pelo Mestre. O Mestre pode carregar até 20 imagens de tokens, movê-los e removê-los. Jogadores acompanham as mudanças.
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

Aba e ficha própria de cada personagem; atributos, perícias, testes, pontos, nível e distribuição de pontos. Depois: persistência de campanhas, camadas de mapa e recursos avançados para o Mestre.
