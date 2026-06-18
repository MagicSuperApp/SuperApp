package com.mvp.orilife.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.google.gson.Gson
import java.util.UUID

object VirtualIDManager {

    private const val PREFS_NAME = "virtual_id_manager"
    private const val PREFS_LAST_ID = "last_virtual_id"
    private const val PREFS_ID_MAPPING = "id_mapping"

    private var prefs: SharedPreferences? = null

    fun initialize(context: Context) {
        prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        Log.d("VirtualIDManager", "✅ Initialized")
    }

    fun generateVirtualID(label: String): String {
        val prefix = when (label.lowercase()) {
            "trunk", "thân" -> "TRUNK"
            "branch", "cành" -> "BRANCH"
            else -> "TREE"
        }

        val timestamp = System.currentTimeMillis().toString(36)
        val random = UUID.randomUUID().toString().take(8).uppercase()
        val sequence = getNextSequence()

        val virtualID = "$prefix-$timestamp-$sequence-$random"

        Log.d("VirtualIDManager", "✅ Generated ID: $virtualID")
        saveIDMapping(virtualID, label)

        return virtualID
    }

    fun getVirtualInfo(virtualID: String): VirtualInfo? {
        val mappingJson = prefs?.getString("$PREFS_ID_MAPPING:$virtualID", null) ?: return null

        return try {
            val gson = Gson()
            gson.fromJson(mappingJson, VirtualInfo::class.java)
        } catch (e: Exception) {
            Log.e("VirtualIDManager", "❌ Failed to parse virtual info", e)
            null
        }
    }

    fun getAllVirtualIDs(): List<String> {
        val allKeys = prefs?.all?.keys?.filter { it.startsWith("$PREFS_ID_MAPPING:") } ?: emptyList()
        return allKeys.map { it.substringAfter(":") }
    }

    fun getLastVirtualID(): String? {
        return prefs?.getString(PREFS_LAST_ID, null)
    }

    private fun getNextSequence(): Int {
        val lastSeq = prefs?.getInt(PREFS_LAST_ID, 0) ?: 0
        val newSeq = lastSeq + 1
        prefs?.edit()?.putInt(PREFS_LAST_ID, newSeq)?.apply()
        return newSeq
    }

    private fun saveIDMapping(virtualID: String, label: String) {
        val virtualInfo = VirtualInfo(
            virtualID = virtualID,
            label = label,
            createdAt = System.currentTimeMillis(),
            confidence = 0.0f,
            trustScore = 0.5f,
            manualVerified = false
        )

        val gson = Gson()
        val json = gson.toJson(virtualInfo)

        prefs?.edit()?.putString("$PREFS_ID_MAPPING:$virtualID", json)?.apply()
    }

    fun updateVirtualInfo(virtualID: String, update: (VirtualInfo) -> VirtualInfo) {
        val existingInfo = getVirtualInfo(virtualID) ?: return
        val updatedInfo = update(existingInfo)

        val gson = Gson()
        val json = gson.toJson(updatedInfo)

        prefs?.edit()?.putString("$PREFS_ID_MAPPING:$virtualID", json)?.apply()
        Log.d("VirtualIDManager", "✅ Updated info: $virtualID")
    }

    fun clearAll() {
        prefs?.edit()?.clear()?.apply()
        Log.d("VirtualIDManager", "🗑️ Cleared all virtual IDs")
    }

    data class VirtualInfo(
        val virtualID: String,
        val label: String,
        val createdAt: Long,
        val confidence: Float,
        val trustScore: Float,
        val manualVerified: Boolean
    )
}
