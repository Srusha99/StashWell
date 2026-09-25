/** The asymmetric 4-block "bento" glyph used everywhere the Kanban board is
 * referenced (view switcher, popup button, floating window titlebar) - swapped
 * in for lucide's column-based Kanban icon, which read as generic columns
 * rather than a distinct board. */
export function KanbanIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="9" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="11" rx="2" />
      <rect x="3" y="12" width="9" height="9" rx="2" />
      <rect x="14" y="16" width="7" height="5" rx="2" />
    </svg>
  )
}
