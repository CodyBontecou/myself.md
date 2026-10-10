#if DEBUG && canImport(UIKit)
import UIKit

final class CommentComposerVC: UIViewController {
    static let issueSubmittedNotification = Notification.Name("GripeIssueSubmitted")

    private let options: [String: Bool]
    private let baseImage: UIImage
    private var croppedImage: UIImage
    private var annotationDocument: AnnotationDocument
    private let onFinished: () -> Void
    var onAnnotationUpdated: ((UIImage) -> Void)?

    private let scrollView = UIScrollView()
    private let contentStack = UIStackView()

    private let titleLabel = UILabel()
    private let screenshotPreview = UIImageView()

    private let commentArea = GripeTextArea(placeholder: "Describe what you're seeing\u{2026}", maxCount: 1000)
    private let titleField = GripeTextField(placeholder: "Short summary", maxCount: 100)
    private let tagsField = GripeTextField(placeholder: "comma-separated tags")

    private let bugChip = GripeChip(title: "Bug", systemImage: "ant.fill")
    private let ideaChip = GripeChip(title: "Idea", systemImage: "lightbulb")
    private let polishChip = GripeChip(title: "Polish", systemImage: "sparkles")

    private let submitButton = GripePrimaryButton(title: "Send report", systemImage: "paperplane.fill")
    private let activity = UIActivityIndicatorView(style: .medium)

    init(
        baseImage: UIImage,
        annotatedImage: UIImage,
        document: AnnotationDocument,
        options: [String: Bool] = GripePreferences.values,
        onFinished: @escaping () -> Void
    ) {
        self.options = options
        self.baseImage = baseImage
        self.croppedImage = annotatedImage
        self.annotationDocument = document
        self.onFinished = onFinished
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = GripeColor.background

        setupScroll()
        setupHeader()
        setupContent()
        setupSubmit()
        setupActions()

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            if self?.options["descriptionEnabled"] == true { self?.commentArea.textView.becomeFirstResponder() }
            else if self?.options["titleEnabled"] == true { self?.titleField.textField.becomeFirstResponder() }
        }
    }

    private func setupScroll() {
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.alwaysBounceVertical = true
        scrollView.keyboardDismissMode = .interactive
        view.addSubview(scrollView)

        contentStack.translatesAutoresizingMaskIntoConstraints = false
        contentStack.axis = .vertical
        contentStack.spacing = GripeSpacing.l
        contentStack.alignment = .fill
        scrollView.addSubview(contentStack)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            contentStack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: GripeSpacing.xl),
            contentStack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor, constant: GripeSpacing.xl),
            contentStack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor, constant: -GripeSpacing.xl),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -GripeSpacing.xl),
            contentStack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -GripeSpacing.xl * 2),
        ])
    }

    private func setupHeader() {
        titleLabel.text = "New Gripe report"
        titleLabel.font = GripeFont.headline()
        titleLabel.textColor = GripeColor.textPrimary
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        let actions = UIStackView()
        actions.axis = .horizontal
        actions.alignment = .center
        actions.spacing = 8
        actions.addArrangedSubview(titleLabel)
        let settings = UIButton(type: .system)
        settings.setImage(UIImage(systemName: "gearshape"), for: .normal)
        settings.accessibilityLabel = "Gripe settings"
        settings.addTarget(self, action: #selector(openSettings), for: .touchUpInside)
        actions.addArrangedSubview(settings)
        let close = UIButton(type: .system)
        close.setTitle("Close", for: .normal)
        close.addTarget(self, action: #selector(closeReport), for: .touchUpInside)
        actions.addArrangedSubview(close)
        settings.widthAnchor.constraint(equalToConstant: 44).isActive = true
        settings.heightAnchor.constraint(equalToConstant: 44).isActive = true
        close.widthAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        close.heightAnchor.constraint(equalToConstant: 44).isActive = true
        contentStack.addArrangedSubview(actions)
    }

    @objc private func openSettings() { view.endEditing(true); GripePreferences.present(from: self) }
    @objc private func closeReport() { dismiss(animated: true) { self.onFinished() } }

    private func setupContent() {
        let preview = screenshotPreview
        preview.image = croppedImage
        preview.contentMode = .scaleAspectFit
        preview.backgroundColor = .secondarySystemBackground
        preview.layer.cornerRadius = 12
        preview.clipsToBounds = true
        preview.isAccessibilityElement = true
        preview.accessibilityLabel = "Captured screenshot"
        preview.heightAnchor.constraint(equalToConstant: 120).isActive = true
        contentStack.addArrangedSubview(preview)
        if options["titleEnabled"] == true { contentStack.addArrangedSubview(makeSection(label: "Title", control: titleField)) }
        if options["descriptionEnabled"] == true { contentStack.addArrangedSubview(makeSection(label: options["titleEnabled"] == true ? "Description" : "Prompt", control: commentArea)) }
        if options["tagsEnabled"] == true { contentStack.addArrangedSubview(makeSection(label: "Tags", control: makeTagsBlock())) }

        commentArea.heightAnchor.constraint(greaterThanOrEqualToConstant: 110).isActive = true

        let spacer = UIView()
        spacer.translatesAutoresizingMaskIntoConstraints = false
        spacer.setContentHuggingPriority(.defaultLow, for: .vertical)
        spacer.heightAnchor.constraint(greaterThanOrEqualToConstant: GripeSpacing.l).isActive = true
        contentStack.addArrangedSubview(spacer)
    }

    private func makeSection(label: String, control: UIView) -> UIView {
        let stack = UIStackView()
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        stack.spacing = GripeSpacing.s
        stack.alignment = .fill
        stack.addArrangedSubview(GripeFieldLabel(label))
        stack.addArrangedSubview(control)
        return stack
    }

    private func makeTagsBlock() -> UIView {
        let chipsRow = UIStackView(arrangedSubviews: [bugChip, ideaChip, polishChip])
        chipsRow.translatesAutoresizingMaskIntoConstraints = false
        chipsRow.axis = .horizontal
        chipsRow.spacing = GripeSpacing.s
        chipsRow.alignment = .center
        chipsRow.distribution = .fill

        bugChip.isSelectedChip = true

        let trailingSpacer = UIView()
        trailingSpacer.translatesAutoresizingMaskIntoConstraints = false
        trailingSpacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        chipsRow.addArrangedSubview(trailingSpacer)

        let block = UIStackView(arrangedSubviews: [chipsRow, tagsField])
        block.translatesAutoresizingMaskIntoConstraints = false
        block.axis = .vertical
        block.spacing = GripeSpacing.s
        block.alignment = .fill

        tagsField.textField.autocapitalizationType = .none
        tagsField.textField.autocorrectionType = .no

        return block
    }

    private func setupSubmit() {
        view.addSubview(submitButton)
        view.addSubview(activity)

        activity.translatesAutoresizingMaskIntoConstraints = false
        activity.hidesWhenStopped = true

        NSLayoutConstraint.activate([
            submitButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: GripeSpacing.xl),
            submitButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -GripeSpacing.xl),
            submitButton.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor, constant: -GripeSpacing.l),

            activity.centerXAnchor.constraint(equalTo: submitButton.centerXAnchor),
            activity.centerYAnchor.constraint(equalTo: submitButton.centerYAnchor),
        ])

        scrollView.contentInset.bottom = 80
        scrollView.verticalScrollIndicatorInsets.bottom = 80
    }

    private func setupActions() {
        submitButton.addTarget(self, action: #selector(submitTapped), for: .touchUpInside)
        bugChip.addTarget(self, action: #selector(chipTapped(_:)), for: .touchUpInside)
        ideaChip.addTarget(self, action: #selector(chipTapped(_:)), for: .touchUpInside)
        polishChip.addTarget(self, action: #selector(chipTapped(_:)), for: .touchUpInside)
    }

    func reopenAnnotation() {
        guard options["drawingEnabled"] == true else { return }
        view.endEditing(true)
        let annotation = AnnotationVC(
            image: baseImage,
            document: annotationDocument,
            onCancel: {},
            onDone: { [weak self] annotated, document in
                guard let self else { return }
                self.croppedImage = annotated
                self.screenshotPreview.image = annotated
                self.annotationDocument = document
                self.onAnnotationUpdated?(annotated)
            }
        )
        annotation.modalPresentationStyle = .overFullScreen
        annotation.modalTransitionStyle = .crossDissolve
        present(annotation, animated: true)
    }

    @objc private func chipTapped(_ sender: GripeChip) {
        let chips = [bugChip, ideaChip, polishChip]
        let willToggleOff = sender.isSelectedChip
        if willToggleOff {
            let othersSelected = chips.contains { $0 !== sender && $0.isSelectedChip }
            guard othersSelected else { return }
        }
        sender.isSelectedChip.toggle()
    }

    private var selectedTags: [String] {
        var tags: [String] = []
        if bugChip.isSelectedChip { tags.append(bugChip.title) }
        if ideaChip.isSelectedChip { tags.append(ideaChip.title) }
        if polishChip.isSelectedChip { tags.append(polishChip.title) }
        let custom = (tagsField.textField.text ?? "")
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        tags.append(contentsOf: custom)
        return tags
    }

    @objc private func submitTapped() {
        view.endEditing(true)
        setBusy(true)

        let titleText = titleField.textField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let commentBody = commentArea.textView.text ?? ""
        let tags = options["tagsEnabled"] == true ? selectedTags : []
        let combinedComment = [titleText, tags.isEmpty ? "" : "Tags: \(tags.joined(separator: ", "))", commentBody].filter { !$0.isEmpty }.joined(separator: "\n\n")
        let metadata = MetadataCollector.collect()
        let image = croppedImage

        Task { [weak self] in
            let result = await GripeAPIClient.shared.submit(image: image, comment: combinedComment, metadata: metadata)
            await MainActor.run {
                self?.handle(result, title: titleText, tags: tags)
            }
        }
    }

    private func setBusy(_ busy: Bool) {
        submitButton.isEnabled = !busy
        submitButton.alpha = busy ? 0.5 : 1
        commentArea.textView.isEditable = !busy
        titleField.textField.isEnabled = !busy
        tagsField.textField.isEnabled = !busy
        if busy { activity.startAnimating() } else { activity.stopAnimating() }
    }

    private func handle(_ result: Result<URL, Error>, title: String, tags: [String]) {
        switch result {
        case .success(let url):
            NotificationCenter.default.post(
                name: CommentComposerVC.issueSubmittedNotification,
                object: nil,
                userInfo: [
                    "url": url,
                    "title": title,
                    "tags": tags,
                    "image": croppedImage,
                    "metadata": MetadataCollector.collect(),
                ]
            )
            let onFinished = self.onFinished
            dismiss(animated: true) { onFinished() }
        case .failure(let error):
            NotificationCenter.default.post(name: Notification.Name("GripeSubmissionFailed"), object: nil)
            setBusy(false)
            presentFailureAlert(for: error, title: title, tags: tags)
        }
    }

    private func presentFailureAlert(for error: Error, title: String, tags: [String]) {
        let copy = Self.failureCopy(for: error)
        let alert = UIAlertController(title: copy.title, message: GripeErrorDetails.json(error, redacting: Gripe.shared.configuration?.apiKey ?? ""), preferredStyle: .alert)
        if copy.allowRetry {
            alert.addAction(UIAlertAction(title: "Try Again", style: .default) { [weak self] _ in
                self?.submitTapped()
            })
            alert.addAction(UIAlertAction(title: "Close", style: .cancel) { [weak self] _ in
                self?.onFinished()
            })
        } else {
            alert.addAction(UIAlertAction(title: "OK", style: .default))
        }
        present(alert, animated: true)
    }

    private static func failureCopy(for error: Error) -> (title: String, allowRetry: Bool) {
        guard let gripe = error as? GripeError else { return ("Couldn't submit", true) }
        switch gripe {
        case .unauthorized: return ("API key was rejected", false)
        case .rateLimited: return ("Slow down a bit", false)
        case .network: return ("Saved for later", false)
        case .serverError(let code, _): return ("Server error (\(code))", true)
        case .invalidResponse: return ("Unexpected server response", false)
        case .encodingFailed: return ("Couldn't encode screenshot", true)
        case .notConfigured: return ("Gripe isn't configured", false)
        }
    }
}
#endif
