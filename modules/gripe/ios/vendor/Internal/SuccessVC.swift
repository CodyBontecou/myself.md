#if DEBUG && canImport(UIKit)
import UIKit

final class SuccessVC: UIViewController {
    private let issueURL: URL
    private let issueNumber: Int?
    private let issueTitle: String
    private let croppedImage: UIImage?
    private let metadata: GripeMetadata
    private let onFinished: () -> Void

    private let copyButton = GripeSecondaryButton(title: "Copy Link", systemImage: "link")
    private var copyResetWorkItem: DispatchWorkItem?

    init(issueURL: URL,
         issueNumber: Int?,
         title: String,
         croppedImage: UIImage?,
         metadata: GripeMetadata,
         onFinished: @escaping () -> Void) {
        self.issueURL = issueURL
        self.issueNumber = issueNumber
        self.issueTitle = title
        self.croppedImage = croppedImage
        self.metadata = metadata
        self.onFinished = onFinished
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = GripeColor.background
        buildLayout()
    }

    private func buildLayout() {
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = true
        view.addSubview(scroll)

        let content = UIView()
        content.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(content)

        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            content.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            content.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            content.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            content.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
            content.heightAnchor.constraint(greaterThanOrEqualTo: scroll.frameLayoutGuide.heightAnchor),
        ])

        let badge = makeCheckBadge()
        let confetti = ConfettiView()
        confetti.translatesAutoresizingMaskIntoConstraints = false

        let titleLabel = UILabel()
        titleLabel.text = "Issue created"
        titleLabel.font = .systemFont(ofSize: 28, weight: .bold)
        titleLabel.textColor = GripeColor.textPrimary
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        let subtitleLabel = UILabel()
        subtitleLabel.attributedText = makeSubtitle()
        subtitleLabel.textAlignment = .center
        subtitleLabel.numberOfLines = 0
        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false

        let card = makeMetadataCard()

        let openButton = GripePrimaryButton(title: "Open in GitHub", systemImage: "arrow.up.right.square")
        openButton.addTarget(self, action: #selector(handleOpen), for: .touchUpInside)

        copyButton.addTarget(self, action: #selector(handleCopy), for: .touchUpInside)

        let doneButton = GripeSecondaryButton(title: "Done")
        doneButton.addTarget(self, action: #selector(handleDone), for: .touchUpInside)

        let buttonsStack = UIStackView(arrangedSubviews: [openButton, copyButton, doneButton])
        buttonsStack.axis = .vertical
        buttonsStack.spacing = 10
        buttonsStack.alignment = .fill
        buttonsStack.translatesAutoresizingMaskIntoConstraints = false

        content.addSubview(confetti)
        content.addSubview(badge)
        content.addSubview(titleLabel)
        content.addSubview(subtitleLabel)
        content.addSubview(card)
        content.addSubview(buttonsStack)

        NSLayoutConstraint.activate([
            badge.centerXAnchor.constraint(equalTo: content.centerXAnchor),
            badge.topAnchor.constraint(equalTo: content.safeAreaLayoutGuide.topAnchor, constant: 36),

            confetti.centerXAnchor.constraint(equalTo: badge.centerXAnchor),
            confetti.centerYAnchor.constraint(equalTo: badge.centerYAnchor),
            confetti.widthAnchor.constraint(equalToConstant: 240),
            confetti.heightAnchor.constraint(equalToConstant: 140),

            titleLabel.topAnchor.constraint(equalTo: badge.bottomAnchor, constant: 24),
            titleLabel.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 20),
            titleLabel.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -20),

            subtitleLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 6),
            subtitleLabel.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 20),
            subtitleLabel.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -20),

            card.topAnchor.constraint(equalTo: subtitleLabel.bottomAnchor, constant: 24),
            card.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 20),
            card.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -20),

            buttonsStack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 20),
            buttonsStack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -20),
            buttonsStack.topAnchor.constraint(greaterThanOrEqualTo: card.bottomAnchor, constant: 24),
            buttonsStack.bottomAnchor.constraint(equalTo: content.safeAreaLayoutGuide.bottomAnchor, constant: -20),
        ])
    }

    private func makeSubtitle() -> NSAttributedString {
        let attributed = NSMutableAttributedString()
        if let n = issueNumber {
            attributed.append(NSAttributedString(
                string: "#\(n) ",
                attributes: [
                    .font: GripeFont.bodySemibold(),
                    .foregroundColor: GripeColor.primary,
                ]
            ))
        }
        attributed.append(NSAttributedString(
            string: issueTitle,
            attributes: [
                .font: GripeFont.body(),
                .foregroundColor: GripeColor.textPrimary,
            ]
        ))
        return attributed
    }

    private func makeCheckBadge() -> UIView {
        let container = UIView()
        container.translatesAutoresizingMaskIntoConstraints = false
        container.backgroundColor = GripeColor.success
        container.layer.cornerRadius = 36
        container.clipsToBounds = true

        let check = UIImageView(image: UIImage(systemName: "checkmark",
                                               withConfiguration: UIImage.SymbolConfiguration(pointSize: 32, weight: .bold)))
        check.tintColor = .white
        check.contentMode = .scaleAspectFit
        check.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(check)

        NSLayoutConstraint.activate([
            container.widthAnchor.constraint(equalToConstant: 72),
            container.heightAnchor.constraint(equalToConstant: 72),
            check.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            check.centerYAnchor.constraint(equalTo: container.centerYAnchor),
        ])
        return container
    }

    private func makeMetadataCard() -> UIView {
        let card = UIView()
        card.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = GripeColor.surface
        card.layer.cornerRadius = GripeRadius.card
        card.layer.borderColor = GripeColor.border.cgColor
        card.layer.borderWidth = 1

        let thumbWrapper = UIView()
        thumbWrapper.translatesAutoresizingMaskIntoConstraints = false
        thumbWrapper.backgroundColor = GripeColor.background
        thumbWrapper.layer.cornerRadius = 10
        thumbWrapper.layer.borderColor = GripeColor.border.cgColor
        thumbWrapper.layer.borderWidth = 1
        thumbWrapper.clipsToBounds = true

        if let img = croppedImage {
            let iv = UIImageView(image: img)
            iv.translatesAutoresizingMaskIntoConstraints = false
            iv.contentMode = .scaleAspectFit
            iv.clipsToBounds = true
            thumbWrapper.addSubview(iv)
            NSLayoutConstraint.activate([
                iv.topAnchor.constraint(equalTo: thumbWrapper.topAnchor),
                iv.leadingAnchor.constraint(equalTo: thumbWrapper.leadingAnchor),
                iv.trailingAnchor.constraint(equalTo: thumbWrapper.trailingAnchor),
                iv.bottomAnchor.constraint(equalTo: thumbWrapper.bottomAnchor),
            ])
        }

        let metaStack = UIStackView()
        metaStack.translatesAutoresizingMaskIntoConstraints = false
        metaStack.axis = .vertical
        metaStack.spacing = 12
        metaStack.alignment = .fill

        let dateFmt = DateFormatter()
        dateFmt.dateStyle = .medium
        dateFmt.timeStyle = .short

        let repo = Gripe.shared.configuration?.repository
        let rows: [(String, String)] = [
            ("Repository", repo ?? "—"),
            ("Screen", metadata.viewControllerName ?? "—"),
            ("Device", metadata.deviceModel),
            (metadata.osName, metadata.osVersion),
            ("App version", "\(metadata.appVersion) (\(metadata.build))"),
            ("Captured", dateFmt.string(from: metadata.capturedAt)),
        ]
        for (key, value) in rows {
            metaStack.addArrangedSubview(makeStackedRow(key: key, value: value))
        }

        card.addSubview(thumbWrapper)
        card.addSubview(metaStack)

        NSLayoutConstraint.activate([
            thumbWrapper.topAnchor.constraint(equalTo: card.topAnchor, constant: 16),
            thumbWrapper.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            thumbWrapper.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -16),
            thumbWrapper.widthAnchor.constraint(equalTo: card.widthAnchor, multiplier: 0.42),

            metaStack.topAnchor.constraint(equalTo: card.topAnchor, constant: 16),
            metaStack.leadingAnchor.constraint(equalTo: thumbWrapper.trailingAnchor, constant: 16),
            metaStack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
            metaStack.bottomAnchor.constraint(lessThanOrEqualTo: card.bottomAnchor, constant: -16),
        ])
        return card
    }

    private func makeStackedRow(key: String, value: String) -> UIView {
        let keyLabel = UILabel()
        keyLabel.text = key
        keyLabel.font = GripeFont.caption()
        keyLabel.textColor = GripeColor.textSecondary
        keyLabel.translatesAutoresizingMaskIntoConstraints = false

        let valueLabel = UILabel()
        valueLabel.text = value
        valueLabel.font = GripeFont.bodySemibold()
        valueLabel.textColor = GripeColor.textPrimary
        valueLabel.numberOfLines = 0
        valueLabel.translatesAutoresizingMaskIntoConstraints = false

        let stack = UIStackView(arrangedSubviews: [keyLabel, valueLabel])
        stack.axis = .vertical
        stack.spacing = 2
        stack.alignment = .fill
        stack.translatesAutoresizingMaskIntoConstraints = false
        return stack
    }

    @objc private func handleOpen() {
        UIApplication.shared.open(issueURL)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
            self?.onFinished()
        }
    }

    @objc private func handleCopy() {
        UIPasteboard.general.string = issueURL.absoluteString
        var attr = AttributedString("Copied")
        attr.font = GripeFont.bodyMedium()
        var config = copyButton.configuration
        config?.attributedTitle = attr
        config?.image = UIImage(systemName: "checkmark")?
            .withConfiguration(UIImage.SymbolConfiguration(pointSize: 16, weight: .medium))
        copyButton.configuration = config

        copyResetWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            var restored = AttributedString("Copy Link")
            restored.font = GripeFont.bodyMedium()
            var c = self.copyButton.configuration
            c?.attributedTitle = restored
            c?.image = UIImage(systemName: "link")?
                .withConfiguration(UIImage.SymbolConfiguration(pointSize: 16, weight: .medium))
            self.copyButton.configuration = c
        }
        copyResetWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0, execute: work)
    }

    @objc private func handleDone() {
        onFinished()
    }
}

// MARK: - Confetti decoration

private final class ConfettiView: UIView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isUserInteractionEnabled = false
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) not supported") }

    private let dots: [(CGPoint, UIColor)] = [
        (CGPoint(x: -110, y: -8),  UIColor(red: 0xEF/255, green: 0x44/255, blue: 0x44/255, alpha: 1)),
        (CGPoint(x: -86,  y: 36),  UIColor(red: 0x0A/255, green: 0x84/255, blue: 0xFF/255, alpha: 1)),
        (CGPoint(x: -64,  y: -48), UIColor(red: 0x22/255, green: 0xC5/255, blue: 0x5E/255, alpha: 1)),
        (CGPoint(x: -36,  y: 56),  UIColor(red: 0xF5/255, green: 0xA6/255, blue: 0x23/255, alpha: 1)),
        (CGPoint(x: 30,   y: -56), UIColor(red: 0xEF/255, green: 0x44/255, blue: 0x44/255, alpha: 1)),
        (CGPoint(x: 60,   y: 50),  UIColor(red: 0x0A/255, green: 0x84/255, blue: 0xFF/255, alpha: 1)),
        (CGPoint(x: 92,   y: -18), UIColor(red: 0xF5/255, green: 0xA6/255, blue: 0x23/255, alpha: 1)),
        (CGPoint(x: 110,  y: 26),  UIColor(red: 0x22/255, green: 0xC5/255, blue: 0x5E/255, alpha: 1)),
    ]

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        let center = CGPoint(x: bounds.midX, y: bounds.midY)
        let r: CGFloat = 3
        for (offset, color) in dots {
            ctx.setFillColor(color.cgColor)
            let p = CGRect(x: center.x + offset.x - r,
                           y: center.y + offset.y - r,
                           width: r * 2,
                           height: r * 2)
            ctx.fillEllipse(in: p)
        }
    }
}
#endif
