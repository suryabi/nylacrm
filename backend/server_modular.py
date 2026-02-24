"""
Sales CRM Backend - Modular Architecture
=========================================

This is the refactored entry point that imports route modules.
The original monolithic server.py is preserved as server_backup.py.

Architecture:
- database.py: MongoDB connection
- config.py: Environment configuration
- deps.py: Authentication dependencies
- utils.py: Shared utility functions
- models/: Pydantic models organized by domain
- routes/: APIRouter modules organized by domain

Route Modules (gradual migration):
- routes/auth.py: Authentication (login, register, OAuth)
- routes/master_data.py: SKUs, Locations, Categories
- More modules to be added incrementally...
"""

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Database connection
from database import db, client

# Create the main app
app = FastAPI(
    title="Nyla Sales CRM API",
    description="Sales CRM Backend API",
    version="2.0.0"
)

# Main API router with /api prefix
api_router = APIRouter(prefix="/api")

# Import route modules
from routes.auth import router as auth_router
from routes.master_data import router as master_data_router

# Include modular routes
api_router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
api_router.include_router(master_data_router, tags=["Master Data"])

# Include the main router
app.include_router(api_router)

# CORS configuration
cors_origins_env = os.environ.get('CORS_ORIGINS', '')
default_origins = [
    'https://crm.nylaairwater.earth',
    'https://pipeline-master-14.emergent.host',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
]

if cors_origins_env and cors_origins_env != '*':
    cors_origins = [origin.strip() for origin in cors_origins_env.split(',')]
else:
    cors_origins = default_origins

preview_url = os.environ.get('REACT_APP_BACKEND_URL', '')
if preview_url and preview_url not in cors_origins:
    from urllib.parse import urlparse
    parsed = urlparse(preview_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin not in cors_origins:
        cors_origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ActiveMQ globals
MQ_AVAILABLE = False
mq_subscriber = None
start_mq_subscriber = None
stop_mq_subscriber = None

try:
    from mq_subscriber import start_mq_subscriber as _start_mq, stop_mq_subscriber as _stop_mq, mq_subscriber as _mq_sub
    MQ_AVAILABLE = True
    mq_subscriber = _mq_sub
    start_mq_subscriber = _start_mq
    stop_mq_subscriber = _stop_mq
except ImportError as e:
    logger.warning(f"ActiveMQ subscriber not available: {e}")

@app.on_event("startup")
async def startup_event():
    """Start ActiveMQ subscriber on app startup"""
    global MQ_AVAILABLE
    if MQ_AVAILABLE and start_mq_subscriber:
        try:
            start_mq_subscriber()
            logger.info("ActiveMQ subscriber started")
        except Exception as e:
            logger.error(f"Failed to start ActiveMQ subscriber: {e}")
            MQ_AVAILABLE = False

@app.on_event("shutdown")
async def shutdown_db_client():
    if MQ_AVAILABLE and stop_mq_subscriber:
        try:
            stop_mq_subscriber()
            logger.info("ActiveMQ subscriber stopped")
        except Exception as e:
            logger.error(f"Error stopping ActiveMQ subscriber: {e}")
    client.close()

# Health check
@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "version": "2.0.0"}
