package com.qrconnect.usage

import android.Manifest
import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.app.usage.UsageEvents
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PhoneUsageModule : Module() {
  private fun context(): Context = requireNotNull(appContext.reactContext)
  private fun authorized(): Boolean {
    val ctx = context()
    val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
    return mode == AppOpsManager.MODE_ALLOWED ||
      (mode == AppOpsManager.MODE_DEFAULT && ctx.checkSelfPermission(Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED)
  }
  override fun definition() = ModuleDefinition {
    Name("PhoneUsage")
    AsyncFunction("status") { if (authorized()) "authorized" else "denied" }
    AsyncFunction("authorize") {
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context().startActivity(intent)
      "settings-opened"
    }
    AsyncFunction("readEvents") { start: Double, end: Double ->
      require(authorized()) { "Grant Usage Access in Android settings." }
      require(start.isFinite() && end.isFinite() && end > start && end - start <= 31 * 86400000.0) { "Invalid usage query." }
      val observedEnd = minOf(end.toLong(), System.currentTimeMillis())
      val manager = context().getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      // One day of context recovers observed sessions crossing the requested start.
      val events = manager.queryEvents(maxOf(0L, start.toLong() - 86400000L), observedEnd)
        ?: throw IllegalStateException("Usage events unavailable while the device is locked.")
      val event = UsageEvents.Event()
      val rows = mutableListOf<Map<String, Any>>()
      while (events.hasNextEvent()) {
        events.getNextEvent(event)
        val kind = when (event.eventType) {
          UsageEvents.Event.ACTIVITY_RESUMED -> "resume"
          UsageEvents.Event.ACTIVITY_PAUSED -> "pause"
          UsageEvents.Event.ACTIVITY_STOPPED -> "stop"
          UsageEvents.Event.SCREEN_NON_INTERACTIVE -> "screen-off"
          UsageEvents.Event.DEVICE_SHUTDOWN -> "shutdown"
          UsageEvents.Event.DEVICE_STARTUP -> "startup"
          else -> null
        } ?: continue
        val activity = event.className ?: ""
        rows.add(mapOf("kind" to kind, "timeMs" to event.timeStamp,
          "identifier" to (event.packageName ?: ""), "activity" to activity))
        require(rows.size <= 100000) { "Too many usage events. Select a shorter interval." }
      }
      mapOf("events" to rows, "observedEndMs" to observedEnd)
    }
    AsyncFunction("read") { start: Double, end: Double, kind: String, offset: Int, limit: Int ->
      require(authorized()) { "Grant Usage Access in Android settings." }
      require(kind == "applications" && offset >= 0 && limit in 1..50 && end > start && end - start <= 31 * 86400000.0) { "Invalid usage query." }
      val manager = context().getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      val stats = manager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start.toLong(), end.toLong())
        .filter { it.totalTimeInForeground > 0 }
        .sortedWith(compareBy({ it.firstTimeStamp }, { it.packageName }))
      val rows = stats.drop(offset).take(limit).map { stat -> mapOf(
        "identifier" to stat.packageName,
        "startMs" to stat.firstTimeStamp, "endMs" to stat.lastTimeStamp,
        "lastTimeUsedMs" to stat.lastTimeUsed, "durationMs" to stat.totalTimeInForeground,
        "granularity" to "system-daily-aggregate"
      ) }
      mapOf("records" to rows, "nextOffset" to if (offset + limit < stats.size) offset + limit else null,
        "warnings" to listOf("Android daily buckets can extend outside the requested interval. These are foreground usage aggregates, not sessions or browser history.", "Retention and pagination depend on the system. Missing historical usage is not proof of zero usage."))
    }
  }
}
