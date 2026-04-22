import CommonCrypto
import CryptoKit
import Foundation

final class BLEProvisioningSecuritySession {
    private let pop: String
    private let clientPrivateKey = Curve25519.KeyAgreement.PrivateKey()
    private var devicePublicKey = Data()
    private var streamCipher: AESCTRStreamCipher?

    init(pop: String) {
        self.pop = pop
    }

    var clientPublicKey: Data {
        clientPrivateKey.publicKey.rawRepresentation
    }

    func makeSetup0Request() -> Data {
        BLEProvisioningProto.makeSessionCommand0(clientPublicKey: clientPublicKey)
    }

    func handleSetup0Response(_ responseData: Data) throws {
        let response = try BLEProvisioningProto.parseSessionResponse0(responseData)
        devicePublicKey = response.devicePublicKey

        let sharedSecret = try clientPrivateKey.sharedSecretFromKeyAgreement(
            with: Curve25519.KeyAgreement.PublicKey(rawRepresentation: response.devicePublicKey)
        )

        var sharedKey = sharedSecret.withUnsafeBytes { Data($0) }
        if !pop.isEmpty {
            let popDigest = Data(SHA256.hash(data: Data(pop.utf8)))
            sharedKey = xor(sharedKey, popDigest)
        }

        streamCipher = try AESCTRStreamCipher(key: sharedKey, iv: response.deviceRandom)
    }

    func makeSetup1Request() throws -> Data {
        let encryptedDevicePublicKey = try crypt(devicePublicKey)
        return BLEProvisioningProto.makeSessionCommand1(clientVerifyData: encryptedDevicePublicKey)
    }

    func handleSetup1Response(_ responseData: Data) throws {
        let response = try BLEProvisioningProto.parseSessionResponse1(responseData)
        let decryptedDeviceProof = try crypt(response.deviceVerifyData)
        guard decryptedDeviceProof == clientPublicKey else {
            throw BLEProvisioningError.securityFailure("The controller proof did not match the client key.")
        }
    }

    func crypt(_ data: Data) throws -> Data {
        guard let streamCipher else {
            throw BLEProvisioningError.securityFailure("The Security1 session is not ready yet.")
        }
        return try streamCipher.update(data)
    }

    private func xor(_ lhs: Data, _ rhs: Data) -> Data {
        Data(zip(lhs, rhs).map(^))
    }
}

private final class AESCTRStreamCipher {
    private var cryptor: CCCryptorRef?

    init(key: Data, iv: Data) throws {
        let status = key.withUnsafeBytes { keyBytes in
            iv.withUnsafeBytes { ivBytes in
                CCCryptorCreateWithMode(
                    CCOperation(kCCEncrypt),
                    CCMode(kCCModeCTR),
                    CCAlgorithm(kCCAlgorithmAES),
                    CCPadding(ccNoPadding),
                    ivBytes.baseAddress,
                    keyBytes.baseAddress,
                    key.count,
                    nil,
                    0,
                    0,
                    CCModeOptions(kCCModeOptionCTR_BE),
                    &cryptor
                )
            }
        }

        guard status == kCCSuccess else {
            throw BLEProvisioningError.securityFailure("Failed to create the BLE session cipher.")
        }
    }

    deinit {
        if let cryptor {
            CCCryptorRelease(cryptor)
        }
    }

    func update(_ data: Data) throws -> Data {
        guard let cryptor else {
            throw BLEProvisioningError.securityFailure("The BLE session cipher is unavailable.")
        }

        var output = Data(count: data.count + kCCBlockSizeAES128)
        var moved = 0

        let status = data.withUnsafeBytes { inputBytes in
            output.withUnsafeMutableBytes { outputBytes in
                CCCryptorUpdate(
                    cryptor,
                    inputBytes.baseAddress,
                    data.count,
                    outputBytes.baseAddress,
                    output.count,
                    &moved
                )
            }
        }

        guard status == kCCSuccess else {
            throw BLEProvisioningError.securityFailure("BLE session encryption failed.")
        }

        output.removeSubrange(moved..<output.count)
        return output
    }
}
