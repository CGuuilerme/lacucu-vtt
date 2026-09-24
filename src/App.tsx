import { useEffect, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import './App.css'

type Screen = 'home' | 'create' | 'join' | 'lobby' | 'game'

type InventoryItem = {
  id: string
  name: string
  icon: string
  x: number
  y: number
  width: number
  height: number
}

type Player = {
  id: string
  name: string
  role: 'master' | 'player'
  hp: number
  items: InventoryItem[]
}

type GameEvent = {
  id: string
  kind: 'chat' | 'roll' | 'system'
  name: string
  text: string
  time: number
}

type Room = {
  code: string
  campaignName: string
  phase: 'lobby' | 'game'
  members: Player[]
  events: GameEvent[]
}

function getClientId() {
  let id = sessionStorage.getItem('lacucu-client-id')
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem('lacucu-client-id', id)
  }
  return id
}

async function roomRequest(path: string, body: object): Promise<Room> {
  const response = await fetch(`/api/rooms${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => {
    throw new Error('Servidor de salas indisponível. Inicie o projeto com npm run dev.')
  })
  if (!response.ok) throw new Error(data.error || 'Não foi possível conectar à sala.')
  return data as Room
}

function App() {
  const [screen, setScreen] = useState<Screen>('home')

  const [campaignName, setCampaignName] = useState('')
  const [masterName, setMasterName] = useState('')

  const [playerName, setPlayerName] = useState('')
  const [roomCode, setRoomCode] = useState('')

  const [currentRoomCode, setCurrentRoomCode] = useState('')
  const [room, setRoom] = useState<Room | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [chatMessage, setChatMessage] = useState('')
  const [clientId, setClientId] = useState(getClientId)
  const [inventoryOwnerId, setInventoryOwnerId] = useState(clientId)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const players = room?.members ?? []
  const isMaster = players.find((member) => member.id === clientId)?.role === 'master'
  const inventoryOwner = players.find((member) => member.id === inventoryOwnerId) ?? players.find((member) => member.id === clientId)
  const canEditInventory = inventoryOwner?.id === clientId
  const selectedItem = canEditInventory ? inventoryOwner?.items.find((item) => item.id === selectedItemId) : undefined

  useEffect(() => {
    const savedCode = sessionStorage.getItem('lacucu-room-code')
    if (!savedCode) return
    fetch(`/api/rooms/${savedCode}?clientId=${encodeURIComponent(clientId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Sala encerrada.')
        return response.json() as Promise<Room>
      })
      .then((savedRoom) => {
        setRoom(savedRoom)
        setCurrentRoomCode(savedRoom.code)
        setScreen(savedRoom.phase)
      })
      .catch(() => sessionStorage.removeItem('lacucu-room-code'))
  }, [clientId])

  useEffect(() => {
    if ((screen !== 'lobby' && screen !== 'game') || !currentRoomCode) return
    let active = true
    async function refreshRoom() {
      try {
        const response = await fetch(`/api/rooms/${currentRoomCode}?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' })
        if (response.status === 404 || response.status === 403) {
          sessionStorage.removeItem('lacucu-room-code')
          if (active) {
            setRoom(null)
            setCurrentRoomCode('')
            setScreen('home')
            setError('A sala foi encerrada. Crie ou entre em outra campanha.')
          }
          return
        }
        if (!response.ok) throw new Error()
        const updated = await response.json() as Room
        if (!active) return
        setRoom(updated)
        setScreen(updated.phase)
        setError((previous) => previous === 'Conexão interrompida. Tentando reconectar...' ? '' : previous)
      } catch {
        if (active) setError('Conexão interrompida. Tentando reconectar...')
      }
    }
    const interval = setInterval(refreshRoom, 2000)
    return () => { active = false; clearInterval(interval) }
  }, [screen, currentRoomCode, clientId])

  async function createCampaign() {
    if (!campaignName.trim() || !masterName.trim() || pending) return
    setPending(true)
    setError('')
    try {
      const created = await roomRequest('', {
        campaignName: campaignName.trim(), masterName: masterName.trim(), clientId,
      })
      setRoom(created)
      setCurrentRoomCode(created.code)
      sessionStorage.setItem('lacucu-room-code', created.code)
      setScreen('lobby')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a sala.')
    } finally {
      setPending(false)
    }
  }

  async function joinCampaign() {
    if (!playerName.trim() || roomCode.length !== 5 || pending) return
    setPending(true)
    setError('')
    try {
      const joined = await roomRequest(`/${roomCode}/join`, {
        playerName: playerName.trim(), clientId,
      })
      setRoom(joined)
      setCurrentRoomCode(joined.code)
      sessionStorage.setItem('lacucu-room-code', joined.code)
      setScreen('lobby')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar na sala.')
    } finally {
      setPending(false)
    }
  }

  async function gameAction(action: string, body: object = {}) {
    if (pending) return false
    setPending(true)
    setError('')
    try {
      const updated = await roomRequest(`/${currentRoomCode}/${action}`, { clientId, ...body })
      setRoom(updated)
      setScreen(updated.phase)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a ação.')
      return false
    } finally {
      setPending(false)
    }
  }

  async function moveInventoryItem(itemId: string, x: number, y: number) {
    if (!canEditInventory || pending) return
    await gameAction('inventory', { op: 'move', itemId, x, y })
  }

  function dropInventoryItem(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const itemId = event.dataTransfer.getData('text/plain')
    const board = event.currentTarget.getBoundingClientRect()
    const x = Math.floor((event.clientX - board.left) / (board.width / 6))
    const y = Math.floor((event.clientY - board.top) / (board.height / 6))
    if (itemId) void moveInventoryItem(itemId, x, y)
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = chatMessage.trim()
    if (!text) return
    if (await gameAction('chat', { text })) setChatMessage('')
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(currentRoomCode)
      alert('Código copiado!')
    } catch {
      alert(`Código da campanha: ${currentRoomCode}`)
    }
  }

  async function leaveLobby() {
    try {
      await roomRequest(`/${currentRoomCode}/leave`, { clientId })
    } catch {
      // The room may already be gone; clear this tab's session either way.
    }
    sessionStorage.removeItem('lacucu-room-code')
    sessionStorage.removeItem('lacucu-client-id')
    setClientId(getClientId())
    setRoom(null)
    setCurrentRoomCode('')
    setCampaignName('')
    setMasterName('')
    setPlayerName('')
    setRoomCode('')
    setInventoryOwnerId(clientId)
    setSelectedItemId(null)
    setError('')
    setScreen('home')
  }

  return (
    <main className="app">
      <div className="background-grid" />

      <section className={`window ${screen === 'lobby' ? 'lobbyWindow' : ''} ${screen === 'game' ? 'gameWindow' : ''}`}>
        <header className="header">
          <div className="logo">L</div>

          <div>
            <h1>LACUCU VTT</h1>
            <span>Virtual Tabletop</span>
          </div>
        </header>

        {screen === 'home' && (
          <div className="content">
            {error && <p className="formError" role="alert">{error}</p>}
            <div className="hero">
              <span className="eyebrow">
                SUA MESA. SUAS REGRAS.
              </span>

              <h2>
                Toda aventura
                <br />
                começa <strong>aqui.</strong>
              </h2>

              <p>
                Crie campanhas, reúna seus jogadores e jogue qualquer
                sistema de RPG em uma mesa virtual.
              </p>
            </div>

            <div className="actions">
              <button
                className="action primary"
                onClick={() => { setError(''); setScreen('create') }}
              >
                <div className="actionIcon">♛</div>

                <div>
                  <strong>Criar campanha</strong>
                  <span>Entre como Mestre</span>
                </div>
              </button>

              <button
                className="action secondary"
                onClick={() => { setError(''); setScreen('join') }}
              >
                <div className="actionIcon">⚔</div>

                <div>
                  <strong>Entrar em campanha</strong>
                  <span>Use o código enviado pelo Mestre</span>
                </div>
              </button>
            </div>

            <div className="info">
              <div>
                <strong>3</strong>
                <span>Jogadores</span>
              </div>

              <div className="line" />

              <div>
                <strong>1</strong>
                <span>Mestre</span>
              </div>

              <div className="line" />

              <div>
                <strong>6×6</strong>
                <span>Inventário</span>
              </div>
            </div>
          </div>
        )}

        {screen === 'create' && (
          <div className="formPage">
            <button
              className="back"
              onClick={() => { setError(''); setScreen('home') }}
            >
              ← Voltar
            </button>

            <span className="eyebrow">
              NOVA AVENTURA
            </span>

            <h2>Criar campanha</h2>

            <p className="description">
              Você entrará automaticamente como Mestre da campanha.
            </p>

            <label>
              Nome da campanha

              <input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="A Maldição de Valebruma"
                maxLength={50}
              />
            </label>

            <label>
              Nome do Mestre

              <input
                value={masterName}
                onChange={(e) => setMasterName(e.target.value)}
                placeholder="Seu nome"
                maxLength={30}
              />
            </label>

            <div className="roleCard">
              <div className="roleIcon">♛</div>

              <div>
                <strong>Mestre</strong>

                <p>
                  Controle jogadores, mapas, NPCs, itens,
                  combates e regras da campanha.
                </p>
              </div>
            </div>

            {error && <p className="formError" role="alert">{error}</p>}

            <button
              className="submit"
              disabled={
                pending ||
                !campaignName.trim() ||
                !masterName.trim()
              }
              onClick={createCampaign}
            >
              Criar campanha
            </button>
          </div>
        )}

        {screen === 'join' && (
          <div className="formPage">
            <button
              className="back"
              onClick={() => { setError(''); setScreen('home') }}
            >
              ← Voltar
            </button>

            <span className="eyebrow">
              ENTRAR NA MESA
            </span>

            <h2>Entrar em campanha</h2>

            <p className="description">
              Digite o código enviado pelo Mestre.
            </p>

            <label>
              Seu nome

              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Nome do jogador"
                maxLength={30}
              />
            </label>

            <label>
              Código da campanha

              <input
                className="codeInput"
                value={roomCode}
                onChange={(e) =>
                  setRoomCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 5)
                  )
                }
                placeholder="A7K2F"
              />
            </label>

            {error && <p className="formError" role="alert">{error}</p>}

            <button
              className="submit"
              disabled={
                pending ||
                !playerName.trim() ||
                roomCode.length !== 5
              }
              onClick={joinCampaign}
            >
              Entrar na campanha
            </button>
          </div>
        )}

        {screen === 'lobby' && (
          <div className="lobby">
            <div className="lobbyTop">
              <div>
                <span className="eyebrow">
                  SALA DE ESPERA
                </span>

                <h2>{room?.campaignName}</h2>

                <p>
                  {isMaster
                    ? 'Aguarde seus jogadores entrarem antes de iniciar a aventura.'
                    : 'Aguarde o Mestre iniciar a aventura.'}
                </p>
              </div>

              <div className="roomCodeBox">
                <span>CÓDIGO</span>

                <strong>{currentRoomCode}</strong>

                <button onClick={copyRoomCode}>
                  Copiar
                </button>
              </div>
            </div>

            <div className="members">
              <h3>Membros da campanha</h3>

              <div className="member masterMember">
                <div className="memberAvatar">
                  ♛
                </div>

                <div className="memberInfo">
                  <strong>{players.find((member) => member.role === 'master')?.name}</strong>
                  <span>Mestre</span>
                </div>

                <div className="online"><span />Online</div>
              </div>

              {[0, 1, 2].map((slot) => {
                const player = players.filter(
                  (p) => p.role === 'player'
                )[slot]

                if (player) {
                  return (
                    <div
                      className="member"
                      key={player.id}
                    >
                      <div className="memberAvatar">
                        ⚔
                      </div>

                      <div className="memberInfo">
                        <strong>{player.name}</strong>
                        <span>Jogador</span>
                      </div>

                      <div className="online"><span />Online</div>
                    </div>
                  )
                }

                return (
                  <div
                    className="member emptyMember"
                    key={slot}
                  >
                    <div className="memberAvatar">
                      ?
                    </div>

                    <div className="memberInfo">
                      <strong>
                        Aguardando jogador...
                      </strong>

                      <span>
                        Vaga disponível
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {error && <p className="formError" role="alert">{error}</p>}

            <div className="lobbyNotice">
              Compartilhe o código{' '}
              <strong>{currentRoomCode}</strong>{' '}
              com até 3 jogadores.
            </div>

            <div className="lobbyButtons">
              <button
                className="leaveButton"
                onClick={leaveLobby}
              >
                Sair da sala
              </button>

              <button
                className="submit startButton"
                onClick={() => gameAction('start')}
                disabled={
                  !isMaster ||
                  players.filter(
                    (p) => p.role === 'player'
                  ).length === 0
                }
              >
                Iniciar aventura
              </button>
            </div>
          </div>
        )}

        {screen === 'game' && room && (
          <div className="gamePage">
            <div className="gameHeading">
              <div>
                <span className="eyebrow">MESA DA AVENTURA</span>
                <h2>{room.campaignName}</h2>
                <p>{isMaster ? 'Você é o Mestre desta mesa.' : 'Sua aventura começou.'}</p>
              </div>
              <div className="gameCode">CÓDIGO <strong>{room.code}</strong></div>
            </div>

            <div className="gameGrid">
              <aside className="gameSidebar">
                <h3>Personagens</h3>
                <p className="masterHint">Somente o Mestre pode restaurar PV.</p>
                {players.map((member) => (
                  <div className="characterCard" key={member.id}>
                    <div className="characterTop">
                      <strong>{member.name}</strong>
                      <span>{member.role === 'master' ? 'Mestre' : 'Jogador'}</span>
                    </div>
                    <div className="healthRow">
                      <span>PV</span>
                      <button aria-label={`Reduzir PV de ${member.name}`} disabled={pending || member.hp === 0 || (!isMaster && member.id !== clientId)} onClick={() => gameAction('hp', { targetId: member.id, hp: member.hp - 1 })}>−</button>
                      <strong>{member.hp} / 10</strong>
                      <button aria-label={`Aumentar PV de ${member.name}`} disabled={pending || member.hp === 10 || !isMaster} onClick={() => gameAction('hp', { targetId: member.id, hp: member.hp + 1 })}>+</button>
                    </div>
                  </div>
                ))}
                <button className="leaveButton gameLeave" onClick={leaveLobby}>Sair da mesa</button>
              </aside>

              <div className="gameMain">
                <section className="dicePanel" aria-label="Dados">
                  <h3>Rolar dados</h3>
                  <div className="diceButtons">
                    {[4, 6, 8, 10, 12, 20, 100].map((sides) => (
                      <button key={sides} disabled={pending} onClick={() => gameAction('roll', { sides })}>d{sides}</button>
                    ))}
                  </div>
                </section>

                <section className="chatPanel" aria-label="Chat da campanha">
                  <h3>Chat e histórico</h3>
                  <div className="chatHistory" role="log" aria-live="polite">
                    {room.events.map((entry) => (
                      <div className={`chatEntry ${entry.kind}`} key={entry.id}>
                        <span>{entry.name}</span>
                        <p>{entry.text}</p>
                      </div>
                    ))}
                  </div>
                  <form className="chatForm" onSubmit={sendMessage}>
                    <input aria-label="Mensagem" value={chatMessage} onChange={(event) => setChatMessage(event.target.value)} maxLength={500} placeholder="Escreva uma mensagem..." />
                    <button type="submit" disabled={pending || !chatMessage.trim()}>Enviar</button>
                  </form>
                </section>
              </div>
            </div>
            <section className="inventoryPanel" aria-label="Inventário">
              <div className="inventoryHeader">
                <div>
                  <span className="eyebrow">MOCHILA DA AVENTURA</span>
                  <h3>Inventário 6×6</h3>
                </div>
                <p>Selecione um item e toque em um espaço. No computador, você também pode arrastar.</p>
              </div>
              <div className="inventoryTabs" role="group" aria-label="Inventário de personagem">
                {players.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className={inventoryOwner?.id === member.id ? 'active' : ''}
                    aria-pressed={inventoryOwner?.id === member.id}
                    onClick={() => { setInventoryOwnerId(member.id); setSelectedItemId(null) }}
                  >
                    {member.name}{member.id === clientId ? ' (você)' : ''}
                  </button>
                ))}
              </div>
              <div className="inventoryContent">
                <div
                  className="inventoryBoard"
                  aria-label={`Inventário de ${inventoryOwner?.name ?? 'personagem'}`}
                  onDragOver={(event) => { if (canEditInventory) event.preventDefault() }}
                  onDrop={dropInventoryItem}
                >
                  {Array.from({ length: 36 }, (_, index) => {
                    const x = index % 6
                    const y = Math.floor(index / 6)
                    return (
                      <button
                        key={index}
                        type="button"
                        className="inventoryCell"
                        style={{ gridColumn: x + 1, gridRow: y + 1 }}
                        aria-label={`Espaço ${x + 1}, ${y + 1}`}
                        disabled={!canEditInventory || !selectedItem || pending}
                        onClick={() => { if (selectedItem) void moveInventoryItem(selectedItem.id, x, y) }}
                      />
                    )
                  })}
                  {inventoryOwner?.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`inventoryItem ${selectedItem?.id === item.id ? 'selected' : ''}`}
                      style={{ gridColumn: `${item.x + 1} / span ${item.width}`, gridRow: `${item.y + 1} / span ${item.height}` }}
                      aria-label={`${item.name}, ${item.width} por ${item.height}, coluna ${item.x + 1}, linha ${item.y + 1}`}
                      aria-pressed={selectedItem?.id === item.id}
                      draggable={canEditInventory && !pending}
                      onDragStart={(event) => { event.dataTransfer.setData('text/plain', item.id); setSelectedItemId(item.id) }}
                      onClick={() => { if (canEditInventory) setSelectedItemId(item.id) }}
                    >
                      <span aria-hidden="true">{item.icon}</span>
                      <small>{item.name}</small>
                    </button>
                  ))}
                </div>
                <div className="inventoryDetails">
                  <strong>{inventoryOwner?.name ?? 'Personagem'}</strong>
                  <span>{canEditInventory ? 'Sua mochila' : 'Apenas visualização'}</span>
                  <ul>
                    {inventoryOwner?.items.map((item) => (
                      <li key={item.id}><span>{item.icon} {item.name}</span><span>{item.width}×{item.height}</span></li>
                    ))}
                  </ul>
                  {canEditInventory && (
                    <button
                      className="rotateButton"
                      type="button"
                      disabled={!selectedItem || pending}
                      onClick={() => { if (selectedItem) void gameAction('inventory', { op: 'rotate', itemId: selectedItem.id }) }}
                    >
                      Girar {selectedItem?.name ?? 'item'} ↻
                    </button>
                  )}
                </div>
              </div>
            </section>
            {error && <p className="formError" role="alert">{error}</p>}
          </div>
        )}
      </section>

      <footer>
        LACUCU VTT • V0.3
      </footer>
    </main>
  )
}

export default App
