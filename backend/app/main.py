from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.auth.routes import router as auth_router
from app.devices.routes import router as devices_router
from app.access.routes import router as access_router
from app.devices.vulnerability_routes import router as vulnerability_router
from app.access.google_drive_routes import router as google_drive_router
from app.db import connect_to_mongo, close_mongo_connection
import logging
from app.agent.routes import router as agent_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)

app = FastAPI(title="Zero Trust Security Management System")

# CORS settings
origins = [
    "http://localhost:3000",  # Frontend React
    "http://localhost:8000",  # Backend for dev
    "http://127.0.0.1:8000",  # Another backend for dev
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_db_client():
    await connect_to_mongo()
    routes = []
    for route in app.routes:
        routes.append(f"{route.path} [{', '.join(route.methods)}]")
    logger.info(f"Registered routes: {routes}")

@app.on_event("shutdown")
async def shutdown_db_client():
    await close_mongo_connection()

logger.info("Including auth router")
app.include_router(auth_router)

logger.info("Including devices router")
app.include_router(devices_router)

logger.info("Including access router")
app.include_router(access_router)

logger.info("Including vulnerability router")
app.include_router(vulnerability_router)

logger.info("Including Google Drive router")
app.include_router(google_drive_router)

logger.info("Including agent router")
app.include_router(agent_router)

@app.get("/")
async def root():
    routes = []
    for route in app.routes:
        routes.append(f"{route.path} [{', '.join(route.methods)}]")
    
    return {
        "message": "Zero Trust Security Management System API",
        "routes": routes
    }