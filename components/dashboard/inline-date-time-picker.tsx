"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

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

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"]

/**
 * A shrunk-down `PickerBody` (see the deleted date-time-picker.tsx) that
 * renders inline inside the assistant card instead of in a centered modal
 * `Dialog` - the card is only ~228px of usable width, so this drops the
 * month/year jump-grid overlay to keep the widget's footprint small.
 *
 * Every change still calls `onChange` immediately (live-update, same as the
 * modal version had), but there's also an explicit "Save" button - Enter
 * anywhere in the widget triggers it too - since a bare X read as "discard"
 * rather than "I'm done picking".
 */
export function InlineDateTimePicker({
  value,
  onChange,
  onClose,
}: {
  value: string
  onChange: (value: string) => void
  onClose: () => void
}) {
  // The reminder this opens for was created with a placeholder time the
  // instant "call mom" was typed - if the panel then sits open for a few
  // minutes before the user gets to the picker, that placeholder has already
  // slipped into the past, and showing it as-is looks (and is) wrong. Falling
  // back to "now" only kicks in for that stale/missing case, never for a
  // reminder that already has a real future time.
  const parsed = React.useMemo(() => parseLocalDateTime(value), [value])
  const wasStale = !parsed || parsed.getTime() <= Date.now()
  const initial = React.useMemo(() => (wasStale ? new Date() : parsed!), [parsed, wasStale])
  const initialTime = React.useMemo(() => splitLocalTime(initial), [initial])

  const [year, setYear] = React.useState(initial.getFullYear())
  const [month, setMonth] = React.useState(initial.getMonth())
  const [day, setDay] = React.useState(initial.getDate())
  const [hours, setHours] = React.useState(initialTime.hours)
  const [minutes, setMinutes] = React.useState(initialTime.minutes)
  const [meridiem, setMeridiem] = React.useState<Meridiem>(initialTime.meridiem)

  const totalDays = daysInMonth(year, month)
  const leadingBlanks = firstWeekdayOfMonth(year, month)
  const todayKey = localDayKey(new Date())

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

  // Only the mount matters: this pushes the "now" fallback above back onto
  // the reminder itself, so a stale placeholder is corrected even if the user
  // hits Save without touching a single field.
  const correctedStaleValue = React.useRef(false)
  React.useEffect(() => {
    if (correctedStaleValue.current) return
    correctedStaleValue.current = true
    if (wasStale) emit({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function goToMonth(nextMonth: number, nextYear: number) {
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

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "Enter") return
    event.preventDefault()
    onClose()
  }

  return (
    <div className="px-4 pb-3" onKeyDown={handleKeyDown}>
      {/* Same rounded-bubble treatment as a transcript message, so the picker
          reads as a piece of the card's own content rather than a bolted-on
          control bar. */}
      <div className="rounded-[14px] bg-neutral-100 p-2 dark:bg-neutral-900">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-primary">
            {MONTH_NAMES[month]} {year}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous month"
              className="rounded-full p-0.5 text-primary transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            >
              <ChevronLeft className="size-2" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next month"
              className="rounded-full p-0.5 text-primary transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            >
              <ChevronRight className="size-2" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 text-center">
          {WEEKDAYS.map((weekday, index) => (
            <div
              key={`${weekday}-${index}`}
              className="text-[6px] font-bold tracking-wide text-[#8e8e93] dark:text-white/40"
            >
              {weekday}
            </div>
          ))}
        </div>

        <div className="mb-1 grid grid-cols-7 justify-items-center gap-y-[2px]">
          {Array.from({ length: leadingBlanks }, (_, index) => (
            <div key={`blank-${index}`} className="size-4" />
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
                  "relative flex size-4 items-center justify-center rounded-full text-[8px] font-medium transition-all",
                  selected
                    ? "z-10 bg-primary font-semibold text-primary-foreground"
                    : "text-primary hover:bg-black/5 dark:hover:bg-white/10",
                  isToday && !selected && "ring-1 ring-primary/40"
                )}
              >
                {dayNumber}
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between border-t border-black/[0.06] pt-1 dark:border-white/5">
          <span className="text-[9px] font-semibold text-foreground">Time</span>

          <div className="flex items-center gap-1">
            <div className="flex items-center rounded-[5px] bg-white px-1 py-0.5 text-[10px] font-medium text-foreground dark:bg-[#2c2c2e]">
              <input
                type="text"
                inputMode="numeric"
                value={hours}
                onChange={(event) => changeHours(event.target.value)}
                onBlur={() => hours === "" && changeHours("12")}
                aria-label="Hour"
                placeholder="00"
                className="w-3 bg-transparent text-center font-semibold outline-none"
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
                className="w-3 bg-transparent text-center font-semibold outline-none"
              />
            </div>

            <div className="flex rounded-[5px] bg-white p-[2px] text-[8px] font-semibold text-foreground dark:bg-[#2c2c2e]">
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
                    "rounded-[3px] px-1 py-0.5 transition-all",
                    meridiem === option
                      ? "bg-neutral-200 shadow-sm dark:bg-[#505054]"
                      : "opacity-60 hover:opacity-100"
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mx-auto mt-2 flex items-center justify-center rounded-full bg-primary px-4 py-1 text-[10px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Save
      </button>
    </div>
  )
}
