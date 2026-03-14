"""
Script to populate Lead Scoring Model in Production
Run this script in your production environment to seed the default scoring model.

Usage:
1. Copy this script to your production server
2. Set the MONGO_URL environment variable to your production MongoDB connection string
3. Run: python populate_scoring_model_production.py
"""

import asyncio
import os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

# Production MongoDB connection - set this to your production MONGO_URL
MONGO_URL = os.environ.get('MONGO_URL', 'YOUR_PRODUCTION_MONGO_URL_HERE')
DB_NAME = os.environ.get('DB_NAME', 'nyla-air-water')

# Default Scoring Model Data
SCORING_MODEL_DATA = {
    "city": "default",
    "name": "Default Scoring Model",
    "description": "Default scoring model - applies to all cities without specific configuration",
    "categories": [
        {
            "name": "Volume Potential",
            "description": "Revenue scale based on estimated volume",
            "weight": 25,
            "is_numeric": True,
            "order": 0,
            "tiers": [
                {"label": ">5000", "description": "Units per month", "score": 25, "min_value": 5000, "max_value": None, "order": 0},
                {"label": "3000-5000", "description": "Units per month", "score": 20, "min_value": 3000, "max_value": 5000, "order": 1},
                {"label": "1500-3000", "description": "Units per month", "score": 15, "min_value": 1500, "max_value": 3000, "order": 2},
                {"label": "500-1500", "description": "Units per month", "score": 10, "min_value": 500, "max_value": 1500, "order": 3},
                {"label": "<500", "description": "Units per month", "score": 5, "min_value": 0, "max_value": 500, "order": 4},
            ]
        },
        {
            "name": "Margin Potential",
            "description": "Profitability assessment",
            "weight": 20,
            "is_numeric": True,
            "order": 1,
            "tiers": [
                {"label": ">40%", "description": "Margin percentage", "score": 20, "min_value": 40, "max_value": None, "order": 0},
                {"label": "30-40%", "description": "Margin percentage", "score": 15, "min_value": 30, "max_value": 40, "order": 1},
                {"label": "20-30%", "description": "Margin percentage", "score": 10, "min_value": 20, "max_value": 30, "order": 2},
                {"label": "10-20%", "description": "Margin percentage", "score": 5, "min_value": 10, "max_value": 20, "order": 3},
                {"label": "<10%", "description": "Margin percentage", "score": 0, "min_value": 0, "max_value": 10, "order": 4},
            ]
        },
        {
            "name": "Brand Prestige",
            "description": "Luxury association and brand value",
            "weight": 20,
            "is_numeric": False,
            "order": 2,
            "tiers": [
                {"label": "5-Star Global Hotel", "description": "JW Marriott, Taj, Four Seasons", "score": 20, "order": 0},
                {"label": "Iconic Luxury Restaurant", "description": "High-end fine dining", "score": 18, "order": 1},
                {"label": "Premium Restaurant", "description": "Upscale dining establishment", "score": 15, "order": 2},
                {"label": "Popular Cafe / Lounge", "description": "Trendy casual venue", "score": 10, "order": 3},
                {"label": "Local Restaurant", "description": "Neighborhood establishment", "score": 5, "order": 4},
            ]
        },
        {
            "name": "Guest Influence",
            "description": "Brand visibility through guest profile",
            "weight": 20,
            "is_numeric": False,
            "order": 3,
            "tiers": [
                {"label": "International Luxury Travellers", "description": "Global high-net-worth individuals", "score": 20, "order": 0},
                {"label": "HNIs / Business Leaders", "description": "Domestic high-net-worth and executives", "score": 18, "order": 1},
                {"label": "Affluent City Crowd", "description": "Urban professionals", "score": 15, "order": 2},
                {"label": "Mass Premium", "description": "Aspirational consumers", "score": 10, "order": 3},
                {"label": "Local Casual Dining", "description": "General public", "score": 5, "order": 4},
            ]
        },
        {
            "name": "Sustainability Alignment",
            "description": "Strategic brand fit with sustainability values",
            "weight": 15,
            "is_numeric": False,
            "order": 4,
            "tiers": [
                {"label": "Strong ESG / Eco Luxury", "description": "Strong ESG/eco luxury positioning", "score": 15, "order": 0},
                {"label": "Sustainability Conscious", "description": "Sustainability conscious brand", "score": 12, "order": 1},
                {"label": "Moderate Alignment", "description": "Some sustainability initiatives", "score": 8, "order": 2},
                {"label": "Low Emphasis", "description": "Limited sustainability focus", "score": 4, "order": 3},
                {"label": "No Focus", "description": "No sustainability initiatives", "score": 0, "order": 4},
            ]
        },
    ],
    "total_weight": 100,
    "is_active": True,
}


def generate_uuid():
    """Generate a UUID string"""
    import uuid
    return str(uuid.uuid4())


def prepare_model_with_ids(model_data, tenant_id):
    """Prepare the model with generated UUIDs"""
    model = {
        "id": generate_uuid(),
        "tenant_id": tenant_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        **model_data
    }
    
    # Add IDs to categories and tiers
    for category in model["categories"]:
        category["id"] = generate_uuid()
        for tier in category.get("tiers", []):
            tier["id"] = generate_uuid()
    
    return model


async def main():
    print("=" * 60)
    print("Lead Scoring Model Population Script")
    print("=" * 60)
    
    # Connect to MongoDB
    print(f"\nConnecting to MongoDB...")
    print(f"Database: {DB_NAME}")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Check if model already exists
    existing = await db.scoring_models.find_one({"city": "default", "is_active": True})
    
    if existing:
        print(f"\n⚠️  A default scoring model already exists!")
        print(f"   Model ID: {existing.get('id')}")
        print(f"   Categories: {len(existing.get('categories', []))}")
        
        response = input("\nDo you want to replace it? (yes/no): ").strip().lower()
        if response != 'yes':
            print("Aborted. No changes made.")
            return
        
        # Deactivate existing model
        await db.scoring_models.update_one(
            {"id": existing["id"]},
            {"$set": {"is_active": False}}
        )
        print("✓ Deactivated existing model")
    
    # Prepare and insert new model
    model = prepare_model_with_ids(SCORING_MODEL_DATA, DB_NAME)
    
    await db.scoring_models.insert_one(model)
    print(f"\n✓ Successfully created new scoring model!")
    print(f"  Model ID: {model['id']}")
    print(f"  City: {model['city']}")
    print(f"  Categories: {len(model['categories'])}")
    
    # Print category summary
    print("\n  Categories:")
    for cat in model['categories']:
        print(f"    - {cat['name']} ({cat['weight']} pts, {len(cat['tiers'])} tiers)")
    
    print("\n" + "=" * 60)
    print("Done! Your Lead Scoring Model is ready to use.")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
