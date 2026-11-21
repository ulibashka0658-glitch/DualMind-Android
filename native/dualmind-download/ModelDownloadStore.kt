package com.danemadsen.maid.download

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import java.io.File

/** System-owned transfers survive screen and JS runtime destruction. */
class ModelDownloadStore(private val context: Context) {
    private val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    private val prefs = context.getSharedPreferences("dualmind_downloads", Context.MODE_PRIVATE)

    data class Snapshot(val id: Long, val status: Int, val reason: Int, val bytes: Long, val total: Long)

    @Synchronized
    fun enqueue(key: String, url: String, filename: String): Long {
        val uri = Uri.parse(url)
        require(uri.scheme == "https" && uri.host == "huggingface.co")
        require(filename.matches(Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,199}")) && filename.endsWith(".gguf", true))
        require(key.isNotBlank())
        val previous = prefs.getLong(key, -1L)
        if (previous >= 0 && query(previous) != null) return previous
        val directory = requireNotNull(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS))
        val unique = java.util.UUID.randomUUID().toString() + "-" + filename
        val destination = File(directory, unique)
        val request = DownloadManager.Request(uri)
            .setTitle(filename)
            .setDescription("DualMind model download")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationUri(Uri.fromFile(destination))
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(false)
        val id = manager.enqueue(request)
        if (!prefs.edit().putLong(key, id).commit()) {
            manager.remove(id)
            error("Could not persist download identifier")
        }
        return id
    }

    fun query(id: Long): Snapshot? =
        manager.query(DownloadManager.Query().setFilterById(id))?.use { cursor ->
            if (!cursor.moveToFirst()) null else Snapshot(
                id,
                cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)),
                cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)),
                cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)),
                cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
            )
        }

    fun tracked(): Map<String, Long> = prefs.all.mapNotNull { (key, value) ->
        (value as? Long)?.let { key to it }
    }.toMap()

    @Synchronized
    fun cancel(key: String) {
        val id = prefs.getLong(key, -1L)
        if (id >= 0) manager.remove(id)
        check(prefs.edit().remove(key).commit())
    }
}
