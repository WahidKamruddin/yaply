import { writeFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverPath = resolve(__dirname, '../dist/server/server.js')

const { default: server } = await import(serverPath)
const res = await server.fetch(new Request('http://localhost/'))
const html = await res.text()

await writeFile(resolve(__dirname, '../dist/client/index.html'), html, 'utf8')
console.log('Generated dist/client/index.html')
