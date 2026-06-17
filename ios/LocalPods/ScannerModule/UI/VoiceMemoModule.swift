// VoiceMemoModule.swift
//
// Build 49 § 3 — Promise-based AVAudioRecorder bridge cho tab "Thông tin"
// trong TreeDetailScreen. Single voice memo per tree, ≤30s AAC mono 22kHz
// to keep file size <500KB (~64kbps ABR).
//
// KHÔNG dùng RCTEventEmitter — chỉ Promise. Pattern: spec session-3 § 4.
//
// File storage:  /Caches/voice_memos/<treeId>.m4a
// When capture session starts, voice memo is attached to tree metadata.
// Bundle assembly copies the file into TAR (deferred to merge with Session 1).

import Foundation
import AVFoundation
import React

@objc(VoiceMemoModule)
final class VoiceMemoModule: NSObject {

    // MARK: - Module plumbing

    private let queue = DispatchQueue(label: "vn.aladinapp.voiceMemo", qos: .userInitiated)
    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var recordingStartedAt: Date?
    private var maxDurationS: TimeInterval = 30.0

    @objc static func moduleName() -> String! {
        return "VoiceMemoModule"
    }

    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }

    // MARK: - Helpers

    private func memosDir() -> URL {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        let dir = caches.appendingPathComponent("voice_memos", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    private func fileURL(forTreeId treeId: String) -> URL {
        // Sanitize treeId — only [A-Za-z0-9_-] survive — fall back to "tree"
        // for any otherwise-invalid identifier.
        let safe = treeId.replacingOccurrences(of: "[^A-Za-z0-9_-]",
                                                with: "_",
                                                options: .regularExpression)
        let name = safe.isEmpty ? "tree" : safe
        return memosDir().appendingPathComponent("\(name).m4a")
    }

    private func ensurePermissionAndSession(_ completion: @escaping (Result<Void, NSError>) -> Void) {
        let session = AVAudioSession.sharedInstance()

        let configureSession: () -> Void = {
            do {
                // iOS 17 renamed .allowBluetooth → .allowBluetoothHFP; fall back
                // to the legacy name on iOS 14-16 (project deployment target).
                var opts: AVAudioSession.CategoryOptions = [.defaultToSpeaker]
                if #available(iOS 17.0, *) {
                    opts.insert(.allowBluetoothHFP)
                } else {
                    opts.insert(.allowBluetooth)
                }
                try session.setCategory(.playAndRecord, mode: .default, options: opts)
                try session.setActive(true, options: [])
                completion(.success(()))
            } catch {
                completion(.failure(NSError(domain: "VoiceMemoModule",
                                            code: -2,
                                            userInfo: [NSLocalizedDescriptionKey:
                                                "Không thể kích hoạt micro: \(error.localizedDescription)"])))
            }
        }

        session.requestRecordPermission { granted in
            DispatchQueue.main.async {
                if granted {
                    configureSession()
                } else {
                    completion(.failure(NSError(domain: "VoiceMemoModule",
                                                code: -1,
                                                userInfo: [NSLocalizedDescriptionKey:
                                                    "Quyền micro bị từ chối. Vui lòng cấp quyền trong Cài đặt."])))
                }
            }
        }
    }

    // MARK: - RN methods

    @objc(startRecording:resolver:rejecter:)
    func startRecording(_ treeId: NSString,
                        resolver resolve: @escaping RCTPromiseResolveBlock,
                        rejecter reject: @escaping RCTPromiseRejectBlock) {
        let treeIdStr = treeId as String
        guard !treeIdStr.isEmpty else {
            reject("E_BAD_PARAMS", "treeId is required", nil); return
        }

        ensurePermissionAndSession { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure(let err):
                reject("E_PERMISSION", err.localizedDescription, err)
            case .success:
                self.queue.async {
                    // If a previous recorder is still alive, stop it cleanly
                    // before starting a new one — guards against double-tap
                    // races from JS.
                    if let existing = self.recorder, existing.isRecording {
                        existing.stop()
                    }
                    self.recorder = nil

                    let url = self.fileURL(forTreeId: treeIdStr)
                    // Overwrite any prior memo for this tree (single-memo policy).
                    try? FileManager.default.removeItem(at: url)

                    let settings: [String: Any] = [
                        AVFormatIDKey:             kAudioFormatMPEG4AAC,
                        AVSampleRateKey:           22050.0,
                        AVNumberOfChannelsKey:     1,
                        AVEncoderAudioQualityKey:  AVAudioQuality.medium.rawValue,
                        AVEncoderBitRateKey:       64000,
                    ]

                    do {
                        let rec = try AVAudioRecorder(url: url, settings: settings)
                        // Cap at maxDurationS — AVAudioRecorder.recordForDuration
                        // auto-stops when reached (JS-side timer is just for UX).
                        guard rec.prepareToRecord() else {
                            reject("E_RECORD_PREP", "Không thể chuẩn bị ghi âm.", nil)
                            return
                        }
                        let ok = rec.record(forDuration: self.maxDurationS)
                        if !ok {
                            reject("E_RECORD_START", "Không thể bắt đầu ghi âm.", nil)
                            return
                        }
                        self.recorder = rec
                        self.recordingStartedAt = Date()
                        resolve([
                            "treeId": treeIdStr,
                            "uri":    "file://\(url.path)",
                            "max_duration_s": self.maxDurationS,
                        ])
                    } catch {
                        reject("E_RECORD_INIT",
                               "Không thể khởi tạo recorder: \(error.localizedDescription)",
                               error as NSError)
                    }
                }
            }
        }
    }

    @objc(stopRecording:rejecter:)
    func stopRecording(_ resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        queue.async { [weak self] in
            guard let self = self, let rec = self.recorder else {
                reject("E_NO_RECORDING", "Không có buổi ghi âm nào đang chạy.", nil)
                return
            }

            let url      = rec.url
            let startedAt = self.recordingStartedAt
            rec.stop()
            self.recorder = nil
            self.recordingStartedAt = nil

            // Compute real duration: prefer file's container duration, fall
            // back to wall clock if asset metadata fails.
            var durationS: TimeInterval = 0
            let asset = AVURLAsset(url: url)
            let assetDuration = CMTimeGetSeconds(asset.duration)
            if assetDuration.isFinite && assetDuration > 0 {
                durationS = assetDuration
            } else if let startedAt = startedAt {
                durationS = Date().timeIntervalSince(startedAt)
            }
            // Clamp to maxDuration in case AVAudioRecorder slightly overshoots.
            durationS = min(durationS, self.maxDurationS)

            let bytes = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int64) ?? 0

            resolve([
                "uri":        "file://\(url.path)",
                "duration_s": durationS,
                "bytes":      bytes,
            ])
        }
    }

    @objc(cancelRecording:rejecter:)
    func cancelRecording(_ resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
        queue.async { [weak self] in
            guard let self = self else { resolve(NSNull()); return }
            if let rec = self.recorder {
                rec.stop()
                try? FileManager.default.removeItem(at: rec.url)
            }
            self.recorder = nil
            self.recordingStartedAt = nil
            resolve(NSNull())
        }
    }

    @objc(deleteRecording:resolver:rejecter:)
    func deleteRecording(_ treeId: NSString,
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
        let treeIdStr = treeId as String
        guard !treeIdStr.isEmpty else {
            reject("E_BAD_PARAMS", "treeId is required", nil); return
        }
        queue.async { [weak self] in
            guard let self = self else { resolve(NSNull()); return }
            // Stop any in-flight playback / recording for this URL.
            if let player = self.player, player.isPlaying { player.stop() }
            self.player = nil

            let url = self.fileURL(forTreeId: treeIdStr)
            try? FileManager.default.removeItem(at: url)
            resolve(NSNull())
        }
    }

    @objc(play:resolver:rejecter:)
    func play(_ treeId: NSString,
              resolver resolve: @escaping RCTPromiseResolveBlock,
              rejecter reject: @escaping RCTPromiseRejectBlock) {
        let treeIdStr = treeId as String
        guard !treeIdStr.isEmpty else {
            reject("E_BAD_PARAMS", "treeId is required", nil); return
        }
        queue.async { [weak self] in
            guard let self = self else { resolve(NSNull()); return }
            let url = self.fileURL(forTreeId: treeIdStr)
            guard FileManager.default.fileExists(atPath: url.path) else {
                reject("E_NO_FILE", "Không tìm thấy bản ghi âm.", nil); return
            }
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .default, options: [.defaultToSpeaker])
                try session.setActive(true, options: [])
                if let existing = self.player, existing.isPlaying { existing.stop() }
                let player = try AVAudioPlayer(contentsOf: url)
                guard player.prepareToPlay() else {
                    reject("E_PLAY_PREP", "Không chuẩn bị phát được.", nil); return
                }
                player.play()
                self.player = player
                resolve([
                    "uri":        "file://\(url.path)",
                    "duration_s": player.duration,
                ])
            } catch {
                reject("E_PLAY", error.localizedDescription, error as NSError)
            }
        }
    }

    @objc(stopPlayback:rejecter:)
    func stopPlayback(_ resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {
        queue.async { [weak self] in
            if let p = self?.player, p.isPlaying { p.stop() }
            self?.player = nil
            resolve(NSNull())
        }
    }

    @objc(getExistingRecording:resolver:rejecter:)
    func getExistingRecording(_ treeId: NSString,
                              resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        let treeIdStr = treeId as String
        guard !treeIdStr.isEmpty else {
            reject("E_BAD_PARAMS", "treeId is required", nil); return
        }
        queue.async { [weak self] in
            guard let self = self else { resolve(NSNull()); return }
            let url = self.fileURL(forTreeId: treeIdStr)
            guard FileManager.default.fileExists(atPath: url.path) else {
                resolve(NSNull()); return
            }
            let asset = AVURLAsset(url: url)
            let dur = CMTimeGetSeconds(asset.duration)
            let bytes = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int64) ?? 0
            resolve([
                "uri":        "file://\(url.path)",
                "duration_s": dur.isFinite ? dur : 0,
                "bytes":      bytes,
            ])
        }
    }
}
