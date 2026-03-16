from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import gpu, node, network, disk, dashboard, devices, settings
from .database import get_conn


PRESET_HOST = "183.111.14.6"


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
            """)
        conn.commit()


def _seed_preset():
    """183.111.14.6을 등록 장비로 사전 등록 (최초 1회)"""
    from .routers.settings import _discover_sensors
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO registered_devices (host_ip, display_name) VALUES (%s, %s)"
                " ON CONFLICT DO NOTHING",
                (PRESET_HOST, "")
            )
        conn.commit()
    _discover_sensors(PRESET_HOST)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_tables()
    _seed_preset()
    yield


app = FastAPI(title="CONB Monitoring API", version="1.1.0", lifespan=lifespan)

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
    return {"status": "ok"}
