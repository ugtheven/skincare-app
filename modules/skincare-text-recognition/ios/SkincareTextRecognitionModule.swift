import ExpoModulesCore
import UIKit
import Vision

public final class SkincareTextRecognitionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SkincareTextRecognition")

    AsyncFunction("recognizeText") { (imageUri: String) throws -> [[String: Any]] in
      let imageUrl: URL
      if let parsedUrl = URL(string: imageUri), parsedUrl.isFileURL {
        imageUrl = parsedUrl
      } else {
        imageUrl = URL(fileURLWithPath: imageUri)
      }

      guard
        let image = UIImage(contentsOfFile: imageUrl.path),
        let cgImage = image.cgImage
      else {
        throw NSError(
          domain: "SkincareTextRecognition",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "The captured image could not be read."]
        )
      }

      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      let preferredLanguages = [
        "fr-FR", "en-US", "de-DE", "es-ES", "it-IT", "pt-PT", "nl-NL",
        "da-DK", "nb-NO", "sv-SE", "fi-FI", "pl-PL"
      ]
      let supportedLanguages = (try? request.supportedRecognitionLanguages()) ?? []
      request.recognitionLanguages = preferredLanguages.filter(
        supportedLanguages.contains
      )

      let handler = VNImageRequestHandler(
        cgImage: cgImage,
        orientation: Self.orientation(for: image.imageOrientation),
        options: [:]
      )
      try handler.perform([request])

      let observations = (request.results ?? []).sorted { left, right in
        let lineTolerance = max(
          0.002,
          min(left.boundingBox.height, right.boundingBox.height) * 0.35
        )
        let sameLine = abs(left.boundingBox.midY - right.boundingBox.midY) < lineTolerance
        return sameLine
          ? left.boundingBox.minX < right.boundingBox.minX
          : left.boundingBox.midY > right.boundingBox.midY
      }

      return observations.compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else {
          return nil
        }
        return [
          "text": candidate.string,
          "confidence": Double(candidate.confidence),
          "x": observation.boundingBox.minX,
          "y": observation.boundingBox.minY,
          "width": observation.boundingBox.width,
          "height": observation.boundingBox.height,
        ]
      }
    }
  }

  private static func orientation(
    for imageOrientation: UIImage.Orientation
  ) -> CGImagePropertyOrientation {
    switch imageOrientation {
    case .up: return .up
    case .upMirrored: return .upMirrored
    case .down: return .down
    case .downMirrored: return .downMirrored
    case .left: return .left
    case .leftMirrored: return .leftMirrored
    case .right: return .right
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
