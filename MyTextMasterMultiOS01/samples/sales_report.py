#!/usr/bin/env python3
"""Monthly sales report.

Reads sales.csv (date, region, product, quantity, price) and prints
total revenue per region and the best-selling products.
"""

import csv
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date


@dataclass
class Sale:
    day: date
    region: str
    product: str
    quantity: int
    price: float

    @property
    def total(self) -> float:
        return self.quantity * self.price


def load_sales(path: str) -> list[Sale]:
    sales = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            sales.append(Sale(
                day=date.fromisoformat(row["date"]),
                region=row["region"],
                product=row["product"],
                quantity=int(row["quantity"]),
                price=float(row["price"]),
            ))
    return sales


def report(sales: list[Sale], top: int = 5) -> None:
    by_region: dict[str, float] = defaultdict(float)
    by_product: Counter[str] = Counter()
    for s in sales:
        by_region[s.region] += s.total
        by_product[s.product] += s.quantity

    print("Revenue by region")
    print("-" * 30)
    for region, revenue in sorted(by_region.items(), key=lambda kv: -kv[1]):
        print(f"{region:<15}{revenue:>15,.0f}")

    print()
    print(f"Top {top} products")
    for rank, (product, qty) in enumerate(by_product.most_common(top), start=1):
        print(f"{rank}. {product} ({qty} sold)")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "sales.csv"
    try:
        report(load_sales(path))
    except FileNotFoundError:
        print(f"File not found: {path}", file=sys.stderr)
        sys.exit(1)
