from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import gpu, node, network, disk

app = FastAPI(title="GPU Monitoring API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(gpu.router,     prefix="/api/gpu",     tags=["GPU"])
app.include_router(node.router,    prefix="/api/node",    tags=["Node"])
app.include_router(network.router, prefix="/api/network", tags=["Network"])
app.include_router(disk.router,    prefix="/api/disk",    tags=["Disk"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
