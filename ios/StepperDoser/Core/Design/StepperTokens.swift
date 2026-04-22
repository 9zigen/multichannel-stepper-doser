// ios-tokens.swift
// Stepper Doser — iOS Design Tokens
//
// Drop this file into an Xcode project (Swift package or app target).
// Derived from frontend/design/DESIGN_SYSTEM.md §19.
//
// Usage:
//   Text("Hello").foregroundStyle(StepperColor.primary)
//   RoundedRectangle(cornerRadius: StepperRadius.lg).fill(StepperColor.card)

import SwiftUI

// MARK: - Hex color initializer

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8)  & 0xFF) / 255
        let b = Double(hex         & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}

// MARK: - Color Tokens

/// All tokens match the web design system dark-mode palette.
/// Light-mode variants follow the same names with `Light` suffix.
public enum StepperColor {

    // ── Background ──────────────────────────────────────────────────────────
    /// Page background: #0b0e11
    public static let background      = Color(hex: 0x0b0e11)
    /// Card surface: #131820
    public static let card            = Color(hex: 0x131820)
    /// Popover / dropdown surface: #161b22
    public static let popover         = Color(hex: 0x161b22)
    /// Sidebar background: #0f1318
    public static let sidebar         = Color(hex: 0x0f1318)
    /// Secondary surface / flat panels: #1e293b
    public static let secondary       = Color(hex: 0x1e293b)

    // ── Foreground ──────────────────────────────────────────────────────────
    /// Primary text (slate-white): #e2e8f0
    public static let foreground      = Color(hex: 0xe2e8f0)
    /// Muted text (labels, captions): #64748b
    public static let mutedForeground = Color(hex: 0x64748b)

    // ── Accent ──────────────────────────────────────────────────────────────
    /// Cyan primary accent: #22d3ee
    public static let primary         = Color(hex: 0x22d3ee)
    /// Slightly darker cyan accent: #06b6d4
    public static let accent          = Color(hex: 0x06b6d4)
    /// Text on primary buttons: #0b0e11
    public static let primaryForeground = Color(hex: 0x0b0e11)

    // ── Semantic ────────────────────────────────────────────────────────────
    /// Error / danger: #ef4444
    public static let destructive     = Color(hex: 0xef4444)
    /// Amber warning: #f59e0b
    public static let warning         = Color(hex: 0xf59e0b)
    /// Focus ring: #22d3ee (same as primary)
    public static let ring            = Color(hex: 0x22d3ee)

    // ── Data Visualization ──────────────────────────────────────────────────
    /// Heatmap / charts — emerald scale
    public static let dataLow         = Color(hex: 0xa7f3d0, opacity: 0.50) // emerald-200/50
    public static let dataMid         = Color(hex: 0x6ee7b7, opacity: 0.65) // emerald-300/65
    public static let dataHigh        = Color(hex: 0x34d399, opacity: 0.80) // emerald-400/80
    public static let datePeak        = Color(hex: 0x10b981, opacity: 0.95) // emerald-500/95

    /// Chart series colors
    public static let chart1          = Color(hex: 0x22d3ee) // cyan
    public static let chart2          = Color(hex: 0x10b981) // emerald
    public static let chart3          = Color(hex: 0xf59e0b) // amber
    public static let chart4          = Color(hex: 0x8b5cf6) // violet
    public static let chart5          = Color(hex: 0x64748b) // slate

    // ── Border / Input ──────────────────────────────────────────────────────
    /// Subtle border: white 8% opacity
    public static let border          = Color.white.opacity(0.08)
    /// Input border: white 12% opacity
    public static let input           = Color.white.opacity(0.12)

    // ── Light Mode ──────────────────────────────────────────────────────────
    public static let backgroundLight = Color(hex: 0xffffff)
    public static let cardLight       = Color(hex: 0xffffff)
    public static let foregroundLight = Color(hex: 0x36454f)
    public static let primaryLight    = Color(hex: 0x36454f)
    public static let mutedLight      = Color(hex: 0x708090)
    public static let secondaryLight  = Color(hex: 0xd3d3d3)
}

// MARK: - Radius Tokens

public enum StepperRadius {
    public static let sm:  CGFloat = 2   // 0.125rem
    public static let md:  CGFloat = 4   // 0.25rem
    public static let lg:  CGFloat = 8   // 0.5rem
    public static let xl:  CGFloat = 12  // 0.75rem (approx)
    public static let xl2: CGFloat = 14  // card outer corners
    public static let full: CGFloat = 999 // pill / progress bar
}

// MARK: - Spacing Tokens

public enum StepperSpacing {
    public static let xs:  CGFloat = 4   // gap-1
    public static let sm:  CGFloat = 6   // gap-1.5
    public static let md:  CGFloat = 8   // gap-2
    public static let lg:  CGFloat = 12  // gap-3 / p-3
    public static let xl:  CGFloat = 16  // gap-4
    public static let xxl: CGFloat = 24  // section spacing
}

// MARK: - Typography Tokens

public enum StepperFont {
    /// Page / card title  (web: text-lg font-medium)
    public static let title    = Font.system(size: 18, weight: .medium)
    /// Section header  (web: text-base font-medium)
    public static let section  = Font.system(size: 16, weight: .medium)
    /// Body text  (web: text-sm)
    public static let body     = Font.system(size: 14)
    /// Small / table cells  (web: text-xs)
    public static let small    = Font.system(size: 12)
    /// Micro labels uppercase  (web: text-[10px] uppercase tracking-wider)
    public static let micro    = Font.system(size: 10, weight: .medium)
    /// Nano / heatmap  (web: text-[9px])
    public static let nano     = Font.system(size: 9)
    /// Help / caption text  (web: text-[11px])
    public static let caption  = Font.system(size: 11)
    /// Mono numeric  (web: font-mono tabular-nums)
    public static let mono     = Font.system(size: 13, design: .monospaced)
    /// Mono small numeric
    public static let monoSm   = Font.system(size: 11, design: .monospaced)
}

// MARK: - Shadow / Glow Tokens

extension View {
    /// Subtle card shadow matching web shadow-sm
    public func stepperCardShadow() -> some View {
        self.shadow(color: .black.opacity(0.5), radius: 8, x: 0, y: 4)
    }

    /// Cyan glow for active / selected states
    public func stepperCyanGlow(intensity: Double = 0.15) -> some View {
        self.shadow(color: StepperColor.primary.opacity(intensity), radius: 8)
    }

    /// Amber glow for warning badges
    public func stepperAmberGlow(intensity: Double = 0.20) -> some View {
        self.shadow(color: StepperColor.warning.opacity(intensity), radius: 6)
    }
}

// MARK: - Glassmorphic Card Background

/// Replicates web: bg-card/80 backdrop-blur-sm border-border/50
public struct StepperCard<Content: View>: View {
    let content: () -> Content

    public init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    public var body: some View {
        content()
            .background(
                RoundedRectangle(cornerRadius: StepperRadius.xl2)
                    .fill(StepperColor.card.opacity(0.85))
                    .overlay(
                        RoundedRectangle(cornerRadius: StepperRadius.xl2)
                            .strokeBorder(StepperColor.border, lineWidth: 1)
                    )
            )
            .clipShape(RoundedRectangle(cornerRadius: StepperRadius.xl2))
            .stepperCardShadow()
    }
}

// MARK: - Flat Inner Panel

/// Replicates web: rounded-lg border-border/40 bg-secondary/10 p-3
public struct StepperPanel<Content: View>: View {
    let content: () -> Content

    public init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: StepperSpacing.lg) {
            content()
        }
        .padding(StepperSpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: StepperRadius.lg)
                .fill(StepperColor.secondary.opacity(0.10))
                .overlay(
                    RoundedRectangle(cornerRadius: StepperRadius.lg)
                        .strokeBorder(StepperColor.border.opacity(0.4 / 0.08), lineWidth: 1)
                )
        )
    }
}

// MARK: - Page Background Gradient

/// Full-screen background matching the web body gradient
public struct StepperBackground: View {
    public var body: some View {
        ZStack {
            StepperColor.background.ignoresSafeArea()
            // Top-left accent glow
            RadialGradient(
                colors: [StepperColor.accent.opacity(0.06), .clear],
                center: .topLeading,
                startRadius: 0,
                endRadius: 350
            ).ignoresSafeArea()
            // Top-right primary glow
            RadialGradient(
                colors: [StepperColor.primary.opacity(0.04), .clear],
                center: .topTrailing,
                startRadius: 0,
                endRadius: 280
            ).ignoresSafeArea()
        }
    }
}

// MARK: - Wear Progress Bar

/// Replicates the multi-segment wear progress bar
public struct StepperWearBar: View {
    /// 0–1 current hours fraction
    public let progress: Double
    /// 0–1 warning threshold marker position
    public let warningAt: Double
    public let state: State

    public enum State { case nominal, warning, critical }

    private var barColors: [Color] {
        switch state {
        case .nominal:  return [StepperColor.primary, StepperColor.primary.opacity(0.85), StepperColor.accent]
        case .warning:  return [StepperColor.warning, StepperColor.warning.opacity(0.8)]
        case .critical: return [StepperColor.destructive, StepperColor.destructive.opacity(0.7)]
        }
    }

    public var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                // Track
                RoundedRectangle(cornerRadius: StepperRadius.full)
                    .fill(StepperColor.secondary)
                // Fill
                RoundedRectangle(cornerRadius: StepperRadius.full)
                    .fill(LinearGradient(colors: barColors, startPoint: .leading, endPoint: .trailing))
                    .frame(width: geo.size.width * CGFloat(min(progress, 1.0)))
                // Warning marker
                Rectangle()
                    .fill(StepperColor.warning.opacity(0.7))
                    .frame(width: 2)
                    .offset(x: geo.size.width * CGFloat(warningAt) - 1)
                // Replace marker (right edge)
                Rectangle()
                    .fill(StepperColor.destructive.opacity(0.7))
                    .frame(width: 2)
                    .offset(x: geo.size.width - 2)
            }
        }
        .frame(height: 8)
        .clipShape(RoundedRectangle(cornerRadius: StepperRadius.full))
    }
}

// MARK: - Status Badge

public enum StepperStatus { case nominal, warning, critical }

public struct StepperStatusBadge: View {
    let text: String
    let status: StepperStatus

    private var fg: Color {
        switch status {
        case .nominal:  return StepperColor.foreground
        case .warning:  return StepperColor.warning
        case .critical: return StepperColor.destructive
        }
    }
    private var bg: Color {
        switch status {
        case .nominal:  return StepperColor.secondary
        case .warning:  return StepperColor.warning.opacity(0.15)
        case .critical: return StepperColor.destructive.opacity(0.15)
        }
    }
    private var border: Color {
        switch status {
        case .nominal:  return StepperColor.border
        case .warning:  return StepperColor.warning.opacity(0.40)
        case .critical: return StepperColor.destructive.opacity(0.40)
        }
    }

    public var body: some View {
        Text(text)
            .font(StepperFont.micro)
            .foregroundStyle(fg)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(
                RoundedRectangle(cornerRadius: StepperRadius.md)
                    .fill(bg)
                    .overlay(
                        RoundedRectangle(cornerRadius: StepperRadius.md)
                            .strokeBorder(border, lineWidth: 1)
                    )
            )
    }
}

// MARK: - Heatmap Cell

public struct StepperHeatmapCell: View {
    /// 0–1 fill ratio
    let ratio: Double
    let isSelected: Bool

    private var fillColor: Color {
        switch ratio {
        case 0:         return StepperColor.secondary.opacity(0.4)
        case ..<0.30:   return StepperColor.dataLow
        case ..<0.55:   return StepperColor.dataMid
        case ..<0.85:   return StepperColor.dataHigh
        default:        return StepperColor.datePeak
        }
    }

    public var body: some View {
        RoundedRectangle(cornerRadius: 3)
            .fill(fillColor)
            .frame(width: 14, height: 14)
            .overlay(
                isSelected
                ? RoundedRectangle(cornerRadius: 3)
                    .strokeBorder(StepperColor.primary.opacity(0.8), lineWidth: 1.5)
                : nil
            )
            .scaleEffect(isSelected ? 1.1 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: isSelected)
    }
}
