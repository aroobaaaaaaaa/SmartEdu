# app/database/db.py
"""
Database connection setup using SQLAlchemy.
This module creates the 'engine' (connection to PostgreSQL) and
provides a session factory that routes use to talk to the database.
"""
# app/database/db.py
"""
Database connection setup using SQLAlchemy.
This module creates the 'engine' (connection to PostgreSQL) and
provides a session factory that routes use to talk to the database.
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

# The engine manages the actual connection pool to PostgreSQL
engine = create_engine(settings.DATABASE_URL)

# SessionLocal is a factory — calling SessionLocal() gives you a new
# database session (a "conversation" with the database for one request)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base is what all our ORM models will inherit from
Base = declarative_base()

def get_db():
    """
    Dependency function used in FastAPI routes via Depends(get_db).
    Creates a session, gives it to the route, then ALWAYS closes it
    afterward — even if the route raises an exception.
    This pattern prevents connection leaks.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

# The engine manages the actual connection pool to PostgreSQL
engine = create_engine(settings.DATABASE_URL)

# SessionLocal is a factory — calling SessionLocal() gives you a new
# database session (a "conversation" with the database for one request)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base is what all our ORM models will inherit from
Base = declarative_base()

def get_db():
    """
    Dependency function used in FastAPI routes via Depends(get_db).
    Creates a session, gives it to the route, then ALWAYS closes it
    afterward — even if the route raises an exception.
    This pattern prevents connection leaks.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()