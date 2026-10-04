import math
import os, time, json, base64, gzip, requests
from prometheus_client import start_http_server, Gauge

SCREEPS_HOST = os.environ.get("SCREEPS_HOST", "screeps.com")
SCREEPS_SHARD = os.environ.get("SCREEPS_SHARD", "shard3")
TOKEN = os.environ["SCREEPS_TOKEN"]
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "120"))
BASE_URL = f"https://{SCREEPS_HOST}"

# --- Métricas já em uso, com dados reais ---
gcl_level = Gauge('screeps_gcl_level', 'Nível de GCL')
gcl_progress = Gauge('screeps_gcl_progress', 'Progresso do GCL')
gcl_progress_total = Gauge('screeps_gcl_progress_total', 'Progresso total necessário do GCL')
cpu_used = Gauge('screeps_cpu_used', 'CPU usado no último tick')
cpu_limit = Gauge('screeps_cpu_limit', 'Limite de CPU')
cpu_bucket = Gauge('screeps_cpu_bucket', 'Bucket de CPU')
game_time = Gauge('screeps_game_time', 'Tick atual do jogo')
room_energy = Gauge('screeps_room_energy_available', 'Energia disponível na sala', ['room'])
room_energy_capacity = Gauge('screeps_room_energy_capacity', 'Capacidade de energia da sala', ['room'])
room_storage_energy = Gauge('screeps_room_storage_energy', 'Energia no storage', ['room'])
room_terminal_energy = Gauge('screeps_room_terminal_energy', 'Energia no terminal', ['room'])
room_controller_level = Gauge('screeps_room_controller_level', 'Nível do controller', ['room'])
room_controller_progress = Gauge('screeps_room_controller_progress', 'Progresso do controller', ['room'])
room_controller_progress_total = Gauge('screeps_room_controller_progress_total', 'Progresso total do controller', ['room'])

# --- Métricas "avançadas" (já implementadas no stats.js) ---
memory_used_bytes = Gauge('screeps_memory_used_bytes', 'Bytes de memória usados')
heap_used_bytes = Gauge('screeps_heap_used_bytes', 'Heap usado (bytes)')
heap_total_bytes = Gauge('screeps_heap_total_bytes', 'Heap total alocado (bytes)')
heap_limit_bytes = Gauge('screeps_heap_limit_bytes', 'Limite de heap (bytes)')
last_global_reset_tick = Gauge('screeps_last_global_reset_tick', 'Tick do último global reset')
last_memory_reset_tick = Gauge('screeps_last_memory_reset_tick', 'Tick do último memory reset')
room_total_energy_assets = Gauge('screeps_room_total_energy_assets', 'Energia total (storage+terminal)', ['room'])
room_hatchery_uptime = Gauge('screeps_room_hatchery_uptime', 'Uptime do spawn (0-1)', ['room'])
room_avg_barrier_hits = Gauge('screeps_room_avg_barrier_hits', 'Média de hits em ramparts/walls', ['room'])
room_defcon = Gauge('screeps_room_defcon', 'Nível de DEFCON da sala', ['room'])
room_mineral = Gauge('screeps_room_mineral', 'Assets de minerais base', ['room', 'mineral'])
room_compound_t3 = Gauge('screeps_room_compound_t3', 'Assets de compostos T3', ['room', 'compound'])
room_energy_spent = Gauge('screeps_room_energy_spent', 'Energia gasta por categoria', ['room', 'category'])
market_credits = Gauge('screeps_market_credits', 'Créditos no mercado')
market_bought_amount = Gauge('screeps_market_bought_amount', 'Quantidade comprada', ['resource'])
market_sold_amount = Gauge('screeps_market_sold_amount', 'Quantidade vendida', ['resource'])
market_bought_credits = Gauge('screeps_market_bought_credits', 'Créditos gastos', ['resource'])
market_sold_credits = Gauge('screeps_market_sold_credits', 'Créditos recebidos', ['resource'])
terminal_transfer_energy = Gauge('screeps_terminal_transfer_energy', 'Transferência de energia entre salas', ['from_room', 'to_room', 'resource'])

# Fallback for new Memory.stats fields. Named metrics above remain the stable
# dashboard contract; these families make new scalar fields observable without
# requiring a Python edit for every addition to stats.js.
generic_stat_value = Gauge(
    'screeps_stat_value',
    'Numeric scalar discovered in Memory.stats',
    ['path', 'room', 'mineral', 'compound', 'category', 'direction', 'span'],
)
generic_stat_info = Gauge(
    'screeps_stat_info',
    'Text scalar discovered in Memory.stats',
    ['path', 'room', 'mineral', 'compound', 'category', 'direction', 'span', 'value'],
)


def decode_data(data):
    if data is None:
        return None
    if isinstance(data, str) and data.startswith("gz:"):
        compressed = base64.b64decode(data[3:])
        decompressed = gzip.decompress(compressed)
        return json.loads(decompressed)
    if isinstance(data, str):
        return json.loads(data)
    return data


def fetch_stats():
    try:
        r = requests.get(
            f"{BASE_URL}/api/user/memory",
            headers={"X-Token": TOKEN},
            params={"path": "stats", "shard": SCREEPS_SHARD},
            timeout=10
        )
    except requests.exceptions.RequestException as e:
        print(f"Erro de rede ao buscar stats: {e}")
        return None

    if r.status_code == 429:
        retry_after = int(r.headers.get("Retry-After", POLL_INTERVAL))
        print(f"Rate limit esgotado (429). Aguardando {retry_after}s (~{retry_after/3600:.1f}h).")
        time.sleep(retry_after)
        return None

    if not r.ok:
        print(f"Erro HTTP {r.status_code} ao buscar stats: {r.text[:200]}")
        return None

    return decode_data(r.json().get("data"))


CPU_METER_GROUPS = ("modules", "roles", "structures", "spans", "fns")


def _generic_stats(value, path=(), labels=None):
    """Yield scalar stats while turning known dynamic maps into labels."""
    labels = dict(labels or {})

    if isinstance(value, dict):
        for key, child in value.items():
            child_labels = dict(labels)
            if path == ("rooms",) and "room" not in labels:
                child_labels["room"] = str(key)
                child_path = path
            elif path and path[-1] == "minerals" and "mineral" not in labels:
                child_labels["mineral"] = str(key)
                child_path = path
            elif path and path[-1] == "compoundsT3" and "compound" not in labels:
                child_labels["compound"] = str(key)
                child_path = path
            elif path and path[-1] == "energySpent" and "category" not in labels:
                child_labels["category"] = str(key)
                child_path = path
            elif (
                path and path[-1] == "transactions" and
                key in ("bought", "sold") and "direction" not in labels
            ):
                child_labels["direction"] = str(key)
                child_path = path
            elif (
                len(path) == 3 and path[:2] == ("cpu", "meter") and
                path[2] in CPU_METER_GROUPS and "span" not in labels
            ):
                # cpuMeter (ROADMAP 0113): module / role / structure type / span /
                # function name becomes the `span` label, the field (avg, max, calls,
                # self, total) stays in the path
                child_labels["span"] = str(key)
                child_path = path
            else:
                child_path = path + (str(key),)
            yield from _generic_stats(child, child_path, child_labels)
        return

    if isinstance(value, list):
        for index, child in enumerate(value):
            yield from _generic_stats(child, path + (str(index),), labels)
        return

    if isinstance(value, bool) or value is None:
        return

    if isinstance(value, (int, float)) and math.isfinite(value):
        yield "value", ".".join(path), labels, value
    elif isinstance(value, str) and value:
        yield "info", ".".join(path), labels, value[:120]


def update_generic_metrics(stats):
    """Export scalar fields not covered by the named dashboard metrics."""
    generic_stat_value.clear()
    generic_stat_info.clear()
    for kind, path, labels, value in _generic_stats(stats):
        metric_labels = {
            "path": path,
            "room": labels.get("room", ""),
            "mineral": labels.get("mineral", ""),
            "compound": labels.get("compound", ""),
            "category": labels.get("category", ""),
            "direction": labels.get("direction", ""),
            "span": labels.get("span", ""),
        }
        if kind == "value":
            generic_stat_value.labels(**metric_labels).set(value)
        else:
            generic_stat_info.labels(value=value, **metric_labels).set(1)


def update_metrics():
    stats = fetch_stats()
    if not stats:
        return

    update_generic_metrics(stats)

    # --- GCL ---
    gcl = stats.get("gcl", {})
    gcl_level.set(gcl.get("level", 0))
    gcl_progress.set(gcl.get("progress", 0))
    gcl_progress_total.set(gcl.get("progressTotal", 0))

    # --- CPU ---
    cpu = stats.get("cpu", {})
    cpu_used.set(cpu.get("used", 0))
    cpu_limit.set(cpu.get("limit", 0))
    cpu_bucket.set(cpu.get("bucket", 0))

    game_time.set(stats.get("time", 0))

    # --- Memória / Heap ---
    memory = stats.get("memory", {})
    if "used" in memory:
        memory_used_bytes.set(memory["used"])

    heap = cpu.get("heap", {})
    if heap:
        heap_used_bytes.set(heap.get("used_heap_size", 0))
        heap_total_bytes.set(heap.get("total_heap_size", 0))
        heap_limit_bytes.set(heap.get("heap_size_limit", 0))

    # --- Resets ---
    persistent = stats.get("persistent", {})
    if "lastGlobalReset" in persistent:
        last_global_reset_tick.set(persistent["lastGlobalReset"])
    if "lastMemoryReset" in persistent:
        last_memory_reset_tick.set(persistent["lastMemoryReset"])

    # --- Salas ---
    for room, r in stats.get("rooms", {}).items():
        room_energy.labels(room=room).set(r.get("energyAvailable", 0))
        room_energy_capacity.labels(room=room).set(r.get("energyCapacityAvailable", 0))
        room_storage_energy.labels(room=room).set(r.get("storageEnergy", 0))
        room_terminal_energy.labels(room=room).set(r.get("terminalEnergy", 0))
        room_controller_level.labels(room=room).set(r.get("controllerLevel", 0))
        room_controller_progress.labels(room=room).set(r.get("controllerProgress", 0))
        room_controller_progress_total.labels(room=room).set(r.get("controllerProgressTotal", 0))

        if "totalEnergyAssets" in r:
            room_total_energy_assets.labels(room=room).set(r["totalEnergyAssets"])
        if "hatcheryUptime" in r:
            room_hatchery_uptime.labels(room=room).set(r["hatcheryUptime"])
        if "avgBarrierHits" in r:
            room_avg_barrier_hits.labels(room=room).set(r["avgBarrierHits"])
        if "defcon" in r:
            room_defcon.labels(room=room).set(r["defcon"])

        for mineral, amount in r.get("minerals", {}).items():
            room_mineral.labels(room=room, mineral=mineral).set(amount)
        for compound, amount in r.get("compoundsT3", {}).items():
            room_compound_t3.labels(room=room, compound=compound).set(amount)

        # energySpent: spawn, renew, build, repairNormal, repairRampart, repairWall,
        # upgrade, towerAttack, towerHeal, towerRepair
        for category, amount in r.get("energySpent", {}).items():
            room_energy_spent.labels(room=room, category=category).set(amount)

    # --- Mercado ---
    market = stats.get("market", {})
    if "credits" in market:
        market_credits.set(market["credits"])
    for resource, tx in market.get("transactions", {}).get("bought", {}).items():
        market_bought_amount.labels(resource=resource).set(tx.get("amount", 0))
        market_bought_credits.labels(resource=resource).set(tx.get("credits", 0))
    for resource, tx in market.get("transactions", {}).get("sold", {}).items():
        market_sold_amount.labels(resource=resource).set(tx.get("amount", 0))
        market_sold_credits.labels(resource=resource).set(tx.get("credits", 0))

    # --- Terminal Network ---
    for transfer in stats.get("terminalNetwork", {}).get("transfers", []):
        terminal_transfer_energy.labels(
            from_room=transfer.get("from", "?"),
            to_room=transfer.get("to", "?"),
            resource=transfer.get("resourceType", "?")
        ).set(transfer.get("amount", 0))


if __name__ == "__main__":
    start_http_server(9101)
    while True:
        try:
            update_metrics()
        except Exception as e:
            print("Erro ao atualizar métricas:", e)
        time.sleep(POLL_INTERVAL)
