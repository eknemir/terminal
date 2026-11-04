import Foundation
import XCTest
@testable import TerminalApp

/// Themes.swift / Theme.swift: colour parsing, Oklab arithmetic and the tokens a theme is made into. Only the static,
/// pure parts: nothing here touches ThemeStore.shared (which reads the app's bundle and UserDefaults).
final class ThemeTests: XCTestCase {
    typealias RGB = ThemeStore.RGB

    private let ansi = ["#1c2040", "#ff5c8a", "#5cf0b0", "#f7d96b", "#4f6bef", "#b04fe8", "#5ce1f0", "#c9cbe8",
                        "#4a5078", "#ff8aae", "#8cf7cb", "#fbe89a", "#3fb6ec", "#e9a6f7", "#9aeff7", "#f0eefa"]

    private func spec(ansi: [String]? = nil, selection: String = "#7c5cf5", ui: [String: String]? = nil) -> ThemeSpec {
        ThemeSpec(id: "t", name: "T", bg: "#11142a", fg: "#f0eefa", cursor: "#5ce1f0", selection: selection,
                  accent: "#5ce1f0", ansi: ansi ?? self.ansi, ui: ui, glow: nil)
    }

    // MARK: parse / RGB

    func testParseHexAndTriplet() {
        let red = ThemeStore.parse("#ff0000")
        XCTAssertEqual(red?.r, 1)
        XCTAssertEqual(red?.g, 0)
        let t = ThemeStore.parse(" 255, 128, 0 ")
        XCTAssertEqual(t?.r, 1)
        XCTAssertEqual(t?.g ?? 0, 128.0 / 255, accuracy: 1e-12)
        XCTAssertNil(ThemeStore.parse("#fff"))
        XCTAssertNil(ThemeStore.parse("#gggggg"))
        XCTAssertNil(ThemeStore.parse("1, 2"))
        XCTAssertNil(ThemeStore.parse("red"))
    }

    func testHexAndTripletRoundTrip() {
        for s in ["#000000", "#ffffff", "#5ce1f0", "#7c5cf5"] {
            XCTAssertEqual(ThemeStore.parse(s)?.hex, s)
        }
        XCTAssertEqual(RGB(1, 0, 0.5).triplet, "255, 0, 128")
    }

    func testByteClamps() {
        XCTAssertEqual(RGB.byte(-1), 0)
        XCTAssertEqual(RGB.byte(2), 255)
        XCTAssertEqual(RGB.byte(0.5), 128)
    }

    func testLuminanceAndContrast() {
        let black = RGB(0, 0, 0), white = RGB(1, 1, 1)
        XCTAssertEqual(black.luminance, 0, accuracy: 1e-12)
        XCTAssertEqual(white.luminance, 1, accuracy: 1e-9)
        XCTAssertEqual(black.contrast(white), 21, accuracy: 1e-6)
        XCTAssertEqual(white.contrast(black), 21, accuracy: 1e-6)
        XCTAssertEqual(white.contrast(white), 1, accuracy: 1e-9)
    }

    func testLabRoundTripAndMixEndpoints() {
        let c = ThemeStore.parse("#5ce1f0")!
        XCTAssertEqual(RGB(c.lab).hex, c.hex)
        let o = ThemeStore.parse("#11142a")!
        XCTAssertEqual(c.mix(o, 0).hex, c.hex)
        XCTAssertEqual(c.mix(o, 1).hex, o.hex)
        let mid = RGB(0, 0, 0).mix(RGB(1, 1, 1), 0.5)
        XCTAssertEqual(mid.r, mid.g, accuracy: 1e-6) // greys stay grey
        XCTAssertGreaterThan(mid.r, 0.2)
        XCTAssertLessThan(mid.r, 0.8)
    }

    func testLabDistanceChromaAndHueDistance() {
        let grey = RGB(0.5, 0.5, 0.5).lab
        XCTAssertLessThan(grey.chroma, 1e-6)
        XCTAssertEqual(grey.hueDistance(RGB(1, 0, 0).lab), 180)
        let red = RGB(1, 0, 0).lab, green = RGB(0, 1, 0).lab
        XCTAssertEqual(red.hueDistance(red), 0, accuracy: 1e-9)
        let d = red.hueDistance(green)
        XCTAssertEqual(d, green.hueDistance(red), accuracy: 1e-9)
        XCTAssertGreaterThan(d, 0)
        XCTAssertLessThanOrEqual(d, 180)
        XCTAssertEqual(red.distance(red), 0)
        XCTAssertGreaterThan(red.distance(green), 0.1)
    }

    // MARK: derive

    func testDeriveKeepsThePaletteAsIs() {
        let t = ThemeStore.derive(spec())
        XCTAssertEqual(t["--code-bg"], "#11142a")
        XCTAssertEqual(t["--code-fg"], "#f0eefa")
        XCTAssertEqual(t["--code-cursor"], "#5ce1f0")
        XCTAssertEqual(t["--accent"], "#5ce1f0")
        XCTAssertEqual(t["--selection"], "#7c5cf5")
        for i in 0..<16 { XCTAssertEqual(t["--a\(i)"], ansi[i], "a\(i)") }
        XCTAssertEqual(t["--red"], ansi[1])
        XCTAssertEqual(t["--green"], ansi[2])
    }

    func testDeriveRgbVariants() {
        let t = ThemeStore.derive(spec())
        // only-rgb tokens have no hex form
        XCTAssertNil(t["--deep"])
        XCTAssertNotNil(t["--deep-rgb"])
        XCTAssertNotNil(t["--panel-rgb"])
        // tokens with both
        XCTAssertNotNil(t["--bg"])
        XCTAssertNotNil(t["--bg-rgb"])
        XCTAssertEqual(t["--accent-rgb"], "92, 225, 240")
        // the rest: hex only
        XCTAssertNotNil(t["--lavender"])
        XCTAssertNil(t["--lavender-rgb"])
        for (k, v) in t where !k.hasSuffix("-rgb") {
            XCTAssertNotNil(ThemeStore.parse(v), "\(k)=\(v)")
            XCTAssertTrue(v.hasPrefix("#"), k)
        }
    }

    func testDeriveCyanGoesGreenWhenAccentHasItsHue() {
        // accent and ANSI cyan are the same hue: "your turn" must not look like "working"
        let t = ThemeStore.derive(spec())
        XCTAssertEqual(t["--cyan"], ansi[2])
        var other = ansi
        other[6] = "#ff00ff"
        let s = ThemeSpec(id: "o", name: "O", bg: "#11142a", fg: "#f0eefa", cursor: "#5ce1f0", selection: "#7c5cf5",
                          accent: "#5ce1f0", ansi: other, ui: nil, glow: nil)
        XCTAssertEqual(ThemeStore.derive(s)["--cyan"], "#ff00ff")
    }

    func testDeriveSelectionTextFollowsSelectionLuminance() {
        XCTAssertEqual(ThemeStore.derive(spec(selection: "#ffffff"))["--selection-text"], "#11142a")
        XCTAssertEqual(ThemeStore.derive(spec(selection: "#000000"))["--selection-text"], "#f0eefa")
    }

    func testDeriveFallsBackForMissingOrBadColours() {
        let t = ThemeStore.derive(spec(ansi: ["#000000", "bad"]))
        XCTAssertEqual(t["--a0"], "#000000")
        XCTAssertEqual(t["--a1"], "#f0eefa") // unparsable: the text colour
        XCTAssertEqual(t["--a15"], "#f0eefa") // missing: the text colour
        let bad = ThemeSpec(id: "b", name: "B", bg: "x", fg: "y", cursor: "z", selection: "w", accent: "v", ansi: [], ui: nil, glow: nil)
        let u = ThemeStore.derive(bad)
        XCTAssertEqual(u["--code-bg"], "#000000")
        XCTAssertEqual(u["--code-fg"], "#ffffff")
        XCTAssertEqual(u["--code-cursor"], "#ffffff")
        XCTAssertEqual(u["--selection"], "#ffffff")
    }

    func testDeriveHueTokensAndInkContrast() {
        let t = ThemeStore.derive(spec())
        XCTAssertEqual(t["--hue0"], t["--accent-soft"])
        XCTAssertEqual(t["--hue9"], t["--txt"])
        // ink is whichever of the dark/light candidates reads better on the accent
        let ink = ThemeStore.parse(t["--ink"]!)!, accent = ThemeStore.parse(t["--accent"]!)!
        XCTAssertGreaterThan(accent.contrast(ink), 4.5)
    }

    // MARK: Theme labels

    func testStatusLabels() {
        XCTAssertEqual(Theme.statusLabel("busy"), "ÇALIŞIYOR")
        XCTAssertEqual(Theme.statusLabel("idle"), "SIRA SENDE")
        XCTAssertEqual(Theme.statusLabel("waiting"), "SENİ BEKLİYOR")
        XCTAssertEqual(Theme.statusLabel("starting"), "BAŞLIYOR")
        XCTAssertEqual(Theme.statusLabel("terminal"), "TERMİNAL")
        XCTAssertEqual(Theme.statusLabel("ended"), "BİTTİ")
        XCTAssertEqual(Theme.statusLabel(nil), "BİTTİ")
    }

    func testEveryCategoryHasALabel() {
        for c in CATS { XCTAssertNotNil(Theme.catLabel[c], c) }
        XCTAssertEqual(Theme.catLabel["bash"], "shell")
    }
}
