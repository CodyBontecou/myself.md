#if DEBUG && canImport(UIKit)
import UIKit

final class DocsSheetVC: UIViewController {
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
        ])

        let logo = GripeLogoView(size: 36)

        let title = UILabel()
        title.text = "How Gripe works"
        title.font = GripeFont.headline()
        title.textColor = GripeColor.textPrimary
        title.translatesAutoresizingMaskIntoConstraints = false

        let subtitle = UILabel()
        subtitle.text = "Capture, annotate, and file an issue from anywhere in the app."
        subtitle.font = GripeFont.body()
        subtitle.textColor = GripeColor.textSecondary
        subtitle.numberOfLines = 0
        subtitle.translatesAutoresizingMaskIntoConstraints = false

        let triggerCard = makeTriggerCard()

        let stepsHeader = UILabel()
        stepsHeader.text = "Filing a report"
        stepsHeader.font = GripeFont.captionMedium()
        stepsHeader.textColor = GripeColor.textSecondary
        stepsHeader.translatesAutoresizingMaskIntoConstraints = false

        let steps = UIStackView(arrangedSubviews: [
            makeStep(number: 1, title: "Frame the issue",
                     body: "Drag on the screen to draw a box around what's broken. Pinch or drag the corner handles to refine."),
            makeStep(number: 2, title: "Tap Next",
                     body: "Once you've drawn a region, the Next button appears in the bottom right."),
            makeStep(number: 3, title: "Add details",
                     body: "Write a short title and description. Pick a tag (Bug, Idea, Feedback) and confirm the repository."),
            makeStep(number: 4, title: "Submit",
                     body: "We attach device, OS, app version, and your annotated screenshot, then open a GitHub issue automatically."),
        ])
        steps.axis = .vertical
        steps.spacing = 14
        steps.alignment = .fill
        steps.translatesAutoresizingMaskIntoConstraints = false

        let doneButton = GripePrimaryButton(title: "Got it")
        doneButton.addTarget(self, action: #selector(handleDone), for: .touchUpInside)

        content.addSubview(logo)
        content.addSubview(title)
        content.addSubview(subtitle)
        content.addSubview(triggerCard)
        content.addSubview(stepsHeader)
        content.addSubview(steps)
        content.addSubview(doneButton)

        NSLayoutConstraint.activate([
            logo.topAnchor.constraint(equalTo: content.topAnchor, constant: 24),
            logo.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 20),

            title.topAnchor.constraint(equalTo: logo.bottomAnchor, constant: 14),
            title.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 20),
            title.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -20),

            subtitle.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 6),
            subtitle.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 20),
            subtitle.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -20),

            triggerCard.topAnchor.constraint(equalTo: subtitle.bottomAnchor, constant: 20),
            triggerCard.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 20),
            triggerCard.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -20),

            stepsHeader.topAnchor.constraint(equalTo: triggerCard.bottomAnchor, constant: 24),
            stepsHeader.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 20),
            stepsHeader.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -20),

            steps.topAnchor.constraint(equalTo: stepsHeader.bottomAnchor, constant: 12),
            steps.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 20),
            steps.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -20),

            doneButton.topAnchor.constraint(equalTo: steps.bottomAnchor, constant: 28),
            doneButton.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 20),
            doneButton.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -20),
            doneButton.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -24),
        ])
    }

    private func makeTriggerCard() -> UIView {
        let card = UIView()
        card.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = GripeColor.surface
        card.layer.cornerRadius = GripeRadius.card
        card.layer.borderColor = GripeColor.border.cgColor
        card.layer.borderWidth = 1

        let icon = UIImageView(image: UIImage(systemName: "hand.tap.fill")?
            .withConfiguration(UIImage.SymbolConfiguration(pointSize: 22, weight: .semibold)))
        icon.tintColor = GripeColor.primary
        icon.contentMode = .scaleAspectFit
        icon.translatesAutoresizingMaskIntoConstraints = false

        let heading = UILabel()
        heading.text = "Open Gripe anywhere"
        heading.font = GripeFont.bodySemibold()
        heading.textColor = GripeColor.textPrimary
        heading.translatesAutoresizingMaskIntoConstraints = false

        let body = UILabel()
        body.text = "Tap the screen three times with two fingers to launch Gripe over any view in the app."
        body.font = GripeFont.body()
        body.textColor = GripeColor.textSecondary
        body.numberOfLines = 0
        body.translatesAutoresizingMaskIntoConstraints = false

        card.addSubview(icon)
        card.addSubview(heading)
        card.addSubview(body)

        NSLayoutConstraint.activate([
            icon.topAnchor.constraint(equalTo: card.topAnchor, constant: 16),
            icon.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            icon.widthAnchor.constraint(equalToConstant: 28),
            icon.heightAnchor.constraint(equalToConstant: 28),

            heading.topAnchor.constraint(equalTo: card.topAnchor, constant: 16),
            heading.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 12),
            heading.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),

            body.topAnchor.constraint(equalTo: heading.bottomAnchor, constant: 4),
            body.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 12),
            body.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),
            body.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -16),
        ])
        return card
    }

    private func makeStep(number: Int, title: String, body: String) -> UIView {
        let row = UIView()
        row.translatesAutoresizingMaskIntoConstraints = false

        let badge = UIView()
        badge.translatesAutoresizingMaskIntoConstraints = false
        badge.backgroundColor = GripeColor.primary.withAlphaComponent(0.1)
        badge.layer.cornerRadius = 14

        let badgeLabel = UILabel()
        badgeLabel.text = "\(number)"
        badgeLabel.font = GripeFont.captionMedium()
        badgeLabel.textColor = GripeColor.primary
        badgeLabel.textAlignment = .center
        badgeLabel.translatesAutoresizingMaskIntoConstraints = false
        badge.addSubview(badgeLabel)

        let titleLabel = UILabel()
        titleLabel.text = title
        titleLabel.font = GripeFont.bodySemibold()
        titleLabel.textColor = GripeColor.textPrimary
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        let bodyLabel = UILabel()
        bodyLabel.text = body
        bodyLabel.font = GripeFont.body()
        bodyLabel.textColor = GripeColor.textSecondary
        bodyLabel.numberOfLines = 0
        bodyLabel.translatesAutoresizingMaskIntoConstraints = false

        row.addSubview(badge)
        row.addSubview(titleLabel)
        row.addSubview(bodyLabel)

        NSLayoutConstraint.activate([
            badge.topAnchor.constraint(equalTo: row.topAnchor, constant: 2),
            badge.leadingAnchor.constraint(equalTo: row.leadingAnchor),
            badge.widthAnchor.constraint(equalToConstant: 28),
            badge.heightAnchor.constraint(equalToConstant: 28),

            badgeLabel.centerXAnchor.constraint(equalTo: badge.centerXAnchor),
            badgeLabel.centerYAnchor.constraint(equalTo: badge.centerYAnchor),

            titleLabel.topAnchor.constraint(equalTo: row.topAnchor, constant: 4),
            titleLabel.leadingAnchor.constraint(equalTo: badge.trailingAnchor, constant: 12),
            titleLabel.trailingAnchor.constraint(equalTo: row.trailingAnchor),

            bodyLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 2),
            bodyLabel.leadingAnchor.constraint(equalTo: badge.trailingAnchor, constant: 12),
            bodyLabel.trailingAnchor.constraint(equalTo: row.trailingAnchor),
            bodyLabel.bottomAnchor.constraint(equalTo: row.bottomAnchor),
        ])
        return row
    }

    @objc private func handleDone() {
        dismiss(animated: true)
    }
}
#endif
