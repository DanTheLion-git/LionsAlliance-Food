import httpx

SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl"


async def lookup_food(name: str) -> dict | None:
    """Search Open Food Facts for a food by name, return best match macros."""
    params = {
        "search_terms": name,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": 5,
        "fields": "product_name,brands,nutriments,code,serving_size,product_name_nl,product_name_de",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(SEARCH_URL, params=params)
            data = resp.json()

        products = data.get("products", [])
        if not products:
            return None

        for product in products:
            n = product.get("nutriments", {})
            if n.get("energy-kcal_100g") or n.get("energy_100g"):
                kcal = n.get("energy-kcal_100g") or (n.get("energy_100g", 0) / 4.184)
                return {
                    "name": (
                        product.get("product_name_nl")
                        or product.get("product_name_de")
                        or product.get("product_name", name)
                    ),
                    "brand": product.get("brands", ""),
                    "barcode": product.get("code", ""),
                    "off_id": product.get("code", ""),
                    "calories_per_100g": round(kcal, 1) if kcal else None,
                    "protein_per_100g": n.get("proteins_100g"),
                    "carbs_per_100g": n.get("carbohydrates_100g"),
                    "fat_per_100g": n.get("fat_100g"),
                    "fiber_per_100g": n.get("fiber_100g"),
                    "sugar_per_100g": n.get("sugars_100g"),
                    "sodium_per_100g": n.get("sodium_100g"),
                    "source": "open_food_facts",
                }
        return None
    except Exception:
        return None
