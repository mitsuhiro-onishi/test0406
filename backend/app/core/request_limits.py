"""ASGI入口でContent-Lengthを検査し、multipart解析前に巨大要求を拒否する。"""

import json


class RequestBodyLimitMiddleware:
    def __init__(self, app, max_body_size: int):
        self.app = app
        self.max_body_size = max_body_size

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            headers = {key.lower(): value for key, value in scope.get("headers", [])}
            value = headers.get(b"content-length")
            try:
                content_length = int(value) if value is not None else None
            except ValueError:
                content_length = None
            if content_length is not None and content_length > self.max_body_size:
                body = json.dumps(
                    {"detail": "リクエスト全体のサイズ上限を超えています"},
                    ensure_ascii=False,
                ).encode()
                await send(
                    {
                        "type": "http.response.start",
                        "status": 413,
                        "headers": [
                            (b"content-type", b"application/json; charset=utf-8"),
                            (b"content-length", str(len(body)).encode()),
                        ],
                    }
                )
                await send({"type": "http.response.body", "body": body})
                return
        await self.app(scope, receive, send)
