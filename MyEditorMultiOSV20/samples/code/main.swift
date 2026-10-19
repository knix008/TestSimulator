// Swift — structs, optionals, guard, closures
import Foundation

struct Temperature {
    var celsius: Double
    var fahrenheit: Double { celsius * 9 / 5 + 32 }
}

func parse(_ text: String) -> Temperature? {
    guard let value = Double(text) else { return nil }
    return Temperature(celsius: value)
}

let inputs = ["21.5", "abc", "-3"]
inputs.compactMap(parse).forEach { print(String(format: "%.1f°C = %.1f°F", $0.celsius, $0.fahrenheit)) }
