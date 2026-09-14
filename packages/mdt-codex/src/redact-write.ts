/** Local atomic write (tmp + rename) so @mdt/codex stays dependency-light. */
import fs from 'node:fs'
import path from 'node:path'

export function atomicWriteFileSync(file: string, data: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, data)
  if (process.platform === 'win32' && fs.existsSync(file)) fs.unlinkSync(file)
  fs.renameSync(tmp, file)
}
