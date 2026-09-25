'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

import {
  KanbanCard,
  KanbanStatus,
  STATUSES,
  readKanbanCards,
  subscribeToKanbanCards,
  writeKanbanCards,
} from '@/lib/kanban';

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
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  placeholder?: string;
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
      onBlur={onCommit}
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
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editDraftTitle, setEditDraftTitle] = useState('');

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
    if (title && cards) {
      persist([...cards, { id: `task_${Date.now()}`, title, status }]);
    }
    setDraftTitle('');
    setAddingToStatus(null);
  }

  function deleteCard(cardId: string) {
    if (cards) persist(cards.filter((c) => c.id !== cardId));
  }

  function startEditingCard(card: KanbanCard) {
    setEditingCardId(card.id);
    setEditDraftTitle(card.title);
  }

  function commitCardEdit(cardId: string) {
    const title = editDraftTitle.trim();
    if (title && cards) {
      persist(cards.map((c) => (c.id === cardId ? { ...c, title } : c)));
    }
    setEditingCardId(null);
    setEditDraftTitle('');
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
                  <AutosizeTextarea
                    key={card.id}
                    value={editDraftTitle}
                    onChange={setEditDraftTitle}
                    onCommit={() => commitCardEdit(card.id)}
                    onCancel={() => {
                      setEditingCardId(null);
                      setEditDraftTitle('');
                    }}
                  />
                ) : (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card)}
                    onDoubleClick={() => startEditingCard(card)}
                    title="Double-click to edit"
                    className="group relative flex cursor-move items-start gap-1.5 rounded-lg border border-neutral-200/50 bg-white/60 px-2.5 py-1.5 pr-6 text-xs font-medium text-neutral-900 backdrop-blur-xs transition-colors hover:bg-white/80 dark:border-neutral-700/50 dark:bg-neutral-800/60 dark:text-neutral-100 dark:hover:bg-neutral-700/70"
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
                <AutosizeTextarea
                  value={draftTitle}
                  placeholder="Task title"
                  onChange={setDraftTitle}
                  onCommit={() => commitDraft(status)}
                  onCancel={() => {
                    setDraftTitle('');
                    setAddingToStatus(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAddingToStatus(status);
                    setDraftTitle('');
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
