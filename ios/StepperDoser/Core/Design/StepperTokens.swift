import SwiftUI

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        let red = Double((hex >> 16) & 0xFF) / 255
        let green = Double((hex >> 8) & 0xFF) / 255
        let blue = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: opacity)
    }
}

enum StepperColor {
    static let background = Color(hex: 0x0b0e11)
    static let foreground = Color(hex: 0xe2e8f0)
    static let card = Color(hex: 0x131820)
    static let popover = Color(hex: 0x161b22)
    static let primary = Color(hex: 0x22d3ee)
    static let primaryForeground = Color(hex: 0x0b0e11)
    static let secondary = Color(hex: 0x1e293b)
    static let secondaryForeground = Color(hex: 0xe2e8f0)
    static let muted = Color(hex: 0x1e293b)
    static let mutedForeground = Color(hex: 0x64748b)
    static let accent = Color(hex: 0x06b6d4)
    static let destructive = Color(hex: 0xef4444)
    static let warning = Color(hex: 0xf59e0b)
    static let border = Color.white.opacity(0.08)
    static let input = Color.white.opacity(0.12)
    static let ring = Color(hex: 0x22d3ee)
    static let sidebar = Color(hex: 0x0f1318)

    static let chart1 = Color(hex: 0x22d3ee)
    static let chart2 = Color(hex: 0x10b981)
    static let chart3 = Color(hex: 0xf59e0b)
    static let chart4 = Color(hex: 0x8b5cf6)
    static let chart5 = Color(hex: 0x64748b)

    static let dataLow = Color(hex: 0xa7f3d0, opacity: 0.50)
    static let dataMid = Color(hex: 0x6ee7b7, opacity: 0.65)
    static let dataHigh = Color(hex: 0x34d399, opacity: 0.80)
    static let dataPeak = Color(hex: 0x10b981, opacity: 0.95)
}

enum StepperRadius {
    static let sm: CGFloat = 2
    static let md: CGFloat = 4
    static let lg: CGFloat = 8
    static let xl: CGFloat = 12
    static let card: CGFloat = 16
    static let pill: CGFloat = 999
}

enum StepperSpacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 6
    static let md: CGFloat = 8
    static let lg: CGFloat = 12
    static let xl: CGFloat = 16
    static let xxl: CGFloat = 24
    static let pagePadding: CGFloat = 12
}

enum StepperLayout {
    static let pageVerticalPadding: CGFloat = StepperSpacing.lg
    static let cardSpacing: CGFloat = StepperSpacing.lg
    static let cardPadding: CGFloat = StepperSpacing.xl
    static let panelSpacing: CGFloat = StepperSpacing.lg
    static let panelPadding: CGFloat = StepperSpacing.lg
    static let inputHorizontalPadding: CGFloat = StepperSpacing.lg
    static let inputVerticalPadding: CGFloat = 10
}

enum StepperFont {
    /// Card / panel title — e.g. "Dashboard", section heading
    static let title        = Font.system(size: 18, weight: .semibold)
    /// List item headline — e.g. "Pump 1", form group label
    static let section      = Font.system(size: 16, weight: .semibold)
    /// Primary metric value inside StepperMetricTile — large, bold, tabular
    static let metricValue  = Font.system(size: 19, weight: .semibold).monospacedDigit()
    /// Body / form field text
    static let body         = Font.system(size: 15)
    /// Secondary text — table cells, descriptions
    static let small        = Font.system(size: 13)
    /// Uppercase micro labels — section headers, tile labels
    static let micro        = Font.system(size: 10, weight: .medium)
    /// Nano — heatmap axes, legend
    static let nano         = Font.system(size: 9)
    /// Help text / captions beneath form fields
    static let caption      = Font.system(size: 12)
    /// Monospaced numeric — IP addresses, firmware hashes
    static let mono         = Font.system(size: 13, weight: .medium, design: .monospaced)
    static let monoSmall    = Font.system(size: 11, weight: .medium, design: .monospaced)
}

enum StepperBadgeTone {
    case primary
    case secondary
    case outline
    case warning
    case destructive
}

enum StepperMetricTone {
    case neutral
    case primary
    case warning
    case destructive
}

struct StepperPage<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        ZStack {
            StepperBackground()
            ScrollView {
                VStack(spacing: StepperSpacing.xl) {
                    content
                }
                .frame(maxWidth: 900)
                .padding(.horizontal, StepperSpacing.pagePadding)
                .padding(.vertical, StepperLayout.pageVerticalPadding)
                .frame(maxWidth: .infinity)
            }
            .scrollIndicators(.hidden)
        }
    }
}

struct StepperBackground: View {
    var body: some View {
        ZStack {
            StepperColor.background.ignoresSafeArea()

            RadialGradient(
                colors: [StepperColor.accent.opacity(0.06), .clear],
                center: .topLeading,
                startRadius: 0,
                endRadius: 340
            )
            .ignoresSafeArea()

            RadialGradient(
                colors: [StepperColor.primary.opacity(0.04), .clear],
                center: .topTrailing,
                startRadius: 0,
                endRadius: 260
            )
            .ignoresSafeArea()
        }
    }
}

struct StepperCard<Content: View>: View {
    private let content: Content
    private let spacing: CGFloat
    private let padding: CGFloat

    init(
        spacing: CGFloat = StepperLayout.cardSpacing,
        padding: CGFloat = StepperLayout.cardPadding,
        @ViewBuilder content: () -> Content
    ) {
        self.spacing = spacing
        self.padding = padding
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) {
            content
        }
        .padding(padding)
        .background(
            RoundedRectangle(cornerRadius: StepperRadius.card, style: .continuous)
                .fill(StepperColor.card.opacity(0.82))
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: StepperRadius.card, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: StepperRadius.card, style: .continuous)
                        .stroke(StepperColor.border.opacity(0.5), lineWidth: 1)
                )
        )
        .shadow(color: Color.black.opacity(0.50), radius: 16, x: 0, y: 10)
    }
}

struct StepperPanel<Content: View>: View {
    private let content: Content
    private let spacing: CGFloat
    private let padding: CGFloat

    init(
        spacing: CGFloat = StepperLayout.panelSpacing,
        padding: CGFloat = StepperLayout.panelPadding,
        @ViewBuilder content: () -> Content
    ) {
        self.spacing = spacing
        self.padding = padding
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) {
            content
        }
        .padding(padding)
        .background(
            RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                .fill(StepperColor.secondary.opacity(0.10))
                .overlay(
                    RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                        .stroke(StepperColor.border.opacity(0.4), lineWidth: 1)
                )
        )
    }
}

struct StepperBadge: View {
    let text: String
    let tone: StepperBadgeTone

    var body: some View {
        Text(text)
            .font(StepperFont.micro)
            .kerning(0.5)
            .foregroundStyle(foregroundColor)
            .padding(.horizontal, StepperSpacing.md)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: StepperRadius.lg, style: .continuous)
                    .fill(backgroundColor)
                    .overlay(
                        RoundedRectangle(cornerRadius: StepperRadius.lg, style: .continuous)
                            .stroke(borderColor, lineWidth: 1)
                    )
            )
    }

    private var foregroundColor: Color {
        switch tone {
        case .primary:
            StepperColor.primaryForeground
        case .secondary:
            StepperColor.foreground
        case .outline:
            StepperColor.mutedForeground
        case .warning:
            StepperColor.warning
        case .destructive:
            StepperColor.destructive
        }
    }

    private var backgroundColor: Color {
        switch tone {
        case .primary:
            StepperColor.primary
        case .secondary:
            StepperColor.secondary
        case .outline:
            .clear
        case .warning:
            StepperColor.warning.opacity(0.12)
        case .destructive:
            StepperColor.destructive.opacity(0.12)
        }
    }

    private var borderColor: Color {
        switch tone {
        case .primary:
            StepperColor.primary.opacity(0.2)
        case .secondary:
            StepperColor.border.opacity(0.6)
        case .outline:
            StepperColor.border
        case .warning:
            StepperColor.warning.opacity(0.35)
        case .destructive:
            StepperColor.destructive.opacity(0.35)
        }
    }
}

struct StepperSectionLabel: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(StepperFont.micro)
            .foregroundStyle(StepperColor.mutedForeground)
            .kerning(1.0)
    }
}

struct StepperKeyValueRow<Value: View>: View {
    let label: String
    let value: Value

    init(_ label: String, @ViewBuilder value: () -> Value) {
        self.label = label
        self.value = value()
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: StepperSpacing.md) {
            Text(label)
                .font(StepperFont.small)
                .foregroundStyle(StepperColor.mutedForeground)
            Spacer(minLength: StepperSpacing.md)
            value
                .font(StepperFont.small)
                .foregroundStyle(StepperColor.foreground)
        }
    }
}

struct StepperEmptyState: View {
    let title: String
    let message: String
    let systemImage: String

    var body: some View {
        VStack(spacing: StepperSpacing.md) {
            Image(systemName: systemImage)
                .font(.system(size: 26, weight: .medium))
                .foregroundStyle(StepperColor.primary)
            Text(title)
                .font(StepperFont.section)
                .foregroundStyle(StepperColor.foreground)
            Text(message)
                .font(StepperFont.small)
                .multilineTextAlignment(.center)
                .foregroundStyle(StepperColor.mutedForeground)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, StepperSpacing.xxl)
    }
}

struct StepperMetricTile: View {
    let label: String
    let value: String
    var caption: String? = nil
    var tone: StepperMetricTone = .neutral

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label.uppercased())
                .font(StepperFont.micro)
                .kerning(0.8)
                .foregroundStyle(StepperColor.mutedForeground)

            Text(value)
                .font(StepperFont.metricValue)
                .foregroundStyle(valueColor)
                .lineLimit(1)
                .minimumScaleFactor(0.75)

            if let caption {
                Text(caption)
                    .font(StepperFont.caption)
                    .foregroundStyle(StepperColor.mutedForeground)
                    .lineLimit(2)
            }
        }
        // maxHeight: .infinity so sibling tiles in the same LazyVGrid row
        // always stretch to the same height regardless of content length.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(StepperSpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                .fill(StepperColor.popover.opacity(0.70))
                .overlay(
                    RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                        .stroke(borderColor, lineWidth: 1)
                )
        )
    }

    private var valueColor: Color {
        switch tone {
        case .neutral:
            StepperColor.foreground
        case .primary:
            StepperColor.primary
        case .warning:
            StepperColor.warning
        case .destructive:
            StepperColor.destructive
        }
    }

    private var borderColor: Color {
        switch tone {
        case .neutral:
            StepperColor.border.opacity(0.8)
        case .primary:
            StepperColor.primary.opacity(0.22)
        case .warning:
            StepperColor.warning.opacity(0.30)
        case .destructive:
            StepperColor.destructive.opacity(0.30)
        }
    }
}

struct StepperInputShell: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(StepperFont.body)
            .foregroundStyle(StepperColor.foreground)
            .padding(.horizontal, StepperLayout.inputHorizontalPadding)
            .padding(.vertical, StepperLayout.inputVerticalPadding)
            .background(
                RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                    .fill(StepperColor.popover.opacity(0.92))
                    .overlay(
                        RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                            .stroke(StepperColor.input, lineWidth: 1)
                    )
            )
    }
}

extension View {
    func stepperInputField() -> some View {
        modifier(StepperInputShell())
    }
}

struct StepperPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(StepperFont.body.weight(.medium))
            .foregroundStyle(StepperColor.primaryForeground)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, StepperSpacing.lg)
            .padding(.vertical, StepperSpacing.lg)
            .background(
                RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                    .fill(StepperColor.primary.opacity(configuration.isPressed ? 0.85 : 1))
            )
            .scaleEffect(configuration.isPressed ? 0.99 : 1)
            .shadow(color: StepperColor.primary.opacity(0.12), radius: 12)
    }
}

struct StepperSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(StepperFont.body.weight(.medium))
            .foregroundStyle(StepperColor.foreground)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, StepperSpacing.lg)
            .padding(.vertical, StepperSpacing.lg)
            .background(
                RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                    .fill(StepperColor.secondary.opacity(configuration.isPressed ? 0.28 : 0.18))
                    .overlay(
                        RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                            .stroke(StepperColor.border.opacity(0.8), lineWidth: 1)
                    )
            )
    }
}

struct StepperDestructiveButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(StepperFont.body.weight(.medium))
            .foregroundStyle(StepperColor.destructive)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, StepperSpacing.lg)
            .padding(.vertical, StepperSpacing.lg)
            .background(
                RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                    .fill(StepperColor.destructive.opacity(configuration.isPressed ? 0.16 : 0.10))
                    .overlay(
                        RoundedRectangle(cornerRadius: StepperRadius.xl, style: .continuous)
                            .stroke(StepperColor.destructive.opacity(0.30), lineWidth: 1)
                    )
            )
    }
}

struct StepperWearBar: View {
    let progress: Double
    let warningAt: Double
    let state: State

    enum State {
        case nominal
        case warning
        case critical
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Capsule(style: .continuous)
                    .fill(StepperColor.secondary)

                Capsule(style: .continuous)
                    .fill(LinearGradient(colors: barColors, startPoint: .leading, endPoint: .trailing))
                    .frame(width: geometry.size.width * CGFloat(min(progress, 1)))

                Rectangle()
                    .fill(StepperColor.warning.opacity(0.7))
                    .frame(width: 2)
                    .offset(x: geometry.size.width * CGFloat(warningAt) - 1)

                Rectangle()
                    .fill(StepperColor.destructive.opacity(0.7))
                    .frame(width: 2)
                    .offset(x: geometry.size.width - 2)
            }
        }
        .frame(height: 8)
        .clipShape(Capsule(style: .continuous))
    }

    private var barColors: [Color] {
        switch state {
        case .nominal:
            [StepperColor.primary, StepperColor.primary.opacity(0.85), StepperColor.accent]
        case .warning:
            [StepperColor.warning, StepperColor.warning.opacity(0.8)]
        case .critical:
            [StepperColor.destructive, StepperColor.destructive.opacity(0.7)]
        }
    }
}

struct StepperHeatmapCell: View {
    let ratio: Double
    let isSelected: Bool

    var body: some View {
        RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(fillColor)
            .frame(width: 14, height: 14)
            .overlay {
                if isSelected {
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .stroke(StepperColor.primary.opacity(0.8), lineWidth: 1.5)
                }
            }
            .scaleEffect(isSelected ? 1.1 : 1)
            .animation(.easeInOut(duration: 0.15), value: isSelected)
    }

    private var fillColor: Color {
        switch ratio {
        case 0:
            StepperColor.secondary.opacity(0.4)
        case ..<0.30:
            StepperColor.dataLow
        case ..<0.55:
            StepperColor.dataMid
        case ..<0.85:
            StepperColor.dataHigh
        default:
            StepperColor.dataPeak
        }
    }
}

struct StepperHeatmapPoint: Identifiable {
    let id: Int
    let ratio: Double
    let label: String
}

struct StepperWeeklyHeatmap: View {
    let points: [StepperHeatmapPoint]
    let selectedID: Int?
    var onSelect: ((Int) -> Void)? = nil

    private let rows = Array(repeating: GridItem(.fixed(14), spacing: StepperSpacing.xs), count: 7)

    var body: some View {
        VStack(alignment: .leading, spacing: StepperSpacing.md) {
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHGrid(rows: rows, spacing: StepperSpacing.xs) {
                    ForEach(points) { point in
                        Button {
                            onSelect?(point.id)
                        } label: {
                            StepperHeatmapCell(ratio: point.ratio, isSelected: point.id == selectedID)
                        }
                        .buttonStyle(.plain)
                        .help(point.label)
                    }
                }
                .padding(.vertical, 2)
                .padding(.horizontal, 1)   // prevent edge cells touching scroll clip boundary
            }
            .scrollClipDisabled()          // allow cells to render flush without being clipped

            HStack(spacing: StepperSpacing.xs) {
                Text("Less")
                    .font(StepperFont.nano)
                    .foregroundStyle(StepperColor.mutedForeground)
                ForEach(0..<5, id: \.self) { index in
                    StepperHeatmapCell(ratio: Double(index) / 4.0, isSelected: false)
                }
                Text("More")
                    .font(StepperFont.nano)
                    .foregroundStyle(StepperColor.mutedForeground)
            }
        }
    }
}

/// Full-width equal-size selection chip — used for pump pickers, mode selectors,
/// weekday/hour grids. Place multiple chips in an `HStack(spacing: StepperSpacing.xs)`
/// so they share the available width equally.
struct StepperSelectionChip: View {
    let title: String
    let isSelected: Bool
    var monospace: Bool = false

    var body: some View {
        Text(title)
            .font(monospace ? StepperFont.monoSmall : StepperFont.small)
            .foregroundStyle(isSelected ? StepperColor.primaryForeground : StepperColor.foreground)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: StepperRadius.lg, style: .continuous)
                    .fill(isSelected ? StepperColor.primary : StepperColor.secondary.opacity(0.24))
                    .overlay(
                        RoundedRectangle(cornerRadius: StepperRadius.lg, style: .continuous)
                            .stroke(
                                isSelected ? StepperColor.primary.opacity(0.2) : StepperColor.border,
                                lineWidth: 1
                            )
                    )
            )
    }
}

struct StepperMiniBarPoint: Identifiable {
    let id: Int
    let value: Double
    let label: String
}

/// UIKit-backed text field that avoids SwiftUI re-render overhead on every
/// keystroke. All static configuration happens once in `makeUIView`; `updateUIView`
/// only synchronises the two properties that can actually change: the text value
/// and the secure-entry flag. Use this instead of SwiftUI `TextField` / `SecureField`
/// anywhere keyboard responsiveness matters.
struct StepperTextField: UIViewRepresentable {
    let placeholder: String
    @Binding var text: String
    var isSecure: Bool = false
    var keyboardType: UIKeyboardType = .asciiCapable
    var returnKeyType: UIReturnKeyType = .done
    var onSubmit: (() -> Void)? = nil
    /// Extra action buttons shown in the keyboard accessory bar (left side).
    /// Each item is a (label, action) pair. Action is called after the keyboard
    /// is dismissed, so the caller doesn't need to resign first responder.
    var inputAccessoryItems: [(label: String, action: () -> Void)] = []

    private var needsAccessoryBar: Bool {
        let isPad = keyboardType == .numberPad || keyboardType == .decimalPad
                 || keyboardType == .phonePad || keyboardType == .asciiCapableNumberPad
        return isPad || !inputAccessoryItems.isEmpty
    }

    func makeUIView(context: Context) -> UITextField {
        let tf = UITextField()
        tf.delegate = context.coordinator
        tf.borderStyle = .none
        tf.backgroundColor = .clear
        tf.textColor = UIColor(StepperColor.foreground)
        tf.tintColor = UIColor(StepperColor.primary)
        tf.font = .systemFont(ofSize: 15)
        tf.attributedPlaceholder = NSAttributedString(
            string: placeholder,
            attributes: [.foregroundColor: UIColor(StepperColor.mutedForeground)]
        )
        // .none disables QuickType suggestions entirely — avoids autofill popups
        // for device credentials and network passwords.
        tf.textContentType = .none
        tf.autocorrectionType = .no
        tf.spellCheckingType = .no
        tf.autocapitalizationType = .none
        tf.smartQuotesType = .no
        tf.smartDashesType = .no
        tf.smartInsertDeleteType = .no
        tf.keyboardType = keyboardType
        tf.returnKeyType = returnKeyType
        tf.enablesReturnKeyAutomatically = false
        tf.isSecureTextEntry = isSecure
        tf.clearButtonMode = .never
        tf.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        // Target-action fires only on actual text edits, not cursor movement.
        tf.addTarget(context.coordinator,
                     action: #selector(Coordinator.textChanged(_:)),
                     for: .editingChanged)
        if needsAccessoryBar {
            tf.inputAccessoryView = buildAccessoryBar(coordinator: context.coordinator)
        }
        return tf
    }

    /// Only the two properties that can change after creation are updated here.
    /// Never set static properties (colors, fonts, content type) in updateUIView —
    /// doing so forces UIKit to reload the QuickType bar on every keystroke.
    func updateUIView(_ tf: UITextField, context: Context) {
        if tf.text != text {
            tf.text = text
        }
        if tf.isSecureTextEntry != isSecure {
            tf.isSecureTextEntry = isSecure
        }
        // Keep coordinator's action list in sync without rebuilding the toolbar.
        context.coordinator.accessoryItems = inputAccessoryItems
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text, onSubmit: onSubmit, accessoryItems: inputAccessoryItems)
    }

    // MARK: — Accessory bar construction

    private func buildAccessoryBar(coordinator: Coordinator) -> UIToolbar {
        let bar = UIToolbar(frame: CGRect(x: 0, y: 0, width: 100, height: 44))
        bar.barStyle = .black
        bar.isTranslucent = true

        var items: [UIBarButtonItem] = []

        // Corner radius matching StepperSelectionChip (StepperRadius.lg = 8).
        // Use .plain() + explicit UIBackgroundConfiguration so the system doesn't
        // inject its own visual-effect background that renders as an unwanted oval.
        let chipRadius: CGFloat = 8

        // Quick-action preset buttons (left side)
        for (index, item) in inputAccessoryItems.enumerated() {
            var bg = UIBackgroundConfiguration.clear()
            bg.cornerRadius = chipRadius
            bg.backgroundColor = UIColor(StepperColor.secondary).withAlphaComponent(0.24)
            bg.strokeColor = UIColor(StepperColor.border).withAlphaComponent(0.55)
            bg.strokeWidth = 0.5

            var config = UIButton.Configuration.plain()
            config.title = item.label
            config.baseForegroundColor = UIColor(StepperColor.foreground)
            config.background = bg
            config.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 14, bottom: 8, trailing: 14)
            config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attrs in
                var a = attrs
                a.font = UIFont.systemFont(ofSize: 13, weight: .medium)
                return a
            }
            let btn = UIButton(configuration: config, primaryAction: UIAction { [weak coordinator] _ in
                coordinator?.executeAccessoryItem(at: index)
            })
            items.append(UIBarButtonItem(customView: btn))
            if index < inputAccessoryItems.count - 1 {
                items.append(UIBarButtonItem(barButtonSystemItem: .fixedSpace, target: nil, action: nil)
                    .then { $0.width = 6 })
            }
        }

        // Flexible space pushes Done to the right
        items.append(UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil))

        // Done button — same plain + explicit background approach, filled with primary colour
        var doneBg = UIBackgroundConfiguration.clear()
        doneBg.cornerRadius = chipRadius
        doneBg.backgroundColor = UIColor(StepperColor.primary)

        var doneConfig = UIButton.Configuration.plain()
        doneConfig.title = "Done"
        doneConfig.baseForegroundColor = UIColor(StepperColor.primaryForeground)
        doneConfig.background = doneBg
        doneConfig.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 20, bottom: 8, trailing: 20)
        doneConfig.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attrs in
            var a = attrs
            a.font = UIFont.systemFont(ofSize: 14, weight: .semibold)
            return a
        }
        let doneBtn = UIButton(configuration: doneConfig, primaryAction: UIAction { [weak coordinator] _ in
            coordinator?.dismissKeyboard()
        })
        items.append(UIBarButtonItem(customView: doneBtn))

        bar.items = items
        bar.sizeToFit()
        return bar
    }

    // MARK: — Coordinator

    final class Coordinator: NSObject, UITextFieldDelegate {
        private let text: Binding<String>
        private let onSubmit: (() -> Void)?
        /// Mutable — updated by updateUIView so closures always reflect current state.
        var accessoryItems: [(label: String, action: () -> Void)]

        init(text: Binding<String>, onSubmit: (() -> Void)?,
             accessoryItems: [(label: String, action: () -> Void)]) {
            self.text = text
            self.onSubmit = onSubmit
            self.accessoryItems = accessoryItems
        }

        @objc func textChanged(_ tf: UITextField) {
            text.wrappedValue = tf.text ?? ""
        }

        func textFieldShouldReturn(_ tf: UITextField) -> Bool {
            tf.resignFirstResponder()
            onSubmit?()
            return true
        }

        func dismissKeyboard() {
            UIApplication.shared.sendAction(
                #selector(UIResponder.resignFirstResponder),
                to: nil, from: nil, for: nil
            )
            onSubmit?()
        }

        func executeAccessoryItem(at index: Int) {
            dismissKeyboard()
            guard index < accessoryItems.count else { return }
            accessoryItems[index].action()
        }
    }
}

// MARK: — Fluent helper

private extension UIBarButtonItem {
    func then(_ configure: (UIBarButtonItem) -> Void) -> UIBarButtonItem {
        configure(self)
        return self
    }
}

struct StepperMiniBarChart: View {
    let points: [StepperMiniBarPoint]
    let selectedID: Int?
    var onSelect: ((Int) -> Void)? = nil

    private var maxValue: Double {
        points.map(\.value).max() ?? 0
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(points) { point in
                Button {
                    onSelect?(point.id)
                } label: {
                    RoundedRectangle(cornerRadius: StepperRadius.sm, style: .continuous)
                        .fill(fill(for: point))
                        .frame(maxWidth: .infinity)
                        .frame(height: height(for: point))
                }
                .buttonStyle(.plain)
                .help(point.label)
            }
        }
        .frame(height: 48, alignment: .bottom)
    }

    private func height(for point: StepperMiniBarPoint) -> CGFloat {
        guard maxValue > 0 else { return 4 }
        return max(4, 48 * CGFloat(point.value / maxValue))
    }

    private func fill(for point: StepperMiniBarPoint) -> Color {
        if point.id == selectedID {
            return StepperColor.chart1
        }

        if maxValue == 0 {
            return StepperColor.secondary.opacity(0.5)
        }

        let ratio = point.value / maxValue
        switch ratio {
        case ..<0.30:
            return StepperColor.dataLow
        case ..<0.55:
            return StepperColor.dataMid
        case ..<0.85:
            return StepperColor.dataHigh
        default:
            return StepperColor.dataPeak
        }
    }
}
