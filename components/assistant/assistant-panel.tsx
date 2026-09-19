"use client"

import * as React from "react"
import { AnimatePresence, motion } from "motion/react"

import type { MessageAction, ThreadMessage } from "@/lib/assistant/thread"
import type { ComposeMode } from "@/hooks/use-assistant"
import { getShortGreeting } from "@/lib/greeting"
import { AIChatCard } from "@/components/spectrumui/ai-chat-card"
import { VoicePoweredOrb } from "@/components/VoicePoweredOrb"

/**
 * The assistant, as a floating card that grows out of its launcher.
 *
 * Deliberately not a Dialog: it used to be a right-docked DialogPrimitive.Popup,
 * which meant fighting two Base UI behaviours - the hardcoded full-viewport
 * overlay inside DialogContent, and `modal={false}` dismissing on every outside
 * press (which needed `disablePointerDismissal`). A plain positioned div has no
 * dismiss behaviour to suppress, so clicks on the dashboard behind it just work.
 * Only Escape and initial focus were worth re-adding.
 *
 * Sized by its parent, which is the same bottom-anchored flex column as the
 * launcher buttons - so it floats above them with no hand-tuned offset to drift
 * out of sync if another button is added.
 */
export function AssistantPanel({
  open,
  onOpenChange,
  messages,
  draft,
  onDraftChange,
  onSend,
  onUndo,
  onClear,
  greetingName,
  mode,
  onModeChange,
  findReminderDueAt,
  onSetReminderTime,
  awaitingTimeId,
  onAwaitingTimeHandled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  messages: ThreadMessage[]
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  onUndo: (action: MessageAction) => void
  onClear: () => void
  greetingName: string
  mode: ComposeMode
  onModeChange: (mode: ComposeMode) => void
  findReminderDueAt: (id: string) => string
  onSetReminderTime: (id: string, dueAt: string) => void
  /** Id of a reminder just created with no time of its own - see the effect below. */
  awaitingTimeId: string | null
  onAwaitingTimeHandled: () => void
}) {
  // A deterministic parser (or a "Reminder" mode send) will occasionally leave
  // a reminder with no time of its own, so every such confirmation offers a way
  // to set one without retyping.
  const [pickerTarget, setPickerTarget] = React.useState<string | null>(null)

  // "Remind me to call mom" has a title but no time - the assistant creates the
  // reminder anyway and asks for a time, then pops the picker open itself instead
  // of making the user hunt for "Change time".
  React.useEffect(() => {
    if (!awaitingTimeId) return
    setPickerTarget(awaitingTimeId)
    onAwaitingTimeHandled()
  }, [awaitingTimeId, onAwaitingTimeHandled])

  // The card fully unmounts on close, so any picker state left over from this
  // session would otherwise reopen mid-air the next time it's opened.
  React.useEffect(() => {
    if (!open) setPickerTarget(null)
  }, [open])

  // Escape closes the card. Skipped while the picker is open, so one press closes
  // the picker only.
  React.useEffect(() => {
    if (!open || pickerTarget !== null) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, pickerTarget, onOpenChange])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="assistant-card"
          initial={{ opacity: 0, scale: 0.6, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 16 }}
          transition={{ type: "spring", bounce: 0.28, duration: 0.42 }}
          // The launcher sits just below the card's bottom-right corner, so
          // scaling from that corner reads as the card emerging from the button.
          style={{ transformOrigin: "bottom right" }}
        >
          <AssistantCard
            messages={messages}
            draft={draft}
            onDraftChange={onDraftChange}
            onSend={onSend}
            onUndo={onUndo}
            onClear={onClear}
            greetingName={greetingName}
            mode={mode}
            onModeChange={onModeChange}
            onChangeTime={setPickerTarget}
            picker={
              pickerTarget
                ? {
                    value: findReminderDueAt(pickerTarget),
                    onChange: (next: string) => onSetReminderTime(pickerTarget, next),
                    onClose: () => setPickerTarget(null),
                  }
                : null
            }
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Split out so it only mounts while open. That's what keeps the clock read below
 * out of the prerendered HTML, where it would be a hydration mismatch.
 */
function AssistantCard({
  messages,
  draft,
  onDraftChange,
  onSend,
  onUndo,
  onClear,
  greetingName,
  mode,
  onModeChange,
  onChangeTime,
  picker,
}: {
  messages: ThreadMessage[]
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  onUndo: (action: MessageAction) => void
  onClear: () => void
  greetingName: string
  mode: ComposeMode
  onModeChange: (mode: ComposeMode) => void
  onChangeTime: (reminderId: string) => void
  picker: { value: string; onChange: (value: string) => void; onClose: () => void } | null
}) {
  const greeting = getShortGreeting(new Date().getHours(), greetingName)

  return (
    <AIChatCard
      // Half the previous area (360x520 -> 260x372). A literal halving of each
      // side would be 180px wide, which can't hold the header's title plus its
      // button, or the composer's two 30px controls.
      className="h-[372px] max-h-[calc(100vh-7rem)] w-[260px]"
      title="Assistant"
      subtitle="Reminders and notes"
      greeting={greeting}
      prompt="Tell me what you need and I'll sort it into a reminder or a note."
      icon={
        <div className="h-full w-full overflow-hidden rounded-[12px]">
          <VoicePoweredOrb enableVoiceControl={false} />
        </div>
      }
      // The registry component types example prompts into the composer's
      // placeholder on a loop. Turned off so the field starts genuinely blank.
      autoType={false}
      placeholder=""
      messages={messages}
      draft={draft}
      onDraftChange={onDraftChange}
      onSend={onSend}
      onReset={onClear}
      onUndo={onUndo}
      onChangeTime={onChangeTime}
      mode={mode}
      onModeChange={onModeChange}
      picker={picker}
    />
  )
}
