"""展示会・組織境界の認可回帰テスト。"""

from datetime import date

import pytest
from fastapi import HTTPException

from app.api.documents import _resolve_booth
from app.api.exhibitions import list_exhibitions
from app.core.authorization import can_access_exhibition
from app.core.database import Base, async_session, engine
from app.models.booth import Booth
from app.models.exhibition import Exhibition
from app.models.organization import Organization
from app.models.submission_category import SubmissionCategory
from app.models.user import User


@pytest.fixture()
async def access_matrix():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)

    async with async_session() as database:
        organizer_a = Organization(name="主催A", org_type="organizer")
        organizer_b = Organization(name="主催B", org_type="organizer")
        exhibitor_a = Organization(name="出展A", org_type="exhibitor")
        exhibitor_b = Organization(name="出展B", org_type="exhibitor")
        partner_a = Organization(name="協力A", org_type="partner")
        database.add_all(
            [organizer_a, organizer_b, exhibitor_a, exhibitor_b, partner_a]
        )
        await database.flush()

        exhibition_a = Exhibition(
            name="展示会A",
            venue="会場A",
            start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 2),
            organizer_id=organizer_a.id,
        )
        exhibition_b = Exhibition(
            name="展示会B",
            venue="会場B",
            start_date=date(2026, 10, 1),
            end_date=date(2026, 10, 2),
            organizer_id=organizer_b.id,
        )
        database.add_all([exhibition_a, exhibition_b])
        await database.flush()
        booth_a = Booth(
            exhibition_id=exhibition_a.id,
            booth_number="A-01",
            exhibitor_id=exhibitor_a.id,
            status="assigned",
        )
        database.add(booth_a)
        database.add(
            SubmissionCategory(
                exhibition_id=exhibition_a.id,
                name="設営図面",
                recipient_org_id=partner_a.id,
            )
        )

        def user(org, role, email):
            return User(
                organization_id=org.id,
                email=email,
                name=email,
                hashed_password="x",
                role=role,
            )

        users = {
            "admin": user(organizer_a, "admin", "admin@example.com"),
            "organizer_a": user(
                organizer_a, "organizer", "organizer-a@example.com"
            ),
            "organizer_b": user(
                organizer_b, "organizer", "organizer-b@example.com"
            ),
            "viewer_a": user(organizer_a, "viewer", "viewer-a@example.com"),
            "exhibitor_a": user(
                exhibitor_a, "exhibitor", "exhibitor-a@example.com"
            ),
            "exhibitor_b": user(
                exhibitor_b, "exhibitor", "exhibitor-b@example.com"
            ),
            "partner_a": user(partner_a, "partner", "partner-a@example.com"),
        }
        database.add_all(users.values())
        await database.commit()
        return {
            "exhibition_a": exhibition_a.id,
            "exhibition_b": exhibition_b.id,
            "booth_a": booth_a.id,
            "users": users,
        }


async def test_exhibition_access_is_limited_by_role_and_relationship(access_matrix):
    a = access_matrix["exhibition_a"]
    b = access_matrix["exhibition_b"]
    users = access_matrix["users"]

    async with async_session() as database:
        assert await can_access_exhibition(database, users["admin"], a)
        assert await can_access_exhibition(database, users["admin"], b)
        assert await can_access_exhibition(database, users["organizer_a"], a)
        assert not await can_access_exhibition(database, users["organizer_a"], b)
        assert await can_access_exhibition(database, users["viewer_a"], a)
        assert not await can_access_exhibition(database, users["viewer_a"], b)
        assert await can_access_exhibition(database, users["exhibitor_a"], a)
        assert not await can_access_exhibition(database, users["exhibitor_a"], b)
        assert not await can_access_exhibition(database, users["exhibitor_b"], a)
        assert await can_access_exhibition(database, users["partner_a"], a)
        assert not await can_access_exhibition(database, users["partner_a"], b)


async def test_write_access_excludes_viewer_exhibitor_and_partner(access_matrix):
    exhibition_id = access_matrix["exhibition_a"]
    users = access_matrix["users"]

    async with async_session() as database:
        assert await can_access_exhibition(
            database, users["admin"], exhibition_id, write=True
        )
        assert await can_access_exhibition(
            database, users["organizer_a"], exhibition_id, write=True
        )
        for role in ("viewer_a", "exhibitor_a", "partner_a"):
            assert not await can_access_exhibition(
                database, users[role], exhibition_id, write=True
            )


async def test_exhibition_list_does_not_leak_other_organizations(access_matrix):
    users = access_matrix["users"]
    async with async_session() as database:
        organizer_result = await list_exhibitions(users["organizer_a"], database)
        exhibitor_result = await list_exhibitions(users["exhibitor_a"], database)
        unassigned_result = await list_exhibitions(users["exhibitor_b"], database)

    assert [item.id for item in organizer_result] == [access_matrix["exhibition_a"]]
    assert [item.id for item in exhibitor_result] == [access_matrix["exhibition_a"]]
    assert unassigned_result == []


async def test_explicit_booth_id_must_belong_to_exhibitor(access_matrix):
    users = access_matrix["users"]
    exhibition_id = access_matrix["exhibition_a"]
    booth_id = access_matrix["booth_a"]
    async with async_session() as database:
        assert await _resolve_booth(
            database, exhibition_id, booth_id, users["exhibitor_a"]
        ) == booth_id
        with pytest.raises(HTTPException) as error:
            await _resolve_booth(
                database, exhibition_id, booth_id, users["exhibitor_b"]
            )
    assert error.value.status_code == 404
