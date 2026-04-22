import Foundation

enum BLEProvisioningEndpoint: String, CaseIterable {
    case session = "prov-session"
    case protoVersion = "proto-ver"
    case config = "prov-config"
    case status = "prov-status"
}

enum BLEProvisioningProto {
    private enum WireType: UInt64 {
        case varint = 0
        case lengthDelimited = 2
    }

    private enum SecScheme {
        static let security1: UInt64 = 1
    }

    private enum Sec1Message {
        static let sessionCommand0: UInt64 = 0
        static let sessionResponse0: UInt64 = 1
        static let sessionCommand1: UInt64 = 2
        static let sessionResponse1: UInt64 = 3
    }

    struct SessionResponse0 {
        var devicePublicKey: Data
        var deviceRandom: Data
    }

    struct SessionResponse1 {
        var deviceVerifyData: Data
    }

    static func makeSessionCommand0(clientPublicKey: Data) -> Data {
        let cmd0 = message {
            $0.bytesField(1, clientPublicKey)
        }

        let sec1 = message {
            $0.varintField(1, Sec1Message.sessionCommand0)
            $0.messageField(20, cmd0)
        }

        return message {
            $0.varintField(2, SecScheme.security1)
            $0.messageField(11, sec1)
        }
    }

    static func parseSessionResponse0(_ data: Data) throws -> SessionResponse0 {
        let fields = try parseFields(in: data)
        try requireVarint(fields, field: 2, equals: SecScheme.security1)
        let sec1 = try requireMessage(fields, field: 11)
        let sec1Fields = try parseFields(in: sec1)
        try requireVarint(sec1Fields, field: 1, equals: Sec1Message.sessionResponse0)
        let response = try requireMessage(sec1Fields, field: 21)
        let responseFields = try parseFields(in: response)
        let status = try requireVarint(responseFields, field: 1)
        guard status == 0 else {
            throw BLEProvisioningError.securityFailure("The controller rejected the first Security1 step.")
        }

        return SessionResponse0(
            devicePublicKey: try requireBytes(responseFields, field: 2),
            deviceRandom: try requireBytes(responseFields, field: 3)
        )
    }

    static func makeSessionCommand1(clientVerifyData: Data) -> Data {
        let cmd1 = message {
            $0.bytesField(2, clientVerifyData)
        }

        let sec1 = message {
            $0.varintField(1, Sec1Message.sessionCommand1)
            $0.messageField(22, cmd1)
        }

        return message {
            $0.varintField(2, SecScheme.security1)
            $0.messageField(11, sec1)
        }
    }

    static func parseSessionResponse1(_ data: Data) throws -> SessionResponse1 {
        let fields = try parseFields(in: data)
        try requireVarint(fields, field: 2, equals: SecScheme.security1)
        let sec1 = try requireMessage(fields, field: 11)
        let sec1Fields = try parseFields(in: sec1)
        try requireVarint(sec1Fields, field: 1, equals: Sec1Message.sessionResponse1)
        let response = try requireMessage(sec1Fields, field: 23)
        let responseFields = try parseFields(in: response)
        let status = try requireVarint(responseFields, field: 1)
        guard status == 0 else {
            throw BLEProvisioningError.securityFailure("The controller rejected the second Security1 step.")
        }

        return SessionResponse1(deviceVerifyData: try requireBytes(responseFields, field: 3))
    }

    private struct FieldValue {
        var wireType: WireType
        var varint: UInt64?
        var bytes: Data?
    }

    private struct Writer {
        var data = Data()

        mutating func varintField(_ field: Int, _ value: UInt64) {
            writeTag(field: field, wireType: .varint)
            writeVarint(value)
        }

        mutating func bytesField(_ field: Int, _ value: Data) {
            writeTag(field: field, wireType: .lengthDelimited)
            writeVarint(UInt64(value.count))
            data.append(value)
        }

        mutating func messageField(_ field: Int, _ nested: Data) {
            bytesField(field, nested)
        }

        private mutating func writeTag(field: Int, wireType: WireType) {
            writeVarint((UInt64(field) << 3) | wireType.rawValue)
        }

        private mutating func writeVarint(_ value: UInt64) {
            var current = value
            while current >= 0x80 {
                data.append(UInt8((current & 0x7f) | 0x80))
                current >>= 7
            }
            data.append(UInt8(current))
        }
    }

    private static func message(_ build: (inout Writer) -> Void) -> Data {
        var writer = Writer()
        build(&writer)
        return writer.data
    }

    private static func parseFields(in data: Data) throws -> [Int: FieldValue] {
        var fields: [Int: FieldValue] = [:]
        var index = data.startIndex

        while index < data.endIndex {
            let tag = try readVarint(from: data, index: &index)
            let field = Int(tag >> 3)
            let wireValue = tag & 0x07
            guard let wireType = WireType(rawValue: wireValue) else {
                throw BLEProvisioningError.invalidResponse("The controller returned an unsupported protobuf field.")
            }

            switch wireType {
            case .varint:
                let value = try readVarint(from: data, index: &index)
                fields[field] = FieldValue(wireType: wireType, varint: value, bytes: nil)
            case .lengthDelimited:
                let count = Int(try readVarint(from: data, index: &index))
                guard count >= 0, index + count <= data.endIndex else {
                    throw BLEProvisioningError.invalidResponse("The controller returned truncated protobuf data.")
                }
                let value = data[index..<(index + count)]
                fields[field] = FieldValue(wireType: wireType, varint: nil, bytes: Data(value))
                index += count
            }
        }

        return fields
    }

    private static func requireVarint(_ fields: [Int: FieldValue], field: Int) throws -> UInt64 {
        guard let value = fields[field], value.wireType == .varint, let varint = value.varint else {
            throw BLEProvisioningError.invalidResponse("The controller returned malformed protobuf field \(field).")
        }
        return varint
    }

    private static func requireVarint(_ fields: [Int: FieldValue], field: Int, equals expected: UInt64) throws {
        let value = try requireVarint(fields, field: field)
        guard value == expected else {
            throw BLEProvisioningError.invalidResponse("The controller responded with an unexpected security scheme.")
        }
    }

    private static func requireBytes(_ fields: [Int: FieldValue], field: Int) throws -> Data {
        guard let value = fields[field], value.wireType == .lengthDelimited, let bytes = value.bytes else {
            throw BLEProvisioningError.invalidResponse("The controller returned malformed protobuf field \(field).")
        }
        return bytes
    }

    private static func requireMessage(_ fields: [Int: FieldValue], field: Int) throws -> Data {
        try requireBytes(fields, field: field)
    }

    private static func readVarint(from data: Data, index: inout Data.Index) throws -> UInt64 {
        var result: UInt64 = 0
        var shift: UInt64 = 0

        while index < data.endIndex {
            let byte = data[index]
            data.formIndex(after: &index)
            result |= UInt64(byte & 0x7f) << shift
            if (byte & 0x80) == 0 {
                return result
            }

            shift += 7
            if shift > 63 {
                break
            }
        }

        throw BLEProvisioningError.invalidResponse("The controller returned invalid protobuf data.")
    }
}
