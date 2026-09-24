import { supabase } from "@/lib/supabaseClient"

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
