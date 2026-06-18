package com.mvp.orilife.data

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.os.Looper
import android.util.Log
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices

class LocationHelper(private val context: Context, private val callback: LocationListener) {

    private var fusedLocationClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)
    private var locationCallback: LocationCallback
    private var currentLocation: Location? = null

    init {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                for (location in locationResult.locations) {
                    currentLocation = location
                    Log.d("LocationHelper", "New location: ${location.latitude}, ${location.longitude}, acc=${location.accuracy}")
                    
                    if (location.accuracy <= REQUIRED_ACCURACY) {
                        callback.onLocationFound(location)
                    } else {
                        callback.onLocationWait(location.accuracy)
                    }
                }
            }
        }
    }

    @SuppressLint("MissingPermission")
    fun startLocationUpdates() {
        // Using LocationRequest API compatible with play-services-location 18.0.0
        // (LocationRequest.Builder and Priority require 21.0.1+)
        @Suppress("DEPRECATION")
        val locationRequest = LocationRequest.create().apply {
            priority = LocationRequest.PRIORITY_HIGH_ACCURACY
            interval = 2000
            fastestInterval = 1000
            setWaitForAccurateLocation(false)
        }

        fusedLocationClient.requestLocationUpdates(
            locationRequest,
            locationCallback,
            Looper.getMainLooper()
        )
    }

    fun stopLocationUpdates() {
        fusedLocationClient.removeLocationUpdates(locationCallback)
    }

    fun getLastKnownLocation(): Location? {
        return currentLocation
    }

    interface LocationListener {
        fun onLocationFound(location: Location)
        fun onLocationWait(currentAccuracy: Float)
    }

    companion object {
        const val REQUIRED_ACCURACY = 12.0f // meters
    }
}
