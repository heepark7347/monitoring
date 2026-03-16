from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import gpu, node, network, disk, dashboard, devices, settings
from .database import get_conn


PRESET_HOST = "183.111.14.6"
GPU_METRIC_SUFFIXES = ['utilization', 'memory', 'temperature', 'power', 'health', 'clock']


def _init_tables():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS sensor_pauses (
                    sensor_key  TEXT PRIMARY KEY,
                    paused_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS registered_devices (
                    id           SERIAL PRIMARY KEY,
                    host_ip      VARCHAR(50) UNIQUE NOT NULL,
                    display_name VARCHAR(100) NOT NULL DEFAULT '',
                    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS sensor_configs (
                    id           SERIAL PRIMARY KEY,
                    host_ip      VARCHAR(50)  NOT NULL,
                    sensor_type  VARCHAR(20)  NOT NULL,
                    sensor_name  VARCHAR(255) NOT NULL,
                    enabled      BOOLEAN      NOT NULL DEFAULT TRUE,
                    display_name VARCHAR(100),
                    UNIQUE(host_ip, sensor_type, sensor_name)
                );

                CREATE TABLE IF NOT EXISTS connectivity_metrics (
                    id           BIGSERIAL PRIMARY KEY,
                    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    host_ip      VARCHAR(50)  NOT NULL,
                    sensor_type  VARCHAR(20)  NOT NULL,
                    sensor_name  VARCHAR(255) NOT NULL,
                    is_reachable BOOLEAN      NOT NULL,
                    latency_ms   FLOAT,
                    error_msg    TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_conn_metrics_time
                    ON connectivity_metrics(collected_at DESC);
                CREATE INDEX IF NOT EXISTS idx_conn_metrics_host
                    ON connectivity_metrics(host_ip, sensor_type, sensor_name);
            """)
        conn.commit()


def _migrate_gpu_sensors():
    """GPU sensor_name='0' (old) → '0_utilization', '0_memory', ... (new 6-per-index format)"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, host_ip, sensor_name, enabled
                FROM sensor_configs
                WHERE sensor_type = 'gpu'
                  AND sensor_name ~ '^[0-9]+$'
            """)
            old_rows = cur.fetchall()
            if not old_rows:
                return

            for (old_id, host_ip, gpu_idx, enabled) in old_rows:
                for suffix in GPU_METRIC_SUFFIXES:
                    cur.execute("""
                        INSERT INTO sensor_configs (host_ip, sensor_type, sensor_name, enabled)
                        VALUES (%s, 'gpu', %s, %s)
                        ON CONFLICT (host_ip, sensor_type, sensor_name) DO NOTHING
                    """, (host_ip, f"{gpu_idx}_{suffix}", enabled))
                cur.execute("DELETE FROM sensor_configs WHERE id = %s", (old_id,))
        conn.commit()


def _seed_preset():
    """183.111.14.6을 등록 장비로 사전 등록 (최초 1회, 센서는 사용자가 직접 추가)"""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO registered_devices (host_ip, display_name) VALUES (%s, %s)"
                " ON CONFLICT DO NOTHING",
                (PRESET_HOST, "")
            )
        conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_tables()
    _seed_preset()
    _migrate_gpu_sensors()
    yield


app = FastAPI(title="CONB Monitoring API", version="1.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)

app.include_router(gpu.router,       prefix="/api/gpu",       tags=["GPU"])
app.include_router(node.router,      prefix="/api/node",      tags=["Node"])
app.include_router(network.router,   prefix="/api/network",   tags=["Network"])
app.include_router(disk.router,      prefix="/api/disk",      tags=["Disk"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(devices.router,   prefix="/api/devices",   tags=["Devices"])
app.include_router(settings.router,  prefix="/api/settings",  tags=["Settings"])


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.2.0"}
