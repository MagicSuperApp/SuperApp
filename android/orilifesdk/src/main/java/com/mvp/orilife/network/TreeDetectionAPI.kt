package com.mvp.orilife.network
import com.mvp.orilife.Config
import com.mvp.orilife.BuildConfig
import com.mvp.orilife.detection.CropResult

import android.graphics.Bitmap
import android.util.Log
import com.google.gson.Gson
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.logging.HttpLoggingInterceptor
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

data class TreeDetectionRequest(
    val imageBlob: File,
    val boxCoordinates: FloatArray,
    val timestamp: Long = System.currentTimeMillis(),
    val label: String,
    val latitude: Double? = null,
    val longitude: Double? = null
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as TreeDetectionRequest

        if (imageBlob != other.imageBlob) return false
        if (!boxCoordinates.contentEquals(other.boxCoordinates)) return false
        if (timestamp != other.timestamp) return false
        if (label != other.label) return false
        if (latitude != other.latitude) return false
        if (longitude != other.longitude) return false

        return true
    }

    override fun hashCode(): Int {
        var result = imageBlob.hashCode()
        result = 31 * result + boxCoordinates.contentHashCode()
        result = 31 * result + timestamp.hashCode()
        result = 31 * result + label.hashCode()
        result = 31 * result + (latitude?.hashCode() ?: 0)
        result = 31 * result + (longitude?.hashCode() ?: 0)
        return result
    }
}

data class SecureTreeDetectionRequest(
    val imageBlob: File,
    val imageId: String,
    val treeId: String,
    val nonce: String,
    val signature: String,
    val timestamp: Long = System.currentTimeMillis(),
    val deviceId: String,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val heading: Double? = null,
    val pitch: Double? = null,
    val roll: Double? = null
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as SecureTreeDetectionRequest

        if (imageBlob != other.imageBlob) return false
        if (imageId != other.imageId) return false
        if (treeId != other.treeId) return false
        if (nonce != other.nonce) return false
        if (signature != other.signature) return false
        if (timestamp != other.timestamp) return false
        if (deviceId != other.deviceId) return false
        if (latitude != other.latitude) return false
        if (longitude != other.longitude) return false
        if (heading != other.heading) return false
        if (pitch != other.pitch) return false
        if (roll != other.roll) return false

        return true
    }

    override fun hashCode(): Int {
        var result = imageBlob.hashCode()
        result = 31 * result + imageId.hashCode()
        result = 31 * result + treeId.hashCode()
        result = 31 * result + nonce.hashCode()
        result = 31 * result + signature.hashCode()
        result = 31 * result + timestamp.hashCode()
        result = 31 * result + deviceId.hashCode()
        result = 31 * result + (latitude?.hashCode() ?: 0)
        result = 31 * result + (longitude?.hashCode() ?: 0)
        result = 31 * result + (heading?.hashCode() ?: 0)
        result = 31 * result + (pitch?.hashCode() ?: 0)
        result = 31 * result + (roll?.hashCode() ?: 0)
        return result
    }
}

data class TreeDetectionResponse(
    val success: Boolean,
    val message: String,
    val treeId: String? = null,
    val confidence: Float? = null,
    val processingTime: Long? = null
)

class TreeDetectionAPI(private val apiUrl: String = Config.TREE_DETECTION_API) {

    private val client: OkHttpClient
    private var usedNonces = mutableSetOf<String>()

    init {
        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BASIC
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }

        client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(loggingInterceptor)
            .build()

        Log.d("TreeDetectionAPI", "✅ Initialized with API URL: $apiUrl")
    }

    suspend fun sendSecureDetection(request: SecureTreeDetectionRequest): Result<TreeDetectionResponse> {
        return try {
            Log.d("TreeDetectionAPI", "🔒 Sending secure detection request")
            Log.d("TreeDetectionAPI", "   → URL: $apiUrl")
            Log.d("TreeDetectionAPI", "   → image: ${request.imageBlob.name} (${request.imageBlob.length()} bytes)")
            Log.d("TreeDetectionAPI", "   → treeId: ${request.treeId}")
            Log.d("TreeDetectionAPI", "   → imageId: ${request.imageId}")

            // ✅ Định dạng đúng theo iOS format:
            // payload = {image_id, tree_id, time_series, metadata}
            // image   = file (PNG/JPEG)

            // Detect MIME type từ file extension
            val mimeType = when {
                request.imageBlob.name.lowercase().endsWith(".png") -> "image/png"
                else -> "image/jpeg"
            }
            val imageBody = request.imageBlob.asRequestBody(mimeType.toMediaType())

            // Build payload JSON (iOS format: 2 fields instead of 5)
            val payloadJson = buildString {
                append("{")
                append("\"image_id\":\"${request.imageId}\"")
                append(",\"tree_id\":\"${request.treeId}\"")
                append(",\"time_series\":{")
                append("\"latitude\":${request.latitude ?: "null"}")
                append(",\"longitude\":${request.longitude ?: "null"}")
                append(",\"timestamp\":${request.timestamp}")
                append(",\"heading\":${request.heading ?: "null"}")
                append(",\"pitch\":${request.pitch ?: "null"}")
                append(",\"roll\":${request.roll ?: "null"}")
                append("}")
                append(",\"metadata\":{")
                append("\"device_id\":\"${request.deviceId}\"")
                append(",\"nonce\":\"${request.nonce}\"")
                append(",\"signature\":\"${request.signature}\"")
                append("}")
                append("}")
            }
            Log.d("TreeDetectionAPI", "   → payload: $payloadJson")

            val requestBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("payload", payloadJson)
                .addFormDataPart("image", request.imageBlob.name, imageBody)
                .build()

            val httpRequest = Request.Builder()
                .url(apiUrl)
                .post(requestBody)
                .build()

            val response = client.newCall(httpRequest).execute()

            if (!response.isSuccessful) {
                Log.e("TreeDetectionAPI", "❌ HTTP ${response.code}: ${response.message}")
                return Result.failure(Exception("HTTP ${response.code}: ${response.message}"))
            }

            val responseBody = response.body?.string() ?: ""

            Log.d("TreeDetectionAPI", "✅ Response received: $responseBody")

            val apiResponse = try {
                Gson().fromJson(responseBody, TreeDetectionResponse::class.java)
            } catch (e: Exception) {
                Log.e("TreeDetectionAPI", "❌ Failed to parse response: ${e.message}")
                TreeDetectionResponse(
                    success = false,
                    message = "Failed to parse response: ${e.message}"
                )
            }

            Result.success(apiResponse)

        } catch (e: Exception) {
            Log.e("TreeDetectionAPI", "❌ Error sending secure detection: ${e.message}", e)
            Result.failure(e)
        }
    }

    suspend fun sendDetection(request: TreeDetectionRequest): Result<TreeDetectionResponse> {
        return try {
            Log.d("TreeDetectionAPI", "📤 Sending detection request...")
            Log.d("TreeDetectionAPI", "   Label: ${request.label}")
            Log.d("TreeDetectionAPI", "   GPS: lat=${request.latitude}, lng=${request.longitude}")
            Log.d("TreeDetectionAPI", "   Box: [${request.boxCoordinates[0]}, ${request.boxCoordinates[1]}, ${request.boxCoordinates[2]}, ${request.boxCoordinates[3]}]")
            Log.d("TreeDetectionAPI", "   Image size: ${request.imageBlob.length()} bytes")

            val imageBody = request.imageBlob.asRequestBody("image/jpeg".toMediaType())

            val boxCoordinatesJson = "[${request.boxCoordinates[0]},${request.boxCoordinates[1]},${request.boxCoordinates[2]},${request.boxCoordinates[3]}]"

            val requestBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("image_blob", request.imageBlob.name, imageBody)
                .addFormDataPart("box_coordinates", boxCoordinatesJson)
                .addFormDataPart("timestamp", request.timestamp.toString())
                .addFormDataPart("label", request.label)
                .apply {
                    request.latitude?.let { addFormDataPart("latitude", it.toString()) }
                    request.longitude?.let { addFormDataPart("longitude", it.toString()) }
                }
                .build()

            val httpRequest = Request.Builder()
                .url(apiUrl)
                .post(requestBody)
                .build()

            val response = client.newCall(httpRequest).execute()

            if (!response.isSuccessful) {
                Log.e("TreeDetectionAPI", "❌ HTTP ${response.code}: ${response.message}")
                return Result.failure(Exception("HTTP ${response.code}: ${response.message}"))
            }

            val responseBody = response.body?.string() ?: ""

            Log.d("TreeDetectionAPI", "✅ Response received: $responseBody")

            val apiResponse = try {
                Gson().fromJson(responseBody, TreeDetectionResponse::class.java)
            } catch (e: Exception) {
                Log.e("TreeDetectionAPI", "❌ Failed to parse response: ${e.message}")
                TreeDetectionResponse(
                    success = false,
                    message = "Failed to parse response: ${e.message}"
                )
            }

            Result.success(apiResponse)

        } catch (e: Exception) {
            Log.e("TreeDetectionAPI", "❌ Error sending detection: ${e.message}", e)
            Result.failure(e)
        }
    }

    suspend fun sendMultipleDetections(requests: List<TreeDetectionRequest>): Result<List<TreeDetectionResponse>> {
        val results = mutableListOf<TreeDetectionResponse>()

        for (request in requests) {
            when (val result = sendDetection(request)) {
                null -> {
                    Log.e("TreeDetectionAPI", "Failed to send detection: Unknown error")
                    results.add(
                        TreeDetectionResponse(
                            success = false,
                            message = "Unknown error"
                        )
                    )
                }
                else -> {
                    when {
                        result.isSuccess -> {
                            results.add(result.getOrNull() ?: TreeDetectionResponse(
                                success = false,
                                message = "Unknown error"
                            ))
                        }
                        else -> {
                            Log.e("TreeDetectionAPI", "Failed to send detection: ${result.exceptionOrNull()?.message}")
                            results.add(
                                TreeDetectionResponse(
                                    success = false,
                                    message = result.exceptionOrNull()?.message ?: "Unknown error"
                                )
                            )
                        }
                    }
                }
            }
        }

        return Result.success(results)
    }

    companion object {
        /**
         * Lưu bitmap ra file PNG — giữ alpha channel cho transparent backgrounds.
         * Dùng khi cần transparent (background removal output).
         */
        fun bitmapToPngFile(bitmap: Bitmap, filename: String = "tree_detection_${System.currentTimeMillis()}.png"): File {
            val tempFile = File.createTempFile(
                filename.substringBeforeLast('.').ifEmpty { "tree_detection_${System.currentTimeMillis()}" },
                ".png"
            )
            FileOutputStream(tempFile).use { outputStream ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, outputStream)
                outputStream.flush()
            }
            Log.d("TreeDetectionAPI", "💾 PNG saved: ${tempFile.length()}bytes (${bitmap.width}x${bitmap.height})")
            return tempFile
        }

        /**
         * Lưu bitmap ra file JPEG — cho ảnh không cần transparent.
         * Dùng cho crop thông thường.
         */
        fun bitmapToJpegFile(bitmap: Bitmap, filename: String = "tree_detection_${System.currentTimeMillis()}.jpg"): File {
            val tempFile = File.createTempFile(
                filename.substringBeforeLast('.').ifEmpty { "tree_detection_${System.currentTimeMillis()}" },
                ".jpg"
            )
            FileOutputStream(tempFile).use { outputStream ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, 98, outputStream)
                outputStream.flush()
            }
            Log.d("TreeDetectionAPI", "💾 JPEG saved: ${tempFile.length()}bytes (${bitmap.width}x${bitmap.height})")
            return tempFile
        }

        /**
         * Đọc PNG bytes trực tiếp từ file — KHÔNG decode/re-encode.
         * Giữ nguyên alpha channel (transparent) qua pipeline upload.
         */
        fun readPngBytes(imagePath: String): ByteArray? {
            return try {
                val file = File(imagePath)
                if (!file.exists()) {
                    Log.e("TreeDetectionAPI", "❌ PNG file not found: $imagePath")
                    return null
                }
                val bytes = file.readBytes()
                Log.d("TreeDetectionAPI", "💾 PNG_BYTES: path=$imagePath, size=${bytes.size}bytes")
                bytes
            } catch (e: Exception) {
                Log.e("TreeDetectionAPI", "❌ Failed to read PNG bytes: ${e.message}")
                null
            }
        }

        /**
         * Lưu PNG bytes ra temp file — dùng để gửi lên server giữ nguyên transparent.
         */
        fun savePngBytesToFile(bytes: ByteArray, prefix: String = "tree_detection"): File {
            val tempFile = File.createTempFile(prefix, ".png")
            tempFile.writeBytes(bytes)
            Log.d("TreeDetectionAPI", "💾 PNG_FILE: ${tempFile.absolutePath}, size=${bytes.size}bytes")
            return tempFile
        }

        /**
         * Hash PNG bytes trực tiếp — thay vì hash decoded bitmap.
         * Dùng để sign request với PNG bytes gốc (giữ nguyên transparent).
         */
        fun hashPngBytes(bytes: ByteArray): String {
            val md = java.security.MessageDigest.getInstance("SHA-256")
            val digest = md.digest(bytes)
            return digest.joinToString("") { "%02x".format(it) }
        }

        fun cropResultToRequest(cropResult: CropResult, label: String, latitude: Double? = null, longitude: Double? = null): TreeDetectionRequest? {
            val imageFile = bitmapToJpegFile(cropResult.croppedBitmap)

            return TreeDetectionRequest(
                imageBlob = imageFile,
                boxCoordinates = cropResult.normalizedBoxCoordinates, // Use normalized coordinates
                label = label,
                latitude = latitude,
                longitude = longitude
            )
        }

        /**
         * Tạo SecureTreeDetectionRequest từ PNG file path.
         * Đọc PNG bytes TRỰC TIẾP → gửi lên server giữ nguyên transparent.
         *
         * @param pngImagePath  Đường dẫn file PNG đã được save bởi saveCroppedImage()
         * @param imageId       Unique image ID
         * @param treeId        Tree session ID
         * @param nonce         Security nonce
         * @param signature     Request signature (computed từ PNG bytes hash)
         * @param deviceId      Device ID
         * @param latitude      GPS latitude
         * @param longitude     GPS longitude
         * @param heading       Compass heading
         * @param pitch         Device pitch
         * @param roll          Device roll
         */
        fun createSecureRequestFromPng(
            pngImagePath: String,
            imageId: String,
            treeId: String,
            nonce: String,
            signature: String,
            deviceId: String,
            latitude: Double? = null,
            longitude: Double? = null,
            heading: Double? = null,
            pitch: Double? = null,
            roll: Double? = null
        ): SecureTreeDetectionRequest? {
            val pngBytes = readPngBytes(pngImagePath) ?: return null
            val pngFile = savePngBytesToFile(pngBytes)

            return SecureTreeDetectionRequest(
                imageBlob = pngFile,
                imageId = imageId,
                treeId = treeId,
                nonce = nonce,
                signature = signature,
                deviceId = deviceId,
                latitude = latitude,
                longitude = longitude,
                heading = heading,
                pitch = pitch,
                roll = roll
            )
        }

        fun cropResultToSecureRequest(
            cropResult: CropResult,
            imageId: String,
            treeId: String,
            nonce: String,
            counter: Long,
            signature: String,
            deviceId: String,
            latitude: Double? = null,
            longitude: Double? = null,
            heading: Double? = null,
            pitch: Double? = null,
            roll: Double? = null
        ): SecureTreeDetectionRequest? {
            val imageFile = bitmapToJpegFile(cropResult.croppedBitmap)

            return SecureTreeDetectionRequest(
                imageBlob = imageFile,
                imageId = imageId,
                treeId = treeId,
                nonce = nonce,
                signature = signature,
                deviceId = deviceId,
                latitude = latitude,
                longitude = longitude,
                heading = heading,
                pitch = pitch,
                roll = roll
            )
        }
    }
}
