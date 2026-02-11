#!/usr/bin/env python3
"""
Production Database Setup Script for Nyla Sales CRM
Run this ONCE on your production server to populate users, leads, and activities
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import bcrypt
import uuid
from datetime import datetime, timezone, timedelta
import os

# IMPORTANT: Set your production MongoDB URI here
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

async def setup_production_database():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("🚀 Starting Production Database Setup for Nyla Sales CRM")
    print(f"📊 Database: {DB_NAME}")
    print(f"🔗 MongoDB: {MONGO_URL}\n")
    
    # ============= LEADERSHIP TEAM =============
    print("👔 Creating Leadership Team...")
    
    surya_id = str(uuid.uuid4())
    vamsi_id = str(uuid.uuid4())
    karanabir_id = str(uuid.uuid4())
    admin_id = str(uuid.uuid4())
    
    leadership = [
        {
            'id': surya_id,
            'email': 'surya.yadavalli@nylaairwater.earth',
            'password': hash_password('Nyla2026!'),
            'name': 'Surya Yadavalli',
            'role': 'CEO',
            'designation': 'CEO',
            'phone': '+919876543200',
            'city': 'Hyderabad',
            'state': 'Telangana',
            'country': 'India',
            'territory': 'All India',
            'reports_to': None,
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': vamsi_id,
            'email': 'vamsi.bommena@nylaairwater.earth',
            'password': hash_password('Nyla2026!'),
            'name': 'Vamsi Bommena',
            'role': 'Director',
            'designation': 'Director',
            'phone': '+919876543201',
            'city': 'Hyderabad',
            'state': 'Telangana',
            'country': 'India',
            'territory': 'All India',
            'reports_to': surya_id,
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': karanabir_id,
            'email': 'karanabir.gulati@nylaairwater.earth',
            'password': hash_password('Nyla2026!'),
            'name': 'Karanabir Singh Gulati',
            'role': 'Vice President',
            'designation': 'Vice President',
            'phone': '+919876543202',
            'city': 'Delhi',
            'state': 'Delhi',
            'country': 'India',
            'territory': 'All India',
            'reports_to': vamsi_id,
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': admin_id,
            'email': 'admin@nylaairwater.earth',
            'password': hash_password('NylaAdmin2026!'),
            'name': 'System Administrator',
            'role': 'CEO',
            'designation': 'CEO',
            'phone': '+919876543299',
            'city': 'Hyderabad',
            'state': 'Telangana',
            'country': 'India',
            'territory': 'All India',
            'reports_to': None,
            'is_active': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
    ]
    
    await db.users.insert_many(leadership)
    print(f"✅ Created 4 leadership members")
    
    # ============= SALES TEAM (2 per city) =============
    print("👥 Creating Sales Team (2 per city)...")
    
    cities = [
        ('Bengaluru', 'Karnataka', 'South India'),
        ('Chennai', 'Tamil Nadu', 'South India'),
        ('Hyderabad', 'Telangana', 'South India'),
        ('Mumbai', 'Maharashtra', 'West India'),
        ('Pune', 'Maharashtra', 'West India'),
        ('New Delhi', 'Delhi', 'North India'),
        ('Ahmedabad', 'Gujarat', 'West India'),
        ('Kolkata', 'West Bengal', 'East India'),
        ('Noida', 'Uttar Pradesh', 'North India')
    ]
    
    sales_team = []
    counter = 1
    
    for city, state, territory in cities:
        for i in range(2):
            city_prefix = city.lower().replace(' ', '')
            email = f"{city_prefix}.sales{counter}@nylaairwater.earth"
            
            member = {
                'id': str(uuid.uuid4()),
                'email': email,
                'password': hash_password('Nyla2026!'),
                'name': f'{city} Sales Rep {counter}',
                'role': 'Business Development Executive',
                'designation': 'Business Development Executive',
                'phone': f'+919{800000000 + counter}',
                'city': city,
                'state': state,
                'country': 'India',
                'territory': territory,
                'reports_to': karanabir_id,
                'is_active': True,
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            
            sales_team.append(member)
            counter += 1
    
    await db.users.insert_many(sales_team)
    print(f"✅ Created {len(sales_team)} sales reps across {len(cities)} cities")
    
    # ============= SAMPLE LEADS =============
    print("📋 Creating Sample Leads...")
    
    leads = []
    for i in range(15):
        city, state, territory = cities[i % len(cities)]
        city_reps = [m for m in sales_team if m['city'] == city]
        assigned_to = city_reps[0]['id'] if city_reps else karanabir_id
        
        lead = {
            'id': str(uuid.uuid4()),
            'company': f'{city} Business {i+1}',
            'contact_person': f'Contact Person {i+1}',
            'email': None,
            'phone': f'+919{900000000 + i}',
            'category': ['Corporate', 'Star Hotel', 'Restaurant'][i % 3],
            'tier': ['Tier 1', 'Tier 2', 'Tier 3'][i % 3],
            'city': city,
            'state': state,
            'country': 'India',
            'region': territory,
            'status': 'new',
            'source': 'Website',
            'assigned_to': assigned_to,
            'priority': 'medium',
            'interested_skus': ['660 ml Silver', '660 ml Gold'],
            'estimated_value': 500000,
            'created_by': assigned_to,
            'created_at': (datetime.now(timezone.utc) - timedelta(days=i)).isoformat(),
            'updated_at': datetime.now(timezone.utc).isoformat()
        }
        leads.append(lead)
    
    await db.leads.insert_many(leads)
    print(f"✅ Created {len(leads)} sample leads")
    
    # ============= ACTIVITIES =============
    print("📞 Creating Sample Activities...")
    
    activities = []
    for lead in leads[:10]:
        activity = {
            'id': str(uuid.uuid4()),
            'lead_id': lead['id'],
            'activity_type': 'call',
            'interaction_method': 'phone_call',
            'description': 'Initial contact call',
            'created_by': lead['assigned_to'],
            'created_at': (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        }
        activities.append(activity)
    
    await db.activities.insert_many(activities)
    print(f"✅ Created {len(activities)} sample activities")
    
    # ============= SUMMARY =============
    print("\n" + "="*60)
    print("✅ PRODUCTION DATABASE SETUP COMPLETE!")
    print("="*60)
    print(f"\n📊 Created:")
    print(f"   - 4 Leadership members")
    print(f"   - 18 Sales representatives")
    print(f"   - 15 Sample leads")
    print(f"   - 10 Sample activities")
    print(f"   Total: 27 users, 15 leads")
    
    print(f"\n🔐 Login Credentials:")
    print(f"   CEO: surya.yadavalli@nylaairwater.earth / Nyla2026!")
    print(f"   VP: karanabir.gulati@nylaairwater.earth / Nyla2026!")
    print(f"   Admin: admin@nylaairwater.earth / NylaAdmin2026!")
    print(f"   Any sales rep: {sales_team[0]['email']} / Nyla2026!")
    
    print(f"\n✅ You can now login with Google Workspace using any of these emails!")
    print(f"✅ Or use email/password with the credentials above")
    
    client.close()

if __name__ == "__main__":
    print("\n⚠️  WARNING: This will create users in your production database!")
    print("⚠️  Make sure MONGO_URL points to your production MongoDB\n")
    
    confirm = input("Continue? (yes/no): ")
    if confirm.lower() == 'yes':
        asyncio.run(setup_production_database())
    else:
        print("Cancelled.")
