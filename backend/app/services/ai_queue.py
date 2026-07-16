"""AI解析を単一プロセス内でキュー化し、同時実行数を固定する。"""

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable, Hashable

from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session
from app.models.document import Document

logger = logging.getLogger("ai_queue")


class AIJobQueue:
    def __init__(
        self,
        *,
        worker: Callable[[Hashable], Awaitable[None]],
        concurrency: int,
        recoverer: Callable[[], Awaitable[list[Hashable]]] | None = None,
    ):
        if concurrency < 1:
            raise ValueError("AI queue concurrency must be at least 1")
        self._worker = worker
        self._concurrency = concurrency
        self._recoverer = recoverer
        self._queue: asyncio.Queue[Hashable] = asyncio.Queue()
        self._pending: set[Hashable] = set()
        self._tasks: list[asyncio.Task] = []

    async def start(self, *, recover: bool = True) -> None:
        if self._tasks:
            return
        self._tasks = [
            asyncio.create_task(self._run_worker(), name=f"doslhub-ai-{index}")
            for index in range(self._concurrency)
        ]
        if recover and self._recoverer:
            for job in await self._recoverer():
                await self.enqueue(job)

    async def stop(self) -> None:
        tasks, self._tasks = self._tasks, []
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def enqueue(self, job: Hashable) -> bool:
        if job in self._pending:
            return False
        self._pending.add(job)
        await self._queue.put(job)
        return True

    async def join(self) -> None:
        await self._queue.join()

    async def _run_worker(self) -> None:
        while True:
            job = await self._queue.get()
            try:
                await self._worker(job)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("AI queue worker failed: %s", job)
            finally:
                self._pending.discard(job)
                self._queue.task_done()


async def _analyze(job: Hashable) -> None:
    from app.services.ai_analyzer import analyze_document

    await analyze_document(uuid.UUID(str(job)))


async def _recover_pending() -> list[uuid.UUID]:
    async with async_session() as db:
        documents = (
            await db.execute(
                select(Document).where(Document.status.in_(("received", "processing")))
            )
        ).scalars().all()
        for document in documents:
            document.status = "received"
        await db.commit()
        return [document.id for document in documents]


analysis_queue = AIJobQueue(
    worker=_analyze,
    concurrency=settings.ai_max_concurrency,
    recoverer=_recover_pending,
)


async def start_ai_queue() -> None:
    await analysis_queue.start()


async def stop_ai_queue() -> None:
    await analysis_queue.stop()


async def enqueue_analysis(document_id: uuid.UUID) -> bool:
    return await analysis_queue.enqueue(document_id)
