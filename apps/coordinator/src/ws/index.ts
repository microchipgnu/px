import type { ServerWebSocket } from "bun"

type WSData = {
	id: string
	taskClasses?: string[]
}

const connections = new Map<string, ServerWebSocket<WSData>>()

export function addConnection(ws: ServerWebSocket<WSData>): void {
	connections.set(ws.data.id, ws)
}

export function removeConnection(ws: ServerWebSocket<WSData>): void {
	connections.delete(ws.data.id)
}

export function broadcast(event: string, data: unknown): void {
	const message = JSON.stringify({ event, data, timestamp: Date.now() })
	for (const ws of connections.values()) {
		ws.send(message)
	}
}

export function broadcastToSolvers(taskClass: string, event: string, data: unknown): void {
	const message = JSON.stringify({ event, data, timestamp: Date.now() })
	for (const ws of connections.values()) {
		const classes = ws.data.taskClasses
		if (classes && classes.includes(taskClass)) {
			ws.send(message)
		}
	}
}

export function getConnectionCount(): number {
	return connections.size
}
