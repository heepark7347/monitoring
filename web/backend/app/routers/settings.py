from fastapi import APIRouter, HTTPException, Body
from ..database import get_conn, fetchall_as_dict

router = APIRouter()

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


# ── 장비 등록 ──────────────────────────────────────────────────
@router.post("/devices")
def add_device(host_ip: str = Body(...), display_name: str = Body(default="")):
    # 수집 데이터에 해당 IP가 존재하는지 확인
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT host_ip FROM (
                    SELECT DISTINCT host_ip FROM gpu_metrics
                    UNION SELECT DISTINCT host_ip FROM node_metrics
                    UNION SELECT DISTINCT host_ip FROM disk_metrics
                    UNION SELECT DISTINCT host_ip FROM snmp_interface_metrics
                ) t WHERE host_ip = %s
            """, (host_ip,))
            if not cur.fetchone():
                raise HTTPException(400, detail=f"{host_ip}에 대한 수집 데이터가 없습니다.")

            try:
                cur.execute(
                    "INSERT INTO registered_devices (host_ip, display_name) VALUES (%s, %s) RETURNING id",
                    (host_ip, display_name)
                )
            except Exception:
                raise HTTPException(409, detail="이미 등록된 장비입니다.")
        conn.commit()

    _discover_sensors(host_ip)
    return {"status": "registered", "host_ip": host_ip}


# ── 장비 수정 (display_name) ───────────────────────────────────
@router.patch("/devices/{host_ip:path}")
def update_device(host_ip: str, display_name: str = Body(...)):
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


# ── 센서 활성화/비활성화, display_name 수정 ────────────────────
@router.patch("/sensors/{sensor_id}")
def update_sensor(sensor_id: int,
                  enabled: bool | None = Body(default=None),
                  display_name: str | None = Body(default=None)):
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


# ── 센서 자동 발견 ─────────────────────────────────────────────
@router.post("/sensors/discover/{host_ip:path}")
def discover_sensors(host_ip: str):
    _discover_sensors(host_ip)
    return {"status": "discovered"}


def _discover_sensors(host_ip: str):
    """metric 테이블에서 해당 host_ip의 센서를 찾아 sensor_configs에 등록"""
    rows: list[tuple] = []

    with get_conn() as conn:
        with conn.cursor() as cur:
            # GPU
            cur.execute(
                "SELECT DISTINCT gpu_index FROM gpu_metrics WHERE host_ip = %s ORDER BY gpu_index",
                (host_ip,)
            )
            for (idx,) in cur.fetchall():
                rows.append((host_ip, 'gpu', str(idx)))

            # Node
            cur.execute(
                "SELECT 1 FROM node_metrics WHERE host_ip = %s LIMIT 1", (host_ip,)
            )
            if cur.fetchone():
                rows.append((host_ip, 'node', 'system'))

            # Disk
            cur.execute(
                "SELECT DISTINCT mountpoint FROM disk_metrics WHERE host_ip = %s ORDER BY mountpoint",
                (host_ip,)
            )
            for (mp,) in cur.fetchall():
                rows.append((host_ip, 'disk', mp))

            # Network
            cur.execute(
                "SELECT DISTINCT if_descr FROM snmp_interface_metrics WHERE host_ip = %s ORDER BY if_descr",
                (host_ip,)
            )
            for (iface,) in cur.fetchall():
                rows.append((host_ip, 'network', iface))

            for r in rows:
                cur.execute("""
                    INSERT INTO sensor_configs (host_ip, sensor_type, sensor_name, enabled)
                    VALUES (%s, %s, %s, true)
                    ON CONFLICT (host_ip, sensor_type, sensor_name) DO NOTHING
                """, r)
        conn.commit()
