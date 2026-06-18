package com.mvp.orilife.network

import android.util.Log
import com.google.gson.Gson
import com.mvp.orilife.network.models.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import java.util.concurrent.TimeUnit

/**
 * Farm API Client
 * Handles /farms endpoints (§4)
 */
class FarmAPI(
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

        Log.d(TAG, "✅ FarmAPI initialized: baseUrl=$baseUrl")
    }

    /**
     * GET /farms - List farms (§4.1)
     */
    suspend fun getFarms(
        regionCode: String? = null,
        ownerDid: String? = null,
        limit: Int = 100,
        offset: Int = 0
    ): Result<FarmListData> {
        return try {
            val url = ("$baseUrl/farms").toHttpUrl().newBuilder()
                .addQueryParameter("limit", limit.toString())
                .addQueryParameter("offset", offset.toString())
                .apply {
                    regionCode?.let { addQueryParameter("region_code", it) }
                    ownerDid?.let { addQueryParameter("owner_did", it) }
                }
                .build()

            val request = Request.Builder()
                .url(url)
                .header("X-API-Key", apiKey)
                .get()
                .build()

            Log.d(TAG, "📤 GET /farms")

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""

            if (!response.isSuccessful) {
                Log.e(TAG, "❌ GET /farms failed: ${response.code} - $responseBody")
                return Result.failure(ApiException(response.code, responseBody))
            }

            val envelope = gson.fromJson(responseBody, ApiEnvelope::class.java)
            val data = gson.fromJson(gson.toJson(envelope.data), FarmListData::class.java)

            Log.d(TAG, "✅ GET /farms success: ${data.items.size} farms")
            Result.success(data)

        } catch (e: Exception) {
            Log.e(TAG, "❌ GET /farms error: ${e.message}", e)
            Result.failure(e)
        }
    }

    /**
     * POST /farms - Create farm (§4.2)
     */
    suspend fun createFarm(request: FarmCreateRequest): Result<Farm> {
        return try {
            val json = gson.toJson(request)
            val requestBody = json.toRequestBody("application/json".toMediaType())

            val httpRequest = Request.Builder()
                .url("$baseUrl/farms")
                .header("X-API-Key", apiKey)
                .post(requestBody)
                .build()

            Log.d(TAG, "📤 POST /farms: farmId=${request.farmId}")

            val response = client.newCall(httpRequest).execute()
            val responseBody = response.body?.string() ?: ""

            if (!response.isSuccessful) {
                Log.e(TAG, "❌ POST /farms failed: ${response.code} - $responseBody")
                return Result.failure(ApiException(response.code, responseBody))
            }

            val envelope = gson.fromJson(responseBody, ApiEnvelope::class.java)
            val farm = gson.fromJson(gson.toJson(envelope.data), Farm::class.java)

            Log.d(TAG, "✅ POST /farms success: farmId=${farm.farmId}")
            Result.success(farm)

        } catch (e: Exception) {
            Log.e(TAG, "❌ POST /farms error: ${e.message}", e)
            Result.failure(e)
        }
    }

    /**
     * GET /farms/{farm_id} - Get farm detail (§4.3)
     */
    suspend fun getFarmById(farmId: String): Result<Farm> {
        return try {
            val request = Request.Builder()
                .url("$baseUrl/farms/$farmId")
                .header("X-API-Key", apiKey)
                .get()
                .build()

            Log.d(TAG, "📤 GET /farms/$farmId")

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""

            if (!response.isSuccessful) {
                Log.e(TAG, "❌ GET /farms/$farmId failed: ${response.code} - $responseBody")
                return Result.failure(ApiException(response.code, responseBody))
            }

            val envelope = gson.fromJson(responseBody, ApiEnvelope::class.java)
            val farm = gson.fromJson(gson.toJson(envelope.data), Farm::class.java)

            Log.d(TAG, "✅ GET /farms/$farmId success")
            Result.success(farm)

        } catch (e: Exception) {
            Log.e(TAG, "❌ GET /farms/$farmId error: ${e.message}", e)
            Result.failure(e)
        }
    }

    /**
     * GET /farms/{farm_id}/grid-config - Get grid config (§4.8)
     */
    suspend fun getGridConfig(farmId: String): Result<GridConfigResponse> {
        return try {
            val request = Request.Builder()
                .url("$baseUrl/farms/$farmId/grid-config")
                .header("X-API-Key", apiKey)
                .get()
                .build()

            Log.d(TAG, "📤 GET /farms/$farmId/grid-config")

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""

            if (!response.isSuccessful) {
                Log.e(TAG, "❌ GET /farms/$farmId/grid-config failed: ${response.code}")
                return Result.failure(ApiException(response.code, responseBody))
            }

            val envelope = gson.fromJson(responseBody, ApiEnvelope::class.java)
            val config = gson.fromJson(gson.toJson(envelope.data), GridConfigResponse::class.java)

            Log.d(TAG, "✅ GET /farms/$farmId/grid-config success")
            Result.success(config)

        } catch (e: Exception) {
            Log.e(TAG, "❌ GET /farms/$farmId/grid-config error: ${e.message}", e)
            Result.failure(e)
        }
    }

    /**
     * POST /farms/{farm_id}/grid-config - Set grid config (§4.9)
     */
    suspend fun setGridConfig(farmId: String, config: GridConfigRequest): Result<GridConfigResponse> {
        return try {
            val json = gson.toJson(config)
            val requestBody = json.toRequestBody("application/json".toMediaType())

            val httpRequest = Request.Builder()
                .url("$baseUrl/farms/$farmId/grid-config")
                .header("X-API-Key", apiKey)
                .post(requestBody)
                .build()

            Log.d(TAG, "📤 POST /farms/$farmId/grid-config")

            val response = client.newCall(httpRequest).execute()
            val responseBody = response.body?.string() ?: ""

            if (!response.isSuccessful) {
                Log.e(TAG, "❌ POST /farms/$farmId/grid-config failed: ${response.code}")
                return Result.failure(ApiException(response.code, responseBody))
            }

            val envelope = gson.fromJson(responseBody, ApiEnvelope::class.java)
            val gridConfig = gson.fromJson(gson.toJson(envelope.data), GridConfigResponse::class.java)

            Log.d(TAG, "✅ POST /farms/$farmId/grid-config success")
            Result.success(gridConfig)

        } catch (e: Exception) {
            Log.e(TAG, "❌ POST /farms/$farmId/grid-config error: ${e.message}", e)
            Result.failure(e)
        }
    }

    companion object {
        private const val TAG = "FarmAPI"
    }
}
