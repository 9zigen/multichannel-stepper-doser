import Foundation
import Security

struct KeychainTokenStore {
    private let service = "com.alekseyvolkov.stepperdoser.auth"

    func loadToken(for device: ManagedDevice?) -> String? {
        guard let device else { return nil }

        var query = baseQuery(account: device.tokenAccount)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let token = String(data: data, encoding: .utf8) else {
            return nil
        }

        return token
    }

    func saveToken(_ token: String, for device: ManagedDevice) {
        deleteToken(for: device)
        let data = Data(token.utf8)
        var query = baseQuery(account: device.tokenAccount)
        query[kSecValueData as String] = data
        SecItemAdd(query as CFDictionary, nil)
    }

    func deleteToken(for device: ManagedDevice?) {
        guard let device else { return }
        SecItemDelete(baseQuery(account: device.tokenAccount) as CFDictionary)
    }

    private func baseQuery(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
