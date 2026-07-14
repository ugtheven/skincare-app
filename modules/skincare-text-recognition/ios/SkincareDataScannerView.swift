import ExpoModulesCore
import UIKit
import Vision
import VisionKit

public final class SkincareDataScannerView: ExpoView {
  let onItemsChanged = EventDispatcher()
  let onError = EventDispatcher()

  private var scannerController: UIViewController?
  private var active = true
  private var mode = "barcode"
  private var highlightedItemIds = Set<String>()
  private var confirmed = false
  private var itemKinds: [String: String] = [:]
  private var highlightLayers: [String: ScannerHighlightLayers] = [:]
  private var pendingItems: [Any] = []
  private var pendingEvent: DispatchWorkItem?
  private var itemsHeartbeat: DispatchSourceTimer?

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
    clipsToBounds = true
  }

  override public func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      detachScanner()
    } else {
      attachScannerIfNeeded()
      updateScanningState()
    }
  }

  override public func layoutSubviews() {
    super.layoutSubviews()
    scannerController?.view.frame = bounds
    updateRegionOfInterest()
    highlightLayers.values.forEach { $0.updateFrame(bounds) }
  }

  func setActive(_ value: Bool) {
    active = value
    updateScanningState()
  }

  func setMode(_ value: String) {
    mode = value
    refreshHighlightAppearance()
  }

  func setHighlightedItemIds(_ values: [String]) {
    highlightedItemIds = Set(values)
    refreshHighlightAppearance()
  }

  func setConfirmed(_ value: Bool) {
    confirmed = value
    refreshHighlightAppearance()
  }

  private func nearestViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let next = responder?.next {
      if let controller = next as? UIViewController {
        return controller
      }
      responder = next
    }
    return nil
  }

  private func attachScannerIfNeeded() {
    guard scannerController == nil else {
      return
    }
    guard #available(iOS 16.0, *) else {
      emitError(code: "unsupported", message: "Le suivi en direct nécessite iOS 16 ou une version ultérieure.")
      return
    }
    guard DataScannerViewController.isSupported else {
      emitError(code: "unsupported", message: "Le suivi en direct n’est pas compatible avec cet appareil.")
      return
    }

    let preferredLanguages = [
      "fr-FR", "en-US", "de-DE", "es-ES", "it-IT", "pt-PT", "nl-NL",
      "da-DK", "nb-NO", "sv-SE", "fi-FI", "pl-PL"
    ]
    let supportedLanguages = Set(DataScannerViewController.supportedTextRecognitionLanguages)
    let languages = preferredLanguages.filter(supportedLanguages.contains)
    let symbologies: [VNBarcodeSymbology] = [
      .ean13, .ean8, .upce, .code128, .code39, .code93, .itf14, .codabar,
      .dataMatrix, .pdf417, .aztec, .qr
    ]
    let recognizedDataTypes: Set<DataScannerViewController.RecognizedDataType> = [
      .text(languages: languages),
      .barcode(symbologies: symbologies)
    ]
    let scanner = DataScannerViewController(
      recognizedDataTypes: recognizedDataTypes,
      qualityLevel: .balanced,
      recognizesMultipleItems: true,
      isHighFrameRateTrackingEnabled: true,
      isPinchToZoomEnabled: true,
      isGuidanceEnabled: false,
      isHighlightingEnabled: false
    )
    scanner.delegate = self
    scanner.view.frame = bounds
    scanner.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]

    if let parent = nearestViewController() {
      parent.addChild(scanner)
      insertSubview(scanner.view, at: 0)
      scanner.didMove(toParent: parent)
    } else {
      insertSubview(scanner.view, at: 0)
    }
    scannerController = scanner
    updateRegionOfInterest()
  }

  private func updateScanningState() {
    guard window != nil else {
      return
    }
    attachScannerIfNeeded()
    guard #available(iOS 16.0, *),
      let scanner = scannerController as? DataScannerViewController
    else {
      return
    }

    if active {
      guard DataScannerViewController.isAvailable else {
        emitError(code: "unavailable", message: "Le scanner en direct est temporairement indisponible.")
        return
      }
      guard !scanner.isScanning else {
        return
      }
      do {
        try scanner.startScanning()
        startItemsHeartbeat()
      } catch {
        emitError(code: "start_failed", message: error.localizedDescription)
      }
    } else {
      scanner.stopScanning()
      stopItemsHeartbeat()
    }
  }

  private func stopScanning() {
    guard #available(iOS 16.0, *),
      let scanner = scannerController as? DataScannerViewController
    else {
      return
    }
    scanner.stopScanning()
    stopItemsHeartbeat()
  }

  private func detachScanner() {
    stopScanning()
    pendingEvent?.cancel()
    pendingEvent = nil
    pendingItems = []
    highlightLayers.values.forEach { $0.remove() }
    highlightLayers.removeAll()
    itemKinds.removeAll()
    scannerController?.willMove(toParent: nil)
    scannerController?.view.removeFromSuperview()
    scannerController?.removeFromParent()
    scannerController = nil
  }

  @available(iOS 16.0, *)
  private func startItemsHeartbeat() {
    guard itemsHeartbeat == nil else {
      return
    }
    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now() + 0.4, repeating: 0.4)
    timer.setEventHandler { [weak self] in
      self?.emitLatestItems()
    }
    itemsHeartbeat = timer
    timer.resume()
  }

  private func stopItemsHeartbeat() {
    itemsHeartbeat?.cancel()
    itemsHeartbeat = nil
  }

  private func updateRegionOfInterest() {
    guard #available(iOS 16.0, *),
      let scanner = scannerController as? DataScannerViewController,
      bounds.width > 0,
      bounds.height > 0
    else {
      return
    }
    let width = min(300, bounds.width * 0.88)
    let height = min(300, bounds.height * 0.55)
    scanner.regionOfInterest = CGRect(
      x: (bounds.width - width) / 2,
      y: (bounds.height - height) / 2,
      width: width,
      height: height
    )
  }

  private func refreshHighlightAppearance() {
    for (id, layers) in highlightLayers {
      let kind = itemKinds[id]
      let shouldShow = mode == "barcode"
        ? kind == "barcode" || highlightedItemIds.contains(id)
        : kind == "text"
      layers.setAppearance(visible: shouldShow, confirmed: confirmed && highlightedItemIds.contains(id))
    }
  }

  private func emitError(code: String, message: String) {
    onError(["code": code, "message": message])
  }
}

@available(iOS 16.0, *)
extension SkincareDataScannerView: DataScannerViewControllerDelegate {
  public func dataScanner(
    _ dataScanner: DataScannerViewController,
    didAdd addedItems: [RecognizedItem],
    allItems: [RecognizedItem]
  ) {
    update(items: addedItems, in: dataScanner)
    removeMissingItems(allItems)
    scheduleItemsEvent(allItems)
  }

  public func dataScanner(
    _ dataScanner: DataScannerViewController,
    didUpdate updatedItems: [RecognizedItem],
    allItems: [RecognizedItem]
  ) {
    update(items: updatedItems, in: dataScanner)
    removeMissingItems(allItems)
    scheduleItemsEvent(allItems)
  }

  public func dataScanner(
    _ dataScanner: DataScannerViewController,
    didRemove removedItems: [RecognizedItem],
    allItems: [RecognizedItem]
  ) {
    for item in removedItems {
      removeHighlight(id: item.id.uuidString)
    }
    scheduleItemsEvent(allItems)
  }

  public func dataScanner(
    _ dataScanner: DataScannerViewController,
    becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable
  ) {
    emitError(code: "unavailable", message: String(describing: error))
  }

  private func update(items: [RecognizedItem], in scanner: DataScannerViewController) {
    for item in items {
      let id = item.id.uuidString
      let kind: String
      switch item {
      case .text:
        kind = "text"
      case .barcode:
        kind = "barcode"
      @unknown default:
        continue
      }
      itemKinds[id] = kind
      let layers = highlightLayers[id] ?? ScannerHighlightLayers(in: scanner.overlayContainerView)
      highlightLayers[id] = layers
      layers.updatePath(item.bounds)
    }
    refreshHighlightAppearance()
  }

  private func removeMissingItems(_ allItems: [RecognizedItem]) {
    let visibleIds = Set(allItems.map { $0.id.uuidString })
    for id in Array(highlightLayers.keys) where !visibleIds.contains(id) {
      removeHighlight(id: id)
    }
  }

  private func removeHighlight(id: String) {
    highlightLayers.removeValue(forKey: id)?.remove()
    itemKinds.removeValue(forKey: id)
  }

  private func scheduleItemsEvent(_ items: [RecognizedItem]) {
    pendingItems = items
    guard pendingEvent == nil else {
      return
    }
    let event = DispatchWorkItem { [weak self] in
      guard let self else {
        return
      }
      self.pendingEvent = nil
      self.emitLatestItems()
    }
    pendingEvent = event
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1, execute: event)
  }

  private func emitLatestItems() {
    let latest = pendingItems.compactMap { $0 as? RecognizedItem }
    onItemsChanged(["items": latest.compactMap(serialize)])
  }

  private func serialize(_ item: RecognizedItem) -> [String: Any]? {
    guard bounds.width > 0, bounds.height > 0 else {
      return nil
    }
    let itemBounds = item.bounds
    let xs = [itemBounds.topLeft.x, itemBounds.topRight.x, itemBounds.bottomRight.x, itemBounds.bottomLeft.x]
    let ys = [itemBounds.topLeft.y, itemBounds.topRight.y, itemBounds.bottomRight.y, itemBounds.bottomLeft.y]
    guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max() else {
      return nil
    }
    var payload: [String: Any] = [
      "id": item.id.uuidString,
      "x": minX / bounds.width,
      "y": 1 - maxY / bounds.height,
      "width": (maxX - minX) / bounds.width,
      "height": (maxY - minY) / bounds.height
    ]
    switch item {
    case .text(let text):
      guard !text.transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        return nil
      }
      payload["kind"] = "text"
      payload["value"] = text.transcript
      payload["confidence"] = Double(text.observation.topCandidates(1).first?.confidence ?? 1)
    case .barcode(let barcode):
      guard let value = barcode.payloadStringValue, !value.isEmpty else {
        return nil
      }
      payload["kind"] = "barcode"
      payload["value"] = value
      payload["type"] = barcode.observation.symbology.rawValue
      payload["confidence"] = Double(barcode.observation.confidence)
    @unknown default:
      return nil
    }
    return payload
  }
}

private final class ScannerHighlightLayers {
  private let outer = CAShapeLayer()
  private let inner = CAShapeLayer()

  init(in container: UIView) {
    let petroleum = UIColor(red: 10 / 255, green: 124 / 255, blue: 145 / 255, alpha: 1)
    outer.fillColor = UIColor.clear.cgColor
    outer.strokeColor = UIColor.white.cgColor
    outer.lineWidth = 5
    outer.lineJoin = .round
    inner.fillColor = petroleum.withAlphaComponent(0.16).cgColor
    inner.strokeColor = petroleum.cgColor
    inner.lineWidth = 2
    inner.lineJoin = .round
    updateFrame(container.bounds)
    container.layer.addSublayer(outer)
    container.layer.addSublayer(inner)
  }

  func updateFrame(_ frame: CGRect) {
    outer.frame = frame
    inner.frame = frame
  }

  @available(iOS 16.0, *)
  func updatePath(_ bounds: RecognizedItem.Bounds) {
    let path = UIBezierPath()
    path.move(to: bounds.topLeft)
    path.addLine(to: bounds.topRight)
    path.addLine(to: bounds.bottomRight)
    path.addLine(to: bounds.bottomLeft)
    path.close()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    outer.path = path.cgPath
    inner.path = path.cgPath
    CATransaction.commit()
  }

  func setAppearance(visible: Bool, confirmed: Bool) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    outer.isHidden = !visible
    inner.isHidden = !visible
    inner.fillColor = UIColor(
      red: 10 / 255,
      green: 124 / 255,
      blue: 145 / 255,
      alpha: confirmed ? 0.28 : 0.16
    ).cgColor
    CATransaction.commit()
  }

  func remove() {
    outer.removeFromSuperlayer()
    inner.removeFromSuperlayer()
  }
}
