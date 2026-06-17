package com.mvp.orilife.utils

import kotlin.math.floor

/**
 * Geohash encoder
 * Converts lat/lng to geohash string with configurable precision.
 *
 * Backend requires precision=7 for tree identification (§5.2).
 *
 * Reference: https://en.wikipedia.org/wiki/Geohash
 */
object GeohashHelper {

    private const val BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"

    /**
     * Encode latitude and longitude to geohash string.
     *
     * @param latitude  Latitude in degrees [-90, 90]
     * @param longitude Longitude in degrees [-180, 180]
     * @param precision Number of characters in output (default 7)
     * @return Geohash string (lowercase alphanumeric)
     *
     * Example:
     * encode(10.12367, 107.12372, 7) → "w3gvk9q"
     */
    fun encode(latitude: Double, longitude: Double, precision: Int = 7): String {
        require(latitude in -90.0..90.0) { "Latitude must be in [-90, 90]" }
        require(longitude in -180.0..180.0) { "Longitude must be in [-180, 180]" }
        require(precision > 0) { "Precision must be > 0" }

        var latMin = -90.0
        var latMax = 90.0
        var lonMin = -180.0
        var lonMax = 180.0

        val geohash = StringBuilder()
        var isEven = true
        var bit = 0
        var ch = 0

        while (geohash.length < precision) {
            if (isEven) {
                // Longitude
                val mid = (lonMin + lonMax) / 2
                if (longitude >= mid) {
                    ch = ch or (1 shl (4 - bit))
                    lonMin = mid
                } else {
                    lonMax = mid
                }
            } else {
                // Latitude
                val mid = (latMin + latMax) / 2
                if (latitude >= mid) {
                    ch = ch or (1 shl (4 - bit))
                    latMin = mid
                } else {
                    latMax = mid
                }
            }

            isEven = !isEven

            if (bit < 4) {
                bit++
            } else {
                geohash.append(BASE32[ch])
                bit = 0
                ch = 0
            }
        }

        return geohash.toString()
    }

    /**
     * Decode geohash string to lat/lng bounding box.
     *
     * @param geohash Geohash string
     * @return Pair of (latitude, longitude) representing the center of the bounding box
     */
    fun decode(geohash: String): Pair<Double, Double> {
        require(geohash.isNotEmpty()) { "Geohash cannot be empty" }

        var latMin = -90.0
        var latMax = 90.0
        var lonMin = -180.0
        var lonMax = 180.0

        var isEven = true

        for (char in geohash.lowercase()) {
            val idx = BASE32.indexOf(char)
            require(idx >= 0) { "Invalid geohash character: $char" }

            for (i in 4 downTo 0) {
                val bit = (idx shr i) and 1

                if (isEven) {
                    // Longitude
                    val mid = (lonMin + lonMax) / 2
                    if (bit == 1) {
                        lonMin = mid
                    } else {
                        lonMax = mid
                    }
                } else {
                    // Latitude
                    val mid = (latMin + latMax) / 2
                    if (bit == 1) {
                        latMin = mid
                    } else {
                        latMax = mid
                    }
                }

                isEven = !isEven
            }
        }

        val latitude = (latMin + latMax) / 2
        val longitude = (lonMin + lonMax) / 2

        return Pair(latitude, longitude)
    }

    /**
     * Get bounding box for a geohash.
     *
     * @return Quadruple of (latMin, latMax, lonMin, lonMax)
     */
    fun getBounds(geohash: String): Quadruple<Double, Double, Double, Double> {
        var latMin = -90.0
        var latMax = 90.0
        var lonMin = -180.0
        var lonMax = 180.0

        var isEven = true

        for (char in geohash.lowercase()) {
            val idx = BASE32.indexOf(char)
            require(idx >= 0) { "Invalid geohash character: $char" }

            for (i in 4 downTo 0) {
                val bit = (idx shr i) and 1

                if (isEven) {
                    val mid = (lonMin + lonMax) / 2
                    if (bit == 1) lonMin = mid else lonMax = mid
                } else {
                    val mid = (latMin + latMax) / 2
                    if (bit == 1) latMin = mid else latMax = mid
                }

                isEven = !isEven
            }
        }

        return Quadruple(latMin, latMax, lonMin, lonMax)
    }

    data class Quadruple<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)
}
