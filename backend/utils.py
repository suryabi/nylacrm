"""
Shared utility functions
"""
import re
from datetime import datetime
from database import db

async def generate_lead_id(company: str, city: str) -> str:
    """
    Generate unique Lead ID in format: NAME4-CITY-LYY-SEQ (16 characters total)
    """
    clean_company = re.sub(r'[^a-zA-Z0-9]', '', company).upper()
    name4 = clean_company[:4].ljust(4, 'X')
    
    clean_city = re.sub(r'[^a-zA-Z0-9]', '', city).upper()
    city3 = clean_city[:3].ljust(3, 'X')
    
    year2 = datetime.now().strftime('%y')
    prefix = f"{name4}-{city3}-L{year2}-"
    
    regex_pattern = f"^{re.escape(prefix)}\\d{{3}}$"
    existing_leads = await db.leads.find(
        {'lead_id': {'$regex': regex_pattern}},
        {'lead_id': 1}
    ).sort('lead_id', -1).limit(1).to_list(1)
    
    if existing_leads and existing_leads[0].get('lead_id'):
        last_seq = int(existing_leads[0]['lead_id'][-3:])
        next_seq = last_seq + 1
    else:
        next_seq = 1
    
    if next_seq > 999:
        next_seq = 1
    
    seq3 = str(next_seq).zfill(3)
    lead_id = f"{name4}-{city3}-L{year2}-{seq3}"
    
    return lead_id

async def generate_account_id(company: str, city: str) -> str:
    """
    Generate unique Account ID in format: NAME4-CITY-AYY-SEQ
    """
    clean_company = re.sub(r'[^a-zA-Z0-9]', '', company).upper()
    name4 = clean_company[:4].ljust(4, 'X')
    
    clean_city = re.sub(r'[^a-zA-Z0-9]', '', city).upper()
    city3 = clean_city[:3].ljust(3, 'X')
    
    year2 = datetime.now().strftime('%y')
    prefix = f"{name4}-{city3}-A{year2}-"
    
    regex_pattern = f"^{re.escape(prefix)}\\d{{3}}$"
    existing_accounts = await db.accounts.find(
        {'account_id': {'$regex': regex_pattern}},
        {'account_id': 1}
    ).sort('account_id', -1).limit(1).to_list(1)
    
    if existing_accounts and existing_accounts[0].get('account_id'):
        last_seq = int(existing_accounts[0]['account_id'][-3:])
        next_seq = last_seq + 1
    else:
        next_seq = 1
    
    if next_seq > 999:
        next_seq = 1
    
    seq3 = str(next_seq).zfill(3)
    account_id = f"{name4}-{city3}-A{year2}-{seq3}"
    
    return account_id
