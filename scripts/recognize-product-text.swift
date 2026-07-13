import CoreGraphics
import Foundation
import ImageIO
import Vision

struct RecognitionResult: Codable {
  let path: String
  let lines: [RecognizedLine]
  let error: String?
}

struct RecognizedLine: Codable {
  let text: String
  let confidence: Float
  let x: CGFloat
  let y: CGFloat
  let width: CGFloat
  let height: CGFloat
}

func imageOrientation(for source: CGImageSource) -> CGImagePropertyOrientation {
  guard
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)
      as? [CFString: Any],
    let rawValue = properties[kCGImagePropertyOrientation] as? UInt32,
    let orientation = CGImagePropertyOrientation(rawValue: rawValue)
  else {
    return .up
  }
  return orientation
}

func recognize(path: String) -> RecognitionResult {
  let url = URL(fileURLWithPath: path)
  guard
    let source = CGImageSourceCreateWithURL(url as CFURL, nil),
    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
  else {
    return RecognitionResult(path: path, lines: [], error: "image_unreadable")
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

  do {
    let handler = VNImageRequestHandler(
      cgImage: image,
      orientation: imageOrientation(for: source),
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
    let lines = observations.compactMap { observation -> RecognizedLine? in
      guard let candidate = observation.topCandidates(1).first else {
        return nil
      }
      return RecognizedLine(
        text: candidate.string,
        confidence: candidate.confidence,
        x: observation.boundingBox.minX,
        y: observation.boundingBox.minY,
        width: observation.boundingBox.width,
        height: observation.boundingBox.height
      )
    }
    return RecognitionResult(path: path, lines: lines, error: nil)
  } catch {
    return RecognitionResult(
      path: path,
      lines: [],
      error: String(describing: error)
    )
  }
}

let results = CommandLine.arguments.dropFirst().map(recognize)
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
let data = try encoder.encode(results)
if let outputPath = ProcessInfo.processInfo.environment["OUTPUT_PATH"] {
  try data.write(to: URL(fileURLWithPath: outputPath), options: .atomic)
} else {
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data("\n".utf8))
}
