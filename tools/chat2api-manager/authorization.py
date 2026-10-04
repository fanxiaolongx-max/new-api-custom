import asyncio
import json
import os
import random

from fastapi import HTTPException

import utils.configs as configs
import utils.globals as globals
from chatgpt.refreshToken import rt2ac
from utils.Logger import logger


POOL_CONFIG_FILE = os.getenv("CHAT2API_POOL_CONFIG", "data/pool_config.json")


def get_pool_config():
    try:
        with open(POOL_CONFIG_FILE, encoding="utf-8") as handle:
            config = json.load(handle)
            if isinstance(config, dict):
                return config
    except (OSError, json.JSONDecodeError):
        pass
    return {}


def get_error_tokens():
    try:
        with open(globals.ERROR_TOKENS_FILE, encoding="utf-8") as handle:
            return {line.strip() for line in handle if line.strip() and not line.startswith("#")}
    except OSError:
        return set()


def get_req_token(req_token, seed=None):
    if configs.auto_seed:
        available_token_list = list(set(globals.token_list) - get_error_tokens())
        length = len(available_token_list)
        if seed and length > 0:
            if seed not in globals.seed_map.keys():
                globals.seed_map[seed] = {"token": random.choice(available_token_list), "conversations": []}
                with open(globals.SEED_MAP_FILE, "w") as handle:
                    json.dump(globals.seed_map, handle, indent=4)
            else:
                req_token = globals.seed_map[seed]["token"]
            return req_token

        pool_config = get_pool_config()
        pool_keys = set(configs.authorization_list)
        if pool_config.get("api_key"):
            pool_keys.add(pool_config["api_key"])
        if req_token in pool_keys:
            if length > 0:
                if pool_config.get("strategy", "random") == "random":
                    return random.choice(available_token_list)
                globals.count += 1
                globals.count %= length
                return available_token_list[globals.count]
            return ""
        return req_token

    seed = req_token
    if seed not in globals.seed_map.keys():
        raise HTTPException(status_code=401, detail={"error": "Invalid Seed"})
    return globals.seed_map[seed]["token"]


async def verify_token(req_token):
    if not req_token:
        pool_config = get_pool_config()
        if configs.authorization_list or pool_config.get("api_key"):
            logger.error("Unauthorized with empty token.")
            raise HTTPException(status_code=401)
        return None
    if req_token.startswith("eyJhbGciOi") or req_token.startswith("fk-"):
        return req_token
    if len(req_token) == 45:
        try:
            if req_token in get_error_tokens():
                raise HTTPException(status_code=401, detail="Error RefreshToken")
            return await rt2ac(req_token, force_refresh=False)
        except HTTPException as error:
            raise HTTPException(status_code=error.status_code, detail=error.detail)
    return req_token


async def refresh_all_tokens(force_refresh=False):
    for token in list(set(globals.token_list) - get_error_tokens()):
        if len(token) == 45:
            try:
                await asyncio.sleep(0.5)
                await rt2ac(token, force_refresh=force_refresh)
            except HTTPException:
                pass
    logger.info("All tokens refreshed.")
