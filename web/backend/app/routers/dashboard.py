import json
import subprocess
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Query
from ..database import get_conn, fetchall_as_dict

router = APIRouter()

# ── 임계치 정의 ────────────────────────────────────────────────
GPU_UTIL_WARN   = 90
GPU_UTIL_DOWN   = 98
GPU_TEMP_WARN   = 80
GPU_TEMP_DOWN   = 90
GPU_MEM_WARN    = 85
GPU_MEM_DOWN    = 98
DISK_DOWN_PCT   = 95
DISK_WARN_PCT   = 85
NODE_DOWN_PCT   = 95
NODE_WARN_PCT   = 80
NET_ERR_WARN    = 0.1   # pps
STALE_THRESHOLD = timedelta(minutes=5)

GPU_METRIC_DISPLAY = {
    'utilization': 'Utilization',
    'memory':      'Memory',
    'temperature': 'Temperature',
    'power':       'Power',
    'health':      'Health',
    'clock':       'Clock',
}


def _sensor_status(key: str, paused: set, *, down: bool, warn: bool) -> str:
    if key in paused:
        return 'pause'
    if down:
        return 'down'
    if warn:
        return 'warning'
    return 'up'


def _is_stale(collected_at) -> bool:
    if collected_at is None:
        return True
    if isinstance(collected_at, str):
        collected_at = datetime.fromisoformat(collected_at.replace('Z', '+00:00'))
    if collected_at.tzinfo is None:
        collected_at = collected_at.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - collected_at) > STALE_THRESHOLD


@router.get("/summary")
def get_summary():
    with get_conn() as conn:
        with conn.cursor() as cur:
            # 활성화된 센서 목록 (등록된 장비 한정)
            cur.execute("""
                SELECT sc.host_ip, sc.sensor_type, sc.sensor_name
                FROM sensor_configs sc
                JOIN registered_devices rd ON rd.host_ip = sc.host_ip
                WHERE sc.enabled = true
            """)
            enabled: set[tuple] = {
                (r['host_ip'], r['sensor_type'], r['sensor_name'])
                for r in fetchall_as_dict(cur)
            }

            # GPU — all hosts with GPU sensors enabled
            gpu_host_ips = list({h for (h, st, _) in enabled if st == 'gpu'})
            gpu_data: dict[tuple, dict] = {}
            if gpu_host_ips:
                cur.execute("""
                    SELECT DISTINCT ON (host_ip, gpu_index)
                        host_ip, gpu_index, collected_at,
                        xid_errors, ecc_sbe, ecc_dbe, pcie_replay,
                        gpu_utilization, temperature_celsius,
                        memory_used_mb, memory_free_mb,
                        power_usage_watts, sm_clock_mhz, mem_clock_mhz
                    FROM gpu_metrics
                    WHERE host_ip = ANY(%s)
                    ORDER BY host_ip, gpu_index, collected_at DESC
                """, (gpu_host_ips,))
                for r in fetchall_as_dict(cur):
                    gpu_data[(r['host_ip'], str(r['gpu_index']))] = r

            # Disk
            cur.execute("""
                SELECT DISTINCT ON (host_ip, mountpoint)
                    host_ip, mountpoint, usage_percent, collected_at
                FROM disk_metrics
                ORDER BY host_ip, mountpoint, collected_at DESC
            """)
            disk_rows = [r for r in fetchall_as_dict(cur)
                         if (r['host_ip'], 'disk', r['mountpoint']) in enabled]

            # Network
            cur.execute("""
                SELECT DISTINCT ON (host_ip, if_descr)
                    host_ip, if_descr, if_oper_status,
                    if_in_octets_rate, if_out_octets_rate,
                    if_in_errors_rate, if_out_errors_rate, collected_at
                FROM snmp_interface_metrics
                ORDER BY host_ip, if_descr, collected_at DESC
            """)
            net_rows = [r for r in fetchall_as_dict(cur)
                        if (r['host_ip'], 'network', r['if_descr']) in enabled]

            # Node
            cur.execute("""
                SELECT DISTINCT ON (host_ip)
                    host_ip, cpu_usage_percent, memory_usage_percent,
                    uptime_seconds, collected_at
                FROM node_metrics
                ORDER BY host_ip, collected_at DESC
            """)
            _node_subs = ('system', 'cpu', 'memory', 'uptime')
            node_rows = [r for r in fetchall_as_dict(cur)
                         if any((r['host_ip'], 'node', s) in enabled for s in _node_subs)]

            # Connectivity (ICMP + Port) — latest metrics (keyed for O(1) lookup)
            conn_data: dict[tuple, dict] = {}
            try:
                cur.execute("""
                    SELECT DISTINCT ON (host_ip, sensor_type, sensor_name)
                        host_ip, sensor_type, sensor_name,
                        is_reachable, latency_ms, packet_loss_pct, collected_at
                    FROM connectivity_metrics
                    ORDER BY host_ip, sensor_type, sensor_name, collected_at DESC
                """)
                for r in fetchall_as_dict(cur):
                    k = (r['host_ip'], r['sensor_type'], r['sensor_name'])
                    if k in enabled:
                        conn_data[k] = r
            except Exception:
                pass  # Table may not exist yet

            cur.execute("SELECT sensor_key FROM sensor_pauses")
            paused = {r['sensor_key'] for r in fetchall_as_dict(cur)}

    sensors = []
    alerts  = []

    # ── GPU ────────────────────────────────────────────────────────
    # 구형: sensor_name = "{idx}_{metric}" / 신형: sensor_name = "{idx}"
    gpu_sensor_map: dict[tuple, set[str]] = {}   # 구형
    gpu_new_list:   list[tuple]           = []   # 신형
    for (h, s_type, sn) in enabled:
        if s_type != 'gpu':
            continue
        if '_' in sn:
            idx, metric = sn.split('_', 1)
            gpu_sensor_map.setdefault((h, idx), set()).add(metric)
        else:
            gpu_new_list.append((h, sn))

    for (host_ip, gpu_idx), metrics in sorted(gpu_sensor_map.items()):
        gpu   = gpu_data.get((host_ip, gpu_idx))
        stale = _is_stale(gpu['collected_at'] if gpu else None)

        for metric in ['utilization', 'memory', 'temperature', 'power', 'health', 'clock']:
            if metric not in metrics:
                continue
            sn_full = f"{gpu_idx}_{metric}"
            key     = f"{host_ip}:gpu:{sn_full}"

            if metric == 'utilization':
                val = float(gpu.get('gpu_utilization') or 0) if gpu else 0
                st  = _sensor_status(key, paused,
                                     down=stale or val >= GPU_UTIL_DOWN,
                                     warn=val >= GPU_UTIL_WARN)
                detail = f"{val:.1f}%"

            elif metric == 'memory':
                used  = float(gpu.get('memory_used_mb') or 0) if gpu else 0
                free  = float(gpu.get('memory_free_mb') or 0) if gpu else 0
                total = used + free
                pct   = (used / total * 100) if total > 0 else 0
                st    = _sensor_status(key, paused,
                                       down=stale or pct >= GPU_MEM_DOWN,
                                       warn=pct >= GPU_MEM_WARN)
                detail = f"{pct:.1f}% ({used/1024:.1f}GB)" if total > 0 else "—"

            elif metric == 'temperature':
                val = float(gpu.get('temperature_celsius') or 0) if gpu else 0
                st  = _sensor_status(key, paused,
                                     down=stale or val >= GPU_TEMP_DOWN,
                                     warn=val >= GPU_TEMP_WARN)
                detail = f"{val:.1f}°C"

            elif metric == 'power':
                val = float(gpu.get('power_usage_watts') or 0) if gpu else 0
                st  = _sensor_status(key, paused, down=stale, warn=False)
                detail = f"{val:.1f}W"

            elif metric == 'health':
                xid  = float(gpu.get('xid_errors') or 0) if gpu else 0
                dbe  = float(gpu.get('ecc_dbe') or 0) if gpu else 0
                sbe  = float(gpu.get('ecc_sbe') or 0) if gpu else 0
                pcie = float(gpu.get('pcie_replay') or 0) if gpu else 0
                st   = _sensor_status(key, paused,
                                      down=stale or xid > 0 or dbe > 0,
                                      warn=sbe > 0 or pcie > 0)
                parts = []
                if xid > 0:  parts.append(f"XID={int(xid)}")
                if dbe > 0:  parts.append(f"DBE={int(dbe)}")
                if sbe > 0:  parts.append(f"SBE={int(sbe)}")
                detail = ', '.join(parts) if parts else "OK"

            elif metric == 'clock':
                sm  = float(gpu.get('sm_clock_mhz') or 0) if gpu else 0
                st  = _sensor_status(key, paused, down=stale, warn=False)
                detail = f"SM {int(sm)}MHz" if sm else "—"

            else:
                continue

            label = GPU_METRIC_DISPLAY.get(metric, metric.capitalize())
            s = {
                'key':         key,
                'host_ip':     host_ip,
                'type':        'GPU',
                'sensor_name': sn_full,
                'name':        f"GPU {gpu_idx} · {label}",
                'status':      st,
                'detail':      detail,
            }
            sensors.append(s)
            if st in ('down', 'warning'):
                alerts.append(s)

    # ── GPU 신형 (per-GPU consolidated) ───────────────────────────
    for (host_ip, gpu_idx_str) in sorted(gpu_new_list):
        gpu   = gpu_data.get((host_ip, gpu_idx_str))
        stale = _is_stale(gpu['collected_at'] if gpu else None)
        key   = f"{host_ip}:gpu:{gpu_idx_str}"

        if not gpu or stale:
            gpu_st = _sensor_status(key, paused, down=True, warn=False)
            detail = 'No data' if not gpu else 'Stale'
        else:
            util_v  = float(gpu.get('gpu_utilization') or 0)
            temp_v  = float(gpu.get('temperature_celsius') or 0)
            used    = float(gpu.get('memory_used_mb') or 0)
            free    = float(gpu.get('memory_free_mb') or 0)
            total_m = used + free
            mem_pct = (used / total_m * 100) if total_m > 0 else 0
            xid     = float(gpu.get('xid_errors') or 0)
            dbe     = float(gpu.get('ecc_dbe') or 0)
            sbe     = float(gpu.get('ecc_sbe') or 0)

            is_down = xid > 0 or dbe > 0 or util_v >= GPU_UTIL_DOWN or temp_v >= GPU_TEMP_DOWN or mem_pct >= GPU_MEM_DOWN
            is_warn = util_v >= GPU_UTIL_WARN or temp_v >= GPU_TEMP_WARN or mem_pct >= GPU_MEM_WARN or sbe > 0
            gpu_st  = _sensor_status(key, paused, down=is_down, warn=is_warn)
            detail  = f"Util {util_v:.1f}% · Temp {temp_v:.1f}°C · Mem {mem_pct:.1f}%"

        model = (gpu.get('model_name') or '') if gpu else ''
        s = {
            'key':         key,
            'host_ip':     host_ip,
            'type':        'GPU',
            'sensor_name': gpu_idx_str,
            'name':        f"GPU {gpu_idx_str}" + (f" · {model}" if model else ""),
            'status':      gpu_st,
            'detail':      detail,
        }
        sensors.append(s)
        if gpu_st in ('down', 'warning'):
            alerts.append(s)

    # ── Disk ──────────────────────────────────────────────────────
    for r in disk_rows:
        key   = f"{r['host_ip']}:disk:{r['mountpoint']}"
        pct   = float(r.get('usage_percent') or 0)
        stale = _is_stale(r.get('collected_at'))
        st    = _sensor_status(key, paused,
                               down=stale or pct >= DISK_DOWN_PCT,
                               warn=pct >= DISK_WARN_PCT)
        s = {
            'key':         key,
            'host_ip':     r['host_ip'],
            'type':        'Disk',
            'sensor_name': r['mountpoint'],
            'name':        r['mountpoint'],
            'status':      st,
            'detail':      f"{pct:.1f}%",
        }
        sensors.append(s)
        if st in ('down', 'warning'):
            alerts.append({**s, 'detail': f"사용률 {pct:.1f}%"})

    # ── Network ───────────────────────────────────────────────────
    def _fmt_bps(bps: float) -> str:
        if bps >= 1024 * 1024:
            return f"{bps/1024/1024:.1f}MB/s"
        if bps >= 1024:
            return f"{bps/1024:.1f}kB/s"
        return f"{bps:.0f}B/s"

    for r in net_rows:
        key   = f"{r['host_ip']}:network:{r['if_descr']}"
        oper  = r.get('if_oper_status') or 1
        in_e  = float(r.get('if_in_errors_rate') or 0)
        out_e = float(r.get('if_out_errors_rate') or 0)
        in_r  = float(r.get('if_in_octets_rate') or 0)
        out_r = float(r.get('if_out_octets_rate') or 0)
        stale = _is_stale(r.get('collected_at'))
        st    = _sensor_status(key, paused,
                               down=stale or oper != 1,
                               warn=in_e > NET_ERR_WARN or out_e > NET_ERR_WARN)
        if oper != 1:
            detail = 'Interface Down'
        else:
            detail = f"↓{_fmt_bps(in_r)} ↑{_fmt_bps(out_r)}"
        s = {
            'key':         key,
            'host_ip':     r['host_ip'],
            'type':        'Network',
            'sensor_name': r['if_descr'],
            'name':        r['if_descr'],
            'status':      st,
            'detail':      detail,
        }
        sensors.append(s)
        if st in ('down', 'warning'):
            alerts.append(s)

    # ── Node ──────────────────────────────────────────────────────
    def _fmt_uptime(sec) -> str:
        if not sec:
            return '—'
        sec = int(sec)
        d = sec // 86400
        h = (sec % 86400) // 3600
        m = (sec % 3600) // 60
        return f"{d}d {h}h {m}m"

    for r in node_rows:
        host_ip = r['host_ip']
        cpu     = float(r.get('cpu_usage_percent') or 0)
        mem     = float(r.get('memory_usage_percent') or 0)
        uptime  = r.get('uptime_seconds')
        stale   = _is_stale(r.get('collected_at'))

        # legacy 'system' 등록도 cpu/memory/uptime 모두 emit
        has_system = (host_ip, 'node', 'system') in enabled

        # CPU sensor
        if has_system or (host_ip, 'node', 'cpu') in enabled:
            cpu_key = f"{host_ip}:node:cpu"
            cpu_st  = _sensor_status(cpu_key, paused,
                                     down=stale or cpu >= NODE_DOWN_PCT,
                                     warn=cpu >= NODE_WARN_PCT)
            s_cpu = {
                'key':         cpu_key,
                'host_ip':     host_ip,
                'type':        'Node',
                'sensor_name': 'cpu',
                'name':        'CPU Utilization',
                'status':      cpu_st,
                'detail':      f"{cpu:.1f}%",
            }
            sensors.append(s_cpu)
            if cpu_st in ('down', 'warning'):
                alerts.append(s_cpu)

        # Memory sensor
        if has_system or (host_ip, 'node', 'memory') in enabled:
            mem_key = f"{host_ip}:node:memory"
            mem_st  = _sensor_status(mem_key, paused,
                                     down=stale or mem >= NODE_DOWN_PCT,
                                     warn=mem >= NODE_WARN_PCT)
            s_mem = {
                'key':         mem_key,
                'host_ip':     host_ip,
                'type':        'Node',
                'sensor_name': 'memory',
                'name':        'Memory',
                'status':      mem_st,
                'detail':      f"{mem:.1f}%",
            }
            sensors.append(s_mem)
            if mem_st in ('down', 'warning'):
                alerts.append(s_mem)

        # Uptime sensor
        if has_system or (host_ip, 'node', 'uptime') in enabled:
            uptime_key = f"{host_ip}:node:uptime"
            uptime_st  = _sensor_status(uptime_key, paused,
                                        down=stale,
                                        warn=False)
            s_uptime = {
                'key':         uptime_key,
                'host_ip':     host_ip,
                'type':        'Node',
                'sensor_name': 'uptime',
                'name':        'Uptime',
                'status':      uptime_st,
                'detail':      _fmt_uptime(uptime),
            }
            sensors.append(s_uptime)
            if uptime_st in ('down', 'warning'):
                alerts.append(s_uptime)

    # ── Connectivity (ICMP + Port) ─────────────────────────────────
    # sensor_configs 기준으로 emit — connectivity_metrics 데이터 없어도 표시
    for (host_ip, sensor_type, sensor_name) in sorted(enabled):
        if sensor_type not in ('icmp', 'port'):
            continue
        key  = f"{host_ip}:{sensor_type}:{sensor_name}"
        r    = conn_data.get((host_ip, sensor_type, sensor_name))  # None if no data yet
        stale     = _is_stale(r.get('collected_at') if r else None)
        reachable = bool(r.get('is_reachable', False)) if r else False
        latency   = r.get('latency_ms') if r else None
        loss      = r.get('packet_loss_pct') if r else None
        st        = _sensor_status(key, paused,
                                   down=stale or not reachable,
                                   warn=False)
        type_label = 'ICMP' if sensor_type == 'icmp' else 'Port'
        display    = 'ICMP Ping' if sensor_type == 'icmp' else f"TCP:{sensor_name}"
        if r is None:
            detail = 'Pending'
        elif not reachable:
            detail = 'Unreachable'
        elif stale:
            detail = 'Stale'
        else:
            parts = []
            if latency is not None:
                parts.append(f"{latency:.1f}ms")
            if loss is not None and loss > 0:
                parts.append(f"loss {loss:.0f}%")
            detail = ' · '.join(parts) if parts else 'OK'
        s = {
            'key':             key,
            'host_ip':         host_ip,
            'type':            type_label,
            'sensor_name':     sensor_name,
            'name':            display,
            'status':          st,
            'detail':          detail,
            'latency_ms':      latency,
            'packet_loss_pct': loss,
        }
        sensors.append(s)
        if st in ('down', 'warning'):
            alerts.append(s)

    counts = {
        'up':      sum(1 for s in sensors if s['status'] == 'up'),
        'down':    sum(1 for s in sensors if s['status'] == 'down'),
        'warning': sum(1 for s in sensors if s['status'] == 'warning'),
        'pause':   sum(1 for s in sensors if s['status'] == 'pause'),
        'total':   len(sensors),
    }
    return {'counts': counts, 'alerts': alerts, 'sensors': sensors}


@router.get("/k8s-nodes")
def get_k8s_nodes():
    """kubectl로 k8s 클러스터 노드 상태를 반환"""
    try:
        result = subprocess.run(
            ["kubectl", "get", "nodes", "-o", "json"],
            capture_output=True, text=True, timeout=10
        )
        nodes_data = json.loads(result.stdout)

        # 파드 수 집계 (Running 상태만)
        pods_result = subprocess.run(
            ["kubectl", "get", "pods", "-A", "-o", "json"],
            capture_output=True, text=True, timeout=10
        )
        pods_data = json.loads(pods_result.stdout)
        pod_counts: dict[str, dict] = {}  # node_name -> {running, total}
        for pod in pods_data.get("items", []):
            node_name = pod["spec"].get("nodeName")
            if not node_name:
                continue
            if node_name not in pod_counts:
                pod_counts[node_name] = {"running": 0, "total": 0}
            pod_counts[node_name]["total"] += 1
            phase = pod.get("status", {}).get("phase", "")
            if phase == "Running":
                pod_counts[node_name]["running"] += 1

        nodes = []
        for item in nodes_data.get("items", []):
            meta   = item["metadata"]
            status = item["status"]
            spec   = item.get("spec", {})

            name   = meta["name"]
            labels = meta.get("labels", {})
            roles  = [
                k.replace("node-role.kubernetes.io/", "")
                for k in labels
                if k.startswith("node-role.kubernetes.io/")
            ]

            # 조건 파싱
            conditions = {c["type"]: c["status"] for c in status.get("conditions", [])}
            ready = conditions.get("Ready") == "True"
            mem_pressure  = conditions.get("MemoryPressure") == "True"
            disk_pressure = conditions.get("DiskPressure")   == "True"
            pid_pressure  = conditions.get("PIDPressure")    == "True"

            # IP
            internal_ip = next(
                (a["address"] for a in status.get("addresses", []) if a["type"] == "InternalIP"),
                None
            )

            # 용량
            capacity    = status.get("capacity", {})
            allocatable = status.get("allocatable", {})

            def _parse_cpu(s: str) -> float:
                if s.endswith("m"):
                    return int(s[:-1]) / 1000
                return float(s)

            def _parse_mem_gb(s: str) -> float:
                if s.endswith("Ki"):
                    return int(s[:-2]) / 1024 / 1024
                if s.endswith("Mi"):
                    return int(s[:-2]) / 1024
                if s.endswith("Gi"):
                    return float(s[:-2])
                return float(s) / 1024 / 1024 / 1024

            node_info = status.get("nodeInfo", {})
            taints = spec.get("taints", [])
            unschedulable = spec.get("unschedulable", False) or any(
                t.get("effect") == "NoSchedule" for t in taints
            )

            pods = pod_counts.get(name, {"running": 0, "total": 0})

            nodes.append({
                "name":            name,
                "roles":           roles if roles else ["worker"],
                "ready":           ready,
                "internal_ip":     internal_ip,
                "k8s_version":     node_info.get("kubeletVersion", ""),
                "os_image":        node_info.get("osImage", ""),
                "container_runtime": node_info.get("containerRuntimeVersion", ""),
                "cpu_capacity":    _parse_cpu(capacity.get("cpu", "0")),
                "mem_capacity_gb": _parse_mem_gb(capacity.get("memory", "0Ki")),
                "cpu_allocatable": _parse_cpu(allocatable.get("cpu", "0")),
                "mem_allocatable_gb": _parse_mem_gb(allocatable.get("memory", "0Ki")),
                "pods_running":    pods["running"],
                "pods_total":      pods["total"],
                "pod_capacity":    int(capacity.get("pods", "110")),
                "mem_pressure":    mem_pressure,
                "disk_pressure":   disk_pressure,
                "pid_pressure":    pid_pressure,
                "unschedulable":   unschedulable,
            })

        return {"nodes": nodes}
    except Exception as e:
        return {"nodes": [], "error": str(e)}


@router.get("/connectivity/{host_ip:path}/history")
def get_connectivity_history(
    host_ip:     str,
    sensor_type: str   = Query(...),
    sensor_name: str   = Query(...),
    hours:       float = Query(default=1),
):
    end   = datetime.now(timezone.utc)
    start = end - timedelta(hours=hours)
    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute("""
                    SELECT collected_at, is_reachable, latency_ms, error_msg,
                           packet_loss_pct, min_latency_ms, max_latency_ms
                    FROM connectivity_metrics
                    WHERE host_ip = %s AND sensor_type = %s AND sensor_name = %s
                      AND collected_at BETWEEN %s AND %s
                    ORDER BY collected_at ASC
                """, (host_ip, sensor_type, sensor_name, start, end))
                return fetchall_as_dict(cur)
            except Exception:
                return []


@router.post("/sensors/{sensor_key:path}/pause")
def pause_sensor(sensor_key: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO sensor_pauses (sensor_key) VALUES (%s) ON CONFLICT DO NOTHING",
                (sensor_key,)
            )
        conn.commit()
    return {'status': 'paused', 'sensor_key': sensor_key}


@router.delete("/sensors/{sensor_key:path}/pause")
def resume_sensor(sensor_key: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM sensor_pauses WHERE sensor_key = %s", (sensor_key,))
        conn.commit()
    return {'status': 'resumed', 'sensor_key': sensor_key}
