/**
 * StashWell reminder notifications (MV3 service worker).
 *
 * Deliberately tiny and read-only. The new-tab page owns reminder state in
 * localStorage - which a service worker cannot read - so the page mirrors a
 * flattened schedule into chrome.storage.local and creates the alarms. All this
 * worker does is turn a fired alarm into a notification.
 *
 * Plain JS on purpose: it is served straight out of public/ and is never passed
 * through the bundler, so it cannot use imports or TypeScript.
 *
 * Keep in sync with lib/reminder-schedule.ts.
 */

const SCHEDULE_KEY = "reminderSchedule"
const ALARM_PREFIX = "stashwell-reminder:"
const TEST_MESSAGE = "stashwell:test-notification"
const ICON = "icons/icon128.png"

/**
 * chrome.notifications.create fails SILENTLY on a bad iconUrl, a denied
 * Chrome-level permission, or an OS-level block - the callback still runs and the
 * only trace is runtime.lastError. Always funnel through here so a failure is
 * reported rather than swallowed.
 */
function notify(id, options) {
  return new Promise((resolve) => {
    chrome.notifications.create(id, options, () => {
      const error = chrome.runtime.lastError
      if (error) {
        console.error("[StashWell] notification failed:", error.message)
        resolve({ ok: false, reason: error.message })
      } else {
        resolve({ ok: true })
      }
    })
  })
}

function permissionLevel() {
  return new Promise((resolve) => {
    if (!chrome.notifications?.getPermissionLevel) {
      resolve("unknown")
      return
    }
    chrome.notifications.getPermissionLevel((level) => resolve(level))
  })
}

/**
 * Registers the test-message handler FIRST, before anything that touches
 * chrome.notifications.
 *
 * A top-level `chrome.notifications.onClicked.addListener(...)` throws if the
 * notifications permission was never granted, and a throw during worker startup
 * aborts the whole script - so every listener registered after it silently never
 * attaches. Putting the diagnostic handler first means it still answers and can
 * report the real reason even when the rest of the worker can't run.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== TEST_MESSAGE) return undefined

  permissionLevel().then(async (level) => {
    if (!chrome.notifications) {
      sendResponse({
        ok: false,
        level,
        reason:
          "The notifications permission isn't granted. Remove StashWell from chrome://extensions and load it again from out/ - a plain reload won't grant newly added permissions.",
      })
      return
    }

    if (level === "denied") {
      sendResponse({
        ok: false,
        level,
        reason:
          "Chrome is blocking notifications for this extension. Check chrome://settings/content/notifications, and that notifications are enabled for Chrome in Windows Settings > System > Notifications.",
      })
      return
    }

    const result = await notify(`stashwell-test-${Date.now()}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL(ICON),
      title: "StashWell reminders are working",
      message: "This is what a reminder will look like.",
    })
    sendResponse({ ...result, level })
  })

  // Keeps the message channel open for the async sendResponse above.
  return true
})

chrome.runtime.onInstalled.addListener(() => {
  console.log("[StashWell] service worker installed; reminder notifications ready.")
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return
  const id = alarm.name.slice(ALARM_PREFIX.length)

  // A service worker can be torn down between alarms, so never hold state in
  // module scope - always read the schedule back out of storage.
  chrome.storage.local.get(SCHEDULE_KEY, async (stored) => {
    const schedule = Array.isArray(stored?.[SCHEDULE_KEY]) ? stored[SCHEDULE_KEY] : []
    const item = schedule.find((entry) => entry && entry.id === id)

    // The reminder was edited or deleted after the alarm was set. Drop the alarm
    // rather than notify about something that no longer exists; a repeating alarm
    // would otherwise keep firing forever.
    if (!item) {
      console.warn("[StashWell] alarm fired with no matching reminder, clearing:", id)
      chrome.alarms.clear(alarm.name)
      return
    }

    const level = await permissionLevel()
    if (level === "denied") {
      console.error(
        "[StashWell] Chrome notifications are blocked for this profile - check chrome://settings/content/notifications and the OS notification settings."
      )
    }

    await notify(alarm.name, {
      type: "basic",
      iconUrl: chrome.runtime.getURL(ICON),
      title: item.title || "Reminder",
      message: item.workspaceName ? `StashWell · ${item.workspaceName}` : "StashWell",
      // requireInteraction is deliberately NOT set: on Windows, Chrome hands off
      // to the OS notification centre, where it is unreliable and can suppress
      // the notification entirely. An auto-dismissing notification beats none.
    })
  })
})

// Clicking the notification opens a new tab, which is StashWell itself - so the
// reminder is right there in the list. Guarded because an ungranted permission
// would otherwise throw here and abort worker startup.
if (chrome.notifications?.onClicked) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    chrome.notifications.clear(notificationId)
    chrome.tabs.create({})
  })
}
