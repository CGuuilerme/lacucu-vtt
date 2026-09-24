import { randomInt, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

type Role = 'master' | 'player'
type Member = { id: string; name: string; role: Role; hp: number }
type GameEvent = { id: string; kind: 'chat' | 'roll' | 'system'; name: string; text: string; time: number }
type Room = {
  code: string
  campaignName: string
  phase: 'lobby' | 'game'
  members: Map<string, Member>
  events: GameEvent[]
  expiryTimers: Map<string, ReturnType<typeof setTimeout>>
}

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const rooms = new Map<string, Room>()
const allowedDice = new Set([4, 6, 8, 10, 12, 20, 100])

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

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = ''
  for await (const chunk of req) {
    body += chunk.toString()
    if (body.length > 4096) throw new Error('Dados da solicitação muito grandes.')
  }
  try {
    const parsed: unknown = JSON.parse(body)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    return parsed as Record<string, unknown>
  } catch {
    throw new Error('Dados inválidos.')
  }
}

function validText(value: unknown, max: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
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
            do {
              code = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join('')
            } while (rooms.has(code))
            const room: Room = {
              code,
              campaignName: (body.campaignName as string).trim(),
              phase: 'lobby',
              members: new Map(),
              events: [],
              expiryTimers: new Map(),
            }
            const id = body.clientId as string
            room.members.set(id, { id, name: (body.masterName as string).trim(), role: 'master', hp: 10 })
            rooms.set(code, room)
            keepMember(room, id)
            return sendJson(res, 201, snapshot(room))
          }

          const roomMatch = /^\/api\/rooms\/([A-Z0-9]{5})(?:\/(join|leave|start|chat|roll|hp))?$/.exec(url.pathname)
          if (!roomMatch) return sendJson(res, 404, { error: 'Sala não encontrada.' })
          const [, code, action] = roomMatch
          const room = rooms.get(code)
          if (!room) return sendJson(res, 404, { error: 'Código inválido ou sala encerrada.' })
          const body = req.method === 'POST' ? await readJson(req) : null

          if (req.method === 'POST' && action === 'join') {
            if (!validText(body?.playerName, 30) || !validText(body?.clientId, 100)) {
              return sendJson(res, 400, { error: 'Informe seu nome para entrar.' })
            }
            const id = body!.clientId as string
            const existing = room.members.get(id)
            if (!existing && room.phase === 'game') return sendJson(res, 409, { error: 'A aventura já começou.' })
            if (!existing && [...room.members.values()].filter(member => member.role === 'player').length >= 3) {
              return sendJson(res, 409, { error: 'A sala já tem três jogadores.' })
            }
            if (!existing) room.members.set(id, { id, name: (body!.playerName as string).trim(), role: 'player', hp: 10 })
            keepMember(room, id)
            return sendJson(res, 200, snapshot(room))
          }

          const clientId = req.method === 'GET' ? url.searchParams.get('clientId') : body?.clientId
          if (typeof clientId !== 'string' || !room.members.has(clientId)) {
            return sendJson(res, 403, { error: 'Você não está nesta sala.' })
          }
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
            if (![...room.members.values()].some(entry => entry.role === 'player')) {
              return sendJson(res, 409, { error: 'Aguarde pelo menos um jogador.' })
            }
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
          if (action === 'hp') {
            const target = room.members.get(body?.targetId as string)
            const hp = body?.hp
            if (!target || typeof hp !== 'number' || !Number.isInteger(hp) || hp < 0 || hp > 10) {
              return sendJson(res, 400, { error: 'Pontos de vida inválidos.' })
            }
            if (member.role !== 'master' && (member.id !== target.id || hp > target.hp)) {
              return sendJson(res, 403, { error: 'Você não pode alterar este personagem.' })
            }
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
    configureServer(server) {
      server.middlewares.use(roomMiddleware)
    },
  }
}
