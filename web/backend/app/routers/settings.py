import re
import json
import time
import socket
import subprocess
from fastapi import APIRouter, HTTPException, Body
from ..database import get_conn, fetchall_as_dict

router = APIRouter()

GPU_METRIC_SUFFIXES = ['utilization', 'memory', 'temperature', 'power', 'health', 'clock']


# ── 장비 조회 ──────────────────────────────────────────────────
@router.get("/devices")
def list_devices():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, host_ip, display_name, created_at
                FROM registered_devices
                ORDER BY created_at ASC
            """)
            return fetchall_as_dict(cur)


# ── 장비 등록 (통신 불필요, 이름 + IP만으로 등록) ─────────────
@router.post("/devices")
def add_device(
    host_ip:      str = Body(...),
    display_name: str = Body(default=""),
):
    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "INSERT INTO registered_devices (host_ip, display_name) VALUES (%s, %s) RETURNING id",
                    (host_ip, display_name)
                )
                result = cur.fetchone()
            except Exception:
                raise HTTPException(409, detail="이미 등록된 장비입니다.")
        conn.commit()
    return {"status": "registered", "host_ip": host_ip, "id": result[0]}


# ── 장비 수정 (display_name) ───────────────────────────────────
@router.patch("/devices/{host_ip:path}")
def update_device(host_ip: str, display_name: str = Body(..., embed=True)):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE registered_devices SET display_name = %s WHERE host_ip = %s RETURNING id",
                (display_name, host_ip)
            )
            if not cur.fetchone():
                raise HTTPException(404, detail="등록되지 않은 장비입니다.")
        conn.commit()
    return {"status": "updated"}


# ── 장비 삭제 ──────────────────────────────────────────────────
@router.delete("/devices/{host_ip:path}")
def remove_device(host_ip: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM sensor_configs WHERE host_ip = %s", (host_ip,))
            cur.execute(
                "DELETE FROM registered_devices WHERE host_ip = %s RETURNING id", (host_ip,)
            )
            if not cur.fetchone():
                raise HTTPException(404, detail="등록되지 않은 장비입니다.")
        conn.commit()
    return {"status": "deleted"}


# ── 센서 목록 조회 ─────────────────────────────────────────────
@router.get("/sensors")
def list_sensors(host_ip: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, host_ip, sensor_type, sensor_name, enabled, display_name
                FROM sensor_configs
                WHERE host_ip = %s
                ORDER BY sensor_type, sensor_name
            """, (host_ip,))
            return fetchall_as_dict(cur)


# ── 수집 가능한 센서 목록 (DB 스캔 + connectivity + 항상 추가 가능한 타입) ─
@router.get("/sensors/available/{host_ip:path}")
def available_sensors(host_ip: str):
    result = []

    with get_conn() as conn:
        with conn.cursor() as cur:
            # GPU — 6 metrics per GPU index
            cur.execute(
                "SELECT DISTINCT gpu_index FROM gpu_metrics WHERE host_ip = %s ORDER BY gpu_index",
                (host_ip,)
            )
            for (idx,) in cur.fetchall():
                for suffix in GPU_METRIC_SUFFIXES:
                    result.append({"sensor_type": "gpu", "sensor_name": f"{idx}_{suffix}"})

            # Node — 에이전트 연결 여부와 무관하게 항상 3개 제공
            for sub in ("cpu", "memory", "uptime"):
                result.append({"sensor_type": "node", "sensor_name": sub})

            # Disk
            cur.execute(
                "SELECT DISTINCT mountpoint FROM disk_metrics WHERE host_ip = %s ORDER BY mountpoint",
                (host_ip,)
            )
            for (mp,) in cur.fetchall():
                result.append({"sensor_type": "disk", "sensor_name": mp})

            # Network
            cur.execute(
                "SELECT DISTINCT if_descr FROM snmp_interface_metrics WHERE host_ip = %s ORDER BY if_descr",
                (host_ip,)
            )
            for (iface,) in cur.fetchall():
                result.append({"sensor_type": "network", "sensor_name": iface})

            # Connectivity — ICMP always available, port sensors from existing config
            result.append({"sensor_type": "icmp", "sensor_name": "icmp"})

            # Mark registration status
            cur.execute(
                "SELECT sensor_type, sensor_name, id FROM sensor_configs WHERE host_ip = %s",
                (host_ip,)
            )
            registered = {(r[0], r[1]): r[2] for r in cur.fetchall()}

    # legacy 'system' 등록 시 cpu/memory/uptime도 registered로 표시
    has_legacy_system = ('node', 'system') in registered

    for item in result:
        key = (item["sensor_type"], item["sensor_name"])
        if key in registered:
            item["registered"] = True
            item["config_id"]  = registered[key]
        elif has_legacy_system and item["sensor_type"] == "node" and item["sensor_name"] in ("cpu", "memory", "uptime"):
            item["registered"] = True
            item["config_id"]  = registered[('node', 'system')]
        else:
            item["registered"] = False
            item["config_id"]  = None

    return result


# ── 센서 등록 (선택한 센서들을 sensor_configs에 추가) ─────────────
@router.post("/sensors")
def register_sensors(
    host_ip: str  = Body(...),
    sensors: list = Body(...)  # [{"sensor_type": "gpu", "sensor_name": "0_utilization"}, ...]
):
    with get_conn() as conn:
        with conn.cursor() as cur:
            for s in sensors:
                cur.execute("""
                    INSERT INTO sensor_configs (host_ip, sensor_type, sensor_name, enabled)
                    VALUES (%s, %s, %s, true)
                    ON CONFLICT (host_ip, sensor_type, sensor_name) DO UPDATE SET enabled = true
                """, (host_ip, s["sensor_type"], s["sensor_name"]))
        conn.commit()
    return {"status": "registered", "count": len(sensors)}


# ── 센서 활성화/비활성화, display_name 수정 ────────────────────
@router.patch("/sensors/{sensor_id}")
def update_sensor(sensor_id: int,
                  enabled:      bool | None = Body(default=None),
                  display_name: str  | None = Body(default=None)):
    fields, vals = [], []
    if enabled is not None:
        fields.append("enabled = %s"); vals.append(enabled)
    if display_name is not None:
        fields.append("display_name = %s"); vals.append(display_name)
    if not fields:
        raise HTTPException(400, detail="변경할 항목이 없습니다.")
    vals.append(sensor_id)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE sensor_configs SET {', '.join(fields)} WHERE id = %s RETURNING id",
                vals
            )
            if not cur.fetchone():
                raise HTTPException(404, detail="센서를 찾을 수 없습니다.")
        conn.commit()
    return {"status": "updated"}


# ── 센서 삭제 (sensor_config + 관련 metric 데이터 삭제) ──────────
@router.delete("/sensors/{sensor_id}")
def delete_sensor(sensor_id: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT host_ip, sensor_type, sensor_name FROM sensor_configs WHERE id = %s",
                (sensor_id,)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, detail="센서를 찾을 수 없습니다.")
            host_ip, sensor_type, sensor_name = row

            # 관련 metric 데이터 삭제
            if sensor_type == 'gpu':
                gpu_idx = sensor_name.split('_')[0]
                cur.execute(
                    "DELETE FROM gpu_metrics WHERE host_ip = %s AND gpu_index::text = %s",
                    (host_ip, gpu_idx)
                )
            elif sensor_type == 'node':
                cur.execute("DELETE FROM node_metrics WHERE host_ip = %s", (host_ip,))
            elif sensor_type == 'disk':
                cur.execute(
                    "DELETE FROM disk_metrics WHERE host_ip = %s AND mountpoint = %s",
                    (host_ip, sensor_name)
                )
            elif sensor_type == 'network':
                cur.execute(
                    "DELETE FROM snmp_interface_metrics WHERE host_ip = %s AND if_descr = %s",
                    (host_ip, sensor_name)
                )
            elif sensor_type == 'icmp':
                try:
                    cur.execute(
                        "DELETE FROM connectivity_metrics WHERE host_ip = %s AND sensor_type = 'icmp'",
                        (host_ip,)
                    )
                except Exception:
                    pass
            elif sensor_type == 'port':
                try:
                    cur.execute(
                        "DELETE FROM connectivity_metrics WHERE host_ip = %s AND sensor_type = 'port' AND sensor_name = %s",
                        (host_ip, sensor_name)
                    )
                except Exception:
                    pass

            cur.execute("DELETE FROM sensor_configs WHERE id = %s", (sensor_id,))
        conn.commit()
    return {"status": "deleted"}


# ── 연결성 프로브 (ICMP ping / TCP port 실시간 점검) ─────────────
@router.post("/probe")
def probe_connectivity(
    host_ip:     str = Body(...),
    sensor_type: str = Body(...),   # 'icmp' or 'port'
    sensor_name: str = Body(...),   # 'icmp' or port number string e.g. '22'
):
    is_reachable = False
    latency_ms   = None
    error_msg    = None

    if sensor_type == 'icmp':
        try:
            result = subprocess.run(
                ['ping', '-c', '1', '-W', '2', host_ip],
                capture_output=True, timeout=5
            )
            is_reachable = result.returncode == 0
            if is_reachable:
                out = result.stdout.decode()
                m   = re.search(r'time=([\d.]+)', out)
                latency_ms = float(m.group(1)) if m else None
            else:
                error_msg = result.stderr.decode().strip() or 'Host unreachable'
        except Exception as e:
            error_msg = str(e)

    elif sensor_type == 'port':
        try:
            port  = int(sensor_name)
            start = time.time()
            with socket.create_connection((host_ip, port), timeout=3):
                latency_ms   = (time.time() - start) * 1000
                is_reachable = True
        except Exception as e:
            error_msg = str(e)
    else:
        raise HTTPException(400, detail="sensor_type은 'icmp' 또는 'port'여야 합니다.")

    with get_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute("""
                    INSERT INTO connectivity_metrics
                        (host_ip, sensor_name, sensor_type, is_reachable, latency_ms, error_msg)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (host_ip, sensor_name, sensor_type, is_reachable, latency_ms, error_msg))
            except Exception:
                pass  # Table may not exist yet
        conn.commit()

    return {
        "host_ip":      host_ip,
        "sensor_type":  sensor_type,
        "sensor_name":  sensor_name,
        "is_reachable": is_reachable,
        "latency_ms":   latency_ms,
        "error_msg":    error_msg,
    }


# ── 센서 자동 발견 (구버전 호환) ───────────────────────────────────
@router.post("/sensors/discover/{host_ip:path}")
def discover_sensors(host_ip: str):
    _discover_sensors(host_ip)
    return {"status": "discovered"}


def _discover_sensors(host_ip: str):
    """metric 테이블에서 해당 host_ip의 센서를 찾아 sensor_configs에 등록 (기본 disabled)"""
    rows: list[tuple] = []

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT DISTINCT gpu_index FROM gpu_metrics WHERE host_ip = %s ORDER BY gpu_index",
                (host_ip,)
            )
            for (idx,) in cur.fetchall():
                for suffix in GPU_METRIC_SUFFIXES:
                    rows.append((host_ip, 'gpu', f"{idx}_{suffix}"))

            cur.execute("SELECT 1 FROM node_metrics WHERE host_ip = %s LIMIT 1", (host_ip,))
            if cur.fetchone():
                for sub in ("cpu", "memory", "uptime"):
                    rows.append((host_ip, 'node', sub))

            cur.execute(
                "SELECT DISTINCT mountpoint FROM disk_metrics WHERE host_ip = %s ORDER BY mountpoint",
                (host_ip,)
            )
            for (mp,) in cur.fetchall():
                rows.append((host_ip, 'disk', mp))

            cur.execute(
                "SELECT DISTINCT if_descr FROM snmp_interface_metrics WHERE host_ip = %s ORDER BY if_descr",
                (host_ip,)
            )
            for (iface,) in cur.fetchall():
                rows.append((host_ip, 'network', iface))

            for r in rows:
                cur.execute("""
                    INSERT INTO sensor_configs (host_ip, sensor_type, sensor_name, enabled)
                    VALUES (%s, %s, %s, false)
                    ON CONFLICT (host_ip, sensor_type, sensor_name) DO NOTHING
                """, r)
        conn.commit()
