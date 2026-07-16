"""ブラウザ側の保存型XSS・認証情報保存に対する回帰テスト。"""

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


WEB_ROOT = Path(__file__).resolve().parents[2] / "web"


def _read(name: str) -> str:
    return (WEB_ROOT / name).read_text(encoding="utf-8")


def test_html_has_no_inline_script_or_event_handlers():
    """CSPでインラインJavaScriptを禁止できる構造を維持する。"""
    for name in ("login.html", "index.html", "admin.html", "apply.html"):
        html = _read(name)
        assert "onclick=" not in html, name
        assert "<script>" not in html, name


def test_malicious_filename_is_never_embedded_in_javascript_handler():
    """ファイル名はDOMのtextContent/propertyとイベントクロージャだけで扱う。"""
    admin = _read("admin.js")
    dangerous_patterns = (
        "onclick=\"downloadDoc",
        "onclick='downloadDoc",
        "setAttribute('onclick'",
        'setAttribute("onclick"',
        ".onclick =",
    )
    for pattern in dangerous_patterns:
        assert pattern not in admin

    assert "fileNameCell.textContent = doc.file_name" in admin
    assert "downloadDoc(doc.id, doc.file_name)" in admin


def test_jwt_is_not_available_to_javascript_storage():
    app = _read("app.js")
    login = _read("login.js")
    combined = app + login

    assert "doslhub_token" not in combined
    assert "access_token" not in combined
    assert "Authorization" not in combined
    assert "getToken" not in combined


def test_pages_load_only_same_origin_javascript():
    for name in ("login.html", "index.html", "admin.html", "apply.html"):
        html = _read(name)
        assert 'src="app.js?' in html
        assert "https://" not in "\n".join(
            line for line in html.splitlines() if "<script" in line
        )


def test_security_headers_block_inline_script_and_framing():
    with TestClient(app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    csp = response.headers["content-security-policy"]
    assert "script-src 'self'" in csp
    assert "script-src 'self' 'unsafe-inline'" not in csp
    assert "object-src 'none'" in csp
    assert "frame-ancestors 'none'" in csp
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "max-age=" in response.headers["strict-transport-security"]
