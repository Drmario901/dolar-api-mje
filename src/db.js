import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const dataDir = path.join(__dirname, '..', 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const dbPath = path.join(dataDir, 'rates.sqlite')

let sqliteDb = null
let saveToFile = () => {}

function createAdapter(nativeDb) {
  return {
    prepare(sql) {
      return {
        run(...params) {
          nativeDb.run(sql, params)
          saveToFile()
        },
        get(...params) {
          const stmt = nativeDb.prepare(sql)
          stmt.bind(params)
          const hasRow = stmt.step()
          if (!hasRow) {
            stmt.free()
            return null
          }
          const row = stmt.getAsObject()
          stmt.free()
          return row
        },
      }
    },
  }
}

let db = null

export async function initDb() {
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs()

  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath)
    sqliteDb = new SQL.Database(buf)
  } else {
    sqliteDb = new SQL.Database()
  }

  sqliteDb.run(`
    CREATE TABLE IF NOT EXISTS rate_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      currency TEXT NOT NULL,
      value REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      UNIQUE(source, currency, fetched_at)
    )
  `)
  sqliteDb.run(`
    CREATE INDEX IF NOT EXISTS idx_lookup
    ON rate_snapshots(source, currency, fetched_at)
  `)

  saveToFile = () => {
    const data = sqliteDb.export();
    fs.writeFileSync(dbPath, Buffer.from(data))
  }

  db = createAdapter(sqliteDb)
}

export function getDb() {
  if (!db) throw new Error('DB not initialized. Call initDb() first.')
  return db
}
