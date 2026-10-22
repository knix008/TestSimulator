// swift-tools-version:5.7
import PackageDescription
let package = Package(
    name: "App",
    dependencies: [
        .package(url: "https://github.com/apple/swift-nio.git", from: "2.40.0"),
        .package(url: "https://github.com/Alamofire/Alamofire.git", exact: "5.6.1"),
    ]
)
