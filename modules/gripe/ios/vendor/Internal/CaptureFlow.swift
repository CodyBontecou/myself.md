#if DEBUG && canImport(UIKit)
import UIKit

enum CaptureFlow {
    static func start(completion: @escaping () -> Void) {
        guard let scene = activeScene(),
              let window = scene.keyWindow ?? scene.windows.first(where: { !$0.isHidden }) else {
            completion()
            return
        }

        let snapshot = renderSnapshot(of: window)
        TriggerToast.show()

        var pendingSuccess: SuccessPayload?
        let observer = NotificationCenter.default.addObserver(
            forName: CommentComposerVC.issueSubmittedNotification,
            object: nil,
            queue: .main
        ) { note in
            pendingSuccess = SuccessPayload(userInfo: note.userInfo)
        }

        let overlay = SelectorOverlayVC(
            snapshot: snapshot,
            onClose: { [weak window] in
                NotificationCenter.default.removeObserver(observer)
                guard let payload = pendingSuccess, let window else {
                    completion()
                    return
                }
                presentSuccess(payload, in: window, completion: completion)
            }
        )
        overlay.modalPresentationStyle = .overFullScreen
        overlay.modalTransitionStyle = .crossDissolve
        topViewController(for: window)?.present(overlay, animated: true)
    }

    private static func presentSuccess(_ payload: SuccessPayload, in window: UIWindow, completion: @escaping () -> Void) {
        let success = SuccessVC(
            issueURL: payload.url,
            issueNumber: payload.issueNumber,
            title: payload.title,
            croppedImage: payload.image,
            metadata: payload.metadata,
            onFinished: { [weak window] in
                guard let window, let presenter = topViewController(for: window) else {
                    completion()
                    return
                }
                presenter.dismiss(animated: true) { completion() }
            }
        )
        success.modalPresentationStyle = .pageSheet
        if let sheet = success.sheetPresentationController {
            sheet.detents = [.large()]
            sheet.prefersGrabberVisible = true
        }
        topViewController(for: window)?.present(success, animated: true)
    }

    private static func activeScene() -> UIWindowScene? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    }

    private static func renderSnapshot(of window: UIWindow) -> UIImage {
        let renderer = UIGraphicsImageRenderer(bounds: window.bounds)
        return renderer.image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
    }

    private static func topViewController(for window: UIWindow) -> UIViewController? {
        var top = window.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}

private struct SuccessPayload {
    let url: URL
    let title: String
    let issueNumber: Int?
    let image: UIImage?
    let metadata: GripeMetadata

    init?(userInfo: [AnyHashable: Any]?) {
        guard let info = userInfo,
              let url = info["url"] as? URL,
              let metadata = info["metadata"] as? GripeMetadata
        else { return nil }
        self.url = url
        self.title = info["title"] as? String ?? ""
        self.image = info["image"] as? UIImage
        self.metadata = metadata
        self.issueNumber = SuccessPayload.parseIssueNumber(from: url)
    }

    private static func parseIssueNumber(from url: URL) -> Int? {
        let parts = url.pathComponents.reversed()
        for part in parts {
            if let n = Int(part) { return n }
        }
        return nil
    }
}
#endif
