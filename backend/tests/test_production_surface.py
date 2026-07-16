"""本番で不要なフレームワーク管理面を閉じる回帰テスト。"""

from app.main import app


def test_api_documentation_is_disabled_by_default():
    assert app.docs_url is None
    assert app.redoc_url is None
    assert app.openapi_url is None

