package com.danemadsen.maid.download

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.uimanager.ViewManager

class ModelDownloadModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val store = ModelDownloadStore(context)
    override fun getName() = "DualMindDownload"

    private fun respond(promise: Promise, action: () -> Any?) {
        try {
            promise.resolve(action())
        } catch (error: Exception) {
            promise.reject("DOWNLOAD_ERROR", "Android download operation failed", error)
        }
    }

    @ReactMethod
    fun enqueue(key: String, url: String, filename: String, promise: Promise) =
        respond(promise) { store.enqueue(key, url, filename).toString() }

    @ReactMethod
    fun query(key: String, promise: Promise) = respond(promise) {
        val id = store.tracked()[key]
        val snapshot = id?.let { store.query(it) }
        snapshot?.let {
            Arguments.createMap().apply {
                putString("id", it.id.toString())
                putInt("status", it.status)
                putInt("reason", it.reason)
                putDouble("bytes", it.bytes.toDouble())
                putDouble("total", it.total.toDouble())
            }
        }
    }

    private val importExecutor = java.util.concurrent.Executors.newSingleThreadExecutor()

    @ReactMethod
    fun importCompleted(key: String, promise: Promise) {
        try {
            importExecutor.execute {
                respond(promise) { store.importCompleted(key) }
            }
        } catch (error: Exception) {
            promise.reject("IMPORT_ERROR", "Unable to schedule model import", error)
        }
    }

    override fun invalidate() {
        importExecutor.shutdown()
        super.invalidate()
    }

    @ReactMethod
    fun tracked(promise: Promise) = respond(promise) {
        Arguments.createMap().apply {
            store.tracked().forEach { (key, id) -> putString(key, id.toString()) }
        }
    }

    @ReactMethod
    fun cancel(key: String, promise: Promise) = respond(promise) {
        store.cancel(key)
        true
    }
}

class ModelDownloadPackage : ReactPackage {
    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
        listOf(ModelDownloadModule(context))

    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
