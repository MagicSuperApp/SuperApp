package com.aladincontract.company

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import org.json.JSONArray
import org.json.JSONObject

class FarmDetailActivity : ReactActivity() {
    
    companion object {
        const val EXTRA_FARM_ID = "farm_id"
        
        // Scan result data
        const val EXTRA_SCAN_TREE_IDS = "scan_tree_ids"
        const val EXTRA_SCAN_COUNT = "scan_count"
        const val EXTRA_SCAN_IMAGES = "scan_images"
    }

    // Trả về tên bạn đã đăng ký ở AppRegistry.registerComponent
    override fun getMainComponentName(): String? = "FarmDetailScreen"

    override fun createReactActivityDelegate(): ReactActivityDelegate {
        return object : DefaultReactActivityDelegate(this, mainComponentName!!, fabricEnabled) {
            override fun getLaunchOptions(): Bundle {
                val initialProps = Bundle()
                
                // Get farm data from intent
                val farmId = intent.getStringExtra(EXTRA_FARM_ID)
                
                // Get scan result data from intent
                val scanTreeIds = intent.getStringArrayListExtra(EXTRA_SCAN_TREE_IDS)
                val scanCount = intent.getIntExtra(EXTRA_SCAN_COUNT, 0)
                val scanImages = intent.getStringArrayListExtra(EXTRA_SCAN_IMAGES)
                          
                initialProps.putString("farm_id", farmId)
                
                // Build scan result object if available
                if (scanTreeIds != null && scanTreeIds.isNotEmpty()) {
                    val scanResultJson = JSONObject().apply {
                        put("treeIds", JSONArray(scanTreeIds))
                        put("count", scanCount)
                        put("code", if (scanTreeIds.isNotEmpty()) "TREE-${scanTreeIds[0].uppercase()}" else "")
                    }
                    initialProps.putString("scanResult", scanResultJson.toString())
                }
                
                // Pass scan images if available
                if (scanImages != null && scanImages.isNotEmpty()) {
                    initialProps.putStringArrayList("images", scanImages)
                }
                
                return initialProps
            }
        }
    }
}
