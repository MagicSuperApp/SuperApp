package com.mvp.orilife.network

import android.util.Log
import com.google.gson.Gson
import com.mvp.orilife.network.models.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit

/**
 * Tree API Client
 * Handles /trees endpoints (§5)
 */
class TreeAPI(
    private val baseUrl: String,
    private val apiKey: String
) {
    private val client: OkHttpClient
    private val gson = Gson()

    init {
        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(loggingInterceptor)
            .build()

        Log.d(TAG, "✅ TreeAPI initialized: baseUrl=$baseUrl")
    }

    /**
     * POST /trees - Create tree (§5.2)
     * MUST be called BEFORE /evidences/ingest
     */
    suspend fun createTree(request: TreeCreateRequest): Result<Tree> {
        return try {
            val json = gson.toJson(request)
            val requestBody = json.toRequestBody("application/json".toMediaType())

            val httpRequest = Request.Builder()
                .url("$baseUrl/trees")
                .header("X-API-Key", apiKey)
                .post(requestBody)
                .build()

            Log.d(TAG, "📤 POST /trees: treeId=${request.id}, farmId=${request.farmId}, geohash=${request.geohash7}")

            val response = client.newCall(httpRequest).execute()
            val responseBody = response.body?.string() ?: ""

            if (!response.isSuccessful) {
                Log.e(TAG, "❌ POST /trees failed: ${response.code} - $responseBody")
                return Result.failure(ApiException(response.code, responseBody))
            }

            val envelope = gson.fromJson(responseBody, ApiEnvelope::class.java)
            val tree = gson.fromJson(gson.toJson(envelope.data), Tree::class.java)

            Log.d(TAG, "✅ POST /trees success: treeId=${tree.id}")
            Result.success(tree)

        } catch (e: Exception) {
            Log.e(TAG, "❌ POST /trees error: ${e.message}", e)
            Result.failure(e)
        }
    }

    /**
     * GET /trees/{tree_id} - Get tree detail (§5.3)
     */
    suspend fun getTreeById(treeId: String): Result<Tree> {
        return try {
            val request = Request.Builder()
                .url("$baseUrl/trees/$treeId")
                .header("X-API-Key", apiKey)
                .get()
                .build()

            Log.d(TAG, "📤 GET /trees/$treeId")

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""

            if (!response.isSuccessful) {
                Log.e(TAG, "❌ GET /trees/$treeId failed: ${response.code} - $responseBody")
                return Result.failure(ApiException(response.code, responseBody))
            }

            val envelope = gson.fromJson(responseBody, ApiEnvelope::class.java)
            val tree = gson.fromJson(gson.toJson(envelope.data), Tree::class.java)

            Log.d(TAG, "✅ GET /trees/$treeId success")
            Result.success(tree)

        } catch (e: Exception) {
            Log.e(TAG, "❌ GET /trees/$treeId error: ${e.message}", e)
            Result.failure(e)
        }
    }

    /**
     * GET /trees - List trees (§5.1)
     */
    suspend fun getTrees(
        farmId: String? = null,
        regionCode: String? = null,
        limit: Int = 100,
        offset: Int = 0
    ): Result<TreeListData> {
        return try {
            val urlBuilder = StringBuilder("$baseUrl/trees?limit=$limit&offset=$offset")
            farmId?.let { urlBuilder.append("&farm_id=$it") }
            regionCode?.let { urlBuilder.append("&region_code=$it") }

            val request = Request.Builder()
                .url(urlBuilder.toString())
                .header("X-API-Key", apiKey)
                .get()
                .build()

            Log.d(TAG, "📤 GET /trees")

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""

            if (!response.isSuccessful) {
                Log.e(TAG, "❌ GET /trees failed: ${response.code} - $responseBody")
                return Result.failure(ApiException(response.code, responseBody))
            }

            val envelope = gson.fromJson(responseBody, ApiEnvelope::class.java)
            val data = gson.fromJson(gson.toJson(envelope.data), TreeListData::class.java)

            Log.d(TAG, "✅ GET /trees success: ${data.items.size} trees")
            Result.success(data)

        } catch (e: Exception) {
            Log.e(TAG, "❌ GET /trees error: ${e.message}", e)
            Result.failure(e)
        }
    }

    companion object {
        private const val TAG = "TreeAPI"
    }
}
