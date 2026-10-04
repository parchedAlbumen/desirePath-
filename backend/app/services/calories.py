"""Calorie estimate for a run, from distance and climb. We don't ask for body weight, so we give a range
covering typical adult runners instead of one falsely precise number.

Running costs about 1 kcal per kg of body weight per km, nearly regardless of pace. Climbing adds about
0.01 kcal per kg per metre: lifting your body weight 1 m, at ~25% muscle efficiency. Good to roughly ±20%."""

KCAL_PER_KG_PER_KM = 1.0
KCAL_PER_KG_PER_M_CLIMBED = 0.01
WEIGHT_RANGE_KG = (55, 80)


def estimate_kcal_range(distance_km: float, elevation_gain_m: float) -> tuple[int, int]:
    """(low, high) kcal for the lightest and heaviest typical runner, rounded to the nearest 10."""
    per_kg = distance_km * KCAL_PER_KG_PER_KM + elevation_gain_m * KCAL_PER_KG_PER_M_CLIMBED
    low, high = (int(round(per_kg * kg, -1)) for kg in WEIGHT_RANGE_KG)
    return low, high
