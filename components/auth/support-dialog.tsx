"use client"

import * as React from "react"
import {
  Bug,
  CircleCheck,
  CircleHelp,
  ImagePlus,
  Info,
  Lightbulb,
  Loader2,
  Monitor,
  Puzzle,
  Send,
  X,
  type LucideIcon,
} from "lucide-react"

import {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  type SupportAttachment,
  type SupportCategory,
  type SupportRole,
  type SupportTicketDraft,
  emptySupportTicketDraft,
  filterAttachments,
  formatBytes,
  readSystemInfo,
  submitSupportTicket,
  toSupportTicket,
} from "@/lib/support-ticket"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

// Empty until there's a real support inbox. While it is, the form shows no
// "mail us directly" line under the Send button.
const SUPPORT_EMAIL: string = ""

const CATEGORIES: {
  value: SupportCategory
  label: string
  icon: LucideIcon
  iconClassName: string
}[] = [
  {
    value: "bug",
    label: "Bug Report",
    icon: Bug,
    iconClassName: "text-red-500",
  },
  {
    value: "feature",
    label: "Feature Request",
    icon: Lightbulb,
    iconClassName: "text-amber-500",
  },
  {
    value: "question",
    label: "General Question / Help",
    icon: CircleHelp,
    iconClassName: "text-sky-500",
  },
]

const ROLES: { value: SupportRole; label: string }[] = [
  { value: "student", label: "Student" },
  { value: "developer", label: "Developer" },
  { value: "video-editor", label: "Video Editor" },
  { value: "other", label: "Other" },
]

function CategoryLabel({
  category,
}: {
  category: (typeof CATEGORIES)[number]
}) {
  return (
    <>
      <category.icon className={category.iconClassName} />
      {category.label}
    </>
  )
}

// What the category trigger shows once one is picked - icon included.
const CATEGORY_ITEMS = CATEGORIES.map((category) => ({
  value: category.value,
  label: <CategoryLabel category={category} />,
}))

type Status = "editing" | "sending" | "sent"

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  /** Small text on the right of the label, e.g. "Optional". */
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="flex items-baseline justify-between gap-2 text-xs font-medium text-muted-foreground"
      >
        {label}
        {hint && (
          <span className="text-[11px] font-normal opacity-70">{hint}</span>
        )}
      </label>
      {children}
    </div>
  )
}

function hasFiles(event: React.DragEvent) {
  return event.dataTransfer.types.includes("Files")
}

/**
 * Screenshot thumbnails plus a tile that opens the file picker. Drag and drop
 * and paste are handled by the whole form instead (see SupportDialog), so
 * `isDragging` is passed in to light the tile up as a drop target.
 */
function AttachmentPicker({
  attachments,
  isDragging,
  disabled,
  problem,
  onAdd,
  onRemove,
}: {
  attachments: SupportAttachment[]
  isDragging: boolean
  disabled: boolean
  problem: string | null
  onAdd: (files: File[]) => void
  onRemove: (id: string) => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const isEmpty = attachments.length === 0
  const isFull = attachments.length >= MAX_ATTACHMENTS
  const pasteShortcut = /Mac/.test(navigator.userAgent) ? "⌘V" : "Ctrl+V"

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept={ATTACHMENT_TYPES.join(",")}
        multiple
        hidden
        onChange={(event) => {
          onAdd(Array.from(event.target.files ?? []))
          event.target.value = ""
        }}
      />
      <div
        className={cn("grid gap-2", isEmpty ? "grid-cols-1" : "grid-cols-3")}
      >
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="relative aspect-video overflow-hidden rounded-lg border border-border bg-muted/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachment.previewUrl}
              alt={attachment.file.name}
              className="size-full object-cover"
            />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-3 pb-1 text-[10px] font-medium text-white">
              {formatBytes(attachment.file.size)}
            </span>
            <button
              type="button"
              aria-label={`Remove ${attachment.file.name}`}
              title="Remove"
              onClick={() => onRemove(attachment.id)}
              disabled={disabled}
              className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 disabled:pointer-events-none disabled:opacity-50"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}

        {!isFull && (
          <button
            id="support-attachments"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center transition-colors disabled:pointer-events-none disabled:opacity-50",
              isEmpty ? "px-3 py-4" : "aspect-video px-1",
              isDragging
                ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            )}
          >
            <ImagePlus className="size-5" />
            {isEmpty ? (
              <>
                <span className="text-xs font-medium">
                  Drop, paste ({pasteShortcut}) or click to add screenshots
                </span>
                <span className="text-[11px] opacity-70">
                  PNG, JPG, WEBP or GIF · up to{" "}
                  {formatBytes(MAX_ATTACHMENT_BYTES)} each
                </span>
              </>
            ) : (
              <span className="text-[11px] font-medium">Add more</span>
            )}
          </button>
        )}
      </div>
      {problem && (
        <p role="alert" className="text-[11px] text-destructive">
          {problem}
        </p>
      )}
    </div>
  )
}

function InfoBadge({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground dark:bg-white/5">
      <Icon className="size-3" />
      {label}: <span className="font-medium text-foreground">{value}</span>
    </span>
  )
}

/**
 * The account menu's Support item: a ticket form for bug reports, feature
 * requests and questions. Sending goes through submitSupportTicket in
 * lib/support-ticket.ts, which is a UI mock for now. The draft lives here
 * rather than in the popup, so closing the dialog by accident doesn't lose
 * it - it's only cleared once a ticket has been sent.
 */
export function SupportDialog({
  open,
  onOpenChange,
  defaultName,
  defaultEmail,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Prefilled from the signed-in account; the user can still change them. */
  defaultName: string
  defaultEmail: string
}) {
  const [draft, setDraft] = React.useState(() =>
    emptySupportTicketDraft(defaultName, defaultEmail)
  )
  const [systemInfo] = React.useState(readSystemInfo)
  const [status, setStatus] = React.useState<Status>("editing")
  const [error, setError] = React.useState<string | null>(null)
  const [attachmentProblem, setAttachmentProblem] = React.useState<
    string | null
  >(null)
  const [isDragging, setIsDragging] = React.useState(false)
  // dragenter/dragleave fire for every child element the pointer crosses, so
  // "still over the form" is a depth count rather than the last event seen.
  const dragDepth = React.useRef(0)
  const isSending = status === "sending"
  const ticket = toSupportTicket(draft, systemInfo)

  function update<K extends keyof SupportTicketDraft>(
    key: K,
    value: SupportTicketDraft[K]
  ) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function reset() {
    draft.attachments.forEach((attachment) =>
      URL.revokeObjectURL(attachment.previewUrl)
    )
    setDraft(emptySupportTicketDraft(defaultName, defaultEmail))
    setStatus("editing")
    setError(null)
    setAttachmentProblem(null)
  }

  function addAttachments(files: File[]) {
    if (isSending || files.length === 0) return
    const { accepted, problem } = filterAttachments(
      files,
      draft.attachments.length
    )
    setAttachmentProblem(problem)
    if (accepted.length === 0) return
    const added = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    update("attachments", [...draft.attachments, ...added])
  }

  function removeAttachment(id: string) {
    const removed = draft.attachments.find((attachment) => attachment.id === id)
    if (removed) URL.revokeObjectURL(removed.previewUrl)
    update(
      "attachments",
      draft.attachments.filter((attachment) => attachment.id !== id)
    )
    setAttachmentProblem(null)
  }

  // Screenshot tools (Win+Shift+S, ⌘⇧4 with Control) copy to the clipboard,
  // so pasting anywhere in the form attaches the image.
  function handlePaste(event: React.ClipboardEvent) {
    // Text wins: Word and Excel put a picture of the copied selection on the
    // clipboard next to its text, and pasting that text shouldn't attach it.
    if (event.clipboardData.getData("text/plain")) return
    const files = Array.from(event.clipboardData.files)
    if (files.length === 0) return
    event.preventDefault()
    addAttachments(files)
  }

  // The whole form is the drop target, so a screenshot dropped anywhere on
  // the dialog attaches rather than the browser navigating away to open it.
  function handleDragEnter(event: React.DragEvent) {
    if (!hasFiles(event)) return
    dragDepth.current += 1
    setIsDragging(true)
  }

  function handleDragLeave(event: React.DragEvent) {
    if (!hasFiles(event)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragging(false)
  }

  function handleDragOver(event: React.DragEvent) {
    if (!hasFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = isSending ? "none" : "copy"
  }

  function handleDrop(event: React.DragEvent) {
    if (!hasFiles(event)) return
    event.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)
    addAttachments(Array.from(event.dataTransfer.files))
  }

  function handleOpenChange(nextOpen: boolean) {
    // Closing mid-send would leave the user not knowing whether it went through.
    if (!nextOpen && isSending) return
    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!ticket) return

    setStatus("sending")
    setError(null)
    try {
      await submitSupportTicket(ticket)
      setStatus("sent")
    } catch (submitError) {
      console.error("[StashWell] Sending support ticket failed:", submitError)
      setError(
        "Couldn't send your ticket. Check your connection and try again."
      )
      setStatus("editing")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      // Reset only once the close animation is done, so the thank-you screen
      // doesn't flip back to an empty form while it fades out.
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen && status === "sent") reset()
      }}
    >
      <DialogContent
        showCloseButton={!isSending}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-2xl bg-popover/85 p-0 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:max-w-lg dark:bg-[#141414]/85 dark:shadow-[0_30px_60px_-12px_rgba(0,0,0,0.8)] dark:ring-white/10"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 size-56 -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl dark:bg-emerald-500/25"
        />

        {status === "sent" ? (
          <div className="relative flex flex-col items-center gap-3 px-6 pt-10 pb-6 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
              <CircleCheck className="size-7 text-emerald-500" />
            </div>
            <DialogTitle className="text-lg font-semibold">
              Thank you!
            </DialogTitle>
            {/* Drop "(UI Mock)" once submitSupportTicket really sends the ticket. */}
            <DialogDescription>
              Your ticket has been recorded (UI Mock).
            </DialogDescription>
            <div className="mt-3 flex w-full gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>
                Send another
              </Button>
              <Button
                className="flex-1"
                onClick={() => handleOpenChange(false)}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            onPaste={handlePaste}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="relative flex min-h-0 flex-1 flex-col"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-5 pb-4">
              <DialogHeader className="pr-8">
                <DialogTitle className="text-lg font-semibold tracking-tight">
                  Need Help or Have Feedback? 💬
                </DialogTitle>
                <DialogDescription>
                  Submit a bug, suggest a feature, or ask us anything.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Your Name" htmlFor="support-name" hint="Optional">
                  <Input
                    id="support-name"
                    autoComplete="name"
                    placeholder="Jane Doe"
                    value={draft.name}
                    onChange={(event) => update("name", event.target.value)}
                    maxLength={100}
                    disabled={isSending}
                  />
                </Field>
                <Field label="Your Email" htmlFor="support-email">
                  <Input
                    id="support-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={draft.email}
                    onChange={(event) => update("email", event.target.value)}
                    maxLength={254}
                    disabled={isSending}
                    required
                  />
                </Field>

                <Field
                  label="What describes you best?"
                  htmlFor="support-role"
                  hint="Optional"
                >
                  <Select
                    items={ROLES}
                    value={draft.role}
                    onValueChange={(value) => update("role", value)}
                    disabled={isSending}
                  >
                    <SelectTrigger id="support-role" className="w-full">
                      <SelectValue placeholder="Select one" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Category" htmlFor="support-category">
                  <Select
                    items={CATEGORY_ITEMS}
                    value={draft.category}
                    onValueChange={(value) => update("category", value)}
                    disabled={isSending}
                  >
                    <SelectTrigger id="support-category" className="w-full">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          <CategoryLabel category={category} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Subject" htmlFor="support-subject">
                <Input
                  id="support-subject"
                  placeholder="Brief summary of the issue/request"
                  value={draft.subject}
                  onChange={(event) => update("subject", event.target.value)}
                  maxLength={120}
                  disabled={isSending}
                  required
                />
              </Field>

              <Field label="Message" htmlFor="support-message">
                <Textarea
                  id="support-message"
                  placeholder="Detailed description..."
                  value={draft.message}
                  onChange={(event) => update("message", event.target.value)}
                  maxLength={5000}
                  disabled={isSending}
                  required
                  className="max-h-56 min-h-28"
                />
              </Field>

              <Field
                label="Screenshots"
                htmlFor="support-attachments"
                hint={
                  draft.attachments.length > 0
                    ? `${draft.attachments.length} of ${MAX_ATTACHMENTS}`
                    : "Optional"
                }
              >
                <AttachmentPicker
                  attachments={draft.attachments}
                  isDragging={isDragging}
                  disabled={isSending}
                  problem={attachmentProblem}
                  onAdd={addAttachments}
                  onRemove={removeAttachment}
                />
              </Field>

              <div className="flex flex-col gap-1.5">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Info className="size-3.5" /> Attached automatically
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <InfoBadge
                    icon={Puzzle}
                    label="Extension Version"
                    value={systemInfo.extensionVersion}
                  />
                  <InfoBadge
                    icon={Monitor}
                    label="Browser"
                    value={systemInfo.browser}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={!ticket || isSending}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(46,160,67,0.3)] transition duration-300 outline-none hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(46,160,67,0.4)] focus-visible:ring-3 focus-visible:ring-emerald-500/40 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none"
              >
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
                {isSending ? (
                  <Loader2 className="relative size-4 animate-spin" />
                ) : (
                  <Send className="relative size-4" />
                )}
                <span className="relative">
                  {isSending ? "Sending..." : "Send Ticket"}
                </span>
              </button>
              {SUPPORT_EMAIL && (
                <p className="text-center text-xs text-muted-foreground">
                  Or mail us directly at{" "}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </p>
              )}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
