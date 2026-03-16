from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Query, HTTPException
from ..database import get_conn, fetchall_as_dict

router = APIRouter()

METRIC_COLUMNS = {
    'utilization': 'gpu_utilization',
    'memory':      'memory_used_mb, memory_free_mb',
    'temperature': 'temperature_celsius',
    'power':       'power_usage_watts',
    'health':      'xid_errors, ecc_sbe, ecc_dbe, pcie_replay, power_violation, thermal_violation',
    'clock':       'sm_clock_mhz, mem_clock_mhz',
}


@router.get("/latest")
def get_gpu_latest():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT ON (gpu_index)
                    collected_at, host_ip, gpu_index, gpu_uuid, model_name,
                    gpu_utilization, memory_used_mb, memory_free_mb,
                    temperature_celsius, power_usage_watts,
                    sm_clock_mhz, mem_clock_mhz,
                    xid_errors, ecc_sbe, ecc_dbe, pcie_replay, power_violation, thermal_violation
                FROM gpu_metrics
                ORDER BY gpu_index, collected_at DESC
            """)
            return fetchall_as_dict(cur)


@router.get("/history")
def get_gpu_history(
    hours:     float        = Query(default=1),
    gpu_index: int          = Query(default=0),
    host_ip:   str | None   = Query(default=None),
):
    end   = datetime.now(timezone.utc)
    start = end - timedelta(hours=hours)
    with get_conn() as conn:
        with conn.cursor() as cur:
            if host_ip:
                cur.execute("""
                    SELECT collected_at, gpu_index,
                        gpu_utilization, memory_used_mb, memory_free_mb,
                        temperature_celsius, power_usage_watts,
                        sm_clock_mhz, mem_clock_mhz,
                        xid_errors, ecc_sbe, ecc_dbe, pcie_replay, power_violation, thermal_violation
                    FROM gpu_metrics
                    WHERE host_ip = %s AND gpu_index = %s
                      AND collected_at BETWEEN %s AND %s
                    ORDER BY collected_at ASC
                """, (host_ip, gpu_index, start, end))
            else:
                cur.execute("""
                    SELECT collected_at, gpu_index,
                        gpu_utilization, memory_used_mb, memory_free_mb,
                        temperature_celsius, power_usage_watts,
                        sm_clock_mhz, mem_clock_mhz,
                        xid_errors, ecc_sbe, ecc_dbe, pcie_replay, power_violation, thermal_violation
                    FROM gpu_metrics
                    WHERE gpu_index = %s
                      AND collected_at BETWEEN %s AND %s
                    ORDER BY collected_at ASC
                """, (gpu_index, start, end))
            return fetchall_as_dict(cur)


@router.get("/indexes")
def get_gpu_indexes():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT gpu_index, model_name FROM gpu_metrics ORDER BY gpu_index")
            return fetchall_as_dict(cur)


@router.get("/sensor/{host_ip:path}")
def get_gpu_sensor_history(
    host_ip:     str,
    sensor_name: str   = Query(...),  # e.g., "0_utilization"
    hours:       float = Query(default=1),
):
    """GPU 개별 센서 (metric) 이력 조회. sensor_name = {gpu_index}_{metric}"""
    parts = sensor_name.split('_', 1)
    if len(parts) != 2:
        raise HTTPException(400, detail="sensor_name은 {gpu_index}_{metric} 형식이어야 합니다.")
    try:
        gpu_idx = int(parts[0])
    except ValueError:
        raise HTTPException(400, detail="gpu_index는 정수여야 합니다.")
    metric = parts[1]

    cols = METRIC_COLUMNS.get(metric)
    if not cols:
        raise HTTPException(400, detail=f"알 수 없는 metric: {metric}")

    end   = datetime.now(timezone.utc)
    start = end - timedelta(hours=hours)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT collected_at, {cols}
                FROM gpu_metrics
                WHERE host_ip = %s AND gpu_index = %s
                  AND collected_at BETWEEN %s AND %s
                ORDER BY collected_at ASC
            """, (host_ip, gpu_idx, start, end))
            return fetchall_as_dict(cur)
