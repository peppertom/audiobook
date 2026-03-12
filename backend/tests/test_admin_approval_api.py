import pytest
from sqlalchemy import select

from app.models import User
from app.routers.auth_routes import hash_password


async def register_user(client, email: str, password: str = "secret123", name: str = "User"):
    return await client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "name": name},
    )


async def login_user(client, email: str, password: str = "secret123"):
    return await client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )


@pytest.mark.asyncio
async def test_unapproved_user_cannot_login_or_access_profile(client):
    register_res = await register_user(client, "pending@example.com")
    assert register_res.status_code == 201

    login_res = await login_user(client, "pending@example.com")
    assert login_res.status_code == 403
    assert login_res.json()["detail"] == "Account pending admin approval"

    token = register_res.json()["access_token"]
    profile_res = await client.get(
        "/api/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert profile_res.status_code == 403
    assert profile_res.json()["detail"] == "Account pending admin approval"


@pytest.mark.asyncio
async def test_admin_can_approve_pending_user_and_user_can_login_after(client, db_session):
    # Seed admin user directly in DB
    admin = User(
        email="admin@example.com",
        password_hash=hash_password("adminpass"),
        name="Admin",
        is_admin=True,
        is_approved=True,
    )
    db_session.add(admin)
    await db_session.commit()

    pending_res = await register_user(client, "newuser@example.com")
    assert pending_res.status_code == 201
    pending_user_id = pending_res.json()["user"]["id"]

    admin_login = await login_user(client, "admin@example.com", "adminpass")
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]

    pending_list = await client.get(
        "/api/admin/pending-users",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert pending_list.status_code == 200
    pending_ids = {u["id"] for u in pending_list.json()}
    assert pending_user_id in pending_ids

    approve_res = await client.post(
        f"/api/admin/users/{pending_user_id}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert approve_res.status_code == 200
    body = approve_res.json()
    assert body["is_approved"] is True
    assert body["approved_by_user_id"] == admin.id

    login_res = await login_user(client, "newuser@example.com")
    assert login_res.status_code == 200


@pytest.mark.asyncio
async def test_non_admin_cannot_access_admin_endpoints(client, db_session):
    approved_user = User(
        email="approved@example.com",
        password_hash=hash_password("userpass"),
        name="Approved",
        is_admin=False,
        is_approved=True,
    )
    db_session.add(approved_user)
    await db_session.commit()

    login_res = await login_user(client, "approved@example.com", "userpass")
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    pending_list = await client.get(
        "/api/admin/pending-users",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert pending_list.status_code == 403
    assert pending_list.json()["detail"] == "Admin privileges required"


@pytest.mark.asyncio
async def test_reject_user_deletes_pending_account(client, db_session):
    admin = User(
        email="admin2@example.com",
        password_hash=hash_password("adminpass"),
        name="Admin2",
        is_admin=True,
        is_approved=True,
    )
    db_session.add(admin)
    await db_session.commit()

    pending_res = await register_user(client, "rejectme@example.com")
    pending_id = pending_res.json()["user"]["id"]

    admin_login = await login_user(client, "admin2@example.com", "adminpass")
    token = admin_login.json()["access_token"]

    reject_res = await client.post(
        f"/api/admin/users/{pending_id}/reject",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert reject_res.status_code == 204

    result = await db_session.execute(select(User).where(User.id == pending_id))
    assert result.scalar_one_or_none() is None
