from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Query
from ..database import get_conn, fetchall_as_dict

router = APIRouter()


@router.get("/latest")
def get_gpu_latest():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT ON (gpu_index)
                    collected_at, host_ip, gpu_index, gpu_uuid, model_name,
                    gpu_utilization, memory_used_mb, memory_free_mb,
                    temperature_celsius, power_usage_watts,
                    sm_clock_mhz, mem_clock_mhz
                FROM gpu_metrics
                ORDER BY gpu_index, collected_at DESC
            """)
            return fetchall_as_dict(cur)


@router.get("/history")
def get_gpu_history(
    hours:     float = Query(default=1),
    gpu_index: int   = Query(default=0),
):
    end   = datetime.now(timezone.utc)
    start = end - timedelta(hours=hours)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT collected_at, gpu_index,
                    gpu_utilization, memory_used_mb, memory_free_mb,
                    temperature_celsius, power_usage_watts,
                    sm_clock_mhz, mem_clock_mhz
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
