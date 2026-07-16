"""本番VMのリソース防御設定を退行させない静的テスト。"""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_systemd_runs_as_dedicated_user_with_resource_and_fs_limits():
    setup = (ROOT / "deploy" / "vm_setup.sh").read_text(encoding="utf-8")

    for directive in (
        "User=doslhub",
        "Group=doslhub",
        "MemoryMax=",
        "CPUQuota=",
        "ProtectSystem=strict",
        "ReadWritePaths=/opt/dosl-hub/data",
        "NoNewPrivileges=true",
    ):
        assert directive in setup
    assert "User=root" not in setup


def test_caddy_rejects_oversize_request_bodies_before_proxying():
    setup = (ROOT / "deploy" / "vm_setup.sh").read_text(encoding="utf-8")
    assert "request_body" in setup
    assert "max_size 64MB" in setup


def test_backup_service_uses_same_unprivileged_account():
    service = (ROOT / "deploy" / "dosl-hub-backup.service").read_text(
        encoding="utf-8"
    )
    assert "User=doslhub" in service
    assert "Group=doslhub" in service
    assert "User=root" not in service
    assert "ProtectSystem=strict" in service
