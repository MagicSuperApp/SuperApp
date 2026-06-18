package com.mvp.orilife.network

import android.util.Log
import com.google.gson.Gson
import com.mvp.orilife.network.ApiEnvelope
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Evidence API Client
 * Handles /evidences/ingest endpoint (§6.2)
 */
class EvidenceAPI(
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

        Log.d(TAG, "✅ EvidenceAPI initialized: baseUrl=$baseUrl")
    }

    /**
     * POST /evidences/ingest - Ingest evidence (§6.2)
     * Multipart upload with image + metadata
     */
    suspend fun ingest(request: IngestRequest): Result<IngestResponse> {
        return try {
            Log.d(TAG, "📤 POST /evidences/ingest")
            Log.d(TAG, "   → treeId: ${request.treeId}")
            Log.d(TAG, "   → imageId: ${request.imageId}")
            Log.d(TAG, "   → image: ${request.imageFile.name} (${request.imageFile.length()} bytes)")

            // Detect MIME type
            val mimeType = when {
                request.imageFile.name.lowercase().endsWith(".png") -> "image/png"
                else -> "image/jpeg"
            }
            val imageBody = request.imageFile.asRequestBody(mimeType.toMediaType())

            // Build payload JSON (iOS format: 2 fields instead of 5)
            val payloadJson = buildString {
                append("{")
                append("\"image_id\":\"${request.imageId}\"")
                append(",\"tree_id\":\"${request.treeId}\"")
                append(",\"time_series\":{")
                append("\"latitude\":${request.timeSeries.latitude ?: "null"}")
                append(",\"longitude\":${request.timeSeries.longitude ?: "null"}")
                append(",\"timestamp\":${request.timeSeries.timestamp}")
                append(",\"heading\":${request.timeSeries.heading ?: "null"}")
                append(",\"pitch\":${request.timeSeries.pitch ?: "null"}")
                append(",\"roll\":${request.timeSeries.roll ?: "null"}")
                append("}")
                append(",\"metadata\":{")
                append("\"device_id\":\"${request.metadata.deviceId}\"")
                append(",\"nonce\":\"${request.metadata.nonce}\"")
                append(",\"signature\":\"${request.metadata.signature}\"")
                append("}")
                append("}")
            }

            val requestBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("payload", payloadJson)
                .addFormDataPart("image", request.imageFile.name, imageBody)
                .build()

            val httpRequest = Request.Builder()
                .url("$baseUrl/evidences/ingest")
                .header("X-API-Key", apiKey)
                .post(requestBody)
                .build()

            val response = client.newCall(httpRequest).execute()
            val responseBody = response.body?.string() ?: ""

            if (!response.isSuccessful) {
                Log.e(TAG, "❌ POST /evidences/ingest failed: ${response.code} - $responseBody")
                return Result.failure(ApiException(response.code, responseBody))
            }

            val envelope = gson.fromJson(responseBody, ApiEnvelope::class.java)
            val ingestResponse = gson.fromJson(gson.toJson(envelope.data), IngestResponse::class.java)

            Log.d(TAG, "✅ POST /evidences/ingest success: imageId=${ingestResponse.imageId}, treeId=${ingestResponse.treeId}")
            Result.success(ingestResponse)

        } catch (e: Exception) {
            Log.e(TAG, "❌ POST /evidences/ingest error: ${e.message}", e)
            Result.failure(e)
        }
    }

    companion object {
        private const val TAG = "EvidenceAPI"
    }
}

// MARK: - Request Models

data class IngestRequest(
    val treeId: String,
    val imageId: String,
    val imageFile: File,
    val timeSeries: TimeSeriesData,
    val metadata: MetadataData
)

data class TimeSeriesData(
    val latitude: Double?,
    val longitude: Double?,
    val timestamp: Long,
    val heading: Double?,
    val pitch: Double?,
    val roll: Double?
)

data class MetadataData(
    val deviceId: String,
    val nonce: String,
    val signature: String
)

// MARK: - Response Models

data class IngestResponse(
    val success: Boolean,
    val imageId: String,
    val treeId: String,
    val featuresExtracted: FeaturesExtracted?,
    val storageKeys: StorageKeys?,
    val message: String
)

data class FeaturesExtracted(
    val globalDim: Int,
    val localKeypoints: Int,
    val localDim: Int
)

data class StorageKeys(
    val globalFeatures: String?,
    val localFeatures: String?,
    val image: String?
)
