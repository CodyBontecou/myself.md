#if DEBUG && canImport(UIKit)
import UIKit

enum TriggerToast {
    private static weak var current: ToastView?

    static func show(message: String = "Gripe activated",
                     subtitle: String = "Triple-tap anywhere to capture an issue",
                     duration: TimeInterval = 2.0) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { show(message: message, subtitle: subtitle, duration: duration) }
            return
        }
        guard let window = activeKeyWindow() else { return }

        if let existing = current {
            existing.dismissImmediately()
            current = nil
        }

        let toast = ToastView(message: message, subtitle: subtitle)
        window.addSubview(toast)

        NSLayoutConstraint.activate([
            toast.topAnchor.constraint(equalTo: window.safeAreaLayoutGuide.topAnchor, constant: 12),
            toast.centerXAnchor.constraint(equalTo: window.centerXAnchor),
            toast.leadingAnchor.constraint(greaterThanOrEqualTo: window.leadingAnchor, constant: 12),
            toast.trailingAnchor.constraint(lessThanOrEqualTo: window.trailingAnchor, constant: -12),
            toast.widthAnchor.constraint(lessThanOrEqualToConstant: 360),
        ])

        let widthFill = toast.widthAnchor.constraint(equalToConstant: 360)
        widthFill.priority = .defaultHigh
        widthFill.isActive = true

        window.layoutIfNeeded()

        toast.alpha = 0
        toast.transform = CGAffineTransform(translationX: 0, y: -40)

        UIView.animate(withDuration: 0.3,
                       delay: 0,
                       options: [.curveEaseOut],
                       animations: {
            toast.alpha = 1
            toast.transform = .identity
        })

        current = toast

        toast.scheduleDismiss(after: duration) { [weak toast] in
            guard let toast, current === toast else { return }
            current = nil
        }
    }

    private static func activeKeyWindow() -> UIWindow? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        guard let scene else { return nil }
        return scene.keyWindow ?? scene.windows.first(where: { !$0.isHidden })
    }
}

private final class ToastView: UIView {
    private var dismissWorkItem: DispatchWorkItem?
    private var onDismiss: (() -> Void)?

    init(message: String, subtitle: String) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        isUserInteractionEnabled = true
        backgroundColor = GripeColor.surfaceAlt
        layer.cornerRadius = GripeRadius.toast
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = 0.2
        layer.shadowRadius = 16
        layer.shadowOffset = CGSize(width: 0, height: 6)

        let logo = GripeLogoView(size: 32)

        let title = UILabel()
        title.text = message
        title.font = GripeFont.bodySemibold()
        title.textColor = .white
        title.numberOfLines = 1

        let sub = UILabel()
        sub.text = subtitle
        sub.font = GripeFont.caption()
        sub.textColor = UIColor.white.withAlphaComponent(0.7)
        sub.numberOfLines = 2

        let textStack = UIStackView(arrangedSubviews: [title, sub])
        textStack.axis = .vertical
        textStack.alignment = .leading
        textStack.spacing = 2
        textStack.translatesAutoresizingMaskIntoConstraints = false

        let row = UIStackView(arrangedSubviews: [logo, textStack])
        row.axis = .horizontal
        row.alignment = .center
        row.spacing = 12
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)

        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
            row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),
            row.topAnchor.constraint(equalTo: topAnchor, constant: 14),
            row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -14),
        ])

        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        addGestureRecognizer(tap)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) not supported") }

    func scheduleDismiss(after duration: TimeInterval, onComplete: @escaping () -> Void) {
        onDismiss = onComplete
        let work = DispatchWorkItem { [weak self] in self?.animateOut() }
        dismissWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + duration, execute: work)
    }

    func dismissImmediately() {
        dismissWorkItem?.cancel()
        dismissWorkItem = nil
        removeFromSuperview()
    }

    @objc private func handleTap() {
        animateOut()
    }

    private func animateOut() {
        dismissWorkItem?.cancel()
        dismissWorkItem = nil
        UIView.animate(withDuration: 0.25,
                       delay: 0,
                       options: [.curveEaseIn],
                       animations: {
            self.alpha = 0
            self.transform = CGAffineTransform(translationX: 0, y: -40)
        }, completion: { _ in
            self.removeFromSuperview()
            let cb = self.onDismiss
            self.onDismiss = nil
            cb?()
        })
    }
}
#endif
