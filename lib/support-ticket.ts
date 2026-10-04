/**
 * The Support dialog's data side (components/auth/support-dialog.tsx), kept
 * apart from the UI so a real backend only has to replace
 * submitSupportTicket - the dialog just needs it to resolve once the ticket
 * is recorded and throw if it wasn't.
 */

export type SupportCategory = "bug" | "feature" | "question"

export type SupportRole = "student" | "developer" | "video-editor" | "other"

/** Collected automatically and shown to the user before they send. */
export interface SystemInfo {
  extensionVersion: string
  /** e.g. "Chrome 141 / Windows". */
  browser: string
}

// Screenshot limits - a backend should enforce the same ones.
export const MAX_ATTACHMENTS = 3
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
export const ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]

/**
 * A screenshot picked in the form. `previewUrl` is an object URL for its
 * thumbnail: the dialog creates it when the file is added and revokes it
 * when the file is removed or the form is cleared.
 */
export interface SupportAttachment {
  id: string
  file: File
  previewUrl: string
}

/** What the form holds while it's being filled in. */
export interface SupportTicketDraft {
  name: string
  email: string
  role: SupportRole | null
  category: SupportCategory | null
  subject: string
  message: string
  attachments: SupportAttachment[]
}

/** A complete, trimmed ticket, ready to send. */
export interface SupportTicket {
  name: string
  email: string
  role: SupportRole | null
  category: SupportCategory
  subject: string
  message: string
  /** The raw image files, e.g. for a multipart upload. */
  attachments: File[]
  system: SystemInfo
}

export function emptySupportTicketDraft(
  name = "",
  email = ""
): SupportTicketDraft {
  return {
    name,
    email,
    role: null,
    category: null,
    subject: "",
    message: "",
    attachments: [],
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`
}

/**
 * Splits newly picked files into the ones that can be attached and, if some
 * can't, why - so the form can say so rather than dropping them silently.
 * `attachedCount` is how many are attached already.
 */
export function filterAttachments(
  files: File[],
  attachedCount: number
): { accepted: File[]; problem: string | null } {
  const accepted: File[] = []
  let problem: string | null = null
  for (const file of files) {
    if (!ATTACHMENT_TYPES.includes(file.type)) {
      problem = "Only PNG, JPG, WEBP or GIF images can be attached."
    } else if (file.size > MAX_ATTACHMENT_BYTES) {
      problem = `Each screenshot must be ${formatBytes(MAX_ATTACHMENT_BYTES)} or smaller.`
    } else if (attachedCount + accepted.length >= MAX_ATTACHMENTS) {
      problem = `You can attach up to ${MAX_ATTACHMENTS} screenshots.`
    } else {
      accepted.push(file)
    }
  }
  return { accepted, problem }
}

/** The finished ticket, or null while a required field is still empty. */
export function toSupportTicket(
  draft: SupportTicketDraft,
  system: SystemInfo
): SupportTicket | null {
  const email = draft.email.trim()
  const subject = draft.subject.trim()
  const message = draft.message.trim()
  if (!email || !draft.category || !subject || !message) return null
  return {
    name: draft.name.trim(),
    email,
    role: draft.role,
    category: draft.category,
    subject,
    message,
    attachments: draft.attachments.map((attachment) => attachment.file),
    system,
  }
}

export function readSystemInfo(): SystemInfo {
  return { extensionVersion: readExtensionVersion(), browser: readBrowser() }
}

function readExtensionVersion(): string {
  // chrome.runtime is missing under `next dev` and throws once the extension
  // has been reloaded under an open page.
  try {
    return chrome.runtime.getManifest().version
  } catch {
    return "Unknown"
  }
}

function readBrowser(): string {
  if (typeof navigator === "undefined") return "Unknown"
  const ua = navigator.userAgent

  // Edge's user agent also says Chrome, so it has to be checked first.
  const edgeMatch = /Edg\/(\d+)/.exec(ua)
  const chromeMatch = /Chrome\/(\d+)/.exec(ua)
  const browser = edgeMatch
    ? `Edge ${edgeMatch[1]}`
    : chromeMatch
      ? `Chrome ${chromeMatch[1]}`
      : "Unknown browser"

  const os = /Windows/.test(ua)
    ? "Windows"
    : /CrOS/.test(ua)
      ? "ChromeOS"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS"

  return `${browser} / ${os}`
}

/**
 * UI mock: waits a second and reports success without sending anything.
 * Replace the body with the real request when there's a backend.
 */
export async function submitSupportTicket(
  ticket: SupportTicket
): Promise<void> {
  void ticket
  await new Promise((resolve) => setTimeout(resolve, 1000))
}
