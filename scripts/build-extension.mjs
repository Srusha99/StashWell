import {
  readdirSync,
  statSync,
  renameSync,
  readFileSync,
  writeFileSync,
  existsSync,
  cpSync,
  rmSync,
  mkdirSync,
} from "node:fs"
import { join, dirname, relative, sep } from "node:path"

const OUT_DIR = join(process.cwd(), "out")
const PUBLIC_DIR = join(process.cwd(), "public")

const TEXT_EXTENSIONS = new Set([".html", ".js", ".css", ".txt", ".json", ".map"])

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      walk(fullPath, files)
    } else {
      files.push(fullPath)
    }
  }
  return files
}

// On Windows, cloud-sync clients (OneDrive, etc.) can briefly hold a lock on
// a folder right after it's written, making renameSync fail with a transient
// EPERM/EBUSY even though nothing is actually wrong. Retry with backoff
// instead of failing the whole build on what's usually a timing issue.
function renameNextFolder(retries = 5, delayMs = 300) {
  const oldDir = join(OUT_DIR, "_next")
  const newDir = join(OUT_DIR, "next")

  if (!existsSync(oldDir)) {
    console.log("No out/_next folder found, skipping rename.")
    return
  }

  if (existsSync(newDir)) {
    rmSync(newDir, { recursive: true, force: true })
  }

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      renameSync(oldDir, newDir)
      console.log("Renamed out/_next -> out/next")
      return
    } catch (error) {
      const transient = error && (error.code === "EPERM" || error.code === "EBUSY")
      if (!transient || attempt === retries) {
        throw error
      }
      console.log(`Rename locked (${error.code}), retrying... (${attempt}/${retries})`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs)
    }
  }
}

function rewriteNextReferences() {
  const files = walk(OUT_DIR).filter((file) => TEXT_EXTENSIONS.has(file.slice(file.lastIndexOf("."))))

  let changedCount = 0
  for (const file of files) {
    const original = readFileSync(file, "utf8")
    const updated = original.replaceAll("_next/", "next/")

    if (updated !== original) {
      writeFileSync(file, updated, "utf8")
      changedCount += 1
    }
  }

  console.log(`Rewrote _next/ -> next/ references in ${changedCount} file(s).`)
}

function copyManifest() {
  cpSync(join(PUBLIC_DIR, "manifest.json"), join(OUT_DIR, "manifest.json"))
  console.log("Copied manifest.json into out/")
}

// Chrome refuses to load an extension containing ANY file or directory whose
// name starts with "_" (not just "_next") — Next's export also emits
// "_not-found/" and "__next.*.txt" RSC prefetch payloads, none of which the
// single-page popup ever requests, so they're removed rather than renamed.
function removeUnderscorePrefixedEntries(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)

    if (entry.startsWith("_")) {
      rmSync(fullPath, { recursive: true, force: true })
      console.log(`Removed reserved entry: ${fullPath.slice(OUT_DIR.length + 1)}`)
      continue
    }

    if (statSync(fullPath).isDirectory()) {
      removeUnderscorePrefixedEntries(fullPath)
    }
  }
}

// Manifest V3 extension pages get a locked-down `script-src 'self'` CSP that
// cannot be relaxed — Chrome silently drops every inline <script> (the
// next-themes no-flash script and the self.__next_f.push(...) RSC hydration
// payloads Next's static export inlines), so React never hydrates and no
// client component ever mounts. Moving each inline script to an external
// file (same document position, no async/defer) keeps them CSP-legal while
// preserving the synchronous execution order the RSC stream relies on.
const INLINE_SCRIPT_RE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g

function externalizeInlineScripts() {
  const inlineDir = join(OUT_DIR, "next", "static", "inline")
  mkdirSync(inlineDir, { recursive: true })

  const htmlFiles = walk(OUT_DIR).filter((file) => file.endsWith(".html"))
  let extractedCount = 0

  for (const htmlFile of htmlFiles) {
    const htmlDir = dirname(htmlFile)
    const pageSlug = relative(OUT_DIR, htmlFile).replace(/\.html$/, "").split(sep).filter(Boolean).join("-") || "root"
    let index = 0

    const rewritten = readFileSync(htmlFile, "utf8").replace(INLINE_SCRIPT_RE, (match, body) => {
      if (!body.trim()) return match

      index += 1
      const scriptPath = join(inlineDir, `${pageSlug}-${index}.js`)
      writeFileSync(scriptPath, body, "utf8")

      const href = relative(htmlDir, scriptPath).split(sep).join("/")
      extractedCount += 1
      return `<script src="${href}"></script>`
    })

    writeFileSync(htmlFile, rewritten, "utf8")
  }

  console.log(`Externalized ${extractedCount} inline script(s) across ${htmlFiles.length} HTML file(s).`)
}

renameNextFolder()
rewriteNextReferences()
copyManifest()
removeUnderscorePrefixedEntries(OUT_DIR)
externalizeInlineScripts()
