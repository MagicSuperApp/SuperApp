package com.mvp.orilife.network.models

import com.google.gson.annotations.SerializedName

/**
 * GeoJSON Polygon
 * Format: {"type":"Polygon","coordinates":[[[lng,lat],[lng,lat],...]]}
 */
data class GeoJsonPolygon(
    @SerializedName("type")
    val type: String = "Polygon",

    @SerializedName("coordinates")
    val coordinates: List<List<List<Double>>>  // [[[lng,lat],[lng,lat],...]]
)

/**
 * Farm response from backend (§4.2)
 */
data class Farm(
    @SerializedName("farm_id")
    val farmId: String,

    @SerializedName("owner_did")
    val ownerDid: String,

    @SerializedName("region_code")
    val regionCode: String,

    @SerializedName("farm_name")
    val farmName: String?,

    @SerializedName("boundary")
    val boundary: GeoJsonPolygon,

    @SerializedName("lon_origin")
    val lonOrigin: Double?,

    @SerializedName("lat_origin")
    val latOrigin: Double?,

    @SerializedName("row_spacing")
    val rowSpacing: Double?,

    @SerializedName("col_spacing")
    val colSpacing: Double?,

    @SerializedName("created_at")
    val createdAt: String,

    @SerializedName("updated_at")
    val updatedAt: String
)

/**
 * Farm create request (§4.2)
 */
data class FarmCreateRequest(
    @SerializedName("farm_id")
    val farmId: String,

    @SerializedName("owner_did")
    val ownerDid: String,

    @SerializedName("region_code")
    val regionCode: String,

    @SerializedName("farm_name")
    val farmName: String?,

    @SerializedName("boundary")
    val boundary: GeoJsonPolygon
)

/**
 * Grid config request (§4.9)
 */
data class GridConfigRequest(
    @SerializedName("lon_origin")
    val lonOrigin: Double,

    @SerializedName("lat_origin")
    val latOrigin: Double,

    @SerializedName("row_spacing")
    val rowSpacing: Double,

    @SerializedName("col_spacing")
    val colSpacing: Double
)

/**
 * Grid config response (§4.8)
 */
data class GridConfigResponse(
    @SerializedName("farm_id")
    val farmId: String,

    @SerializedName("total_trees")
    val totalTrees: Int,

    @SerializedName("row_min")
    val rowMin: Int?,

    @SerializedName("row_max")
    val rowMax: Int?,

    @SerializedName("col_min")
    val colMin: Int?,

    @SerializedName("col_max")
    val colMax: Int?,

    @SerializedName("lon_origin")
    val lonOrigin: Double?,

    @SerializedName("lat_origin")
    val latOrigin: Double?,

    @SerializedName("row_spacing")
    val rowSpacing: Double?,

    @SerializedName("col_spacing")
    val colSpacing: Double?
)

/**
 * Farm list response (§4.1)
 */
data class FarmListData(
    @SerializedName("items")
    val items: List<Farm>,

    @SerializedName("limit")
    val limit: Int,

    @SerializedName("offset")
    val offset: Int
)
