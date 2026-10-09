#if DEBUG && canImport(UIKit)
import UIKit

enum GripeColor {
    static let background = UIColor(red: 0xF8/255, green: 0xF9/255, blue: 0xFB/255, alpha: 1)
    static let surface = UIColor.white
    static let surfaceAlt = UIColor(red: 0x1F/255, green: 0x1F/255, blue: 0x2F/255, alpha: 1)
    static let border = UIColor(red: 0xE3/255, green: 0xE7/255, blue: 0xEB/255, alpha: 1)
    static let textPrimary = UIColor(red: 0x0F/255, green: 0x14/255, blue: 0x20/255, alpha: 1)
    static let textSecondary = UIColor(red: 0x6B/255, green: 0x74/255, blue: 0x80/255, alpha: 1)
    static let primary = UIColor(red: 0x0A/255, green: 0x84/255, blue: 0xFF/255, alpha: 1)
    static let primaryDark = UIColor(red: 0x00/255, green: 0x55/255, blue: 0xCC/255, alpha: 1)
    static let success = UIColor(red: 0x30/255, green: 0xD1/255, blue: 0x58/255, alpha: 1)
    static let overlay = UIColor.black.withAlphaComponent(0.5)
    static let chipFill = UIColor(red: 0xF1/255, green: 0xF4/255, blue: 0xF8/255, alpha: 1)
}

enum GripeFont {
    static func display() -> UIFont { .systemFont(ofSize: 34, weight: .bold) }
    static func headline() -> UIFont { .systemFont(ofSize: 22, weight: .semibold) }
    static func body() -> UIFont { .systemFont(ofSize: 17, weight: .regular) }
    static func bodyMedium() -> UIFont { .systemFont(ofSize: 17, weight: .medium) }
    static func bodySemibold() -> UIFont { .systemFont(ofSize: 17, weight: .semibold) }
    static func caption() -> UIFont { .systemFont(ofSize: 13, weight: .regular) }
    static func captionMedium() -> UIFont { .systemFont(ofSize: 13, weight: .medium) }
    static func chip() -> UIFont { .systemFont(ofSize: 14, weight: .medium) }
}

enum GripeRadius {
    static let chip: CGFloat = 999
    static let button: CGFloat = 12
    static let card: CGFloat = 16
    static let field: CGFloat = 12
    static let toast: CGFloat = 14
}

enum GripeSpacing {
    static let xs: CGFloat = 4
    static let s: CGFloat = 8
    static let m: CGFloat = 12
    static let l: CGFloat = 16
    static let xl: CGFloat = 20
    static let xxl: CGFloat = 24
}
#endif
