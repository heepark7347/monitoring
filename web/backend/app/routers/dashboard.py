from fastapi import APIRouter
from ..database import get_conn, fetchall_as_dict

router = APIRouter()

# ── 임계치 정의 ────────────────────────────────────────────────
GPU_TEMP_WARN   = 80
GPU_UTIL_WARN   = 90
DISK_DOWN_PCT   = 95
DISK_WARN_PCT   = 85
NODE_DOWN_PCT   = 95
NODE_WARN_PCT   = 80
NET_ERR_WARN    = 0.1   # pps


def _sensor_status(key: str, paused: set, *, down: bool, warn: bool) -> str:
    if key in paused:
        return 'pause'
    if down:
        return 'down'
    if warn:
        return 'warning'
    return 'up'


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

            cur.execute("""
                SELECT DISTINCT ON (host_ip, gpu_index)
                    host_ip, gpu_index,
                    xid_errors, ecc_sbe, ecc_dbe,
                    gpu_utilization, temperature_celsius
                FROM gpu_metrics
                ORDER BY host_ip, gpu_index, collected_at DESC
            """)
            gpu_rows = [r for r in fetchall_as_dict(cur)
                        if (r['host_ip'], 'gpu', str(r['gpu_index'])) in enabled]

            cur.execute("""
                SELECT DISTINCT ON (host_ip, mountpoint)
                    host_ip, mountpoint, usage_percent
                FROM disk_metrics
                ORDER BY host_ip, mountpoint, collected_at DESC
            """)
            disk_rows = [r for r in fetchall_as_dict(cur)
                         if (r['host_ip'], 'disk', r['mountpoint']) in enabled]

            cur.execute("""
                SELECT DISTINCT ON (host_ip, if_descr)
                    host_ip, if_descr, if_oper_status,
                    if_in_errors_rate, if_out_errors_rate
                FROM snmp_interface_metrics
                ORDER BY host_ip, if_descr, collected_at DESC
            """)
            net_rows = [r for r in fetchall_as_dict(cur)
                        if (r['host_ip'], 'network', r['if_descr']) in enabled]

            cur.execute("""
                SELECT DISTINCT ON (host_ip)
                    host_ip, cpu_usage_percent, memory_usage_percent
                FROM node_metrics
                ORDER BY host_ip, collected_at DESC
            """)
            node_rows = [r for r in fetchall_as_dict(cur)
                         if (r['host_ip'], 'node', 'system') in enabled]

            cur.execute("SELECT sensor_key FROM sensor_pauses")
            paused = {r['sensor_key'] for r in fetchall_as_dict(cur)}

    sensors = []
    alerts  = []

    # GPU
    for r in gpu_rows:
        key  = f"{r['host_ip']}:gpu:{r['gpu_index']}"
        xid  = r.get('xid_errors') or 0
        dbe  = r.get('ecc_dbe') or 0
        sbe  = r.get('ecc_sbe') or 0
        temp = r.get('temperature_celsius') or 0
        util = r.get('gpu_utilization') or 0
        st   = _sensor_status(key, paused,
                              down=xid > 0 or dbe > 0,
                              warn=sbe > 0 or temp >= GPU_TEMP_WARN or util >= GPU_UTIL_WARN)
        s = {'key': key, 'host_ip': r['host_ip'], 'type': 'GPU',
             'name': f"GPU {r['gpu_index']}", 'status': st}
        sensors.append(s)
        if st in ('down', 'warning'):
            detail = []
            if xid > 0:  detail.append(f"XID={int(xid)}")
            if dbe > 0:  detail.append(f"DBE={int(dbe)}")
            if sbe > 0:  detail.append(f"SBE={int(sbe)}")
            if temp >= GPU_TEMP_WARN: detail.append(f"Temp={temp:.1f}°C")
            if util >= GPU_UTIL_WARN: detail.append(f"Util={util:.1f}%")
            alerts.append({**s, 'detail': ', '.join(detail)})

    # Disk
    for r in disk_rows:
        key = f"{r['host_ip']}:disk:{r['mountpoint']}"
        pct = r.get('usage_percent') or 0
        st  = _sensor_status(key, paused,
                             down=pct >= DISK_DOWN_PCT,
                             warn=pct >= DISK_WARN_PCT)
        s = {'key': key, 'host_ip': r['host_ip'], 'type': 'Disk',
             'name': r['mountpoint'], 'status': st}
        sensors.append(s)
        if st in ('down', 'warning'):
            alerts.append({**s, 'detail': f"사용률 {pct:.1f}%"})

    # Network
    for r in net_rows:
        key   = f"{r['host_ip']}:network:{r['if_descr']}"
        oper  = r.get('if_oper_status') or 1
        in_e  = r.get('if_in_errors_rate') or 0
        out_e = r.get('if_out_errors_rate') or 0
        st    = _sensor_status(key, paused,
                               down=oper != 1,
                               warn=in_e > NET_ERR_WARN or out_e > NET_ERR_WARN)
        s = {'key': key, 'host_ip': r['host_ip'], 'type': 'Network',
             'name': r['if_descr'], 'status': st}
        sensors.append(s)
        if st in ('down', 'warning'):
            detail = 'Interface Down' if oper != 1 else f"Err in={in_e:.3f} out={out_e:.3f} pps"
            alerts.append({**s, 'detail': detail})

    # Node
    for r in node_rows:
        key = f"{r['host_ip']}:node"
        cpu = r.get('cpu_usage_percent') or 0
        mem = r.get('memory_usage_percent') or 0
        st  = _sensor_status(key, paused,
                             down=cpu >= NODE_DOWN_PCT or mem >= NODE_DOWN_PCT,
                             warn=cpu >= NODE_WARN_PCT or mem >= NODE_WARN_PCT)
        s = {'key': key, 'host_ip': r['host_ip'], 'type': 'Node',
             'name': 'System', 'status': st}
        sensors.append(s)
        if st in ('down', 'warning'):
            detail = []
            if cpu >= NODE_WARN_PCT: detail.append(f"CPU {cpu:.1f}%")
            if mem >= NODE_WARN_PCT: detail.append(f"MEM {mem:.1f}%")
            alerts.append({**s, 'detail': ', '.join(detail)})

    counts = {
        'up':      sum(1 for s in sensors if s['status'] == 'up'),
        'down':    sum(1 for s in sensors if s['status'] == 'down'),
        'warning': sum(1 for s in sensors if s['status'] == 'warning'),
        'pause':   sum(1 for s in sensors if s['status'] == 'pause'),
        'total':   len(sensors),
    }
    return {'counts': counts, 'alerts': alerts, 'sensors': sensors}


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
