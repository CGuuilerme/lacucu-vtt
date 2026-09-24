import { randomInt, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

type Role = 'master' | 'player'
type ItemKind = 'sword' | 'shield' | 'potion' | 'scroll'
type InventoryItem = { id: string; kind: ItemKind; name: string; icon: string; x: number; y: number; width: number; height: number }
type Member = { id: string; name: string; role: Role; hp: number; items: InventoryItem[]; avatarId?: string }
type GameEvent = { id: string; kind: 'chat' | 'roll' | 'system'; name: string; text: string; time: number }
type MapToken = { id: string; name: string; assetId: string; x: number; y: number }
type Asset = { bytes: Buffer; contentType: string }
type Room = {
  code: string
  campaignName: string
  phase: 'lobby' | 'game'
  members: Map<string, Member>
  events: GameEvent[]
  expiryTimers: Map<string, ReturnType<typeof setTimeout>>
  assets: Map<string, Asset>
  mapAssetId?: string
  mapWidth?: number
  mapHeight?: number
  tokens: Map<string, MapToken>
}

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const rooms = new Map<string, Room>()
const allowedDice = new Set([4, 6, 8, 10, 12, 20, 100])

function starterItems(): InventoryItem[] {
  return [
    { id: randomUUID(), kind: 'sword', name: 'Espada', icon: '⚔', x: 0, y: 0, width: 1, height: 3 },
    { id: randomUUID(), kind: 'shield', name: 'Escudo', icon: '◈', x: 2, y: 0, width: 2, height: 2 },
    { id: randomUUID(), kind: 'potion', name: 'Poção', icon: '✦', x: 5, y: 0, width: 1, height: 1 },
    { id: randomUUID(), kind: 'scroll', name: 'Pergaminho', icon: '▤', x: 4, y: 2, width: 1, height: 2 },
  ]
}

function overlaps(a: InventoryItem, b: InventoryItem) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

function snapshot(room: Room) {
  return {
    code: room.code,
    campaignName: room.campaignName,
    phase: room.phase,
    members: [...room.members.values()],
    events: room.events,
    mapAssetId: room.mapAssetId,
    mapWidth: room.mapWidth,
    mapHeight: room.mapHeight,
    tokens: [...room.tokens.values()],
  }
}

function addEvent(room: Room, kind: GameEvent['kind'], name: string, text: string) {
  room.events.push({ id: randomUUID(), kind, name, text, time: Date.now() })
  if (room.events.length > 100) room.events.shift()
}

function removeMember(room: Room, clientId: string) {
  const member = room.members.get(clientId)
  if (!member) return
  const timer = room.expiryTimers.get(clientId)
  if (timer) clearTimeout(timer)
  room.expiryTimers.delete(clientId)
  room.members.delete(clientId)
  if (member.avatarId) room.assets.delete(member.avatarId)
  if (member.role === 'master') {
    rooms.delete(room.code)
    for (const expiryTimer of room.expiryTimers.values()) clearTimeout(expiryTimer)
    room.expiryTimers.clear()
  } else if (room.phase === 'game') {
    addEvent(room, 'system', 'Sistema', `${member.name} saiu da aventura.`)
  }
}

function keepMember(room: Room, clientId: string) {
  const previous = room.expiryTimers.get(clientId)
  if (previous) clearTimeout(previous)
  room.expiryTimers.set(clientId, setTimeout(() => removeMember(room, clientId), 90_000))
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += part.length
    if (size > limit) throw new Error('Arquivo ou solicitação muito grande.')
    chunks.push(part)
  }
  return Buffer.concat(chunks)
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse((await readBody(req, 4096)).toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    return parsed as Record<string, unknown>
  } catch {
    throw new Error('Dados inválidos.')
  }
}

function validText(value: unknown, max: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
}

function imageType(bytes: Buffer): string | null {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

async function upload(req: IncomingMessage, res: ServerResponse, url: URL, room: Room, member: Member, kind: string) {
  if (kind !== 'avatar' && member.role !== 'master') return sendJson(res, 403, { error: 'Só o Mestre pode carregar mapas e tokens.' })
  if (kind !== 'avatar' && room.phase !== 'game') return sendJson(res, 409, { error: 'Inicie a aventura antes de carregar o mapa.' })
  if (kind === 'token' && !room.mapAssetId) return sendJson(res, 409, { error: 'Carregue um mapa primeiro.' })
  if (kind === 'token' && room.tokens.size >= 20) return sendJson(res, 409, { error: 'Limite de 20 tokens atingido.' })
  const bytes = await readBody(req, kind === 'map' ? 5_000_000 : 700_000)
  const type = imageType(bytes)
  if (!type || (kind === 'map' && type !== 'image/png')) {
    return sendJson(res, 400, { error: kind === 'map' ? 'O mapa precisa ser um PNG válido.' : 'Use uma imagem PNG, JPG ou WebP válida.' })
  }
  let width: number | undefined
  let height: number | undefined
  if (kind === 'map') {
    width = bytes.readUInt32BE(16)
    height = bytes.readUInt32BE(20)
    if (width < 1 || height < 1 || width > 8192 || height > 8192) {
      return sendJson(res, 400, { error: 'O mapa deve ter até 8192 pixels de largura e altura.' })
    }
  }
  const assetId = randomUUID()
  room.assets.set(assetId, { bytes, contentType: type })
  if (kind === 'avatar') {
    if (member.avatarId) room.assets.delete(member.avatarId)
    member.avatarId = assetId
  } else if (kind === 'map') {
    if (room.mapAssetId) room.assets.delete(room.mapAssetId)
    room.mapAssetId = assetId
    room.mapWidth = width
    room.mapHeight = height
    addEvent(room, 'system', 'Sistema', `${member.name} carregou um mapa.`)
  } else {
    const name = url.searchParams.get('name')?.trim().slice(0, 30) || 'Token'
    const tokenId = randomUUID()
    room.tokens.set(tokenId, { id: tokenId, name, assetId, x: 50, y: 50 })
    addEvent(room, 'system', 'Sistema', `${member.name} adicionou o token ${name}.`)
  }
  return sendJson(res, 200, snapshot(room))
}

export async function roomMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (!url.pathname.startsWith('/api/rooms')) return next()
  try {
    if (req.method === 'POST' && url.pathname === '/api/rooms') {
      const body = await readJson(req)
      if (!validText(body.campaignName, 50) || !validText(body.masterName, 30) || !validText(body.clientId, 100)) {
        return sendJson(res, 400, { error: 'Preencha o nome da campanha e do Mestre.' })
      }
      let code = ''
      do { code = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join('') } while (rooms.has(code))
      const room: Room = {
        code, campaignName: (body.campaignName as string).trim(), phase: 'lobby',
        members: new Map(), events: [], expiryTimers: new Map(), assets: new Map(), tokens: new Map(),
      }
      const id = body.clientId as string
      room.members.set(id, { id, name: (body.masterName as string).trim(), role: 'master', hp: 10, items: [] })
      rooms.set(code, room)
      keepMember(room, id)
      return sendJson(res, 201, snapshot(room))
    }

    const assetMatch = /^\/api\/rooms\/([A-Z0-9]{5})\/assets\/([a-f0-9-]{36})$/.exec(url.pathname)
    if (assetMatch) {
      const room = rooms.get(assetMatch[1])
      if (!room) return sendJson(res, 404, { error: 'Sala encerrada.' })
      const clientId = url.searchParams.get('clientId')
      if (!clientId || !room.members.has(clientId)) return sendJson(res, 403, { error: 'Você não está nesta sala.' })
      const asset = room.assets.get(assetMatch[2])
      if (!asset) return sendJson(res, 404, { error: 'Imagem não encontrada.' })
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Operação não permitida.' })
      res.writeHead(200, { 'Content-Type': asset.contentType, 'Content-Length': asset.bytes.length, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' })
      return res.end(asset.bytes)
    }

    const uploadMatch = /^\/api\/rooms\/([A-Z0-9]{5})\/upload\/(map|token|avatar)$/.exec(url.pathname)
    if (uploadMatch) {
      const room = rooms.get(uploadMatch[1])
      if (!room) return sendJson(res, 404, { error: 'Sala encerrada.' })
      const clientId = url.searchParams.get('clientId')
      if (!clientId || !room.members.has(clientId)) return sendJson(res, 403, { error: 'Você não está nesta sala.' })
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Operação não permitida.' })
      keepMember(room, clientId)
      return upload(req, res, url, room, room.members.get(clientId)!, uploadMatch[2])
    }

    const roomMatch = /^\/api\/rooms\/([A-Z0-9]{5})(?:\/(join|leave|start|chat|roll|hp|inventory|token))?$/.exec(url.pathname)
    if (!roomMatch) return sendJson(res, 404, { error: 'Sala não encontrada.' })
    const [, code, action] = roomMatch
    const room = rooms.get(code)
    if (!room) return sendJson(res, 404, { error: 'Código inválido ou sala encerrada.' })
    const body = req.method === 'POST' ? await readJson(req) : null

    if (req.method === 'POST' && action === 'join') {
      if (!validText(body?.playerName, 30) || !validText(body?.clientId, 100)) return sendJson(res, 400, { error: 'Informe seu nome para entrar.' })
      const id = body!.clientId as string
      const existing = room.members.get(id)
      if (!existing && room.phase === 'game') return sendJson(res, 409, { error: 'A aventura já começou.' })
      if (!existing && [...room.members.values()].filter(member => member.role === 'player').length >= 3) return sendJson(res, 409, { error: 'A sala já tem três jogadores.' })
      if (!existing) room.members.set(id, { id, name: (body!.playerName as string).trim(), role: 'player', hp: 10, items: starterItems() })
      keepMember(room, id)
      return sendJson(res, 200, snapshot(room))
    }

    const clientId = req.method === 'GET' ? url.searchParams.get('clientId') : body?.clientId
    if (typeof clientId !== 'string' || !room.members.has(clientId)) return sendJson(res, 403, { error: 'Você não está nesta sala.' })
    const member = room.members.get(clientId)!
    keepMember(room, clientId)
    if (req.method === 'GET' && !action) return sendJson(res, 200, snapshot(room))
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Operação não permitida.' })
    if (action === 'leave') {
      removeMember(room, clientId)
      return sendJson(res, 200, { ok: true })
    }
    if (action === 'start') {
      if (member.role !== 'master') return sendJson(res, 403, { error: 'Só o Mestre pode iniciar a aventura.' })
      if (![...room.members.values()].some(entry => entry.role === 'player')) return sendJson(res, 409, { error: 'Aguarde pelo menos um jogador.' })
      if (room.phase === 'lobby') {
        room.phase = 'game'
        addEvent(room, 'system', 'Sistema', 'A aventura começou!')
      }
      return sendJson(res, 200, snapshot(room))
    }
    if (room.phase !== 'game') return sendJson(res, 409, { error: 'A aventura ainda não começou.' })
    if (action === 'chat') {
      if (!validText(body?.text, 500)) return sendJson(res, 400, { error: 'Digite uma mensagem de até 500 caracteres.' })
      addEvent(room, 'chat', member.name, (body!.text as string).trim())
      return sendJson(res, 200, snapshot(room))
    }
    if (action === 'roll') {
      const sides = body?.sides
      if (typeof sides !== 'number' || !allowedDice.has(sides)) return sendJson(res, 400, { error: 'Dado inválido.' })
      addEvent(room, 'roll', member.name, `rolou 1d${sides}: ${randomInt(1, sides + 1)}`)
      return sendJson(res, 200, snapshot(room))
    }
    if (action === 'inventory') {
      if (member.role !== 'player') return sendJson(res, 403, { error: 'O Mestre não tem inventário.' })
      const item = member.items.find(entry => entry.id === body?.itemId)
      if (!item) return sendJson(res, 403, { error: 'Você só pode usar ou organizar seu próprio inventário.' })
      if (body?.op === 'use') {
        if (item.kind === 'potion') {
          if (member.hp >= 10) return sendJson(res, 409, { error: 'Seus PV já estão completos.' })
          const healed = Math.min(2, 10 - member.hp)
          member.hp += healed
          addEvent(room, 'system', member.name, `usou uma Poção e recuperou ${healed} PV.`)
        } else if (item.kind === 'sword') {
          addEvent(room, 'roll', member.name, `atacou com a Espada: 1d20 = ${randomInt(1, 21)}.`)
        } else if (item.kind === 'shield') {
          addEvent(room, 'roll', member.name, `ergueu o Escudo: defesa 1d20 = ${randomInt(1, 21)}.`)
        } else {
          addEvent(room, 'roll', member.name, `lançou o Pergaminho: magia 1d20 = ${randomInt(1, 21)}.`)
        }
        if (item.kind === 'potion' || item.kind === 'scroll') member.items = member.items.filter(entry => entry.id !== item.id)
        return sendJson(res, 200, snapshot(room))
      }
      if (body?.op !== 'move' && body?.op !== 'rotate') return sendJson(res, 400, { error: 'Movimento inválido.' })
      const candidate = { ...item }
      if (body.op === 'move') {
        if (!Number.isInteger(body.x) || !Number.isInteger(body.y)) return sendJson(res, 400, { error: 'Posição inválida.' })
        candidate.x = body.x as number
        candidate.y = body.y as number
      } else {
        candidate.width = item.height
        candidate.height = item.width
      }
      if (candidate.x < 0 || candidate.y < 0 || candidate.x + candidate.width > 6 || candidate.y + candidate.height > 6) return sendJson(res, 409, { error: 'O item não cabe nessa posição.' })
      if (member.items.some(other => other.id !== item.id && overlaps(candidate, other))) return sendJson(res, 409, { error: 'Esse espaço já está ocupado.' })
      Object.assign(item, candidate)
      return sendJson(res, 200, snapshot(room))
    }
    if (action === 'token') {
      if (member.role !== 'master') return sendJson(res, 403, { error: 'Só o Mestre pode mover tokens.' })
      const token = room.tokens.get(body?.tokenId as string)
      if (!token) return sendJson(res, 404, { error: 'Token não encontrado.' })
      if (body?.op === 'remove') {
        room.tokens.delete(token.id)
        room.assets.delete(token.assetId)
      } else if (body?.op === 'move') {
        if (typeof body.x !== 'number' || typeof body.y !== 'number' || !Number.isFinite(body.x) || !Number.isFinite(body.y) || body.x < 0 || body.x > 100 || body.y < 0 || body.y > 100) return sendJson(res, 400, { error: 'Posição inválida.' })
        token.x = body.x
        token.y = body.y
      } else return sendJson(res, 400, { error: 'Ação inválida.' })
      return sendJson(res, 200, snapshot(room))
    }
    if (action === 'hp') {
      const target = room.members.get(body?.targetId as string)
      const hp = body?.hp
      if (!target || typeof hp !== 'number' || !Number.isInteger(hp) || hp < 0 || hp > 10) return sendJson(res, 400, { error: 'Pontos de vida inválidos.' })
      if (member.role !== 'master' && (member.id !== target.id || hp > target.hp)) return sendJson(res, 403, { error: 'Você não pode alterar este personagem.' })
      target.hp = hp
      return sendJson(res, 200, snapshot(room))
    }
    return sendJson(res, 405, { error: 'Operação não permitida.' })
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : 'Não foi possível processar a solicitação.' })
  }
}

export function lobbyServer(): Plugin {
  return {
    name: 'lacucu-lobby-server',
    configureServer(server) { server.middlewares.use(roomMiddleware) },
  }
}
