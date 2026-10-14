"""Exercise the exporter with in-memory gauges, without network or credentials."""
import ast
import math
from pathlib import Path
import sys


class Gauge:
    def __init__(self):
        self.values = {}

    def clear(self):
        self.values.clear()

    def labels(self, **labels):
        gauge = self
        key = tuple(sorted(labels.items()))

        class Sample:
            def set(self, value):
                gauge.values[key] = value

        return Sample()

    def set(self, value):
        self.values[()] = value


source = Path(sys.argv[1], "exporter.py").read_text(encoding="utf-8")
tree = ast.parse(source)  # Also check the entire exporter syntax.
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "update_asset_metrics")
stock, prices, coverage = Gauge(), Gauge(), Gauge()
env = dict(math=math, resource_amount=stock, resource_sell_value=prices, assets_unpriced_resources=coverage)
exec(compile(ast.Module(body=[function], type_ignores=[]), "exporter.py", "exec"), env)
update = env["update_asset_metrics"]
update({"assets": {"resources": {"O": 10, "battery": 5, "pixel": 2, "zero": 0, "bad": float("nan")}},
        "market": {"fairPrice": {"O": {"sellPrice": 12, "currentSell": 99}, "battery": {"sellPrice": None}, "pixel": {"sellPrice": 0}}}})
assert stock.values == {(("resource", "O"),): 10, (("resource", "battery"),): 5, (("resource", "pixel"),): 2}
assert prices.values == {(("resource", "O"),): 12, (("resource", "pixel"),): 0}
assert coverage.values[()] == 1
assert 100 + 0.95 * sum(amount * prices.values.get(key, 0) for key, amount in stock.values.items()) == 214
update({"assets": {"resources": {"O": 3}}, "market": {"fairPrice": {"O": {"sellPrice": float("inf")}}}})
assert stock.values == {(("resource", "O"),): 3} and prices.values == {} and coverage.values[()] == 1
update({"assets": {"resources": {}}, "market": {}})
assert stock.values == {} and prices.values == {} and coverage.values[()] == 0
print("asset exporter checks passed")
