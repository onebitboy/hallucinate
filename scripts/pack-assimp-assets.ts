import assimpjs from 'assimpjs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

const publicDirectory = 'public'
const packedDirectory = join(publicDirectory, 'packed')

const input = process.argv.slice(2)
const files = input.length > 0 ? input : await fbxFiles()
const assimp = await assimpjs({
  locateFile(path) {
    return path.endsWith('.wasm') ? join(publicDirectory, 'assimpjs.wasm') : path
  },
})

await mkdir(packedDirectory, { recursive: true })

for (const file of files) {
  const source = file.startsWith(publicDirectory + '/') ? file : join(publicDirectory, file)
  const name = basename(source)
  const output = join(packedDirectory, name.replace(/\.fbx$/i, '.json'))
  const list = new assimp.FileList()

  list.AddFile(name, new Uint8Array(await readFile(source)))
  const result = assimp.ConvertFileList(list, 'assjson')

  if (!result.IsSuccess() || result.FileCount() === 0) {
    throw new Error(`Assimp failed to convert ${source}: ${result.GetErrorCode()}`)
  }

  await writeFile(output, new TextDecoder().decode(result.GetFile(0).GetContent()))
  console.log(`${source} -> ${output}`)
}

async function fbxFiles() {
  const entries = await readdir(publicDirectory)

  return entries.filter(file => file.endsWith('.fbx')).sort()
}
