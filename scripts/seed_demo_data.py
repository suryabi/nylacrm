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
    
    # Create demo users with organizational hierarchy
    surya_id = str(uuid.uuid4())  # CEO
    vamsi_id = str(uuid.uuid4())  # Director
    karanabir_id = str(uuid.uuid4())  # VP Growth & Strategy
    manager_id = str(uuid.uuid4())  # Sales Manager
    rep1_id = str(uuid.uuid4())  # Sales Rep 1
    rep2_id = str(uuid.uuid4())  # Sales Rep 2
    
    users = [
        # Top Level - CEO & Managing Director
        {
            'id': surya_id,
            'email': 'surya.yadavalli@nyla.com',
            'password': hash_password('surya123'),
            'name': 'Surya Yadavalli',
            'role': 'ceo',
            'designation': 'CEO & Managing Director',
            'phone': '+919876543200',
            'city': 'Hyderabad',
            'state': 'Telangana',
            'country': 'India',
            'territory': 'All India',
            'reports_to': None,  # Top of hierarchy
            'dotted_line_to': None,
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        # Second Level - Director
        {
            'id': vamsi_id,
            'email': 'vamsi.bommena@nyla.com',
            'password': hash_password('vamsi123'),
            'name': 'Vamsi Bommena',
            'role': 'director',
            'designation': 'Director',
            'phone': '+919876543201',
            'city': 'Hyderabad',
            'state': 'Telangana',
            'country': 'India',
            'territory': 'All India',
            'reports_to': surya_id,  # Reports to Surya
            'dotted_line_to': None,
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        # Third Level - VP Growth & Strategy
        {
            'id': karanabir_id,
            'email': 'karanabir.gulati@nyla.com',
            'password': hash_password('karanabir123'),
            'name': 'Karanabir Singh Gulati',
            'role': 'vp',
            'designation': 'VP - Growth & Strategy',
            'phone': '+919876543202',
            'city': 'Delhi NCR',
            'state': 'Delhi',
            'country': 'India',
            'territory': 'All India',
            'reports_to': vamsi_id,  # Reports to Vamsi
            'dotted_line_to': surya_id,  # Dotted line to Surya
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        # Sales Team - Reports to Karanabir
        {
            'id': manager_id,
            'email': 'sales.manager@nyla.com',
            'password': hash_password('manager123'),
            'name': 'Rahul Sharma',
            'role': 'sales_manager',
            'designation': 'Sales Manager - West India',
            'phone': '+919876543210',
            'city': 'Mumbai',
            'state': 'Maharashtra',
            'country': 'India',
            'territory': 'West India',
            'reports_to': karanabir_id,  # Reports to Karanabir
            'dotted_line_to': None,
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': rep1_id,
            'email': 'priya.sales@nyla.com',
            'password': hash_password('priya123'),
            'name': 'Priya Menon',
            'role': 'sales_rep',
            'designation': 'Senior Sales Executive - South India',
            'phone': '+919876543211',
            'city': 'Bangalore',
            'state': 'Karnataka',
            'country': 'India',
            'territory': 'South India',
            'reports_to': karanabir_id,  # Reports to Karanabir
            'dotted_line_to': None,
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': rep2_id,
            'email': 'amit.sales@nyla.com',
            'password': hash_password('amit123'),
            'name': 'Amit Verma',
            'role': 'sales_rep',
            'designation': 'Sales Executive - North India',
            'phone': '+919876543212',
            'city': 'Delhi NCR',
            'state': 'Delhi',
            'country': 'India',
            'territory': 'North India',
            'reports_to': karanabir_id,  # Reports to Karanabir
            'dotted_line_to': None,
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
    ]
    
    await db.users.insert_many(users)
    print("✅ Created 6 team members with organizational hierarchy")
    print("   └─ Surya Yadavalli (CEO & MD)")
    print("      └─ Vamsi Bommena (Director)")
    print("         └─ Karanabir Singh Gulati (VP Growth & Strategy)")
    print("            ├─ Rahul Sharma (Sales Manager - West)")
    print("            ├─ Priya Menon (Senior Sales Executive - South)")
    print("            └─ Amit Verma (Sales Executive - North)")
    print("   [Dotted line: Karanabir → Surya]")
    
    # Create demo leads - assign to sales team members
    leads_data = [
        {
            'id': str(uuid.uuid4()),
            'name': 'Rajesh Kumar',
            'email': 'rajesh.kumar@techsolutions.in',
            'phone': '+919876001111',
            'company': 'Tech Solutions India',
            'status': 'new',
            'source': 'website',
            'assigned_to': rep2_id,  # Amit Verma - North India
            'estimated_value': 450000,
            'priority': 'high',
            'notes': 'Interested in enterprise water purification solution',
            'city': 'Delhi NCR',
            'state': 'Delhi',
            'country': 'India',
            'region': 'North India',
            'created_by': karanabir_id,
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
            'assigned_to': manager_id,  # Rahul Sharma - West India
            'estimated_value': 650000,
            'priority': 'high',
            'notes': 'Looking for corporate office solution',
            'city': 'Mumbai',
            'state': 'Maharashtra',
            'country': 'India',
            'region': 'West India',
            'created_by': karanabir_id,
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
            'assigned_to': manager_id,  # Rahul Sharma - West India
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
            'assigned_to': rep1_id,  # Priya Menon - South India
            'estimated_value': 850000,
            'priority': 'high',
            'notes': 'IT park with 5000+ employees, proposal sent',
            'city': 'Bangalore',
            'state': 'Karnataka',
            'country': 'India',
            'region': 'South India',
            'created_by': rep1_id,
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
            'assigned_to': rep1_id,  # Priya Menon - South India
            'estimated_value': 1200000,
            'priority': 'high',
            'notes': 'Large pharmaceutical facility, deal closed!',
            'city': 'Hyderabad',
            'state': 'Telangana',
            'country': 'India',
            'region': 'South India',
            'created_by': karanabir_id,
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
            'assigned_to': rep2_id,  # Amit Verma - North India
            'estimated_value': 400000,
            'priority': 'medium',
            'notes': 'Heritage hotel chain, 8 properties',
            'city': 'Jaipur',
            'state': 'Rajasthan',
            'country': 'India',
            'region': 'North India',
            'created_by': karanabir_id,
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
            'assigned_to': rep2_id,  # Amit Verma - North India
            'estimated_value': 300000,
            'priority': 'high',
            'notes': 'Educational institution campus',
            'city': 'Chandigarh',
            'state': 'Chandigarh',
            'country': 'India',
            'region': 'North India',
            'created_by': rep2_id,
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
            'assigned_to': rep2_id,
            'created_by': karanabir_id,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'lead_id': leads_data[1]['id'],
            'title': 'Send Proposal',
            'description': 'Send detailed proposal with pricing',
            'scheduled_date': (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat(),
            'is_completed': False,
            'assigned_to': manager_id,
            'created_by': karanabir_id,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
    ]
    
    await db.follow_ups.insert_many(follow_ups)
    print("✅ Created demo follow-ups")
    
    print("\\n🎉 Demo data seeded successfully!")
    print("\\n👥 Organizational Hierarchy:")
    print("  CEO & MD: Surya Yadavalli (surya.yadavalli@nyla.com / surya123)")
    print("  Director: Vamsi Bommena (vamsi.bommena@nyla.com / vamsi123)")
    print("  VP Growth: Karanabir Singh Gulati (karanabir.gulati@nyla.com / karanabir123)")
    print("\\n📧 Sales Team Login Credentials:")
    print("  Manager: sales.manager@nyla.com / manager123 (Rahul Sharma - West)")
    print("  Rep 1: priya.sales@nyla.com / priya123 (Priya Menon - South)")
    print("  Rep 2: amit.sales@nyla.com / amit123 (Amit Verma - North)")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_data())
