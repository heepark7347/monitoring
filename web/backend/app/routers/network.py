from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Query
from ..database import get_conn, fetchall_as_dict

router = APIRouter()


@router.get("/interfaces")
def get_interfaces():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT if_descr, BOOL_OR(if_oper_status = 1) AS is_up
                FROM snmp_interface_metrics
                GROUP BY if_descr ORDER BY if_descr
            """)
            return fetchall_as_dict(cur)


@router.get("/latest")
def get_network_latest():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT ON (host_ip, if_descr)
                    collected_at, host_ip, if_descr,
                    if_oper_status, if_speed_mbps,
                    if_in_octets_rate, if_out_octets_rate,
                    if_in_ucast_pkts_rate, if_out_ucast_pkts_rate,
                    if_in_errors_rate, if_out_errors_rate,
                    if_in_discards_rate, if_out_discards_rate
                FROM snmp_interface_metrics
                ORDER BY host_ip, if_descr, collected_at DESC
            """)
            return fetchall_as_dict(cur)


@router.get("/history")
def get_network_history(
    hours:     float = Query(default=1),
    interface: str   = Query(default="ens10f0"),
):
    end   = datetime.now(timezone.utc)
    start = end - timedelta(hours=hours)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT collected_at, host_ip, if_descr,
                    if_oper_status,
                    if_in_octets_rate, if_out_octets_rate,
                    if_in_ucast_pkts_rate, if_out_ucast_pkts_rate,
                    if_in_errors_rate, if_out_errors_rate,
                    if_in_discards_rate, if_out_discards_rate
                FROM snmp_interface_metrics
                WHERE if_descr = %s AND collected_at BETWEEN %s AND %s
                ORDER BY collected_at ASC
            """, (interface, start, end))
            return fetchall_as_dict(cur)
