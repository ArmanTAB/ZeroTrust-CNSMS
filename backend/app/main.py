# backend/app/main.py
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.auth.routes import router as auth_router
from app.devices.routes import router as devices_router
from app.access.routes import router as access_router
from app.devices.vulnerability_routes import router as vulnerability_router
from app.db import connect_to_mongo, close_mongo_connection
import logging

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

app = FastAPI(title="Zero Trust Security Management System")

# CORS настройки
origins = [
    "http://localhost:3000",  # Фронтенд React
    "http://localhost:8000",  # Бэкенд для разработки
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# События запуска и остановки
@app.on_event("startup")
async def startup_db_client():
    await connect_to_mongo()

@app.on_event("shutdown")
async def shutdown_db_client():
    await close_mongo_connection()

# Маршруты
app.include_router(auth_router)
app.include_router(devices_router)
app.include_router(access_router)
app.include_router(vulnerability_router)  # Добавляем маршруты для уязвимостей

@app.get("/")
async def root():
    return {"message": "Zero Trust Security Management System API"}