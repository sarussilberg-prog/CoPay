package expo.modules.copaypartialauth

import android.content.ComponentName
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import androidx.browser.customtabs.CustomTabsClient
import androidx.browser.customtabs.CustomTabsIntent
import androidx.browser.customtabs.CustomTabsServiceConnection
import androidx.core.net.toUri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val DUMMY_URL = "https://expo.dev"

class CopayPartialAuthBrowserModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CopayPartialAuthBrowser")

    AsyncFunction("openPartialCustomTabAsync") { url: String, initialHeightPx: Int, promise: Promise ->
      val activity = appContext.throwingActivity
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val packageManager = activity.packageManager ?: throw Exceptions.ReactContextLost()

      val browserPackage = resolvePreferredBrowserPackage(packageManager)
        ?: throw BrowserNotAvailableException()

      // Chrome ignores setInitialActivityHeightPx unless a CustomTabsSession is attached
      // to the Builder. Without the session, the tab opens full-screen.
      val connection = object : CustomTabsServiceConnection() {
        override fun onCustomTabsServiceConnected(name: ComponentName, client: CustomTabsClient) {
          try {
            client.warmup(0)
            launchPartialTab(activity, browserPackage, client, url, initialHeightPx)
            promise.resolve(mapOf("type" to "opened"))
          } catch (e: Exception) {
            promise.reject("PARTIAL_TAB_LAUNCH_FAILED", e.message ?: "Launch failed", e)
          } finally {
            try {
              context.unbindService(this)
            } catch (_: Exception) {
            }
          }
        }

        override fun onServiceDisconnected(name: ComponentName?) {
        }
      }

      val bound = CustomTabsClient.bindCustomTabsService(context, browserPackage, connection)
      if (!bound) {
        try {
          launchPartialTab(activity, browserPackage, null, url, initialHeightPx)
          promise.resolve(mapOf("type" to "opened"))
        } catch (e: Exception) {
          promise.reject("PARTIAL_TAB_LAUNCH_FAILED", e.message ?: "Launch failed", e)
        }
      }
    }
  }

  private fun launchPartialTab(
    activity: android.app.Activity,
    browserPackage: String,
    client: CustomTabsClient?,
    url: String,
    initialHeightPx: Int,
  ) {
    val session = client?.newSession(null)
    val builder = if (session != null) {
      CustomTabsIntent.Builder(session)
    } else {
      CustomTabsIntent.Builder()
    }

    builder.setShowTitle(true)
      .setToolbarCornerRadiusDp(16)
      .setInitialActivityHeightPx(
        initialHeightPx,
        CustomTabsIntent.ACTIVITY_HEIGHT_FIXED,
      )

    val tabsIntent = builder.build().apply {
      intent.setPackage(browserPackage)
    }

    tabsIntent.launchUrl(activity, url.toUri())
  }

  private fun resolvePreferredBrowserPackage(packageManager: PackageManager): String? {
    val dummyIntent = CustomTabsIntent.Builder().build().apply {
      intent.data = DUMMY_URL.toUri()
    }
    val packages = packageManager.queryIntentActivities(dummyIntent.intent, 0)
      .mapNotNull { info: ResolveInfo -> info.activityInfo?.packageName }
      .distinct()

    if (packages.isEmpty()) return null

    return CustomTabsClient.getPackageName(appContext.throwingActivity, packages, true)
      ?: packages.firstOrNull()
  }
}

class BrowserNotAvailableException : Exception("No browser supports Chrome Custom Tabs on this device")
