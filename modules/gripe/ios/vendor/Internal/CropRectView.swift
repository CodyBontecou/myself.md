#if DEBUG && canImport(UIKit)
import UIKit

final class CropRectView: UIView {
    private(set) var cropRectInView: CGRect?

    var onSelectionChanged: (() -> Void)?

    private var imageRectProvider: (() -> CGRect)?
    private let outline = CAShapeLayer()
    private let dim = CAShapeLayer()
    private var cornerHandles: [CAShapeLayer] = []
    private var dragMode: DragMode?
    private var pinchInitialRect: CGRect?

    private static let minCropSize: CGFloat = 40
    private static let cornerHitSize: CGFloat = 44

    private enum Corner {
        case topLeft, topRight, bottomLeft, bottomRight
    }

    private enum DragMode {
        case create(start: CGPoint)
        case move(initialRect: CGRect, startTouch: CGPoint)
        case resize(anchor: CGPoint)
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setup()
    }

    private func setup() {
        dim.fillColor = UIColor.black.withAlphaComponent(0.5).cgColor
        dim.fillRule = .evenOdd
        layer.addSublayer(dim)

        outline.fillColor = UIColor.clear.cgColor
        outline.strokeColor = GripeColor.primary.cgColor
        outline.lineWidth = 2
        outline.lineDashPattern = [6, 4]
        layer.addSublayer(outline)

        for _ in 0..<4 {
            let handle = CAShapeLayer()
            handle.fillColor = UIColor.white.cgColor
            handle.strokeColor = GripeColor.primary.cgColor
            handle.lineWidth = 1.5
            handle.isHidden = true
            layer.addSublayer(handle)
            cornerHandles.append(handle)
        }

        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        pan.maximumNumberOfTouches = 1
        addGestureRecognizer(pan)

        let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
        addGestureRecognizer(pinch)
    }

    func configure(imageRect: @escaping () -> CGRect) {
        self.imageRectProvider = imageRect
    }

    func refreshIfNeeded() {
        if cropRectInView == nil, let r = imageRectProvider?(), r.width > 80, r.height > 80 {
            cropRectInView = r.insetBy(dx: r.width * 0.15, dy: r.height * 0.2)
        }
        updatePaths()
    }

    @objc private func handlePan(_ pan: UIPanGestureRecognizer) {
        guard let imageRect = imageRectProvider?() else { return }
        let raw = pan.location(in: self)
        let pt = clamp(raw, to: imageRect)
        switch pan.state {
        case .began:
            if let existing = cropRectInView, let corner = cornerHit(at: raw, in: existing) {
                dragMode = .resize(anchor: oppositeCorner(of: corner, in: existing))
            } else if let existing = cropRectInView, existing.contains(raw) {
                dragMode = .move(initialRect: existing, startTouch: raw)
            } else {
                dragMode = .create(start: pt)
                cropRectInView = CGRect(origin: pt, size: .zero)
            }
        case .changed:
            switch dragMode {
            case .create(let start):
                cropRectInView = CGRect(
                    x: min(start.x, pt.x),
                    y: min(start.y, pt.y),
                    width: abs(pt.x - start.x),
                    height: abs(pt.y - start.y)
                )
            case .move(let initialRect, let startTouch):
                let dx = raw.x - startTouch.x
                let dy = raw.y - startTouch.y
                let maxX = imageRect.maxX - initialRect.width
                let maxY = imageRect.maxY - initialRect.height
                let originX = min(max(initialRect.minX + dx, imageRect.minX), maxX)
                let originY = min(max(initialRect.minY + dy, imageRect.minY), maxY)
                cropRectInView = CGRect(origin: CGPoint(x: originX, y: originY), size: initialRect.size)
            case .resize(let anchor):
                cropRectInView = resizedRect(anchor: anchor, moving: pt, in: imageRect)
            case .none:
                break
            }
            onSelectionChanged?()
        case .ended:
            dragMode = nil
            onSelectionChanged?()
        case .cancelled, .failed:
            dragMode = nil
        default:
            break
        }
        updatePaths()
    }

    @objc private func handlePinch(_ pinch: UIPinchGestureRecognizer) {
        guard let imageRect = imageRectProvider?() else { return }
        switch pinch.state {
        case .began:
            pinchInitialRect = cropRectInView
        case .changed:
            guard let initial = pinchInitialRect else { return }
            let scale = max(pinch.scale, 0.01)
            let maxW = imageRect.width
            let maxH = imageRect.height
            let minSize = Self.minCropSize
            let newW = min(max(initial.width * scale, minSize), maxW)
            let newH = min(max(initial.height * scale, minSize), maxH)
            let centerX = initial.midX
            let centerY = initial.midY
            var originX = centerX - newW / 2
            var originY = centerY - newH / 2
            originX = min(max(originX, imageRect.minX), imageRect.maxX - newW)
            originY = min(max(originY, imageRect.minY), imageRect.maxY - newH)
            cropRectInView = CGRect(x: originX, y: originY, width: newW, height: newH)
            updatePaths()
            onSelectionChanged?()
        case .ended, .cancelled, .failed:
            pinchInitialRect = nil
            onSelectionChanged?()
        default:
            break
        }
    }

    private func cornerHit(at point: CGPoint, in rect: CGRect) -> Corner? {
        let r = Self.cornerHitSize / 2
        let corners: [(Corner, CGPoint)] = [
            (.topLeft, CGPoint(x: rect.minX, y: rect.minY)),
            (.topRight, CGPoint(x: rect.maxX, y: rect.minY)),
            (.bottomLeft, CGPoint(x: rect.minX, y: rect.maxY)),
            (.bottomRight, CGPoint(x: rect.maxX, y: rect.maxY)),
        ]
        var best: (Corner, CGFloat)?
        for (corner, center) in corners {
            let dx = point.x - center.x
            let dy = point.y - center.y
            if abs(dx) <= r && abs(dy) <= r {
                let d2 = dx * dx + dy * dy
                if best == nil || d2 < best!.1 {
                    best = (corner, d2)
                }
            }
        }
        return best?.0
    }

    private func oppositeCorner(of corner: Corner, in rect: CGRect) -> CGPoint {
        switch corner {
        case .topLeft: return CGPoint(x: rect.maxX, y: rect.maxY)
        case .topRight: return CGPoint(x: rect.minX, y: rect.maxY)
        case .bottomLeft: return CGPoint(x: rect.maxX, y: rect.minY)
        case .bottomRight: return CGPoint(x: rect.minX, y: rect.minY)
        }
    }

    private func resizedRect(anchor: CGPoint, moving: CGPoint, in imageRect: CGRect) -> CGRect {
        let minSize = Self.minCropSize
        var mx = moving.x
        var my = moving.y
        if abs(mx - anchor.x) < minSize {
            mx = mx >= anchor.x
                ? min(anchor.x + minSize, imageRect.maxX)
                : max(anchor.x - minSize, imageRect.minX)
        }
        if abs(my - anchor.y) < minSize {
            my = my >= anchor.y
                ? min(anchor.y + minSize, imageRect.maxY)
                : max(anchor.y - minSize, imageRect.minY)
        }
        return CGRect(
            x: min(anchor.x, mx),
            y: min(anchor.y, my),
            width: abs(mx - anchor.x),
            height: abs(my - anchor.y)
        )
    }

    private func clamp(_ p: CGPoint, to rect: CGRect) -> CGPoint {
        CGPoint(
            x: min(max(p.x, rect.minX), rect.maxX),
            y: min(max(p.y, rect.minY), rect.maxY)
        )
    }

    private func updatePaths() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        guard let rect = cropRectInView else {
            outline.path = nil
            dim.path = nil
            cornerHandles.forEach { $0.isHidden = true }
            return
        }
        outline.path = UIBezierPath(rect: rect).cgPath
        let dimPath = UIBezierPath(rect: bounds)
        dimPath.append(UIBezierPath(rect: rect))
        dim.path = dimPath.cgPath
        positionCornerHandles(for: rect)
    }

    private func positionCornerHandles(for rect: CGRect) {
        let size: CGFloat = 10
        let half = size / 2
        let positions = [
            CGPoint(x: rect.minX, y: rect.minY),
            CGPoint(x: rect.maxX, y: rect.minY),
            CGPoint(x: rect.minX, y: rect.maxY),
            CGPoint(x: rect.maxX, y: rect.maxY),
        ]
        for (handle, center) in zip(cornerHandles, positions) {
            let frame = CGRect(x: center.x - half, y: center.y - half, width: size, height: size)
            handle.frame = frame
            handle.path = UIBezierPath(rect: handle.bounds).cgPath
            handle.isHidden = false
        }
    }
}
#endif
