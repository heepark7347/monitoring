from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Query
from ..database import get_conn, fetchall_as_dict

router = APIRouter()


@router.get("/latest")
def get_gpu_latest():
    """GPU별 최신 메트릭"""
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
    start: datetime = Query(default=None),
    end:   datetime = Query(default=None),
    gpu_index: int  = Query(default=0),
):
    """GPU 시계열 히스토리 (기본 최근 1시간)"""
    now = datetime.now(timezone.utc)
    if end   is None: end   = now
    if start is None: start = now - timedelta(hours=1)

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
    """수집 중인 GPU 인덱스 목록"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT gpu_index, model_name
                FROM gpu_metrics
                ORDER BY gpu_index
            """)
            return fetchall_as_dict(cur)
