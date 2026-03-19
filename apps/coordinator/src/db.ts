import { Database } from "bun:sqlite"
import { existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"

const DB_PATH = process.env.DB_PATH

/**
 * Open a database. If DB_PATH is set, returns a persistent file-backed database.
 * Otherwise returns a fresh in-memory database (same behavior as Map-based Orderbook).
 */
export function openDatabase(): Database {
	if (DB_PATH) {
		const dir = dirname(DB_PATH)
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
		const db = new Database(DB_PATH)
		db.exec("PRAGMA journal_mode = WAL")
		db.exec("PRAGMA synchronous = NORMAL")
		return db
	}
	return new Database(":memory:")
}

/**
 * A Map-like class backed by SQLite. Drop-in replacement for Map<string, T>.
 */
export class SQLiteMap<T> {
	private stmtGet: ReturnType<Database["prepare"]>
	private stmtSet: ReturnType<Database["prepare"]>
	private stmtDel: ReturnType<Database["prepare"]>
	private stmtAll: ReturnType<Database["prepare"]>
	private stmtCount: ReturnType<Database["prepare"]>

	constructor(
		private db: Database,
		private table: string,
	) {
		db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`)
		this.stmtGet = db.prepare(`SELECT data FROM ${table} WHERE id = ?`)
		this.stmtSet = db.prepare(`INSERT OR REPLACE INTO ${table} (id, data) VALUES (?, ?)`)
		this.stmtDel = db.prepare(`DELETE FROM ${table} WHERE id = ?`)
		this.stmtAll = db.prepare(`SELECT id, data FROM ${table}`)
		this.stmtCount = db.prepare(`SELECT COUNT(*) as count FROM ${table}`)
	}

	get(key: string): T | undefined {
		const row = this.stmtGet.get(key) as { data: string } | null
		return row ? (JSON.parse(row.data) as T) : undefined
	}

	set(key: string, value: T): this {
		this.stmtSet.run(key, JSON.stringify(value))
		return this
	}

	has(key: string): boolean {
		return this.stmtGet.get(key) != null
	}

	delete(key: string): boolean {
		const result = this.stmtDel.run(key)
		return result.changes > 0
	}

	get size(): number {
		const row = this.stmtCount.get() as { count: number }
		return row.count
	}

	values(): IterableIterator<T> {
		const rows = this.stmtAll.all() as Array<{ id: string; data: string }>
		let i = 0
		return {
			next(): IteratorResult<T> {
				if (i >= rows.length) return { value: undefined, done: true }
				return { value: JSON.parse(rows[i++].data) as T, done: false }
			},
			[Symbol.iterator]() {
				return this
			},
		}
	}

	*entries(): IterableIterator<[string, T]> {
		const rows = this.stmtAll.all() as Array<{ id: string; data: string }>
		for (const row of rows) {
			yield [row.id, JSON.parse(row.data) as T]
		}
	}

	*[Symbol.iterator](): IterableIterator<[string, T]> {
		yield* this.entries()
	}
}
