"use client"

import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"

import {
  type Meridiem,
  composeLocalDateTime,
  daysInMonth,
  firstWeekdayOfMonth,
  localDayKey,
  parseLocalDateTime,
  splitLocalTime,
} from "@/lib/dates"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

/**
 * Calendar + clock picker used instead of Chrome's native datetime-local popup.
 *
 * Emits a `datetime-local` value ("2026-09-20T14:30") so it drops straight into
 * the reminder draft with no reformatting, and stays the single representation
 * used everywhere else (see the dueAt comment in lib/reminders.ts).
 *
 * Wrapped in the project's Dialog rather than a hand-rolled fixed overlay, so
 * Escape, the backdrop click and focus trapping come for free.
 */
export function DateTimePicker({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Current datetime-local value, or "" when no date is set. */
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[310px] max-w-[calc(100%-2rem)] gap-0 rounded-[24px] p-[18px] sm:max-w-[310px]"
      >
        {/* Mounted only while open, which is what makes the calendar start from
            the current value each time it is opened. Deliberately NOT keyed on
            `value`: that would remount on every click, resetting the month grid
            and slamming the month/year dropdown shut mid-selection. */}
        {open && <PickerBody value={value} onChange={onChange} />}
      </DialogContent>
    </Dialog>
  )
}

function PickerBody({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const initial = React.useMemo(() => parseLocalDateTime(value) ?? new Date(), [value])
  const initialTime = React.useMemo(() => splitLocalTime(initial), [initial])

  const [year, setYear] = React.useState(initial.getFullYear())
  const [month, setMonth] = React.useState(initial.getMonth())
  const [day, setDay] = React.useState(initial.getDate())
  const [hours, setHours] = React.useState(initialTime.hours)
  const [minutes, setMinutes] = React.useState(initialTime.minutes)
  const [meridiem, setMeridiem] = React.useState<Meridiem>(initialTime.meridiem)
  const [monthOpen, setMonthOpen] = React.useState(false)

  const totalDays = daysInMonth(year, month)
  const leadingBlanks = firstWeekdayOfMonth(year, month)
  const todayKey = localDayKey(new Date())

  /**
   * Pushes the current selection up. Empty or partial time fields fall back to a
   * sane number rather than emitting a broken value - the raw strings stay as
   * typed so the inputs don't fight the user mid-keystroke.
   */
  const emit = React.useCallback(
    (next: {
      year?: number
      month?: number
      day?: number
      hours?: string
      minutes?: string
      meridiem?: Meridiem
    }) => {
      const y = next.year ?? year
      const m = next.month ?? month
      const d = next.day ?? day
      const h = Number.parseInt(next.hours ?? hours, 10)
      const min = Number.parseInt(next.minutes ?? minutes, 10)
      onChange(
        composeLocalDateTime(
          y,
          m,
          d,
          Number.isNaN(h) || h === 0 ? 12 : h,
          Number.isNaN(min) ? 0 : min,
          next.meridiem ?? meridiem
        )
      )
    },
    [year, month, day, hours, minutes, meridiem, onChange]
  )

  function goToMonth(nextMonth: number, nextYear: number) {
    // Clamp before emitting, or the 31st of a 30-day month rolls into the next.
    const clamped = Math.min(day, daysInMonth(nextYear, nextMonth))
    setMonth(nextMonth)
    setYear(nextYear)
    setDay(clamped)
    emit({ month: nextMonth, year: nextYear, day: clamped })
  }

  function step(direction: -1 | 1) {
    const raw = month + direction
    const nextMonth = (raw + 12) % 12
    const nextYear = raw < 0 ? year - 1 : raw > 11 ? year + 1 : year
    goToMonth(nextMonth, nextYear)
  }

  function changeHours(raw: string) {
    let next = raw.replace(/\D/g, "").slice(0, 2)
    if (Number.parseInt(next, 10) > 12) next = "12"
    setHours(next)
    emit({ hours: next })
  }

  function changeMinutes(raw: string) {
    let next = raw.replace(/\D/g, "").slice(0, 2)
    if (Number.parseInt(next, 10) > 59) next = "59"
    setMinutes(next)
    emit({ minutes: next })
  }

  return (
    <>
      <DialogTitle className="sr-only">Pick a date and time</DialogTitle>

      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonthOpen((current) => !current)}
          aria-expanded={monthOpen}
          className="flex items-center gap-1 text-[17px] font-semibold text-primary transition-opacity hover:opacity-75"
        >
          <span>
            {MONTH_NAMES[month]} {year}
          </span>
          <ChevronDown
            className={cn("size-3 transition-transform", monthOpen && "rotate-180")}
            strokeWidth={3}
          />
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous month"
            className="rounded-full p-1.5 text-primary transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          >
            <ChevronLeft className="size-3.5" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next month"
            className="rounded-full p-1.5 text-primary transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          >
            <ChevronRight className="size-3.5" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div className="mb-2 grid grid-cols-7 text-center">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="text-[10px] font-bold tracking-wider text-[#8e8e93] dark:text-white/40"
          >
            {weekday}
          </div>
        ))}
      </div>

      <div className="relative mb-4 h-[216px]">
        <div className="absolute grid w-full grid-cols-7 justify-items-center gap-y-1">
          {Array.from({ length: leadingBlanks }, (_, index) => (
            <div key={`blank-${index}`} className="size-9" />
          ))}
          {Array.from({ length: totalDays }, (_, index) => {
            const dayNumber = index + 1
            const selected = dayNumber === day
            const isToday = localDayKey(new Date(year, month, dayNumber)) === todayKey
            return (
              <button
                key={dayNumber}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setDay(dayNumber)
                  emit({ day: dayNumber })
                }}
                className={cn(
                  "relative flex size-9 items-center justify-center rounded-full text-[15px] font-medium transition-all",
                  selected
                    ? "z-10 scale-105 bg-primary font-semibold text-primary-foreground shadow-md"
                    : "text-primary hover:bg-black/5 dark:hover:bg-white/10",
                  // A ring marks today without competing with the filled selection.
                  isToday && !selected && "ring-1 ring-primary/40"
                )}
              >
                {dayNumber}
              </button>
            )
          })}
        </div>

        {monthOpen && (
          <div className="absolute inset-0 z-30 flex flex-col rounded-[18px] bg-popover/95 p-3 backdrop-blur-md">
            <div className="mb-3 flex items-center justify-between border-b border-black/5 pb-2 dark:border-white/5">
              <button
                type="button"
                onClick={() => goToMonth(month, year - 1)}
                aria-label="Previous year"
                className="rounded-full p-1.5 text-primary transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              >
                <ChevronLeft className="size-3.5" strokeWidth={2.5} />
              </button>
              <span className="text-[16px] font-bold text-foreground">{year}</span>
              <button
                type="button"
                onClick={() => goToMonth(month, year + 1)}
                aria-label="Next year"
                className="rounded-full p-1.5 text-primary transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              >
                <ChevronRight className="size-3.5" strokeWidth={2.5} />
              </button>
            </div>

            <div className="grid flex-1 grid-cols-3 gap-1.5 overflow-y-auto">
              {MONTH_NAMES.map((name, index) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    goToMonth(index, year)
                    setMonthOpen(false)
                  }}
                  className={cn(
                    "rounded-lg py-1.5 text-xs font-bold transition-all",
                    index === month
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                  )}
                >
                  {name.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-black/[0.06] pt-4 dark:border-white/5">
        <span className="text-[17px] font-semibold text-foreground">Time</span>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-[8px] bg-[#e3e3e8] px-2 py-1 text-[17px] font-medium text-foreground dark:bg-[#2c2c2e]">
            <input
              type="text"
              inputMode="numeric"
              value={hours}
              onChange={(event) => changeHours(event.target.value)}
              onBlur={() => hours === "" && changeHours("12")}
              aria-label="Hour"
              placeholder="00"
              className="w-6 bg-transparent text-center font-semibold outline-none"
            />
            <span className="opacity-70">:</span>
            <input
              type="text"
              inputMode="numeric"
              value={minutes}
              onChange={(event) => changeMinutes(event.target.value)}
              onBlur={() => minutes === "" && changeMinutes("00")}
              aria-label="Minute"
              placeholder="00"
              className="w-6 bg-transparent text-center font-semibold outline-none"
            />
          </div>

          <div className="flex rounded-[8px] bg-[#e3e3e8] p-[2px] text-[13px] font-semibold text-foreground dark:bg-[#2c2c2e]">
            {(["AM", "PM"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={meridiem === option}
                onClick={() => {
                  setMeridiem(option)
                  emit({ meridiem: option })
                }}
                className={cn(
                  "rounded-[6px] px-2.5 py-1 transition-all",
                  meridiem === option
                    ? "bg-white shadow-sm dark:bg-[#505054]"
                    : "opacity-60 hover:opacity-100"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
