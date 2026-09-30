import { supabase } from "@/lib/supabaseClient"

// The Chrome Web Store build's redirect URL - the one Supabase's Redirect URLs
// allow-list needs. The live value always comes from getRedirectURL(); this
// only exists to flag a mismatch, since an unpacked build without
// manifest.json's "key" gets a different, path-derived extension ID and
// Supabase silently swaps a non-allow-listed
// redirectTo for its Site URL, so the auth window never lands back here.
const WEB_STORE_REDIRECT_URL = "https://nblkphiogednjkhgfhkomcmeebohmamc.chromiumapp.org/"

/**
 * Signs in with Google from an extension page via chrome.identity, since a
 * normal OAuth redirect has nowhere in-extension to land. Supabase issues
 * the Google consent URL (skipBrowserRedirect so it doesn't navigate this
 * page), chrome.identity.launchWebAuthFlow drives the popup and hands back
 * the final redirect (matching chrome.identity.getRedirectURL()) without
 * ever loading it, and the tokens Supabase put in that URL's hash are used
 * to establish the session directly.
 */
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const redirectUrl = chrome.identity.getRedirectURL()
  console.log("[StashWell] chrome.identity redirect URL:", redirectUrl)
  if (redirectUrl !== WEB_STORE_REDIRECT_URL) {
    console.warn(
      `[StashWell] redirect URL doesn't match the Web Store build's (${WEB_STORE_REDIRECT_URL}) - add ${redirectUrl} to Supabase's Redirect URLs allow-list or Google sign-in won't complete.`
    )
  }

  const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
    },
  })

  if (oauthError) return { error: oauthError.message }
  if (!data?.url) return { error: "Supabase didn't return a Google auth URL." }

  let responseUrl: string | undefined
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({
      url: data.url,
      interactive: true,
    })
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "The Google sign-in window was closed before finishing.",
    }
  }

  if (!responseUrl) {
    return { error: "The Google sign-in window was closed before finishing." }
  }

  const hashParams = new URLSearchParams(new URL(responseUrl).hash.slice(1))

  const flowError = hashParams.get("error_description") ?? hashParams.get("error")
  if (flowError) return { error: flowError }

  const accessToken = hashParams.get("access_token")
  const refreshToken = hashParams.get("refresh_token")
  if (!accessToken || !refreshToken) {
    return { error: "Google sign-in didn't return a session." }
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  return { error: sessionError?.message ?? null }
}
