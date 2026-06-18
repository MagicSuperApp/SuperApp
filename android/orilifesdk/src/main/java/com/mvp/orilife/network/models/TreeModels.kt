package com.mvp.orilife.network.models

import com.google.gson.annotations.SerializedName

/**
 * Tree response from backend (§5.2)
 */
data class Tree(
    @SerializedName("id")
    val id: String,

    @SerializedName("region_code")
    val regionCode: String,

    @SerializedName("farm_id")
    val farmId: String,

    @SerializedName("geohash_7")
    val geohash7: String,

    @SerializedName("latitude")
    val latitude: Double?,

    @SerializedName("longitude")
    val longitude: Double?,

    @SerializedName("row_idx")
    val rowIdx: Int?,

    @SerializedName("col_idx")
    val colIdx: Int?,

    @SerializedName("codebook_id")
    val codebookId: String?,

    @SerializedName("metadata")
    val metadata: Map<String, Any>?,  // Free-form: species, cultivar, health, age_years

    @SerializedName("captured_at")
    val capturedAt: String?,

    @SerializedName("created_at")
    val createdAt: String,

    @SerializedName("updated_at")
    val updatedAt: String,

    @SerializedName("representative_vector")
    val representativeVector: List<Float>?,

    @SerializedName("binary_code")
    val binaryCode: String?,

    @SerializedName("pq_code")
    val pqCode: String?
)

/**
 * Tree create request (§5.2)
 */
data class TreeCreateRequest(
    @SerializedName("id")
    val id: String,

    @SerializedName("region_code")
    val regionCode: String,

    @SerializedName("farm_id")
    val farmId: String,

    @SerializedName("geohash_7")
    val geohash7: String,

    @SerializedName("latitude")
    val latitude: Double?,

    @SerializedName("longitude")
    val longitude: Double?,

    @SerializedName("row_idx")
    val rowIdx: Int?,

    @SerializedName("col_idx")
    val colIdx: Int?,

    @SerializedName("codebook_id")
    val codebookId: String? = "codebook_v1",

    @SerializedName("metadata")
    val metadata: Map<String, Any>?,

    @SerializedName("captured_at")
    val capturedAt: String?
)

/**
 * Tree list response (§5.1)
 */
data class TreeListData(
    @SerializedName("items")
    val items: List<Tree>,

    @SerializedName("limit")
    val limit: Int?,

    @SerializedName("offset")
    val offset: Int?
)
