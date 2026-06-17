// LocalPods/ScannerModule/UI/TreeMatchConfirmationView.swift
//
// UI for confirming tree match when verify finds existing tree

import SwiftUI

/// Tree match confirmation data
struct TreeMatchData {
    let originalTreeId: String
    let matchedTreeId: String
    let confidence: Double
    let matchedTreeImage: UIImage?
    let location: (lat: Double, lng: Double)?
    let capturedAt: Date?
    let reason: String
}

/// Tree match confirmation view
struct TreeMatchConfirmationView: View {
    let matchData: TreeMatchData
    let onConfirm: () -> Void
    let onReject: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var isProcessing = false

    var body: some View {
        VStack(spacing: 0) {
            // Header with improved design
            VStack(spacing: 16) {
                ZStack {
                    Circle()
                        .fill(Color.green.opacity(0.15))
                        .frame(width: 80, height: 80)

                    Image(systemName: "tree.circle.fill")
                        .font(.system(size: 44))
                        .foregroundColor(.green)
                }

                Text("Server tìm thấy cây giống cây này")
                    .font(.system(size: 20, weight: .semibold))
                    .multilineTextAlignment(.center)
                    .foregroundColor(.primary)
            }
            .padding(.top, 40)
            .padding(.bottom, 32)

            // Matched tree info
            ScrollView {
                VStack(spacing: 12) {
                    // Confidence
                    InfoRow(
                        icon: "checkmark.seal.fill",
                        title: "Độ tin cậy",
                        value: "\(Int(matchData.confidence * 100))%",
                        color: confidenceColor
                    )

                    // Time
                    if let capturedAt = matchData.capturedAt {
                        InfoRow(
                            icon: "clock.fill",
                            title: "Lần quét trước",
                            value: timeAgoString(from: capturedAt),
                            color: .orange
                        )
                    }

                    // Location
                    if let location = matchData.location {
                        InfoRow(
                            icon: "location.fill",
                            title: "Vị trí",
                            value: String(format: "%.5f, %.5f", location.lat, location.lng),
                            color: .blue
                        )
                    }
                }
                .padding(.horizontal, 20)
            }

            // Action buttons with improved design
            VStack(spacing: 12) {
                // Confirm button
                Button(action: {
                    guard !isProcessing else { return }
                    isProcessing = true
                    onConfirm()
                    dismiss()
                }) {
                    HStack(spacing: 10) {
                        if isProcessing {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 20))
                        }
                        Text("Đúng, cùng cây cũ")
                            .font(.system(size: 16, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(isProcessing ? Color.green.opacity(0.6) : Color.green)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .disabled(isProcessing)

                // Reject button
                Button(action: {
                    guard !isProcessing else { return }
                    isProcessing = true
                    onReject()
                    dismiss()
                }) {
                    HStack(spacing: 10) {
                        if isProcessing {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .primary))
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 20))
                        }
                        Text("Không, tạo cây mới")
                            .font(.system(size: 16, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(isProcessing ? Color(.systemGray5).opacity(0.6) : Color(.systemGray5))
                    .foregroundColor(.primary)
                    .cornerRadius(12)
                }
                .disabled(isProcessing)
            }
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 32)
        }
        .background(Color(.systemBackground))
    }

    private var confidenceColor: Color {
        if matchData.confidence >= 0.9 {
            return .green
        } else if matchData.confidence >= 0.7 {
            return .orange
        } else {
            return .red
        }
    }

    private func timeAgoString(from date: Date) -> String {
        let interval = Date().timeIntervalSince(date)
        let days = Int(interval / 86400)
        let hours = Int(interval / 3600)
        let minutes = Int(interval / 60)

        if days > 0 {
            return "\(days) ngày trước"
        } else if hours > 0 {
            return "\(hours) giờ trước"
        } else if minutes > 0 {
            return "\(minutes) phút trước"
        } else {
            return "Vừa xong"
        }
    }
}

/// Info row component with improved design
struct InfoRow: View {
    let icon: String
    let title: String
    let value: String
    let color: Color

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.15))
                    .frame(width: 44, height: 44)

                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundColor(color)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.secondary)
                Text(value)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.primary)
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

// MARK: - Preview

struct TreeMatchConfirmationView_Previews: PreviewProvider {
    static var previews: some View {
        TreeMatchConfirmationView(
            matchData: TreeMatchData(
                originalTreeId: "tree_abc123",
                matchedTreeId: "tree_xyz789",
                confidence: 0.91,
                matchedTreeImage: nil,
                location: (lat: 10.12367, lng: 107.12372),
                capturedAt: Date().addingTimeInterval(-172800), // 2 days ago
                reason: "Best match: tree_xyz789 with score 0.91"
            ),
            onConfirm: { print("Confirmed") },
            onReject: { print("Rejected") }
        )
    }
}
