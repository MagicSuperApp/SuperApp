import Foundation

/// Monotonic counter for anti-replay protection.
/// Matches Android MonotonicCounter.kt.
final class MonotonicCounter {

    private var counter: Int64 = 0
    private let userDefaults = UserDefaults.standard
    private let key: String

    // MARK: - Init

    init(key: String = "com.aladin.counter") {
        self.key = key
        loadCounter()
    }

    // MARK: - Public API

    /// Increment and return the next counter value.
    func next() -> Int64 {
        counter += 1
        saveCounter()
        return counter
    }

    /// Get current counter value without incrementing.
    func current() -> Int64 {
        return counter
    }

    /// Reset counter (e.g., on session start).
    func reset() {
        counter = 0
        saveCounter()
    }

    // MARK: - Private

    private func loadCounter() {
        counter = Int64(userDefaults.integer(forKey: key))
    }

    private func saveCounter() {
        userDefaults.set(counter, forKey: key)
    }
}
