package com.mvp.orilife.security

import android.util.Base64
import java.nio.charset.StandardCharsets.UTF_8
import java.security.MessageDigest
import java.util.UUID

/**
 * Utility sinh ID cho payload gửi lên server.
 *
 * image_id: UUID v4 — đảm bảo unique tuyệt đối (2^122 combinations)
 * tree_id:  SHA256(deviceId + sessionId + timestamp)[0..8].uppercase()
 */
object IdGenerator {

    private const val IMAGE_PREFIX = "IMAGE_"
    private const val TREE_PREFIX = "TREE_"

    /**
     * Sinh image_id: IMAGE_ + UUID v4
     * Sinh mới mỗi lần chụp, đảm bảo unique tuyệt đối.
     */
    fun generateImageId(): String {
        return IMAGE_PREFIX + UUID.randomUUID().toString()
    }

    /**
     * Sinh tree_id: TREE_ + SHA256(deviceId + sessionId + timestamp)[0..8].uppercase()
     *
     * Tính 1 lần khi bắt đầu session, dùng chung cho cả 5 ảnh trong session.
     * Cùng device + session + timestamp → cùng tree_id.
     *
     * @param deviceId  Public key fingerprint (device identifier)
     * @param sessionId Session UUID
     * @param timestamp Epoch milliseconds tại thời điểm bắt đầu session
     */
    fun generateTreeId(deviceId: String, sessionId: String, timestamp: Long): String {
        val input = "$deviceId$sessionId$timestamp"
        val sha256Bytes = sha256(input.toByteArray(UTF_8))
        val hashHex = sha256Bytes.sliceArray(0..7).toHexString().uppercase()
        return TREE_PREFIX + hashHex
    }

    private fun sha256(input: ByteArray): ByteArray {
        return MessageDigest.getInstance("SHA-256").digest(input)
    }

    private fun ByteArray.toHexString(): String {
        return joinToString("") { "%02x".format(it) }
    }
}
