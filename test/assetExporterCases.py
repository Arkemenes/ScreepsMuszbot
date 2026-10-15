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

# Accounting scalars use the existing generic collector; no new network poll.
import json
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in ("_generic_stats", "update_generic_metrics")]
values, info = Gauge(), Gauge()
env = dict(math=math, CPU_METER_GROUPS=(), generic_stat_value=values, generic_stat_info=info)
exec(compile(ast.Module(body=functions, type_ignores=[]), "exporter.py", "exec"), env)
env["update_generic_metrics"]({"cpu": {"accounting": {"used": 20, "scriptUsed": 16, "residual": 4, "validTicks": 60}}})
by_path = {dict(key)["path"]: value for key, value in values.values.items()}
assert by_path["cpu.accounting.used"] == 20 and by_path["cpu.accounting.scriptUsed"] == 16 and by_path["cpu.accounting.residual"] == 4
env["update_generic_metrics"]({"cpu": {"accounting": {"used": None, "validTicks": 0}}})
assert all(dict(key)["path"] != "cpu.accounting.used" for key in values.values)
dashboard = json.loads(Path(sys.argv[1], "grafana.json").read_text(encoding="utf-8"))
queries = dashboard["spec"]["elements"]["panel-7"]["spec"]["data"]["spec"]["queries"]
assert queries[0]["spec"]["query"]["spec"]["expr"] == 'screeps_stat_value{path="cpu.accounting.used"}'
assert next(q for q in queries if q["spec"]["refId"] == "D")["spec"]["query"]["spec"]["expr"] == 'screeps_stat_value{path="cpu.accounting.scriptUsed"}'
print("CPU accounting exporter/dashboard checks passed")

terminal = Gauge()
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "update_terminal_metrics")
env = dict(math=math, terminal_transfer_energy=terminal, _previous_terminal_routes=set())
exec(compile(ast.Module(body=[function], type_ignores=[]), "exporter.py", "exec"), env)
update = env["update_terminal_metrics"]
sample = {"terminalNetwork": {"transfers": [{"from": "A", "to": "B", "resourceType": "energy", "amount": 100}]}}
update(sample); update(sample)
assert list(terminal.values.values()) == [100]
update({"terminalNetwork": {"transfers": []}})
assert list(terminal.values.values()) == [0]
update({"terminalNetwork": {"transfers": []}})
assert terminal.values == {} and env["_previous_terminal_routes"] == set()
update({"terminalNetwork": {"transfers": [
    {"from": "A", "to": "B", "resourceType": "energy", "amount": 20},
    {"from": "A", "to": "B", "resourceType": "O", "amount": 30}]}})
assert sorted(terminal.values.values()) == [20, 30]
print("Terminal network expiration/idempotency/resource checks passed")
panel = dashboard["spec"]["elements"]["panel-241"]["spec"]
query = panel["data"]["spec"]["queries"][0]["spec"]["query"]["spec"]
assert query["expr"] == 'screeps_terminal_transfer_energy{resource="energy"}'
assert query["legendFormat"] == "{{from_room}} → {{to_room}}"
print("Terminal network dashboard query/labels checks passed")
