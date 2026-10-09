#if DEBUG && canImport(UIKit)
import UIKit

final class GestureInstaller {
    private var observer: NSObjectProtocol?
    private var trigger: (() -> Void)?

    private struct Keys { static var attached: UInt8 = 0 }

    func install(trigger: @escaping () -> Void) {
        self.trigger = trigger
        observer = NotificationCenter.default.addObserver(
            forName: UIWindow.didBecomeVisibleNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard let window = note.object as? UIWindow else { return }
            self?.attach(to: window)
        }
        for scene in UIApplication.shared.connectedScenes {
            guard let ws = scene as? UIWindowScene else { continue }
            for window in ws.windows {
                attach(to: window)
            }
        }
    }

    func uninstall() {
        if let observer { NotificationCenter.default.removeObserver(observer) }
        observer = nil
        trigger = nil
    }

    private func attach(to window: UIWindow) {
        if objc_getAssociatedObject(window, &Keys.attached) != nil { return }
        objc_setAssociatedObject(window, &Keys.attached, true, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        let recognizer = UITapGestureRecognizer(target: self, action: #selector(handle(_:)))
        recognizer.numberOfTapsRequired = 3
        recognizer.numberOfTouchesRequired = 2
        recognizer.cancelsTouchesInView = false
        recognizer.delaysTouchesBegan = false
        recognizer.delaysTouchesEnded = false
        window.addGestureRecognizer(recognizer)
    }

    @objc private func handle(_ recognizer: UITapGestureRecognizer) {
        guard recognizer.state == .recognized else { return }
        trigger?()
    }
}
#endif
