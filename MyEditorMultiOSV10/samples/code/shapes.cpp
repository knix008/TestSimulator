// C++17 — classes, smart pointers, ranges-style loops
#include <iostream>
#include <memory>
#include <vector>
#include <cmath>

struct Shape {
    virtual ~Shape() = default;
    virtual double area() const = 0;
    virtual const char* name() const = 0;
};

struct Circle : Shape {
    explicit Circle(double r) : r_(r) {}
    double area() const override { return M_PI * r_ * r_; }
    const char* name() const override { return "circle"; }
private:
    double r_;
};

int main() {
    std::vector<std::unique_ptr<Shape>> shapes;
    shapes.push_back(std::make_unique<Circle>(1.5));
    for (const auto& s : shapes) std::cout << s->name() << ": " << s->area() << '\n';
}
