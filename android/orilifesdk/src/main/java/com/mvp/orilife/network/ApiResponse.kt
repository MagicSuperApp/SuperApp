package com.mvp.orilife.network

import com.google.gson.annotations.SerializedName

/**
 * API Response Envelope
 *
 * Backend wraps all responses in this envelope format (§1.2):
 * {
 *   "status_code": 200,
 *   "message": "OK",
 *   "error": null,
 *   "data": { ... }
 * }
 */
data class ApiEnvelope<T>(
    @SerializedName("status_code")
    val statusCode: Int,

    @SerializedName("message")
    val message: String,

    @SerializedName("error")
    val error: Any?,  // Can be string or object

    @SerializedName("data")
    val data: T?
) {
    val isSuccess: Boolean
        get() = statusCode in 200..299 && error == null

    fun getDataOrThrow(): T {
        if (!isSuccess) {
            val errorMsg = when (error) {
                is String -> error
                is Map<*, *> -> (error as? Map<String, Any>)?.get("detail")?.toString() ?: message
                else -> message
            }
            throw ApiException(statusCode, errorMsg)
        }
        return data ?: throw ApiException(statusCode, "Response data is null")
    }
}

/**
 * API Exception
 */
class ApiException(
    val statusCode: Int,
    override val message: String
) : Exception(message) {

    val isClientError: Boolean
        get() = statusCode in 400..499

    val isServerError: Boolean
        get() = statusCode in 500..599

    val isUnauthorized: Boolean
        get() = statusCode == 401

    val isNotFound: Boolean
        get() = statusCode == 404

    val isConflict: Boolean
        get() = statusCode == 409

    companion object {
        fun from(statusCode: Int, message: String): ApiException {
            return ApiException(statusCode, message)
        }
    }
}
