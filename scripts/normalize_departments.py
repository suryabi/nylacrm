"""
Script to normalize department values in the users collection.
Converts old values ('sales', 'production', 'both') to new values ('Sales', 'Production', 'Admin').

Run this script in production after deploying the new code:
python3 normalize_departments.py
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

# Department mapping from old values to new values
DEPARTMENT_MAPPING = {
    'sales': 'Sales',
    'production': 'Production',
    'both': 'Admin',  # 'Both (Admin)' becomes 'Admin'
    'admin': 'Admin',
    'marketing': 'Marketing',
    'finance': 'Finance',
    # Keep new values as-is
    'Sales': 'Sales',
    'Production': 'Production',
    'Admin': 'Admin',
    'Marketing': 'Marketing',
    'Finance': 'Finance',
}

async def normalize_departments():
    # Connect to MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'test_database')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print(f"Connected to database: {db_name}")
    
    # Get all users
    users = await db.users.find({}, {'_id': 0, 'id': 1, 'name': 1, 'department': 1}).to_list(1000)
    
    print(f"Found {len(users)} users")
    
    updated_count = 0
    for user in users:
        old_dept = user.get('department')
        new_dept = DEPARTMENT_MAPPING.get(old_dept, 'Sales')  # Default to 'Sales' if unknown
        
        if old_dept != new_dept:
            result = await db.users.update_one(
                {'id': user['id']},
                {'$set': {'department': new_dept}}
            )
            if result.modified_count > 0:
                print(f"  Updated {user['name']}: '{old_dept}' -> '{new_dept}'")
                updated_count += 1
        elif not old_dept:
            # Set default department if missing
            result = await db.users.update_one(
                {'id': user['id']},
                {'$set': {'department': 'Sales'}}
            )
            if result.modified_count > 0:
                print(f"  Set default for {user['name']}: None -> 'Sales'")
                updated_count += 1
    
    print(f"\nNormalization complete. Updated {updated_count} users.")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(normalize_departments())
