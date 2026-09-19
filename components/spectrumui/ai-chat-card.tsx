"use client";

import * as React from "react";
import { motion, useInView } from "motion/react";
import {
  AlarmClock,
  ArrowUp,
  CalendarClock,
  MessageCircleDashed,
  Plus,
  RefreshCw,
  StickyNote,
  Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { ComposeMode } from "@/hooks/use-assistant";

import { useTypewriter } from "@/components/spectrumui/use-typewriter";
import { InlineDateTimePicker } from "@/components/dashboard/inline-date-time-picker";

/**
 * Extended from the spectrumui registry component.
 *
 * As shipped it was an empty-state card only: a header, a greeting, and a
 * composer that typed sample prompts on a loop - no message list and no
 * `messages` prop, because it's a landing-page piece. Since installed shadcn code
 * is ours to own, it now also renders a transcript and per-message actions, and
 * its composer is controlled from outside so a half-typed draft survives closing.
 *
 * The design language is the registry's - the same shadow pair, the same header
 * layout, the same pill buttons and composer well - with radii, type and padding
 * stepped down one notch so it reads correctly at 260px rather than 360px.
 */

export interface AIChatCardMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Renders Undo, and Change time when the action created a reminder. */
  action?: { kind: "reminder" | "note"; id: string; undone?: boolean };
}

export interface AIChatCardProps {
  title?: string;
  subtitle?: string;
  greeting?: string;
  prompt?: string;
  /** Sample prompts. Typed out on a loop while the transcript is empty. */
  prompts?: string[];
  /** Turn the prompt-typing animation off. */
  autoType?: boolean;
  placeholder?: string;
  icon?: React.ReactNode;
  /** Transcript. Empty renders the animated empty state. */
  messages?: AIChatCardMessage[];
  /** Shows a "thinking" bubble after the last message. */
  pending?: boolean;
  /** Controlled composer value, held by the caller so it outlives unmounting. */
  draft?: string;
  onDraftChange?: (value: string) => void;
  onSend?: (message: string) => void;
  onReset?: () => void;
  onUndo?: (action: NonNullable<AIChatCardMessage["action"]>) => void;
  onChangeTime?: (reminderId: string) => void;
  /** Which of the two mode buttons (if any) is armed for the next send. */
  mode?: ComposeMode;
  onModeChange?: (mode: ComposeMode) => void;
  /**
   * Non-null while a reminder's time is being picked. Rendered in place of the
   * mode buttons and composer, rather than a centered modal, so it stays
   * inside the card.
   */
  picker?: { value: string; onChange: (value: string) => void; onClose: () => void } | null;
  className?: string;
}

const DEFAULT_PROMPTS = [
  "remind me at 12 that I have a meeting with Bob",
  "remind me in 20 minutes to check the oven",
  "every Monday at 9 send the report",
  "note: wifi password is hunter2",
  "what's on today?",
];

export function AIChatCard({
  title = "New Chat",
  subtitle = "How can I help you today?",
  greeting = "Hello!",
  prompt = "Tell me what you need and I'll sort it into a reminder or a note.",
  prompts = DEFAULT_PROMPTS,
  autoType = true,
  placeholder = "Remind me to…",
  icon,
  messages = [],
  pending = false,
  draft = "",
  onDraftChange,
  onSend,
  onReset,
  onUndo,
  onChangeTime,
  mode = null,
  onModeChange,
  picker = null,
  className,
}: AIChatCardProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { margin: "-10% 0px" });

  const [spins, setSpins] = React.useState(0);
  const hasMessages = messages.length > 0;

  // Only animate sample prompts on an empty transcript with nothing typed.
  const { text: typedMessage } = useTypewriter(prompts, {
    typeMs: 48,
    deleteMs: 14,
    holdMs: 3400,
    gapMs: 900,
    enabled: autoType && inView && !hasMessages && draft.length === 0,
  });

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex w-full flex-col rounded-[20px] bg-white",
        "shadow-[0_0_16.4px_1px_rgba(10,10,10,0.05),0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)]",
        "dark:bg-neutral-950 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_1px_3px_0_rgba(0,0,0,0.5)]",
        className,
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] leading-5 font-medium text-foreground">
            {title}
          </h3>
          <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <motion.button
          type="button"
          onClick={() => {
            setSpins((count) => count + 1);
            onReset?.();
          }}
          whileTap={{ scale: 0.9 }}
          aria-label="Clear conversation"
          title="Clear conversation"
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[14px] border border-border bg-white text-muted-foreground transition-colors hover:text-foreground dark:bg-neutral-950"
        >
          <motion.span
            animate={{ rotate: spins * 360 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.7 }}
            className="flex"
          >
            <RefreshCw className="h-4 w-4" />
          </motion.span>
        </motion.button>
      </div>

      {hasMessages ? (
        <Transcript
          messages={messages}
          pending={pending}
          onUndo={onUndo}
          onChangeTime={onChangeTime}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-6 text-center">
          <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="flex h-8 w-8 items-center justify-center rounded-[12px] bg-neutral-100 dark:bg-neutral-900"
          >
            {icon ?? <MessageCircleDashed className="h-4 w-4 text-foreground" />}
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
            className="mt-3 text-[15px] leading-6 font-medium tracking-[-0.3px] text-foreground"
          >
            {greeting}
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25, ease: "easeOut" }}
            className="mt-1 max-w-[200px] text-[11px] leading-4 text-muted-foreground"
          >
            {prompt}
          </motion.p>
        </div>
      )}

      {picker ? (
        <InlineDateTimePicker
          value={picker.value}
          onChange={picker.onChange}
          onClose={picker.onClose}
        />
      ) : (
        <>
          <ModeToggle mode={mode} onModeChange={onModeChange} />
          <Composer
            draft={draft}
            onDraftChange={onDraftChange}
            onSend={onSend}
            placeholder={!hasMessages && typedMessage ? typedMessage : placeholder}
            onInsertExample={() => {
              setSpins((count) => count + 1);
              onDraftChange?.(prompts[spins % prompts.length]);
            }}
          />
        </>
      )}
    </div>
  );
}

/**
 * Two side-by-side pills that pin the meaning of the next send: "Note" saves
 * whatever is typed verbatim as a note, "Reminder" saves it verbatim as a
 * reminder's title and always asks for a time afterward - see useAssistant's
 * `send(text, mode)`. Clicking the already-active pill deselects it, falling
 * back to the free-text grammar.
 */
function ModeToggle({
  mode,
  onModeChange,
}: {
  mode: ComposeMode;
  onModeChange?: (mode: ComposeMode) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1.5 px-4 pb-2">
      {(
        [
          { value: "note" as const, label: "Note", Icon: StickyNote },
          { value: "reminder" as const, label: "Reminder", Icon: AlarmClock },
        ]
      ).map(({ value, label, Icon }) => {
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => onModeChange?.(active ? null : value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-[10px] py-1.5 text-[11px] font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-neutral-100 text-muted-foreground hover:text-foreground dark:bg-neutral-900",
            )}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The input pill: a leading "insert example" button, an auto-resizing textarea,
 * and a trailing send button, all in one row.
 *
 * Adapted from a pasted ChatGPT-style input design rather than copied whole: the
 * source had a `figma:react` import (a Figma-only virtual module, not real
 * outside its export tool) and built several class names by string-interpolating
 * a prop into the middle of them - e.g. `` `bg-white/${bgOpacityValue}` `` and
 * `` `text-[${textColor}]` ``. Tailwind finds class names by scanning source text
 * for literal strings, not by running the code, so a name assembled at runtime
 * never gets generated - those effects would have silently never rendered. The
 * glow here uses this app's own `ring`/`primary` tokens (the exact focus style
 * `input.tsx` already uses) instead of hardcoded purple/pink/blue, and the ripple
 * is self-contained - the source's `ChatInputContext` was never actually read by
 * any of its child components, just an unused provider wrapping nothing.
 */
function Composer({
  draft,
  onDraftChange,
  onSend,
  placeholder,
  onInsertExample,
}: {
  draft: string;
  onDraftChange?: (value: string) => void;
  onSend?: (message: string) => void;
  placeholder: string;
  onInsertExample: () => void;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [ripples, setRipples] = React.useState<{ x: number; y: number; id: number }[]>([]);

  // Grows with content up to 3 lines, then scrolls internally - the registry's
  // fixed rows={2} couldn't show a reminder title that wrapped.
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 18 * 3 + 8;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [draft]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter is a newline. Escape is left to the caller, which
    // closes the card - the draft survives because it lives outside.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (draft.trim()) onSend?.(draft);
    }
  }

  function addRipple(event: React.MouseEvent<HTMLDivElement>) {
    // Capped at 4 concurrent: a rapid double-click shouldn't pile up timers.
    if (ripples.length >= 4) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ripple = { x: event.clientX - rect.left, y: event.clientY - rect.top, id: Date.now() };
    setRipples((current) => [...current, ripple]);
    setTimeout(() => {
      setRipples((current) => current.filter((r) => r.id !== ripple.id));
    }, 600);
  }

  return (
    <div className="shrink-0 px-4 pb-4">
      <div
        onMouseDown={addRipple}
        className="relative flex items-end gap-1 overflow-hidden rounded-[16px] border border-transparent bg-neutral-200/50 py-1 pl-1 pr-1.5 transition-colors focus-within:border-ring focus-within:bg-neutral-200/70 focus-within:ring-3 focus-within:ring-ring/50 dark:bg-neutral-800/50 dark:focus-within:bg-neutral-800/70"
      >
        {ripples.map((ripple) => (
          // box-shadow-free, so overflow-hidden on this same element clips it
          // cleanly without also clipping the focus ring above (a ring is a
          // self box-shadow, which an element's own overflow never clips).
          <span
            key={ripple.id}
            aria-hidden
            className="pointer-events-none absolute block size-10 rounded-full bg-primary/20"
            style={{ left: ripple.x - 20, top: ripple.y - 20 }}
          >
            <span className="block size-full animate-ping rounded-full bg-primary/25" />
          </span>
        ))}

        <button
          type="button"
          onClick={onInsertExample}
          aria-label="Insert an example"
          title="Insert an example"
          className="relative z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => onDraftChange?.(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          autoFocus
          aria-label="Message the assistant"
          className="relative z-10 min-h-[26px] flex-1 resize-none bg-transparent px-1 py-1 text-[12px] leading-[18px] text-foreground outline-hidden placeholder:text-muted-foreground"
        />

        <button
          type="button"
          onClick={() => draft.trim() && onSend?.(draft)}
          disabled={!draft.trim()}
          aria-label="Send message"
          className="relative z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-black text-white transition-transform enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-40 dark:bg-white dark:text-neutral-950"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function Transcript({
  messages,
  pending,
  onUndo,
  onChangeTime,
}: {
  messages: AIChatCardMessage[];
  pending: boolean;
  onUndo?: (action: NonNullable<AIChatCardMessage["action"]>) => void;
  onChangeTime?: (reminderId: string) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Keyed on `pending` too, or the thinking bubble appears below the fold.
  React.useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length, pending]);

  return (
    <div
      ref={scrollRef}
      // role="log" so a reply is announced while the card is already open.
      role="log"
      aria-live="polite"
      aria-busy={pending}
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3"
    >
      {messages.map((message) => {
        const isUser = message.role === "user";
        const action = message.action;
        return (
          <div
            key={message.id}
            className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}
          >
            <div
              className={cn(
                "max-w-[88%] rounded-[12px] px-2.5 py-1.5 text-[12px] leading-4 whitespace-pre-line",
                isUser
                  ? "bg-black text-white dark:bg-white dark:text-neutral-950"
                  : "bg-neutral-100 text-foreground dark:bg-neutral-900",
              )}
            >
              {message.text}
            </div>

            {action && !action.undone && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onUndo?.(action)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Undo2 className="h-2.5 w-2.5" /> Undo
                </button>
                {action.kind === "reminder" && (
                  <button
                    type="button"
                    onClick={() => onChangeTime?.(action.id)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <CalendarClock className="h-2.5 w-2.5" /> Change time
                  </button>
                )}
              </div>
            )}
            {action?.undone && (
              <span className="text-[11px] text-muted-foreground/70">Undone</span>
            )}
          </div>
        );
      })}

      {pending && (
        <div className="flex items-start">
          <div className="rounded-[12px] bg-neutral-100 px-2.5 py-1.5 dark:bg-neutral-900">
            <motion.span
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="text-[12px] leading-4 text-muted-foreground"
            >
              Thinking…
            </motion.span>
          </div>
        </div>
      )}
    </div>
  );
}
