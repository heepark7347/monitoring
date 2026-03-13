from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Query
from ..database import get_conn, fetchall_as_dict

router = APIRouter()


@router.get("/latest")
def get_node_latest():
    """Node Exporter 최신 시스템 메트릭"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT ON (host_ip)
                    collected_at, host_ip,
                    cpu_usage_percent,
                    memory_total_bytes, memory_available_bytes, memory_usage_percent,
                    load_1m, load_5m, load_15m,
                    net_receive_bytes, net_transmit_bytes,
                    uptime_seconds
                FROM node_metrics
                ORDER BY host_ip, collected_at DESC
            """)
            return fetchall_as_dict(cur)


@router.get("/history")
def get_node_history(
    start: datetime = Query(default=None),
    end:   datetime = Query(default=None),
):
    now = datetime.now(timezone.utc)
    if end   is None: end   = now
    if start is None: start = now - timedelta(hours=1)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT collected_at, host_ip,
                    cpu_usage_percent,
                    memory_total_bytes, memory_available_bytes, memory_usage_percent,
                    load_1m, load_5m, load_15m,
                    net_receive_bytes, net_transmit_bytes,
                    uptime_seconds
                FROM node_metrics
                WHERE collected_at BETWEEN %s AND %s
                ORDER BY collected_at ASC
            """, (start, end))
            return fetchall_as_dict(cur)


@router.get("/snmp/latest")
def get_snmp_system_latest():
    """SNMP linux_base 최신 시스템 메트릭"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT ON (host_ip)
                    collected_at, host_ip,
                    uptime_seconds,
                    cpu_user_pct, cpu_system_pct, cpu_idle_pct,
                    mem_total_kb, mem_avail_kb, mem_buffer_kb, mem_cached_kb,
                    mem_swap_total_kb, mem_swap_avail_kb,
                    load_1m, load_5m, load_15m
                FROM snmp_system_metrics
                ORDER BY host_ip, collected_at DESC
            """)
            return fetchall_as_dict(cur)


@router.get("/snmp/history")
def get_snmp_system_history(
    start: datetime = Query(default=None),
    end:   datetime = Query(default=None),
):
    now = datetime.now(timezone.utc)
    if end   is None: end   = now
    if start is None: start = now - timedelta(hours=1)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT collected_at, host_ip,
                    uptime_seconds,
                    cpu_user_pct, cpu_system_pct, cpu_idle_pct,
                    mem_total_kb, mem_avail_kb, mem_buffer_kb, mem_cached_kb,
                    mem_swap_total_kb, mem_swap_avail_kb,
                    load_1m, load_5m, load_15m
                FROM snmp_system_metrics
                WHERE collected_at BETWEEN %s AND %s
                ORDER BY collected_at ASC
            """, (start, end))
            return fetchall_as_dict(cur)
