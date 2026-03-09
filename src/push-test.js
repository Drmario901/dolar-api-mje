import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

import { sendBcvUpdatePush } from './onesignal.js'

console.log('Enviando push de prueba (sin depender del BCV)...\n')
const result = await sendBcvUpdatePush({})
console.log('\nResultado final:', JSON.stringify(result, null, 2))
process.exit(result.sent ? 0 : 1)
