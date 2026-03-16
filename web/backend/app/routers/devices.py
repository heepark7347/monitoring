from fastapi import APIRouter
from ..database import get_conn, fetchall_as_dict

router = APIRouter()


@router.get("")
def get_devices():
    """등록된 디바이스 및 활성화된 센서 타입 반환"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT rd.host_ip, rd.display_name,
                       sc.sensor_type
                FROM registered_devices rd
                LEFT JOIN sensor_configs sc
                       ON sc.host_ip = rd.host_ip AND sc.enabled = true
                ORDER BY rd.created_at, sc.sensor_type
            """)
            rows = fetchall_as_dict(cur)

    devices: dict[str, dict] = {}
    for r in rows:
        ip = r['host_ip']
        if ip not in devices:
            devices[ip] = {
                'host_ip':      ip,
                'display_name': r['display_name'],
                'sensor_types': [],
            }
        if r['sensor_type']:
            devices[ip]['sensor_types'].append(r['sensor_type'])

    # 중복 제거
    for d in devices.values():
        d['sensor_types'] = list(dict.fromkeys(d['sensor_types']))

    return list(devices.values())
