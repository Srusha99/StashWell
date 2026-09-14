"use client"

import * as React from "react"
import { Globe, RotateCcw, Upload } from "lucide-react"

import { type BookmarkNode, isFolder } from "@/hooks/use-bookmarks"
import { useCustomIcon } from "@/hooks/use-custom-icon"
import { readIconFile } from "@/lib/custom-icons"
import { faviconUrl } from "@/lib/favicon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type BookmarkFormMode = "create-bookmark" | "create-folder" | "edit"

export interface BookmarkFormValues {
  title: string
  url?: string
}

export function BookmarkFormDialog({
  mode,
  node,
  onOpenChange,
  onSubmit,
}: {
  mode: BookmarkFormMode | null
  node: BookmarkNode | null
  onOpenChange: (open: boolean) => void
  onSubmit: (values: BookmarkFormValues) => Promise<void>
}) {
  const isOpen = mode !== null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        {mode && (
          <BookmarkFormFields
            key={`${mode}-${node?.id ?? "new"}`}
            mode={mode}
            node={node}
            onClose={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function BookmarkFormFields({
  mode,
  node,
  onClose,
  onSubmit,
}: {
  mode: BookmarkFormMode
  node: BookmarkNode | null
  onClose: () => void
  onSubmit: (values: BookmarkFormValues) => Promise<void>
}) {
  const isEditingFolder = mode === "edit" && node ? isFolder(node) : mode === "create-folder"
  const showUrlField = !isEditingFolder
  const showIconField = mode === "edit" && node !== null && !isEditingFolder

  const [title, setTitle] = React.useState(mode === "edit" && node ? node.title : "")
  const [url, setUrl] = React.useState(mode === "edit" && node ? node.url ?? "" : "")
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [customIcon, setCustomIcon, clearCustomIcon] = useCustomIcon(
    showIconField ? node!.url ?? null : null
  )
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  async function handleIconChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const dataUrl = await readIconFile(file)
    setCustomIcon(dataUrl)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      await onSubmit({ title: title.trim(), url: showUrlField ? url.trim() : undefined })
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const heading =
    mode === "create-bookmark"
      ? "New bookmark"
      : mode === "create-folder"
        ? "New folder"
        : isEditingFolder
          ? "Rename folder"
          : "Edit bookmark"

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{heading}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-3 py-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="bookmark-title" className="text-xs font-medium text-muted-foreground">
            Name
          </label>
          <Input
            id="bookmark-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
            required
          />
        </div>

        {showUrlField && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bookmark-url" className="text-xs font-medium text-muted-foreground">
              URL
            </label>
            <Input
              id="bookmark-url"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
            />
          </div>
        )}

        {showIconField && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Icon</span>
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/[0.03] ring-1 ring-black/[0.06] dark:bg-white/5 dark:ring-white/10">
                {customIcon || (url && faviconUrl(url, 64)) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={customIcon || faviconUrl(url, 64)}
                    alt=""
                    className="size-full object-contain"
                  />
                ) : (
                  <Globe className="size-5 text-[#8e8e93] dark:text-white/40" />
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleIconChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload /> Upload icon
              </Button>
              {customIcon && (
                <Button type="button" variant="ghost" size="sm" onClick={clearCustomIcon}>
                  <RotateCcw /> Reset
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !title.trim()}>
          {isSubmitting ? "Saving..." : "Save"}
        </Button>
      </DialogFooter>
    </form>
  )
}
