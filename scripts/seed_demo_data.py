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
            'phone': '+919876543210',
            'city': 'Delhi NCR',
            'state': 'Delhi',
            'country': 'India',
            'territory': 'North India',
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': manager_id,
            'email': 'manager@nyla.com',
            'password': hash_password('manager123'),
            'name': 'Sales Manager',
            'role': 'sales_manager',
            'phone': '+919876543211',
            'city': 'Mumbai',
            'state': 'Maharashtra',
            'country': 'India',
            'territory': 'West India',
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': rep_id,
            'email': 'sales@nyla.com',
            'password': hash_password('sales123'),
            'name': 'Sales Rep',
            'role': 'sales_rep',
            'phone': '+919876543212',
            'city': 'Bangalore',
            'state': 'Karnataka',
            'country': 'India',
            'territory': 'South India',
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
            'name': 'Rajesh Kumar',
            'email': 'rajesh.kumar@techsolutions.in',
            'phone': '+919876001111',
            'company': 'Tech Solutions India',
            'status': 'new',
            'source': 'website',
            'assigned_to': rep_id,
            'estimated_value': 450000,
            'priority': 'high',
            'notes': 'Interested in enterprise water purification solution',
            'city': 'Delhi NCR',
            'state': 'Delhi',
            'country': 'India',
            'region': 'North India',
            'created_by': admin_id,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Priya Sharma',
            'email': 'priya@innovatecorp.in',
            'phone': '+919876002222',
            'company': 'Innovate Corp',
            'status': 'contacted',
            'source': 'referral',
            'assigned_to': rep_id,
            'estimated_value': 650000,
            'priority': 'high',
            'notes': 'Looking for corporate office solution',
            'city': 'Mumbai',
            'state': 'Maharashtra',
            'country': 'India',
            'region': 'West India',
            'created_by': admin_id,
            'created_at': (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Amit Patel',
            'email': 'amit.patel@hospitality.in',
            'phone': '+919876003333',
            'company': 'Goa Hospitality Group',
            'status': 'qualified',
            'source': 'cold_call',
            'assigned_to': manager_id,
            'estimated_value': 350000,
            'priority': 'medium',
            'notes': 'Resort chain interested in premium water systems',
            'city': 'Goa',
            'state': 'Goa',
            'country': 'India',
            'region': 'West India',
            'created_by': manager_id,
            'created_at': (datetime.now(timezone.utc) - timedelta(days=5)).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Sneha Reddy',
            'email': 'sneha@techpark.in',
            'phone': '+919876004444',
            'company': 'Bangalore Tech Park',
            'status': 'proposal',
            'source': 'social_media',
            'assigned_to': rep_id,
            'estimated_value': 850000,
            'priority': 'high',
            'notes': 'IT park with 5000+ employees, proposal sent',
            'city': 'Bangalore',
            'state': 'Karnataka',
            'country': 'India',
            'region': 'South India',
            'created_by': manager_id,
            'created_at': (datetime.now(timezone.utc) - timedelta(days=7)).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Vikram Singh',
            'email': 'vikram@pharmaceuticals.in',
            'phone': '+919876005555',
            'company': 'Hyderabad Pharma Ltd',
            'status': 'closed_won',
            'source': 'website',
            'assigned_to': manager_id,
            'estimated_value': 1200000,
            'priority': 'high',
            'notes': 'Large pharmaceutical facility, deal closed!',
            'city': 'Hyderabad',
            'state': 'Telangana',
            'country': 'India',
            'region': 'South India',
            'created_by': admin_id,
            'created_at': (datetime.now(timezone.utc) - timedelta(days=15)).isoformat(),
            'updated_at': (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Arun Mehta',
            'email': 'arun@heritage.in',
            'phone': '+919876006666',
            'company': 'Heritage Hotels Jaipur',
            'status': 'contacted',
            'source': 'referral',
            'assigned_to': rep_id,
            'estimated_value': 400000,
            'priority': 'medium',
            'notes': 'Heritage hotel chain, 8 properties',
            'city': 'Jaipur',
            'state': 'Rajasthan',
            'country': 'India',
            'region': 'North India',
            'created_by': admin_id,
            'created_at': (datetime.now(timezone.utc) - timedelta(days=3)).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'name': 'Meera Kapoor',
            'email': 'meera@education.in',
            'phone': '+919876007777',
            'company': 'Chandigarh Education Hub',
            'status': 'qualified',
            'source': 'website',
            'assigned_to': rep_id,
            'estimated_value': 300000,
            'priority': 'high',
            'notes': 'Educational institution campus',
            'city': 'Chandigarh',
            'state': 'Chandigarh',
            'country': 'India',
            'region': 'North India',
            'created_by': manager_id,
            'created_at': (datetime.now(timezone.utc) - timedelta(days=4)).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
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
