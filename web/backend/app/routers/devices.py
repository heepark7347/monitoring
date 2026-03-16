from fastapi import APIRouter, HTTPException
from ..database import get_conn, fetchall_as_dict

router = APIRouter()


@router.get("")
def get_devices():
    """등록된 디바이스 및 활성화된 센서 타입 반환"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT rd.id, rd.host_ip, rd.display_name,
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
                'id':           r['id'],
                'host_ip':      ip,
                'display_name': r['display_name'],
                'sensor_types': [],
            }
        if r['sensor_type']:
            devices[ip]['sensor_types'].append(r['sensor_type'])

    for d in devices.values():
        d['sensor_types'] = list(dict.fromkeys(d['sensor_types']))

    return list(devices.values())


@router.get("/{device_id}")
def get_device(device_id: int):
    """ID로 장비 정보 조회"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, host_ip, display_name, created_at FROM registered_devices WHERE id = %s",
                (device_id,)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, detail="장비를 찾을 수 없습니다.")
            cols = [d[0] for d in cur.description]
            return dict(zip(cols, row))
