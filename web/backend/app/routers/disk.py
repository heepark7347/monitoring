from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Query
from ..database import get_conn, fetchall_as_dict

router = APIRouter()


@router.get("/latest")
def get_disk_latest():
    """파티션별 최신 디스크 사용량"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT ON (host_ip, mountpoint)
                    collected_at, host_ip, mountpoint, device, fstype,
                    total_bytes, avail_bytes, usage_percent
                FROM disk_metrics
                ORDER BY host_ip, mountpoint, collected_at DESC
            """)
            return fetchall_as_dict(cur)


@router.get("/history")
def get_disk_history(
    start:      datetime = Query(default=None),
    end:        datetime = Query(default=None),
    mountpoint: str      = Query(default="/"),
):
    now = datetime.now(timezone.utc)
    if end   is None: end   = now
    if start is None: start = now - timedelta(hours=1)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT collected_at, host_ip, mountpoint,
                    total_bytes, avail_bytes, usage_percent
                FROM disk_metrics
                WHERE mountpoint = %s
                  AND collected_at BETWEEN %s AND %s
                ORDER BY collected_at ASC
            """, (mountpoint, start, end))
            return fetchall_as_dict(cur)


@router.get("/mountpoints")
def get_mountpoints():
    """수집 중인 마운트포인트 목록"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT mountpoint, device, fstype
                FROM disk_metrics
                ORDER BY mountpoint
            """)
            return fetchall_as_dict(cur)
