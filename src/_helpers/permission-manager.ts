import { AppConfig } from '@/app-config'
import { isFirefox, isOpera, isSafari } from './saladict'

export async function checkBackgroundPermission(
  config: AppConfig
): Promise<void> {
  // Manifest V3 backgrounds are service workers managed by the browser. The
  // legacy `background` optional permission only exists for Manifest V2 and
  // requesting it in Chromium MV3 rejects, which used to block every settings
  // save (including API keys) in Edge.
  if (browser.runtime.getManifest().manifest_version >= 3) return

  // Firefox, Opera and Safari does not support 'background' permission.
  if (isFirefox || isOpera || isSafari) return

  const backgroundPermissions: browser.permissions.AnyPermissions = {
    permissions: ['background']
  }
  const hasBackground = await browser.permissions.contains(
    backgroundPermissions
  )
  if (config.runInBg) {
    if (!hasBackground) {
      await browser.permissions.request(
        backgroundPermissions as browser.permissions.Permissions
      )
    }
  } else {
    if (hasBackground) {
      try {
        await browser.permissions.remove(
          backgroundPermissions as browser.permissions.Permissions
        )
      } catch (e) {
        // failed silently on remove
        console.error(e)
      }
    }
  }
}
