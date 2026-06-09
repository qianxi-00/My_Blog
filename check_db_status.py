import asyncio
import sys
import os

# 将后端目录添加到路径
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if os.path.exists(BACKEND_DIR):
    sys.path.insert(0, BACKEND_DIR)

from app.core.database import async_session_maker
from app.models.article import Article, Tag
from sqlalchemy import select

async def check_db():
    async with async_session_maker() as db:
        result = await db.execute(select(Article))
        articles = result.scalars().all()
        print(f"Total articles found: {len(articles)}")
        for a in articles:
            print(f"ID: {a.id}, Title: {a.title}, Status: {a.status}, Slug: {a.slug}")
        
        result = await db.execute(select(Tag))
        tags = result.scalars().all()
        print(f"Total tags found: {len(tags)}")
        for t in tags:
            print(f"ID: {t.id}, Name: {t.name}")

if __name__ == "__main__":
    asyncio.run(check_db())
