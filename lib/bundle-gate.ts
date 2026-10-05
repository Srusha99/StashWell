/**
 * How many saved tab sessions ("bundles") each plan may keep.
 *
 *  - Free: 2 bundles, any number of tabs each, kept on this device only.
 *  - Pro: unlimited bundles, synced to the user's other devices
 *    (lib/dashboard-sync-engine.ts, `user_dashboards.session_bundles`).
 *
 * Only saving a new bundle is limited. Bundles a user already has - from
 * before these limits, or restored from a backup - are kept, and a Free user
 * over the limit just can't add another until they're back under it.
 */

export const FREE_BUNDLE_LIMIT = 2

export type BundleGateReason = "OK" | "BUNDLE_LIMIT_REACHED"

export function canSaveBundle(
  isPro: boolean,
  currentBundleCount: number
): { allowed: boolean; reason: BundleGateReason } {
  if (isPro || currentBundleCount < FREE_BUNDLE_LIMIT) return { allowed: true, reason: "OK" }
  return { allowed: false, reason: "BUNDLE_LIMIT_REACHED" }
}

/** The most bundles this plan may keep, for a check made at the moment of saving. */
export function bundleLimit(isPro: boolean): number {
  return isPro ? Infinity : FREE_BUNDLE_LIMIT
}
