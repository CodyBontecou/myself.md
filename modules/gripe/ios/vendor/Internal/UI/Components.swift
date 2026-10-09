#if DEBUG && canImport(UIKit)
import UIKit

// MARK: - Buttons

final class GripePrimaryButton: UIButton {
    init(title: String, systemImage: String? = nil) {
        super.init(frame: .zero)
        var config = UIButton.Configuration.filled()
        config.cornerStyle = .fixed
        config.background.cornerRadius = GripeRadius.button
        config.background.backgroundColor = GripeColor.primary
        config.baseForegroundColor = .white
        config.contentInsets = NSDirectionalEdgeInsets(top: 14, leading: 18, bottom: 14, trailing: 18)
        config.imagePadding = 8
        if let systemImage {
            config.image = UIImage(systemName: systemImage)?
                .withConfiguration(UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold))
        }
        var attr = AttributedString(title)
        attr.font = GripeFont.bodySemibold()
        config.attributedTitle = attr
        configuration = config
        configurationUpdateHandler = { btn in
            var c = btn.configuration
            c?.background.backgroundColor = btn.isHighlighted ? GripeColor.primaryDark : GripeColor.primary
            btn.configuration = c
        }
        translatesAutoresizingMaskIntoConstraints = false
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) not supported") }
}

final class GripeSecondaryButton: UIButton {
    init(title: String, systemImage: String? = nil) {
        super.init(frame: .zero)
        var config = UIButton.Configuration.plain()
        config.background.strokeColor = GripeColor.border
        config.background.strokeWidth = 1
        config.background.cornerRadius = GripeRadius.button
        config.background.backgroundColor = GripeColor.surface
        config.baseForegroundColor = GripeColor.textPrimary
        config.contentInsets = NSDirectionalEdgeInsets(top: 14, leading: 18, bottom: 14, trailing: 18)
        config.imagePadding = 8
        if let systemImage {
            config.image = UIImage(systemName: systemImage)?
                .withConfiguration(UIImage.SymbolConfiguration(pointSize: 16, weight: .medium))
        }
        var attr = AttributedString(title)
        attr.font = GripeFont.bodyMedium()
        config.attributedTitle = attr
        configuration = config
        configurationUpdateHandler = { btn in
            var c = btn.configuration
            c?.background.backgroundColor = btn.isHighlighted ? GripeColor.chipFill : GripeColor.surface
            btn.configuration = c
        }
        translatesAutoresizingMaskIntoConstraints = false
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) not supported") }
}

// MARK: - Chip

final class GripeChip: UIControl {
    let title: String
    let systemImage: String?

    private let stack = UIStackView()
    private let icon = UIImageView()
    private let label = UILabel()

    var isSelectedChip: Bool = false { didSet { applyState() } }

    init(title: String, systemImage: String? = nil) {
        self.title = title
        self.systemImage = systemImage
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        layer.cornerRadius = GripeRadius.chip
        layer.borderWidth = 1
        clipsToBounds = true

        stack.axis = .horizontal
        stack.alignment = .center
        stack.spacing = 6
        stack.isUserInteractionEnabled = false
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        if let systemImage {
            icon.image = UIImage(systemName: systemImage)?
                .withConfiguration(UIImage.SymbolConfiguration(pointSize: 13, weight: .semibold))
            icon.contentMode = .scaleAspectFit
            stack.addArrangedSubview(icon)
        }

        label.text = title
        label.font = GripeFont.chip()
        stack.addArrangedSubview(label)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
            stack.topAnchor.constraint(equalTo: topAnchor, constant: 8),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -8),
            heightAnchor.constraint(equalToConstant: 32),
        ])
        applyState()
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) not supported") }

    override var isHighlighted: Bool { didSet { alpha = isHighlighted ? 0.7 : 1 } }

    private func applyState() {
        if isSelectedChip {
            backgroundColor = GripeColor.primary.withAlphaComponent(0.1)
            layer.borderColor = GripeColor.primary.cgColor
            label.textColor = GripeColor.primary
            icon.tintColor = GripeColor.primary
        } else {
            backgroundColor = GripeColor.surface
            layer.borderColor = GripeColor.border.cgColor
            label.textColor = GripeColor.textSecondary
            icon.tintColor = GripeColor.textSecondary
        }
    }
}

// MARK: - Single-line text field

final class GripeTextField: UIView {
    let textField = UITextField()
    private let maxCount: Int?
    private let counterLabel = UILabel()

    init(placeholder: String, maxCount: Int? = nil) {
        self.maxCount = maxCount
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = GripeColor.surface
        layer.cornerRadius = GripeRadius.field
        layer.borderColor = GripeColor.border.cgColor
        layer.borderWidth = 1

        textField.font = GripeFont.body()
        textField.textColor = GripeColor.textPrimary
        textField.attributedPlaceholder = NSAttributedString(
            string: placeholder,
            attributes: [.foregroundColor: GripeColor.textSecondary]
        )
        textField.translatesAutoresizingMaskIntoConstraints = false
        addSubview(textField)

        let textTrailing: NSLayoutConstraint
        if let maxCount {
            counterLabel.font = GripeFont.caption()
            counterLabel.textColor = GripeColor.textSecondary
            counterLabel.text = "0/\(maxCount)"
            counterLabel.textAlignment = .right
            counterLabel.translatesAutoresizingMaskIntoConstraints = false
            counterLabel.setContentHuggingPriority(.required, for: .horizontal)
            counterLabel.setContentCompressionResistancePriority(.required, for: .horizontal)
            addSubview(counterLabel)
            textField.addTarget(self, action: #selector(textChanged), for: .editingChanged)
            textTrailing = textField.trailingAnchor.constraint(equalTo: counterLabel.leadingAnchor, constant: -8)
            NSLayoutConstraint.activate([
                counterLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),
                counterLabel.centerYAnchor.constraint(equalTo: centerYAnchor),
            ])
        } else {
            textTrailing = textField.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14)
        }

        NSLayoutConstraint.activate([
            textField.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 14),
            textTrailing,
            textField.topAnchor.constraint(equalTo: topAnchor, constant: 12),
            textField.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -12),
            heightAnchor.constraint(equalToConstant: 48),
        ])
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) not supported") }

    @objc private func textChanged() {
        guard let maxCount else { return }
        counterLabel.text = "\(textField.text?.count ?? 0)/\(maxCount)"
    }
}

// MARK: - Multi-line comment area

final class GripeTextArea: UIView, UITextViewDelegate {
    let textView = UITextView()
    private let placeholderLabel = UILabel()
    private let counterLabel = UILabel()
    private let maxCount: Int?

    var onChange: ((String) -> Void)?

    init(placeholder: String, maxCount: Int? = nil) {
        self.maxCount = maxCount
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = GripeColor.surface
        layer.cornerRadius = GripeRadius.field
        layer.borderColor = GripeColor.border.cgColor
        layer.borderWidth = 1

        textView.font = GripeFont.body()
        textView.textColor = GripeColor.textPrimary
        textView.backgroundColor = .clear
        textView.delegate = self
        let bottomInset: CGFloat = maxCount != nil ? 26 : 12
        textView.textContainerInset = UIEdgeInsets(top: 12, left: 10, bottom: bottomInset, right: 10)
        textView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(textView)

        placeholderLabel.text = placeholder
        placeholderLabel.font = GripeFont.body()
        placeholderLabel.textColor = GripeColor.textSecondary
        placeholderLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(placeholderLabel)

        NSLayoutConstraint.activate([
            textView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 4),
            textView.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -4),
            textView.topAnchor.constraint(equalTo: topAnchor, constant: 0),
            textView.bottomAnchor.constraint(equalTo: bottomAnchor, constant: 0),

            placeholderLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            placeholderLabel.topAnchor.constraint(equalTo: topAnchor, constant: 14),
        ])

        if let maxCount {
            counterLabel.font = GripeFont.caption()
            counterLabel.textColor = GripeColor.textSecondary
            counterLabel.text = "0/\(maxCount)"
            counterLabel.translatesAutoresizingMaskIntoConstraints = false
            addSubview(counterLabel)
            NSLayoutConstraint.activate([
                counterLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -14),
                counterLabel.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -8),
            ])
        }
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) not supported") }

    func textViewDidChange(_ textView: UITextView) {
        placeholderLabel.isHidden = !textView.text.isEmpty
        if let maxCount {
            counterLabel.text = "\(textView.text.count)/\(maxCount)"
        }
        onChange?(textView.text)
    }
}

// MARK: - Form section label (small uppercase)

final class GripeFieldLabel: UILabel {
    init(_ text: String) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        self.text = text
        font = GripeFont.captionMedium()
        textColor = GripeColor.textSecondary
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) not supported") }
}

// MARK: - Brand logo (chat bubble + dot)

final class GripeLogoView: UIView {
    init(size: CGFloat = 28) {
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        backgroundColor = GripeColor.primary
        layer.cornerRadius = size * 0.28
        clipsToBounds = true

        let icon = UIImageView(image: UIImage(systemName: "bubble.left.fill")?
            .withConfiguration(UIImage.SymbolConfiguration(pointSize: size * 0.55, weight: .bold)))
        icon.tintColor = .white
        icon.contentMode = .scaleAspectFit
        icon.translatesAutoresizingMaskIntoConstraints = false
        addSubview(icon)

        NSLayoutConstraint.activate([
            widthAnchor.constraint(equalToConstant: size),
            heightAnchor.constraint(equalToConstant: size),
            icon.centerXAnchor.constraint(equalTo: centerXAnchor),
            icon.centerYAnchor.constraint(equalTo: centerYAnchor, constant: -1),
        ])
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) not supported") }
}
#endif
