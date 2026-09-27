'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

import {
  KanbanCard,
  KanbanPriority,
  KanbanStatus,
  PRIORITIES,
  STATUSES,
  readKanbanCards,
  subscribeToKanbanCards,
  writeKanbanCards,
} from '@/lib/kanban';

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
  priority,
  onTitleChange,
  onDescriptionChange,
  onPriorityChange,
  onCancel,
  onSave,
  saveLabel,
}: {
  title: string;
  description: string;
  priority: KanbanPriority;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPriorityChange: (priority: KanbanPriority) => void;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
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
  const [cards, setCards] = useState<KanbanCard[] | null>(null);
  const [addingToStatus, setAddingToStatus] = useState<KanbanStatus | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftPriority, setDraftPriority] = useState<KanbanPriority>(DEFAULT_PRIORITY);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editDraftTitle, setEditDraftTitle] = useState('');
  const [editDraftDescription, setEditDraftDescription] = useState('');
  const [editDraftPriority, setEditDraftPriority] = useState<KanbanPriority>(DEFAULT_PRIORITY);

  useEffect(() => {
    readKanbanCards().then(setCards);
    // Picks up edits made from the toolbar popup's floating Kanban window
    // (a separate page - see subscribeToKanbanCards) while this popover is
    // already open, instead of only reflecting them on next open.
    return subscribeToKanbanCards(setCards);
  }, []);

  function persist(next: KanbanCard[]) {
    setCards(next);
    writeKanbanCards(next);
  }

  function commitDraft(status: KanbanStatus) {
    const title = draftTitle.trim();
    const description = draftDescription.trim();
    if (title && cards) {
      persist([
        ...cards,
        { id: `task_${Date.now()}`, title, status, priority: draftPriority, description: description || undefined },
      ]);
    }
    setDraftTitle('');
    setDraftDescription('');
    setDraftPriority(DEFAULT_PRIORITY);
    setAddingToStatus(null);
  }

  function cancelAdding() {
    setDraftTitle('');
    setDraftDescription('');
    setDraftPriority(DEFAULT_PRIORITY);
    setAddingToStatus(null);
  }

  function deleteCard(cardId: string) {
    if (cards) persist(cards.filter((c) => c.id !== cardId));
  }

  function startEditingCard(card: KanbanCard) {
    setEditingCardId(card.id);
    setEditDraftTitle(card.title);
    setEditDraftDescription(card.description ?? '');
    setEditDraftPriority(card.priority ?? DEFAULT_PRIORITY);
  }

  function cancelEditingCard() {
    setEditingCardId(null);
    setEditDraftTitle('');
    setEditDraftDescription('');
    setEditDraftPriority(DEFAULT_PRIORITY);
  }

  function commitCardEdit(cardId: string) {
    const title = editDraftTitle.trim();
    const description = editDraftDescription.trim();
    if (title && cards) {
      persist(
        cards.map((c) =>
          c.id === cardId
            ? { ...c, title, description: description || undefined, priority: editDraftPriority }
            : c
        )
      );
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
    if (!cards) return;

    const card = cards.find((c) => c.id === cardId);
    if (!card || card.status === targetStatus) return;

    persist(cards.map((c) => (c.id === cardId ? { ...c, status: targetStatus } : c)));
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
                    priority={editDraftPriority}
                    onTitleChange={setEditDraftTitle}
                    onDescriptionChange={setEditDraftDescription}
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
                    <span className="min-w-0 flex-1 whitespace-normal break-words">{card.title}</span>
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
                  priority={draftPriority}
                  onTitleChange={setDraftTitle}
                  onDescriptionChange={setDraftDescription}
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
