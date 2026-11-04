// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "terminal-app",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "terminal-app", targets: ["TerminalApp"]),
    ],
    dependencies: [
        .package(url: "https://github.com/migueldeicaza/SwiftTerm", from: "1.20.0"),
    ],
    targets: [
        .executableTarget(
            name: "TerminalApp",
            dependencies: [.product(name: "SwiftTerm", package: "SwiftTerm")],
            path: "Sources/TerminalApp"
        ),
        .testTarget(
            name: "TerminalAppTests",
            dependencies: ["TerminalApp"],
            path: "Tests/TerminalAppTests"
        ),
    ]
)
