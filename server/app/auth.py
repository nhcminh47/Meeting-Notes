import secrets
from typing import Annotated

from fastapi import Depends, Request

from app.config import Settings, get_settings
from app.errors import ApiError


def require_api_key(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    authorization = request.headers.get("Authorization")
    if authorization is not None:
        scheme, separator, token = authorization.partition(" ")
        if (
            separator
            and scheme.lower() == "bearer"
            and token
            and secrets.compare_digest(token, settings.server_api_key)
        ):
            return

    raise ApiError(401, "UNAUTHORIZED", "Missing or invalid API key.")


Protected = Annotated[None, Depends(require_api_key)]
