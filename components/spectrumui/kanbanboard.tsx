'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Clock, X } from 'lucide-react';

import {
  KanbanCard,
  KanbanPriority,
  KanbanStatus,
  PRIORITIES,
  STATUSES,
  hasStorageApi,
  readKanbanCards,
  subscribeToKanbanCards,
  updateKanbanCards,
} from '@/lib/kanban';
import { formatWhen, isDateOnly, parseDueAt } from '@/lib/dates';
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from '@/lib/gcal-service';
import { DateTimePicker } from '@/components/dashboard/date-time-picker';
import { useAppearanceSettings } from '@/hooks/use-appearance-settings';

const DEFAULT_PRIORITY: KanbanPriority = 'medium';

const COLUMN_COLOR: Record<KanbanStatus, string> = {
  todo: '#8B7355',
  'in-progress': '#6B8E23',
  done: '#556B2F',
};

export type KanbanBoardVariant = 'comfortable' | 'compact';

/**
 * Same board, two looks: the dashboard popover has room to breathe
 * ("comfortable"), the toolbar popup's floating window is a small fixed
 * window where that spacing just eats space ("compact"). Behavior (add,
 * edit, delete, drag, storage) never branches on this - only Tailwind
 * classes do, so both surfaces stay one implementation.
 */
const SIZES: Record<
  KanbanBoardVariant,
  {
    grid: string;
    column: string;
    header: string;
    dot: string;
    title: string;
    count: string;
    cardList: string;
  }
> = {
  comfortable: {
    grid: 'grid grid-cols-3 gap-4',
    column: 'min-w-0 rounded-2xl border border-border bg-white/20 p-3 backdrop-blur-xl dark:border-neutral-700/50 dark:bg-neutral-900/20',
    header: 'mb-3 flex items-center justify-between gap-2',
    dot: 'h-3 w-3 rounded-full',
    title: 'text-sm font-semibold text-neutral-900 dark:text-neutral-100',
    count: 'rounded-full bg-neutral-100/80 px-1.5 py-0.5 text-[11px] font-medium text-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-300',
    cardList: 'space-y-1.5',
  },
  compact: {
    grid: 'grid grid-cols-3 gap-2',
    column: 'min-w-0 rounded-xl border border-border bg-white/20 p-2 backdrop-blur-xl dark:border-neutral-700/50 dark:bg-neutral-900/20',
    header: 'mb-2 flex items-center justify-between gap-1.5',
    dot: 'h-2.5 w-2.5 rounded-full',
    title: 'text-xs font-semibold text-neutral-900 dark:text-neutral-100',
    count: 'rounded-full bg-neutral-100/80 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-300',
    cardList: 'space-y-1',
  },
};

const AUTOSIZE_CLASS =
  'w-full resize-none overflow-hidden rounded-lg border border-neutral-200/50 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-neutral-900 outline-none dark:border-neutral-700/50 dark:bg-neutral-800/80 dark:text-neutral-100';

// Goes through updateKanbanCards like every user edit does, so a calendar
// sync's result is applied to the latest stored cards and queued behind (not
// interleaved with) any edit already in flight - it can neither clobber that
// edit nor be clobbered by it.
async function patchCardAfterSync(cardId: string, patch: Partial<KanbanCard>): Promise<void> {
  let orphanedEventId: string | undefined;
  await updateKanbanCards((cards) => {
    const current = cards.find((c) => c.id === cardId);
    if (!current) {
      // The card was deleted locally while this calendar sync was still in
      // flight - the id we just learned about is now unreachable from local
      // state and would otherwise leak as an orphaned event on Google's side.
      orphanedEventId = patch.gcal_event_id;
      return cards;
    }
    if (patch.gcal_event_id && !current.dueAt) {
      // The due date was cleared (or never set) on this card while its
      // create/update sync was still in flight. Attaching the id now would
      // silently reattach a Calendar event to a card that shows no due date
      // anywhere in the UI, so delete the event we just synced instead of
      // storing its id.
      orphanedEventId = patch.gcal_event_id;
      return cards;
    }
    return cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c));
  });
  if (orphanedEventId) void syncDelete(orphanedEventId);
}

// Card ids with a createCalendarEvent request currently in flight. Without
// this, re-saving a card (even with an unrelated trivial edit) before its
// first sync's gcal_event_id has round-tripped back into storage still sees
// no gcal_event_id and fires a second, duplicate create for the same card.
const pendingCreates = new Set<string>();

async function syncCreate(card: KanbanCard): Promise<void> {
  if (pendingCreates.has(card.id)) return;
  pendingCreates.add(card.id);
  try {
    const result = await createCalendarEvent(card);
    await patchCardAfterSync(card.id, { gcal_event_id: result.id });
  } catch (error) {
    console.error('[StashWell] Failed to create Google Calendar event:', error);
  } finally {
    pendingCreates.delete(card.id);
  }
}

async function syncUpdate(eventId: string, card: KanbanCard): Promise<void> {
  try {
    await updateCalendarEvent(eventId, card);
  } catch (error) {
    console.error('[StashWell] Failed to update Google Calendar event:', error);
  }
}

async function syncDelete(eventId: string): Promise<void> {
  try {
    await deleteCalendarEvent(eventId);
  } catch (error) {
    console.error('[StashWell] Failed to delete Google Calendar event:', error);
  }
}

/**
 * Grows with its content as the user types, instead of scrolling a fixed
 * single-line box - a plain <input> stays one line while typing and only the
 * saved card wraps/grows, which reads as a size jump the moment you commit.
 * overflow-hidden above matters even though resize() keeps height in sync
 * with scrollHeight: right on mount (before fonts/layout fully settle) that
 * measurement can be off by a pixel or two, which is enough for the browser
 * to draw the textarea's own internal scrollbar for an instant.
 */
function AutosizeTextarea({
  value,
  onChange,
  onCommit,
  onCancel,
  placeholder,
  commitOnBlur = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  placeholder?: string;
  /** The edit-existing-card flow has no other controls to click, so blur
   * (clicking away) doubles as "save" there - default true keeps that.
   * The add-card flow below it has a priority picker and Save/Cancel
   * buttons sharing the same form, so blurring to click one of those must
   * NOT also fire a save; it passes false. */
  commitOnBlur?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  useEffect(() => {
    if (ref.current) resize(ref.current);
  }, [value]);

  return (
    <textarea
      ref={ref}
      autoFocus
      rows={1}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => resize(e.target)}
      onBlur={commitOnBlur ? onCommit : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onCommit();
        }
        if (e.key === 'Escape') onCancel();
      }}
      className={AUTOSIZE_CLASS}
    />
  );
}

/**
 * The title/description/priority editor - shared between creating a new
 * card and editing an existing one (clicking a saved card opens this same
 * form, pre-filled) so the two flows can't drift into different fields or
 * layouts.
 */
function CardForm({
  title,
  description,
  dueAt,
  priority,
  use24Hour,
  onTitleChange,
  onDescriptionChange,
  onDueAtChange,
  onPriorityChange,
  onCancel,
  onSave,
  saveLabel,
}: {
  title: string;
  description: string;
  dueAt: string;
  priority: KanbanPriority;
  use24Hour: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDueAtChange: (value: string) => void;
  onPriorityChange: (priority: KanbanPriority) => void;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const parsedDueAt = parseDueAt(dueAt);
  const dueAtIsAllDay = isDateOnly(dueAt);

  return (
    <div className="space-y-2 rounded-lg border border-blue-400/60 bg-white/70 p-2 dark:border-blue-500/60 dark:bg-neutral-800/70">
      <AutosizeTextarea
        value={title}
        placeholder="Task title"
        onChange={onTitleChange}
        onCommit={onSave}
        onCancel={onCancel}
        commitOnBlur={false}
      />

      {/* Optional - stored on the card but deliberately never rendered on
          the card face (see the card className further down, which only
          ever prints card.title). Keeps the compact card list from turning
          into a wall of text. */}
      <AutosizeTextarea
        value={description}
        placeholder="Description (optional)"
        onChange={onDescriptionChange}
        onCommit={onSave}
        onCancel={onCancel}
        commitOnBlur={false}
      />

      {/* Opens the shared calendar + wheel-style clock picker
          (components/dashboard/date-time-picker.tsx), so setting a card's
          time looks and behaves identically everywhere in the app rather
          than falling back to Chrome's native popup here. */}
      <div className="flex h-8 items-center gap-1.5 rounded-md border border-neutral-200/60 bg-white/80 px-2 dark:border-neutral-700/60 dark:bg-neutral-800/80">
        <CalendarDays className="size-3.5 shrink-0 text-neutral-400 dark:text-neutral-500" />
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-label={
            parsedDueAt
              ? `Change date and time (${formatWhen(parsedDueAt, new Date(), use24Hour, dueAtIsAllDay)})`
              : 'Set date and time'
          }
          className={`min-w-0 flex-1 truncate text-left text-xs font-medium ${
            parsedDueAt
              ? 'text-neutral-900 dark:text-neutral-100'
              : 'text-neutral-400 dark:text-neutral-500'
          }`}
        >
          {parsedDueAt ? formatWhen(parsedDueAt, new Date(), use24Hour, dueAtIsAllDay) : 'Set date (optional)'}
        </button>
        {parsedDueAt && (
          <button
            type="button"
            onClick={() => onDueAtChange('')}
            aria-label="Clear date"
            title="Clear date"
            className="shrink-0 text-neutral-400 transition-colors hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
          >
            <X className="size-3" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label="Open date and time picker"
          className="shrink-0 text-neutral-400 transition-colors hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
        >
          <Clock className="size-3.5" />
        </button>
      </div>

      <DateTimePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        value={dueAt}
        onChange={onDueAtChange}
        use24Hour={use24Hour}
      />

      <div className="space-y-1 rounded-md border border-neutral-200/60 bg-neutral-50/60 p-1.5 dark:border-neutral-700/60 dark:bg-neutral-900/40">
        <div className="px-0.5 text-[10px] font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
          Priority
        </div>
        {PRIORITIES.map(({ priority: p, label, color }) => {
          const selected = priority === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onPriorityChange(p)}
              className={`flex w-full items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                selected
                  ? 'border-current bg-current/10'
                  : 'border-neutral-200/60 text-neutral-600 hover:bg-white/80 dark:border-neutral-700/60 dark:text-neutral-300 dark:hover:bg-neutral-800/80'
              }`}
              style={selected ? { color } : undefined}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className={selected ? '' : 'text-neutral-900 dark:text-neutral-100'}>{label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md bg-neutral-100 px-2 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-200 dark:bg-neutral-700/60 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="flex-1 rounded-md bg-blue-500 px-2 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

export default function KanbanBoard({
  variant = 'comfortable',
  columnMinHeight,
}: {
  variant?: KanbanBoardVariant;
  /** Optional floor on each column's height, e.g. "220px" - unset (the
   * default) leaves columns exactly as tall as their content, which is what
   * the dashboard popover and floating window want. components/kanban/kanban-panel.tsx
   * is the one consumer that sets this, so its docked panel doesn't look
   * cramped when the board has few or no cards. */
  columnMinHeight?: string;
}) {
  const size = SIZES[variant];
  // Called here rather than threaded as a prop: this board renders in three
  // separate, unconnected trees (the dashboard popover, the floating OS
  // popup window, and the docked iframe panel - see kanban-board.tsx and
  // kanban-panel.tsx), two of which have no settings plumbing today. This
  // hook already reads/writes chrome.storage.local directly and live-syncs
  // across extension contexts on its own, so calling it independently here
  // keeps every instance in sync with zero prop drilling through those.
  const { settings } = useAppearanceSettings();
  const [cards, setCards] = useState<KanbanCard[] | null>(null);
  const [addingToStatus, setAddingToStatus] = useState<KanbanStatus | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftDueAt, setDraftDueAt] = useState('');
  const [draftPriority, setDraftPriority] = useState<KanbanPriority>(DEFAULT_PRIORITY);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editDraftTitle, setEditDraftTitle] = useState('');
  const [editDraftDescription, setEditDraftDescription] = useState('');
  const [editDraftDueAt, setEditDraftDueAt] = useState('');
  const [editDraftPriority, setEditDraftPriority] = useState<KanbanPriority>(DEFAULT_PRIORITY);

  // Last card list actually confirmed by chrome.storage - what the board
  // falls back to if a write fails, so it never keeps showing a change that
  // didn't save.
  const persistedRef = useRef<KanbanCard[] | null>(null);

  useEffect(() => {
    let active = true;
    // Bumped on every onChanged event. A read already in flight when one
    // arrives may resolve with the older value, so it's dropped rather than
    // allowed to overwrite the newer one.
    let changeCount = 0;

    function applyStored(stored: KanbanCard[]) {
      persistedRef.current = stored;
      setCards(stored);
    }

    // Picks up edits made from any other surface - another New Tab, the
    // toolbar popup's floating window, or a docked overlay on some page (all
    // separate pages - see subscribeToKanbanCards) - while this board is
    // already open, instead of only reflecting them on next open.
    const unsubscribe = subscribeToKanbanCards((stored) => {
      changeCount += 1;
      applyStored(stored);
    });

    function resync() {
      const startedAt = changeCount;
      readKanbanCards().then(
        (stored) => {
          if (active && changeCount === startedAt) applyStored(stored);
        },
        (error) => console.error('[StashWell] Failed to load Kanban cards:', error)
      );
    }

    // Also re-read whenever this page comes back into view: a background tab
    // Chrome froze, or a page restored from the back/forward cache, may not
    // have received onChanged events while it was suspended. Skipped outside
    // the extension (e.g. `next dev`), where there's no storage to re-read
    // and every resync would just reset the board to empty.
    function resyncOnReturn() {
      // chrome.runtime.id disappears once the extension is reloaded/updated
      // while this page stays open (content.js's overlay iframe outlives
      // that) - every chrome.storage call would just throw "Extension
      // context invalidated" from then on.
      if (chrome.runtime?.id) resync();
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') resyncOnReturn();
    }
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) resyncOnReturn();
    }

    resync();
    if (hasStorageApi()) {
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('pageshow', onPageShow);
    }
    return () => {
      active = false;
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  // Every add/move/edit/delete goes through here. `apply` runs twice: once
  // on local state so the board responds instantly, then again by
  // updateKanbanCards on the *latest* stored cards, which is what actually
  // gets written - so it must be pure and change cards by id, never assume
  // local state is current. The onChanged listener above then delivers
  // what landed in storage, the same value every other tab receives.
  function mutate(apply: (cards: KanbanCard[]) => KanbanCard[]) {
    setCards((current) => (current ? apply(current) : current));
    updateKanbanCards(apply).catch((error) => {
      console.error('[StashWell] Failed to save Kanban cards:', error);
      setCards(persistedRef.current);
    });
  }

  function commitDraft(status: KanbanStatus) {
    const title = draftTitle.trim();
    const description = draftDescription.trim();
    if (title) {
      const newCard: KanbanCard = {
        id: `task_${Date.now()}`,
        title,
        status,
        priority: draftPriority,
        description: description || undefined,
        dueAt: draftDueAt || undefined,
      };
      mutate((current) => [...current, newCard]);
      if (newCard.dueAt) {
        void syncCreate(newCard);
      }
    }
    setDraftTitle('');
    setDraftDescription('');
    setDraftDueAt('');
    setDraftPriority(DEFAULT_PRIORITY);
    setAddingToStatus(null);
  }

  function cancelAdding() {
    setDraftTitle('');
    setDraftDescription('');
    setDraftDueAt('');
    setDraftPriority(DEFAULT_PRIORITY);
    setAddingToStatus(null);
  }

  function deleteCard(cardId: string) {
    const card = cards?.find((c) => c.id === cardId);
    mutate((current) => current.filter((c) => c.id !== cardId));
    if (card?.gcal_event_id) {
      void syncDelete(card.gcal_event_id);
    }
  }

  function startEditingCard(card: KanbanCard) {
    setEditingCardId(card.id);
    setEditDraftTitle(card.title);
    setEditDraftDescription(card.description ?? '');
    setEditDraftDueAt(card.dueAt ?? '');
    setEditDraftPriority(card.priority ?? DEFAULT_PRIORITY);
  }

  function cancelEditingCard() {
    setEditingCardId(null);
    setEditDraftTitle('');
    setEditDraftDescription('');
    setEditDraftDueAt('');
    setEditDraftPriority(DEFAULT_PRIORITY);
  }

  function commitCardEdit(cardId: string) {
    const title = editDraftTitle.trim();
    const description = editDraftDescription.trim();
    const previous = cards?.find((c) => c.id === cardId);
    if (title && previous) {
      const nextDueAt = editDraftDueAt || undefined;
      const dueAtCleared = Boolean(previous.dueAt) && !nextDueAt;
      const hasChanges =
        previous.title !== title ||
        (previous.description || '') !== description ||
        (previous.dueAt || '') !== (nextDueAt || '');

      // Only the fields this form edits - merged onto whatever the stored
      // card is by then, so e.g. a gcal_event_id a calendar sync wrote in
      // the meantime isn't reverted to this tab's older copy.
      const edits: Partial<KanbanCard> = {
        title,
        description: description || undefined,
        dueAt: nextDueAt,
        priority: editDraftPriority,
        ...(dueAtCleared ? { gcal_event_id: undefined } : {}),
      };
      const nextCard: KanbanCard = { ...previous, ...edits };

      mutate((current) => current.map((c) => (c.id === cardId ? { ...c, ...edits } : c)));

      if (dueAtCleared && previous.gcal_event_id) {
        void syncDelete(previous.gcal_event_id);
      } else if (nextCard.gcal_event_id && nextDueAt && hasChanges) {
        void syncUpdate(nextCard.gcal_event_id, nextCard);
      } else if (!nextCard.gcal_event_id && nextDueAt && hasChanges) {
        void syncCreate(nextCard);
      }
    }
    cancelEditingCard();
  }

  const handleDragStart = (e: React.DragEvent, card: KanbanCard) => {
    e.dataTransfer.setData('text/plain', card.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetStatus: KanbanStatus) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('text/plain');
    const card = cards?.find((c) => c.id === cardId);
    if (!card || card.status === targetStatus) return;

    mutate((current) => current.map((c) => (c.id === cardId ? { ...c, status: targetStatus } : c)));
  };

  return (
    <div className={size.grid}>
      {STATUSES.map(({ status, label }) => {
        const columnCards = cards?.filter((c) => c.status === status) ?? [];
        return (
          <div
            key={status}
            className={size.column}
            style={columnMinHeight ? { minHeight: columnMinHeight } : undefined}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, status)}
          >
            <div className={size.header}>
              <div className="flex items-center gap-1.5">
                <div className={size.dot} style={{ backgroundColor: COLUMN_COLOR[status] }} />
                <h3 className={size.title}>{label}</h3>
              </div>
              <span className={size.count}>{columnCards.length}</span>
            </div>

            <div className={size.cardList}>
              {columnCards.map((card) =>
                editingCardId === card.id ? (
                  <CardForm
                    key={card.id}
                    title={editDraftTitle}
                    description={editDraftDescription}
                    dueAt={editDraftDueAt}
                    priority={editDraftPriority}
                    use24Hour={settings.use24HourClock}
                    onTitleChange={setEditDraftTitle}
                    onDescriptionChange={setEditDraftDescription}
                    onDueAtChange={setEditDraftDueAt}
                    onPriorityChange={setEditDraftPriority}
                    onCancel={cancelEditingCard}
                    onSave={() => commitCardEdit(card.id)}
                    saveLabel="Save Changes"
                  />
                ) : (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card)}
                    onClick={() => startEditingCard(card)}
                    title="Click to edit"
                    className="group relative flex cursor-pointer items-start gap-1.5 rounded-lg border border-t-4 border-neutral-200/50 bg-white/60 px-2.5 py-1.5 pr-6 text-xs font-medium text-neutral-900 backdrop-blur-xs transition-colors hover:bg-white/80 dark:border-neutral-700/50 dark:bg-neutral-800/60 dark:text-neutral-100 dark:hover:bg-neutral-700/70"
                    style={{
                      borderTopColor: PRIORITIES.find(
                        (p) => p.priority === (card.priority ?? DEFAULT_PRIORITY)
                      )?.color,
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="whitespace-normal break-words">{card.title}</span>
                      {/* The only place a set time shows up - description stays
                          hidden from the card face by design, but a due time is
                          the point of setting one, so it needs to be visible
                          without opening the edit form. */}
                      {card.dueAt && parseDueAt(card.dueAt) && (
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] font-normal text-neutral-500 dark:text-neutral-400">
                          <Clock className="size-2.5 shrink-0" />
                          <span className="truncate">
                            {formatWhen(
                              parseDueAt(card.dueAt)!,
                              new Date(),
                              settings.use24HourClock,
                              isDateOnly(card.dueAt)
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      title="Delete card"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCard(card.id);
                      }}
                      className="absolute top-1 right-1 rounded-full p-0.5 text-neutral-400 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              )}

              {addingToStatus === status ? (
                <CardForm
                  title={draftTitle}
                  description={draftDescription}
                  dueAt={draftDueAt}
                  priority={draftPriority}
                  use24Hour={settings.use24HourClock}
                  onTitleChange={setDraftTitle}
                  onDescriptionChange={setDraftDescription}
                  onDueAtChange={setDraftDueAt}
                  onPriorityChange={setDraftPriority}
                  onCancel={cancelAdding}
                  onSave={() => commitDraft(status)}
                  saveLabel="Add Card"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAddingToStatus(status);
                    setDraftTitle('');
                    setDraftDescription('');
                    setDraftDueAt('');
                    setDraftPriority(DEFAULT_PRIORITY);
                  }}
                  className="w-full rounded-lg border border-dashed border-neutral-300/60 px-2.5 py-1.5 text-xs text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700 dark:border-neutral-700/60 dark:text-neutral-500 dark:hover:text-neutral-300"
                >
                  + Add a card
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
