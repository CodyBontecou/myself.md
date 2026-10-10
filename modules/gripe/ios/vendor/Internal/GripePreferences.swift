#if DEBUG && canImport(UIKit)
import UIKit

/// Preferences are local to this Debug installation; never include credentials.
enum GripePreferences {
    static let defaults: [String: Bool] = [
        "companionEnabled": false, "cropEnabled": true, "drawingEnabled": true,
        "titleEnabled": true, "descriptionEnabled": true, "tagsEnabled": true
    ]
    static var values: [String: Bool] {
        defaults.merging(UserDefaults.standard.dictionary(forKey: "gripe.preferences") as? [String: Bool] ?? [:]) { _, saved in saved }
    }
    static func update(_ changes: [String: Bool]) throws {
        guard changes.keys.allSatisfy({ defaults[$0] != nil }) else {
            throw NSError(domain: "Gripe", code: 4, userInfo: [NSLocalizedDescriptionKey: "Unknown Gripe setting."])
        }
        UserDefaults.standard.set(values.merging(changes) { _, new in new }, forKey: "gripe.preferences")
        GripeCompanion.shared.refresh()
    }
    static func present(from presenter: UIViewController) {
        let settings = UINavigationController(rootViewController: GripeSettingsVC())
        settings.modalPresentationStyle = .pageSheet
        presenter.present(settings, animated: true)
    }
}

private final class GripeSettingsVC: UITableViewController {
    private let rows = [
        ("companionEnabled", "Floating companion"), ("cropEnabled", "Crop screenshot"),
        ("drawingEnabled", "Drawing tools"), ("titleEnabled", "Title field"),
        ("descriptionEnabled", "Description / prompt"), ("tagsEnabled", "Tags")
    ]
    init() { super.init(style: .insetGrouped) }
    required init?(coder: NSCoder) { fatalError("init(coder:) not supported") }
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Gripe settings"
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(done))
    }
    override func numberOfSections(in tableView: UITableView) -> Int { 2 }
    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int { section == 0 ? 1 : rows.count }
    override func tableView(_ tableView: UITableView, titleForFooterInSection section: Int) -> String? {
        section == 0 ? "Quick capture keeps the full screenshot and a prompt. Changes apply to your next capture." : "Tap the companion to capture. Drag it to move it; touch and hold for settings. Preferences stay on this phone."
    }
    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
        if indexPath.section == 0 {
            cell.textLabel?.text = "Use quick capture"
            cell.accessibilityIdentifier = "gripe-quick-capture"
            cell.accessoryType = .disclosureIndicator
        } else {
            let (key, label) = rows[indexPath.row]
            cell.textLabel?.text = label
            let toggle = UISwitch()
            toggle.isOn = GripePreferences.values[key] == true
            toggle.tag = indexPath.row
            toggle.accessibilityLabel = label
            toggle.accessibilityIdentifier = "gripe-\(key)"
            toggle.addTarget(self, action: #selector(changed(_:)), for: .valueChanged)
            cell.accessoryView = toggle
            cell.selectionStyle = .none
        }
        return cell
    }
    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        guard indexPath.section == 0 else { return }
        try? GripePreferences.update(["cropEnabled": false, "drawingEnabled": false, "titleEnabled": false, "descriptionEnabled": true, "tagsEnabled": false])
        tableView.reloadData()
    }
    @objc private func changed(_ sender: UISwitch) { try? GripePreferences.update([rows[sender.tag].0: sender.isOn]) }
    @objc private func done() { dismiss(animated: true) }
}

final class GripeCompanion {
    static let shared = GripeCompanion()
    private let button = UIButton(type: .system)
    private var observer: NSObjectProtocol?
    private var installed = false
    var suspended = false { didSet { refresh() } }
    func install() {
        guard !installed else { return }
        installed = true
        var config = UIButton.Configuration.filled()
        config.image = UIImage(systemName: "ant.fill")
        config.cornerStyle = .capsule
        config.baseBackgroundColor = .systemIndigo
        config.baseForegroundColor = .white
        button.configuration = config
        button.frame = CGRect(x: 0, y: 0, width: 52, height: 52)
        button.accessibilityLabel = "Gripe companion"
        button.accessibilityHint = "Capture a report. Touch and hold for Gripe settings."
        button.accessibilityIdentifier = "gripe-companion"
        button.addTarget(self, action: #selector(capture), for: .touchUpInside)
        button.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(drag(_:))))
        button.addGestureRecognizer(UILongPressGestureRecognizer(target: self, action: #selector(settings(_:))))
        observer = NotificationCenter.default.addObserver(forName: UIWindow.didBecomeVisibleNotification, object: nil, queue: .main) { [weak self] _ in self?.refresh() }
        refresh()
    }
    func refresh() {
        guard installed else { return }
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
        guard let window = scene?.windows.first(where: { $0.isKeyWindow }) else { return }
        if button.superview !== window {
            button.removeFromSuperview()
            window.addSubview(button)
            button.center = CGPoint(x: window.bounds.width - 38, y: window.safeAreaInsets.top + 90)
        }
        button.isHidden = suspended || GripePreferences.values["companionEnabled"] != true || Gripe.shared.configuration == nil
        window.bringSubviewToFront(button)
    }
    @objc private func capture() { Gripe.trigger() }
    @objc private func drag(_ gesture: UIPanGestureRecognizer) {
        guard let window = button.superview else { return }
        let delta = gesture.translation(in: window)
        button.center = CGPoint(x: min(max(button.center.x + delta.x, 30), window.bounds.width - 30), y: min(max(button.center.y + delta.y, window.safeAreaInsets.top + 30), window.bounds.height - window.safeAreaInsets.bottom - 30))
        gesture.setTranslation(.zero, in: window)
    }
    @objc private func settings(_ gesture: UILongPressGestureRecognizer) {
        guard gesture.state == .began, !Gripe.shared.inFlight, let window = button.superview as? UIWindow else { return }
        var presenter = window.rootViewController
        while let next = presenter?.presentedViewController { presenter = next }
        if let presenter { GripePreferences.present(from: presenter) }
    }
}
#endif
