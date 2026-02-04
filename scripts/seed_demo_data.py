import asyncio
import sys
sys.path.append('/app/backend')

from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt
from datetime import datetime, timezone, timedelta
import uuid
import os

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

async def seed_data():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("🌱 Seeding demo data...")
    
    # Clear existing data
    await db.users.delete_many({})
    await db.leads.delete_many({})
    await db.activities.delete_many({})
    await db.follow_ups.delete_many({})
    await db.comments.delete_many({})
    
    # Create demo users
    admin_id = str(uuid.uuid4())
    manager_id = str(uuid.uuid4())
    rep_id = str(uuid.uuid4())
    
    users = [
        {
            'id': admin_id,
            'email': 'admin@nyla.com',
            'password': hash_password('admin123'),
            'name': 'Admin User',
            'role': 'admin',
            'phone': '+1234567890',
            'city': 'New York',
            'state': 'NY',
            'country': 'United States',
            'territory': 'Northeast',
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': manager_id,
            'email': 'manager@nyla.com',
            'password': hash_password('manager123'),
            'name': 'Sales Manager',
            'role': 'sales_manager',
            'phone': '+1234567891',
            'city': 'Los Angeles',
            'state': 'CA',
            'country': 'United States',
            'territory': 'West Coast',
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': rep_id,
            'email': 'sales@nyla.com',
            'password': hash_password('sales123'),
            'name': 'Sales Rep',
            'role': 'sales_rep',
            'phone': '+1234567892',
            'city': 'Chicago',
            'state': 'IL',
            'country': 'United States',
            'territory': 'Midwest',
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
    ]
    
    await db.users.insert_many(users)
    print("✅ Created 3 demo users")
    
    # Create demo leads
    leads_data = [
        {
            'id': str(uuid.uuid4()),
            'name': 'John Smith',
            'email': 'john.smith@techcorp.com',
            'phone': '+1555123456',
            'company': 'TechCorp Inc',
            'status': 'new',
            'source': 'website',
            'assigned_to': rep_id,
            'estimated_value': 50000,
            'priority': 'high',
            'notes': 'Interested in enterprise solution',
            'created_by': admin_id,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Sarah Johnson',
            'email': 'sarah@innovate.io',
            'phone': '+1555234567',
            'company': 'Innovate Solutions',
            'status': 'contacted',
            'source': 'referral',
            'assigned_to': rep_id,
            'estimated_value': 75000,
            'priority': 'high',
            'notes': 'Referred by existing client',
            'created_by': admin_id,
            'created_at': (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Michael Brown',
            'email': 'mbrown@startup.com',
            'phone': '+1555345678',
            'company': 'StartUp Ventures',
            'status': 'qualified',
            'source': 'cold_call',
            'assigned_to': rep_id,
            'estimated_value': 30000,
            'priority': 'medium',
            'notes': 'Looking for premium package',
            'created_by': manager_id,
            'created_at': (datetime.now(timezone.utc) - timedelta(days=5)).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Emily Davis',
            'email': 'emily.davis@bizco.com',
            'phone': '+1555456789',
            'company': 'BizCo LLC',
            'status': 'proposal',
            'source': 'social_media',
            'assigned_to': manager_id,
            'estimated_value': 100000,
            'priority': 'high',
            'notes': 'Sent proposal yesterday',
            'created_by': manager_id,
            'created_at': (datetime.now(timezone.utc) - timedelta(days=7)).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'David Wilson',
            'email': 'dwilson@enterprise.net',
            'phone': '+1555567890',
            'company': 'Enterprise Networks',
            'status': 'closed_won',
            'source': 'website',
            'assigned_to': manager_id,
            'estimated_value': 150000,
            'priority': 'high',
            'notes': 'Deal closed successfully!',
            'created_by': admin_id,
            'created_at': (datetime.now(timezone.utc) - timedelta(days=15)).isoformat(),
            'updated_at': (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        }
    ]
    
    await db.leads.insert_many(leads_data)
    print(f"✅ Created {len(leads_data)} demo leads")
    
    # Create some activities
    for lead in leads_data:
        activity = {
            'id': str(uuid.uuid4()),
            'lead_id': lead['id'],
            'activity_type': 'note',
            'description': f'Lead created by {users[0]["name"]}',
            'created_by': lead['created_by'],
            'created_at': lead['created_at']
        }
        await db.activities.insert_one(activity)
    
    print("✅ Created demo activities")
    
    # Create some follow-ups
    follow_ups = [
        {
            'id': str(uuid.uuid4()),
            'lead_id': leads_data[0]['id'],
            'title': 'Initial Discovery Call',
            'description': 'Schedule discovery call to understand requirements',
            'scheduled_date': (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            'is_completed': False,
            'assigned_to': rep_id,
            'created_by': admin_id,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'lead_id': leads_data[1]['id'],
            'title': 'Send Proposal',
            'description': 'Send detailed proposal with pricing',
            'scheduled_date': (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat(),
            'is_completed': False,
            'assigned_to': rep_id,
            'created_by': admin_id,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
    ]
    
    await db.follow_ups.insert_many(follow_ups)
    print("✅ Created demo follow-ups")
    
    print("\\n🎉 Demo data seeded successfully!")
    print("\\n📧 Demo Login Credentials:")
    print("  Admin:   admin@nyla.com / admin123")
    print("  Manager: manager@nyla.com / manager123")
    print("  Sales:   sales@nyla.com / sales123")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_data())
