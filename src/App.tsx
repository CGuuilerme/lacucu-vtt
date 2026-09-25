import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent, MouseEvent, PointerEvent } from 'react'
import { ItemArt } from './ItemArt'
import './App.css'

type Screen = 'home' | 'create' | 'join' | 'lobby' | 'game'

type InventoryItem = {
  id: string
  name: string
  icon: string
  kind: 'sword' | 'shield' | 'potion' | 'scroll' | 'misc'
  description: string
  effect: 'none' | 'roll' | 'heal'
  power: number
  uses: number
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
  avatarId?: string
}

type GameEvent = {
  id: string
  kind: 'chat' | 'roll' | 'system'
  name: string
  text: string
  time: number
}

type MapToken = { id: string; name: string; assetId: string; x: number; y: number }

type Room = {
  code: string
  campaignName: string
  phase: 'lobby' | 'game'
  members: Player[]
  events: GameEvent[]
  mapAssetId?: string
  mapWidth?: number
  mapHeight?: number
  tokens: MapToken[]
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

async function uploadRoomAsset(code: string, kind: 'avatar' | 'map' | 'token', file: Blob, clientId: string, name = ''): Promise<Room> {
  const params = new URLSearchParams({ clientId })
  if (name) params.set('name', name)
  const response = await fetch(`/api/rooms/${code}/upload/${kind}?${params}`, { method: 'POST', body: file })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a imagem.')
  return data as Room
}

async function compactImage(file: File, size: number): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha uma imagem válida.')
  const image = await createImageBitmap(file)
  const scale = Math.min(1, size / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
  image.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', .85))
  if (!blob) throw new Error('Não foi possível preparar a imagem.')
  return blob
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
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [mapMode, setMapMode] = useState<'tokens' | 'pan'>('tokens')
  const [showGrid, setShowGrid] = useState(false)
  const [activePanel, setActivePanel] = useState<'characters' | 'inventory' | 'chat' | 'dice' | 'master' | null>(null)
  const panAnchor = useRef<{ x: number; y: number } | null>(null)
  const [itemName, setItemName] = useState('')
  const [itemDescription, setItemDescription] = useState('')
  const [itemKind, setItemKind] = useState<InventoryItem['kind']>('misc')
  const [itemWidth, setItemWidth] = useState(1)
  const [itemHeight, setItemHeight] = useState(1)
  const [itemEffect, setItemEffect] = useState<InventoryItem['effect']>('none')
  const [itemPower, setItemPower] = useState(2)
  const [itemUses, setItemUses] = useState(0)
  const [itemRecipientId, setItemRecipientId] = useState('')
  const players = room?.members ?? []
  const isMaster = players.find((member) => member.id === clientId)?.role === 'master'
  const inventoryOwner = players.find((member) => member.role === 'player' && member.id === inventoryOwnerId)
    ?? players.find((member) => member.role === 'player' && member.id === clientId)
    ?? players.find((member) => member.role === 'player')
  const canEditInventory = inventoryOwner?.id === clientId || isMaster
  const selectedItem = canEditInventory ? inventoryOwner?.items.find((item) => item.id === selectedItemId) : undefined
  const selectedToken = room?.tokens?.find((token) => token.id === selectedTokenId)
  function assetUrl(id: string) {
    return `/api/rooms/${currentRoomCode}/assets/${id}?clientId=${encodeURIComponent(clientId)}`
  }

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

  useEffect(() => {
    if (screen !== 'game') return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setActivePanel(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [screen])

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
      if (avatarFile) setRoom(await uploadRoomAsset(created.code, 'avatar', await compactImage(avatarFile, 256), clientId))
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
      if (avatarFile) setRoom(await uploadRoomAsset(joined.code, 'avatar', await compactImage(avatarFile, 256), clientId))
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

  async function uploadGameImage(kind: 'map' | 'token', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !isMaster || pending) return
    setPending(true)
    setError('')
    try {
      if (kind === 'map' && (file.type !== 'image/png' || file.size > 5_000_000)) {
        throw new Error('Escolha um PNG de até 5 MB para o mapa.')
      }
      const image = kind === 'map' ? file : await compactImage(file, 512)
      const updated = await uploadRoomAsset(currentRoomCode, kind, image, clientId, file.name.replace(/\.[^.]+$/, '').slice(0, 30))
      setRoom(updated)
      if (kind === 'token') setSelectedTokenId(updated.tokens.at(-1)?.id ?? null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a imagem.')
    } finally {
      setPending(false)
    }
  }

  function mapPosition(event: MouseEvent<HTMLDivElement> | DragEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(100, Math.round((event.clientX - box.left) / box.width * 1000) / 10)),
      y: Math.max(0, Math.min(100, Math.round((event.clientY - box.top) / box.height * 1000) / 10)),
    }
  }

  function placeToken(event: MouseEvent<HTMLDivElement>) {
    if (mapMode === 'pan') return
    if (isMaster && selectedToken && !pending) void gameAction('token', { op: 'move', tokenId: selectedToken.id, ...mapPosition(event) })
  }

  function dropToken(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const tokenId = event.dataTransfer.getData('text/plain')
    if (isMaster && tokenId && !pending) void gameAction('token', { op: 'move', tokenId, ...mapPosition(event) })
  }

  function beginPan(event: PointerEvent<HTMLDivElement>) {
    if (mapMode !== 'pan') return
    panAnchor.current = { x: event.clientX - pan.x, y: event.clientY - pan.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function movePan(event: PointerEvent<HTMLDivElement>) {
    if (mapMode === 'pan' && panAnchor.current) setPan({ x: event.clientX - panAnchor.current.x, y: event.clientY - panAnchor.current.y })
  }

  function endPan(event: PointerEvent<HTMLDivElement>) {
    panAnchor.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isMaster || !itemName.trim()) return
    const targetId = itemRecipientId || players.find((member) => member.role === 'player')?.id
    if (!targetId) return
    if (await gameAction('item', {
      op: 'create', targetId, name: itemName.trim(), description: itemDescription.trim(),
      kind: itemKind, width: itemWidth, height: itemHeight, effect: itemEffect,
      power: itemEffect === 'none' ? 0 : itemPower, uses: itemUses,
    })) {
      setItemName('')
      setItemDescription('')
      setInventoryOwnerId(targetId)
      setSelectedItemId(null)
    }
  }

  async function moveInventoryItem(itemId: string, x: number, y: number) {
    if (!canEditInventory || pending) return
    await gameAction('inventory', { op: 'move', targetId: inventoryOwner?.id, itemId, x, y })
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
    setSelectedTokenId(null)
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setMapMode('tokens')
    setShowGrid(false)
    setActivePanel(null)
    setAvatarFile(null)
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
                Reúna seus amigos, compartilhe mapas e conduza sua aventura
                em uma mesa virtual livre para qualquer sistema.
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

            <label className="photoPicker">
              Foto do Mestre (opcional)
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)} />
              <span>{avatarFile?.name ?? 'Escolher foto'}</span>
            </label>

            <div className="roleCard">
              <div className="roleIcon">♛</div>

              <div>
                <strong>Mestre</strong>

                <p>
                  Conduza a mesa, compartilhe mapas e organize
                  os itens da aventura.
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

            <label className="photoPicker">
              Foto do personagem (opcional)
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)} />
              <span>{avatarFile?.name ?? 'Escolher foto'}</span>
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
                  {players.find((member) => member.role === 'master')?.avatarId
                    ? <img src={assetUrl(players.find((member) => member.role === 'master')!.avatarId!)} alt="" />
                    : '♛'}
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
                        {player.avatarId ? <img src={assetUrl(player.avatarId)} alt="" /> : '⚔'}
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
          <div className="gamePage tabletopPage">
            <header className="tabletopTopbar">
              <div className="tabletopBrand"><div className="logo">L</div><span>LACUCU <em>VTT</em></span></div>
              <div className="tabletopCampaign"><small>MESA COMPARTILHADA</small><strong>{room.campaignName}</strong></div>
              <div className="tabletopPresence" aria-label="Participantes online">
                {players.map((member) => <span key={member.id} title={member.name} className="presenceAvatar">{member.avatarId ? <img src={assetUrl(member.avatarId)} alt="" /> : member.role === 'master' ? '♛' : '⚔'}</span>)}
              </div>
              <button className="tabletopCode" onClick={copyRoomCode} title="Copiar código da sala"><small>SALA</small><strong>{room.code}</strong></button>
              <button className="tabletopExit" onClick={leaveLobby}>Sair</button>
            </header>
            <div className="tabletopWorkspace">
            <section className="mapPanel" aria-label="Mapa da aventura">
              <div className="mapNav" role="group" aria-label="Controles do mapa">
                <button type="button" className={mapMode === 'tokens' ? 'active' : ''} onClick={() => setMapMode('tokens')}>Tokens</button>
                <button type="button" className={mapMode === 'pan' ? 'active' : ''} onClick={() => setMapMode('pan')}>Arrastar mapa</button>
                <button type="button" className={showGrid ? 'active' : ''} aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)}>Grade</button>
                <span className="mapNavDivider" />
                <button type="button" aria-label="Diminuir zoom" onClick={() => setZoom((value) => Math.max(.5, +(value - .25).toFixed(2)))}>−</button>
                <span className="zoomValue">{Math.round(zoom * 100)}%</span>
                <button type="button" aria-label="Aumentar zoom" onClick={() => setZoom((value) => Math.min(3, +(value + .25).toFixed(2)))}>+</button>
                <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>Centralizar</button>
              </div>
              <div
                className={`mapViewport ${mapMode === 'pan' ? 'panMode' : ''}`}
                onPointerDown={beginPan}
                onPointerMove={movePan}
                onPointerUp={endPan}
                onPointerCancel={endPan}
              >
              {room.mapAssetId ? (
                <div
                  className={`mapStage ${isMaster && selectedToken ? 'canPlace' : ''}`}
                  style={{ aspectRatio: `${room.mapWidth ?? 16} / ${room.mapHeight ?? 10}`, width: `min(100%, calc((100dvh - 64px) * ${(room.mapWidth ?? 16) / (room.mapHeight ?? 10)}))`, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                  onClick={placeToken}
                  onDragOver={(event) => { if (isMaster) event.preventDefault() }}
                  onDrop={dropToken}
                >
                  <img className="mapImage" src={assetUrl(room.mapAssetId)} alt="Mapa da aventura" draggable={false} />
                  {showGrid && <div className="mapGridOverlay" aria-hidden="true" />}
                  {room.tokens.map((token) => (
                    <button
                      key={token.id}
                      type="button"
                      className={`mapToken ${selectedToken?.id === token.id ? 'selected' : ''}`}
                      style={{ left: `${token.x}%`, top: `${token.y}%` }}
                      aria-label={`Token ${token.name}`}
                      aria-pressed={selectedToken?.id === token.id}
                      draggable={isMaster && !pending}
                      onDragStart={(event) => { event.dataTransfer.setData('text/plain', token.id); setSelectedTokenId(token.id) }}
                      onClick={(event) => { event.stopPropagation(); if (isMaster) setSelectedTokenId(token.id) }}
                    >
                      <img src={assetUrl(token.assetId)} alt="" draggable={false} />
                    </button>
                  ))}
                </div>
              ) : <div className="mapEmpty"><span aria-hidden="true">✧</span><strong>O cenário ainda não foi revelado</strong><p>{isMaster ? 'Carregue um mapa PNG para começar.' : 'Aguarde o Mestre carregar um mapa.'}</p></div>}
              </div>
              {room.tokens.length > 0 && <div className="tokenRoster">
                {room.tokens.map((token) => <button key={token.id} type="button" className={selectedToken?.id === token.id ? 'active' : ''} disabled={!isMaster || mapMode === 'pan'} onClick={() => setSelectedTokenId(token.id)}><img src={assetUrl(token.assetId)} alt="" />{token.name}</button>)}
                {isMaster && selectedToken && <button type="button" className="removeToken" disabled={pending} onClick={() => { void gameAction('token', { op: 'remove', tokenId: selectedToken.id }); setSelectedTokenId(null) }}>Remover token</button>}
              </div>}
            </section>

              <nav className="tabletopRail" aria-label="Painéis da mesa">
                {([
                  ['characters', '♟', 'Pessoas'],
                  ['inventory', '▣', 'Inventário'],
                  ['chat', '☷', 'Chat'],
                  ['dice', '◇', 'Dados'],
                  ...(isMaster ? [['master', '♛', 'Mestre']] : []),
                ] as const).map(([panel, icon, label]) => (
                  <button
                    key={panel}
                    type="button"
                    className={activePanel === panel ? 'active' : ''}
                    aria-label={`Abrir ${label.toLowerCase()}`}
                    aria-expanded={activePanel === panel}
                    aria-controls="tabletop-drawer"
                    onClick={() => setActivePanel(activePanel === panel ? null : panel as Exclude<typeof activePanel, null>)}
                  >
                    <span className="railGlyph" aria-hidden="true">{icon}</span>
                    <span className="railText">{label}</span>
                  </button>
                ))}
              </nav>
              {activePanel && <aside className="tabletopDrawer" id="tabletop-drawer" aria-label={`Painel de ${activePanel}`}>
                <div className="drawerHead">
                  <div><small>LACUCU VTT</small><h2>{activePanel === 'characters' ? 'Personagens' : activePanel === 'inventory' ? 'Inventário' : activePanel === 'chat' ? 'Chat e histórico' : activePanel === 'dice' ? 'Dados' : 'Ferramentas do Mestre'}</h2></div>
                  <button type="button" aria-label="Fechar painel" onClick={() => setActivePanel(null)}>×</button>
                </div>
                <div className="drawerBody">
                  {activePanel === 'characters' && (
              <aside className="gameSidebar">
                <h3>Personagens</h3>
                <p className="masterHint">O Mestre controla PV. Itens de cura definidos por ele também podem recuperar PV.</p>
                {players.map((member) => (
                  <div className="characterCard" key={member.id}>
                    <div className="characterTop">
                      <div className="characterIdentity">
                        <div className="characterPortrait">{member.avatarId ? <img src={assetUrl(member.avatarId)} alt="" /> : member.role === 'master' ? '♛' : '⚔'}</div>
                        <strong>{member.name}</strong>
                      </div>
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
              </aside>

                  )}
                  {activePanel === 'inventory' && (
            <section className="inventoryPanel" aria-label="Inventário">
              <div className="inventoryHeader">
                <div>
                  <span className="eyebrow">MOCHILA DA AVENTURA</span>
                  <h3>Inventário 6×6</h3>
                </div>
                <p>O Mestre cria e entrega itens. Cada jogador organiza e usa os seus.</p>
              </div>
              {isMaster && <form className="itemCreator" onSubmit={createItem}>
                <div className="itemCreatorTitle">
                  <strong>Criar item para jogador</strong>
                  <span>Defina o que existe na aventura.</span>
                </div>
                <label>Nome do item<input value={itemName} onChange={(event) => setItemName(event.target.value)} maxLength={40} placeholder="Ex.: Lâmina de Valebruma" required /></label>
                <label>Entregar para<select value={itemRecipientId || players.find((member) => member.role === 'player')?.id || ''} onChange={(event) => setItemRecipientId(event.target.value)}>{players.filter((member) => member.role === 'player').map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
                <label className="creatorWide">Descrição<input value={itemDescription} onChange={(event) => setItemDescription(event.target.value)} maxLength={180} placeholder="O que esse item faz na história?" /></label>
                <label>Aparência<select value={itemKind} onChange={(event) => setItemKind(event.target.value as InventoryItem['kind'])}><option value="misc">Artefato</option><option value="sword">Arma</option><option value="shield">Defesa</option><option value="potion">Frasco</option><option value="scroll">Pergaminho</option></select></label>
                <label>Efeito<select value={itemEffect} onChange={(event) => { const effect = event.target.value as InventoryItem['effect']; setItemEffect(effect); setItemPower(effect === 'roll' ? 4 : 2) }}><option value="none">Narrativo</option><option value="roll">Rolar dado</option><option value="heal">Recuperar PV</option></select></label>
                <label>Largura<select value={itemWidth} onChange={(event) => setItemWidth(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((size) => <option key={size} value={size}>{size} espaços</option>)}</select></label>
                <label>Altura<select value={itemHeight} onChange={(event) => setItemHeight(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((size) => <option key={size} value={size}>{size} espaços</option>)}</select></label>
                {itemEffect !== 'none' && <label>{itemEffect === 'heal' ? 'PV recuperados' : 'Dado'}<select value={itemPower} onChange={(event) => setItemPower(Number(event.target.value))}>{(itemEffect === 'heal' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [4, 6, 8, 10, 12, 20, 100]).map((value) => <option key={value} value={value}>{itemEffect === 'heal' ? value : `d${value}`}</option>)}</select></label>}
                <label>Usos<select value={itemUses} onChange={(event) => setItemUses(Number(event.target.value))}><option value={0}>Ilimitados</option>{[1, 2, 3, 4, 5, 10, 20].map((value) => <option key={value} value={value}>{value} {value === 1 ? 'uso' : 'usos'}</option>)}</select></label>
                <button className="createItemButton" type="submit" disabled={pending || !itemName.trim()}>Entregar item</button>
              </form>}
              <div className="inventoryTabs" role="group" aria-label="Inventário de personagem">
                {players.filter((member) => member.role === 'player').map((member) => (
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
                      <ItemArt kind={item.kind} />
                      <small>{item.name}</small>
                    </button>
                  ))}
                </div>
                <div className="inventoryDetails">
                  <strong>{inventoryOwner?.name ?? 'Personagem'}</strong>
                  <span>{isMaster ? 'Controle do Mestre' : canEditInventory ? 'Sua mochila' : 'Apenas visualização'}</span>
                  {inventoryOwner?.items.length ? <ul>
                    {inventoryOwner.items.map((item) => (
                      <li key={item.id}><span><ItemArt kind={item.kind} /> {item.name}</span><span>{item.uses ? `${item.uses} uso(s)` : '∞'} · {item.width}×{item.height}</span></li>
                    ))}
                  </ul> : <p className="emptyInventory">Nenhum item ainda. O Mestre pode criar e entregar um.</p>}
                  {selectedItem && <p className="itemDescription">{selectedItem.description || 'Sem descrição adicional.'}</p>}
                  {canEditInventory && <div className="itemActions">
                    <button
                      className="rotateButton"
                      type="button"
                      disabled={!selectedItem || pending}
                      onClick={() => { if (selectedItem) void gameAction('inventory', { op: 'rotate', targetId: inventoryOwner?.id, itemId: selectedItem.id }) }}
                    >
                      Girar {selectedItem?.name ?? 'item'} ↻
                    </button>
                    {!isMaster && <button
                      className="useButton"
                      type="button"
                      disabled={!selectedItem || pending || (selectedItem.effect === 'heal' && inventoryOwner?.hp === 10)}
                      onClick={() => { if (selectedItem) void gameAction('inventory', { op: 'use', itemId: selectedItem.id }) }}
                    >
                      Usar {selectedItem?.name ?? 'item'}
                    </button>}
                    {isMaster && <button
                      className="removeItemButton"
                      type="button"
                      disabled={!selectedItem || pending}
                      onClick={() => { if (selectedItem) { void gameAction('item', { op: 'remove', targetId: inventoryOwner?.id, itemId: selectedItem.id }); setSelectedItemId(null) } }}
                    >Retirar item</button>}
                    <p>{selectedItem ? selectedItem.effect === 'heal' ? `Recupera até ${selectedItem.power} PV.` : selectedItem.effect === 'roll' ? `Rola 1d${selectedItem.power} no histórico.` : 'Efeito narrativo registrado no histórico.' : 'Selecione um item para ver sua ação.'}</p>
                  </div>}
                </div>
              </div>
            </section>
                  )}
                  {activePanel === 'chat' && (
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
                  )}
                  {activePanel === 'dice' && (
                <section className="dicePanel" aria-label="Dados">
                  <h3>Rolar dados</h3>
                  <div className="diceButtons">
                    {[4, 6, 8, 10, 12, 20, 100].map((sides) => (
                      <button key={sides} disabled={pending} onClick={() => gameAction('roll', { sides })}>d{sides}</button>
                    ))}
                  </div>
                </section>

                  )}
                  {activePanel === 'master' && isMaster && (
                    <section className="masterPanel">
                      <h3>Cenário</h3>
                      <p>Carregue um mapa PNG e adicione tokens para todos verem na mesa.</p>
                      <div className="mapTools">
                        <label className="mapUpload">
                          {room.mapAssetId ? 'Trocar mapa PNG' : 'Carregar mapa PNG'}
                          <input type="file" accept="image/png" disabled={pending} onChange={(event) => void uploadGameImage('map', event)} />
                        </label>
                        <label className={`mapUpload tokenUpload ${!room.mapAssetId ? 'disabled' : ''}`}>
                          Adicionar token
                          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={pending || !room.mapAssetId} onChange={(event) => void uploadGameImage('token', event)} />
                        </label>
                      </div>
                      <div className="masterDivider" />
                      <h3>Itens dos jogadores</h3>
                      <p>Você define o que cada personagem recebe. Crie itens no painel de inventário.</p>
                      <button className="masterJump" type="button" onClick={() => setActivePanel('inventory')}>Abrir criação de itens →</button>
                    </section>
                  )}
                </div>
              </aside>}
              {error && <p className="formError tabletopToast" role="alert">{error}</p>}
            </div>
          </div>
        )}
      </section>

      <footer>
        LACUCU VTT • V0.6
      </footer>
    </main>
  )
}

export default App
