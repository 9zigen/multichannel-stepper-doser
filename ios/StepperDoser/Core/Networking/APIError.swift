import Foundation

enum APIError: LocalizedError {
    case missingEndpoint
    case invalidResponse
    case unauthorized
    case server(String)

    var errorDescription: String? {
        switch self {
        case .missingEndpoint:
            "Set a controller endpoint before making requests."
        case .invalidResponse:
            "The controller returned an unexpected response."
        case .unauthorized:
            "The controller rejected the current credentials."
        case let .server(message):
            message
        }
    }
}
