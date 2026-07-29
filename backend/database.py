from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Update the password/host/db name to match your local PostgreSQL setup
DATABASE_URL = "postgresql+psycopg://neondb_owner:npg_adyNWGgQ3TY9@ep-lingering-waterfall-ayc6dyy8-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
# DATABASE_URL = "postgresql://postgres:harshvardhan@localhost:5432/inventory_db"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency: yields a DB session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
