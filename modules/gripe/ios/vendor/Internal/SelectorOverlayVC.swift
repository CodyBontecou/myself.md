#if DEBUG && canImport(UIKit)
import UIKit

final class SelectorOverlayVC: UIViewController {
    private let snapshot: UIImage
    private let onClose: () -> Void

    private let imageView = UIImageView()
    private let cropView = CropRectView()
    private let previewTapView = UIView()
    private weak var presentedComposer: CommentComposerVC?

    private let topBar = UIView()
    private let topBarBlur = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterial))
    private let topBarRim = UIView()
    private let titleLabel = UILabel()
    private let infoButton = UIButton(type: .system)
    private let dividerView = UIView()
    private let cancelButton = UIButton(type: .custom)
    private let nextButton = UIButton(type: .custom)
    private let rightStack = UIStackView()

    init(snapshot: UIImage, onClose: @escaping () -> Void) {
        self.snapshot = snapshot
        self.onClose = onClose
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        imageView.image = snapshot
        imageView.contentMode = .scaleAspectFit
        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.isUserInteractionEnabled = false
        view.addSubview(imageView)

        cropView.translatesAutoresizingMaskIntoConstraints = false
        cropView.backgroundColor = .clear
        view.addSubview(cropView)

        previewTapView.translatesAutoresizingMaskIntoConstraints = false
        previewTapView.backgroundColor = .clear
        previewTapView.isHidden = true
        previewTapView.addGestureRecognizer(
            UITapGestureRecognizer(target: self, action: #selector(previewTapped))
        )
        view.addSubview(previewTapView)

        configureTopBar()
        view.addSubview(topBar)

        let imageRect: () -> CGRect = { [weak self] in self?.displayedImageRect() ?? .zero }
        cropView.configure(imageRect: imageRect)
        cropView.onSelectionChanged = { [weak self] in self?.updateNextButtonVisibility() }

        NSLayoutConstraint.activate([
            imageView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            imageView.topAnchor.constraint(equalTo: view.topAnchor),
            imageView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            cropView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            cropView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            cropView.topAnchor.constraint(equalTo: view.topAnchor),
            cropView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            previewTapView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            previewTapView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            previewTapView.topAnchor.constraint(equalTo: view.topAnchor),
            previewTapView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            topBar.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            topBar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: GripeSpacing.s),
            topBar.heightAnchor.constraint(equalToConstant: 44),
            topBar.leadingAnchor.constraint(greaterThanOrEqualTo: view.safeAreaLayoutGuide.leadingAnchor, constant: GripeSpacing.l),
            topBar.trailingAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -GripeSpacing.l),
        ])

        updateNextButtonVisibility()
    }

    private func configureTopBar() {
        topBar.translatesAutoresizingMaskIntoConstraints = false
        topBar.backgroundColor = .clear
        topBar.layer.cornerRadius = 22
        topBar.layer.cornerCurve = .continuous
        topBar.layer.shadowColor = UIColor.black.cgColor
        topBar.layer.shadowOpacity = 0.18
        topBar.layer.shadowRadius = 18
        topBar.layer.shadowOffset = CGSize(width: 0, height: 4)

        topBarBlur.translatesAutoresizingMaskIntoConstraints = false
        topBarBlur.layer.cornerRadius = 22
        topBarBlur.layer.cornerCurve = .continuous
        topBarBlur.clipsToBounds = true
        topBar.addSubview(topBarBlur)

        topBarRim.translatesAutoresizingMaskIntoConstraints = false
        topBarRim.backgroundColor = .clear
        topBarRim.layer.cornerRadius = 22
        topBarRim.layer.cornerCurve = .continuous
        topBarRim.layer.borderWidth = 0.5
        topBarRim.layer.borderColor = UIColor.white.withAlphaComponent(0.45).cgColor
        topBarRim.isUserInteractionEnabled = false
        topBar.addSubview(topBarRim)

        NSLayoutConstraint.activate([
            topBarBlur.leadingAnchor.constraint(equalTo: topBar.leadingAnchor),
            topBarBlur.trailingAnchor.constraint(equalTo: topBar.trailingAnchor),
            topBarBlur.topAnchor.constraint(equalTo: topBar.topAnchor),
            topBarBlur.bottomAnchor.constraint(equalTo: topBar.bottomAnchor),

            topBarRim.leadingAnchor.constraint(equalTo: topBar.leadingAnchor),
            topBarRim.trailingAnchor.constraint(equalTo: topBar.trailingAnchor),
            topBarRim.topAnchor.constraint(equalTo: topBar.topAnchor),
            topBarRim.bottomAnchor.constraint(equalTo: topBar.bottomAnchor),
        ])

        let content = topBarBlur.contentView

        titleLabel.text = "Gripe"
        titleLabel.font = GripeFont.bodySemibold()
        titleLabel.textColor = GripeColor.textPrimary
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(titleLabel)

        infoButton.setImage(UIImage(systemName: "info.circle")?
            .withConfiguration(UIImage.SymbolConfiguration(pointSize: 14, weight: .regular)), for: .normal)
        infoButton.tintColor = GripeColor.textSecondary
        infoButton.addTarget(self, action: #selector(infoTapped), for: .touchUpInside)
        infoButton.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(infoButton)

        dividerView.backgroundColor = UIColor.black.withAlphaComponent(0.1)
        dividerView.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(dividerView)

        var cancelConfig = UIButton.Configuration.plain()
        cancelConfig.image = UIImage(systemName: "xmark")?
            .withConfiguration(UIImage.SymbolConfiguration(pointSize: 13, weight: .semibold))
        cancelConfig.baseForegroundColor = GripeColor.textPrimary
        cancelConfig.contentInsets = .zero
        cancelButton.configuration = cancelConfig
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)

        var nextConfig = UIButton.Configuration.filled()
        nextConfig.cornerStyle = .capsule
        nextConfig.baseBackgroundColor = GripeColor.primary
        nextConfig.baseForegroundColor = .white
        nextConfig.image = UIImage(systemName: "arrow.right")?
            .withConfiguration(UIImage.SymbolConfiguration(pointSize: 12, weight: .semibold))
        nextConfig.imagePlacement = .trailing
        nextConfig.imagePadding = 6
        nextConfig.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 14, bottom: 6, trailing: 12)
        var nextAttr = AttributedString("Next")
        nextAttr.font = .systemFont(ofSize: 14, weight: .semibold)
        nextConfig.attributedTitle = nextAttr
        nextButton.configuration = nextConfig
        nextButton.configurationUpdateHandler = { btn in
            var c = btn.configuration
            c?.background.backgroundColor = btn.isHighlighted ? GripeColor.primaryDark : GripeColor.primary
            btn.configuration = c
        }
        nextButton.addTarget(self, action: #selector(nextTapped), for: .touchUpInside)
        nextButton.isHidden = true
        nextButton.alpha = 0

        rightStack.axis = .horizontal
        rightStack.spacing = 4
        rightStack.alignment = .center
        rightStack.translatesAutoresizingMaskIntoConstraints = false
        rightStack.addArrangedSubview(cancelButton)
        rightStack.addArrangedSubview(nextButton)
        content.addSubview(rightStack)

        NSLayoutConstraint.activate([
            titleLabel.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 16),
            titleLabel.centerYAnchor.constraint(equalTo: content.centerYAnchor),

            infoButton.leadingAnchor.constraint(equalTo: titleLabel.trailingAnchor, constant: 4),
            infoButton.centerYAnchor.constraint(equalTo: content.centerYAnchor),
            infoButton.widthAnchor.constraint(equalToConstant: 22),
            infoButton.heightAnchor.constraint(equalToConstant: 22),

            dividerView.leadingAnchor.constraint(equalTo: infoButton.trailingAnchor, constant: 10),
            dividerView.widthAnchor.constraint(equalToConstant: 0.5),
            dividerView.topAnchor.constraint(equalTo: content.topAnchor, constant: 10),
            dividerView.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -10),

            rightStack.leadingAnchor.constraint(equalTo: dividerView.trailingAnchor, constant: 8),
            rightStack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -6),
            rightStack.centerYAnchor.constraint(equalTo: content.centerYAnchor),

            cancelButton.widthAnchor.constraint(equalToConstant: 30),
            cancelButton.heightAnchor.constraint(equalToConstant: 30),
        ])
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        cropView.refreshIfNeeded()
        updateNextButtonVisibility()
        topBar.layer.shadowPath = UIBezierPath(
            roundedRect: topBar.bounds,
            cornerRadius: topBar.layer.cornerRadius
        ).cgPath
    }

    func displayedImageRect() -> CGRect {
        guard let image = imageView.image, image.size.width > 0, image.size.height > 0 else {
            return imageView.frame
        }
        let viewSize = imageView.bounds.size
        let scale = min(viewSize.width / image.size.width, viewSize.height / image.size.height)
        let displaySize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let origin = CGPoint(
            x: imageView.frame.origin.x + (viewSize.width - displaySize.width) / 2,
            y: imageView.frame.origin.y + (viewSize.height - displaySize.height) / 2
        )
        return CGRect(origin: origin, size: displaySize)
    }

    private func updateNextButtonVisibility() {
        let rect = cropView.cropRectInView
        let hasSelection = rect.map { $0.width > 4 && $0.height > 4 } ?? false
        guard nextButton.isHidden == hasSelection else { return }
        UIView.animate(withDuration: 0.22, delay: 0, options: [.beginFromCurrentState, .curveEaseInOut]) {
            self.nextButton.isHidden = !hasSelection
            self.nextButton.alpha = hasSelection ? 1 : 0
            self.view.layoutIfNeeded()
        }
    }

    @objc private func cancelTapped() {
        finish(animated: true)
    }

    @objc private func infoTapped() {
        let docs = DocsSheetVC()
        if #available(iOS 15.0, *) {
            docs.modalPresentationStyle = .pageSheet
            if let sheet = docs.sheetPresentationController {
                if #available(iOS 16.0, *) {
                    sheet.detents = [.medium(), .large()]
                } else {
                    sheet.detents = [.medium(), .large()]
                }
                sheet.prefersGrabberVisible = true
            }
        } else {
            docs.modalPresentationStyle = .formSheet
        }
        present(docs, animated: true)
    }

    @objc private func nextTapped() {
        guard let rect = cropView.cropRectInView, rect.width > 4, rect.height > 4 else { return }
        let cropped = crop(image: snapshot, rectInView: rect) ?? snapshot
        let annotation = AnnotationVC(
            image: cropped,
            onCancel: {},
            onDone: { [weak self] annotated, document in
                self?.presentComposer(baseImage: cropped, annotated: annotated, document: document)
            }
        )
        annotation.modalPresentationStyle = .overFullScreen
        annotation.modalTransitionStyle = .crossDissolve
        present(annotation, animated: true)
    }

    private func presentComposer(baseImage: UIImage, annotated: UIImage, document: AnnotationDocument) {
        enterPreviewMode(annotated: annotated)
        let composer = CommentComposerVC(
            baseImage: baseImage,
            annotatedImage: annotated,
            document: document,
            onFinished: { [weak self] in
                self?.finish(animated: false)
            }
        )
        composer.onAnnotationUpdated = { [weak self] image in
            self?.imageView.image = image
        }
        presentedComposer = composer
        if #available(iOS 15.0, *) {
            composer.modalPresentationStyle = .pageSheet
            if let sheet = composer.sheetPresentationController {
                sheet.detents = [.medium(), .large()]
                sheet.prefersGrabberVisible = true
                sheet.largestUndimmedDetentIdentifier = .medium
                sheet.prefersScrollingExpandsWhenScrolledToEdge = false
            }
        } else {
            composer.modalPresentationStyle = .formSheet
        }
        present(composer, animated: true)
    }

    private func enterPreviewMode(annotated: UIImage) {
        imageView.image = annotated
        cropView.isHidden = true
        topBar.isHidden = true
        previewTapView.isHidden = false
    }

    @objc private func previewTapped() {
        presentedComposer?.reopenAnnotation()
    }

    private func crop(image: UIImage, rectInView: CGRect) -> UIImage? {
        let imageRect = displayedImageRect()
        guard imageRect.width > 0, imageRect.height > 0 else { return nil }
        let scaleX = image.size.width / imageRect.width
        let scaleY = image.size.height / imageRect.height
        let normalized = CGRect(
            x: (rectInView.minX - imageRect.minX) * scaleX,
            y: (rectInView.minY - imageRect.minY) * scaleY,
            width: rectInView.width * scaleX,
            height: rectInView.height * scaleY
        ).integral
        let pxRect = CGRect(
            x: normalized.minX * image.scale,
            y: normalized.minY * image.scale,
            width: normalized.width * image.scale,
            height: normalized.height * image.scale
        )
        guard let cg = image.cgImage?.cropping(to: pxRect) else { return nil }
        return UIImage(cgImage: cg, scale: image.scale, orientation: image.imageOrientation)
    }

    private func finish(animated: Bool) {
        let onClose = self.onClose
        dismiss(animated: animated) {
            onClose()
        }
    }
}
#endif
