import os

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
ORS_API_KEY = os.getenv("ORS_API_KEY")  # openrouteservice.org, free tier is enough for dev
JWT_SECRET = os.getenv("JWT_SECRET")

# /generate rate limits. Each uncached generate costs ~9 ORS requests; ORS free tier allows ~40/min and ~2000/day.
# Logged-out callers are limited per IP; logged-in ones per account, with more room as a reason to sign up.
GENERATE_LIMIT_PER_IP_MINUTE = int(os.getenv("GENERATE_LIMIT_PER_IP_MINUTE", "2"))
GENERATE_LIMIT_PER_IP_HOUR = int(os.getenv("GENERATE_LIMIT_PER_IP_HOUR", "3"))
GENERATE_LIMIT_PER_USER_MINUTE = int(os.getenv("GENERATE_LIMIT_PER_USER_MINUTE", "3"))
GENERATE_LIMIT_PER_USER_HOUR = int(os.getenv("GENERATE_LIMIT_PER_USER_HOUR", "10"))
GENERATE_LIMIT_GLOBAL_MINUTE = int(os.getenv("GENERATE_LIMIT_GLOBAL_MINUTE", "4"))

# /generate response cache: nearby postal codes (same ~CELL_M grid square) with the same settings share routes.
ROUTE_CACHE_TTL_S = int(os.getenv("ROUTE_CACHE_TTL_S", "3600"))
ROUTE_CACHE_MAX_ENTRIES = int(os.getenv("ROUTE_CACHE_MAX_ENTRIES", "200"))
ROUTE_CACHE_CELL_M = int(os.getenv("ROUTE_CACHE_CELL_M", "150"))
# Cheap lookups (geocoding) happen before the cache check, so cap them too: stops random-postal-code spam.
GENERATE_LOOKUP_LIMIT_PER_IP_MINUTE = int(os.getenv("GENERATE_LOOKUP_LIMIT_PER_IP_MINUTE", "30"))

# How many proxies sit in front of the app (e.g. 1 for Render, 2 for Vercel -> Render). 0 = trust no
# X-Forwarded-For header and use the connecting address, which is right when running locally.
TRUSTED_PROXY_HOPS = int(os.getenv("TRUSTED_PROXY_HOPS", "0"))
