import sharp from "sharp"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const svgPath = join(ROOT, "public", "logo", "stashwell-logo.svg")
const svg = readFileSync(svgPath)

const MASTER_SIZE = 1024
let masterPngPromise
function getMasterPng() {
  if (!masterPngPromise) {
    masterPngPromise = sharp(svg, { density: 1536 })
      .resize(MASTER_SIZE, MASTER_SIZE)
      .png()
      .toBuffer()
  }
  return masterPngPromise
}

async function renderPng(size) {
  const master = await getMasterPng()
  return sharp(master).resize(size, size, { kernel: "lanczos3" }).png().toBuffer()
}

function buildIco(pngBuffers) {
  const count = pngBuffers.length
  const headerSize = 6
  const dirEntrySize = 16
  let offset = headerSize + dirEntrySize * count

  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)

  const dirEntries = []
  const imageDatas = []

  for (const { size, buffer } of pngBuffers) {
    const entry = Buffer.alloc(dirEntrySize)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(buffer.length, 8)
    entry.writeUInt32LE(offset, 12)
    dirEntries.push(entry)
    imageDatas.push(buffer)
    offset += buffer.length
  }

  return Buffer.concat([header, ...dirEntries, ...imageDatas])
}

async function main() {
  const extensionSizes = [16, 32, 48, 96, 128, 256, 512]
  for (const size of extensionSizes) {
    const buf = await renderPng(size)
    writeFileSync(join(ROOT, "public", "icons", `icon${size}.png`), buf)
    console.log(`Wrote public/icons/icon${size}.png`)
  }

  const icoSizes = [16, 32, 48]
  const icoBuffers = []
  for (const size of icoSizes) {
    icoBuffers.push({ size, buffer: await renderPng(size) })
  }
  const ico = buildIco(icoBuffers)
  writeFileSync(join(ROOT, "app", "favicon.ico"), ico)
  console.log("Wrote app/favicon.ico")

  const appleTouch = await renderPng(180)
  writeFileSync(join(ROOT, "public", "icons", "apple-touch-icon.png"), appleTouch)
  console.log("Wrote public/icons/apple-touch-icon.png")

  const largeSizes = [256, 512, 1024]
  for (const size of largeSizes) {
    const buf = await renderPng(size)
    writeFileSync(join(ROOT, "public", "logo", `stashwell-logo-${size}.png`), buf)
    console.log(`Wrote public/logo/stashwell-logo-${size}.png`)
  }
}

main()
