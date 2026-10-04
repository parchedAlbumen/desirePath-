from app.services.calories import estimate_kcal_range


def test_flat_run_is_about_one_kcal_per_kg_per_km():
    assert estimate_kcal_range(5, 0) == (280, 400)  # 55 kg and 80 kg runners, nearest 10


def test_climbing_costs_extra():
    flat, hilly = estimate_kcal_range(5, 0), estimate_kcal_range(5, 120)
    assert hilly[0] > flat[0] and hilly[1] > flat[1]
    assert estimate_kcal_range(5, 120) == (340, 500)


def test_range_is_ordered_and_zero_for_nothing():
    assert estimate_kcal_range(0, 0) == (0, 0)
    low, high = estimate_kcal_range(10.3, 250)
    assert 0 < low < high
