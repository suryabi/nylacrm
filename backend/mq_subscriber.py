"""
ActiveMQ Subscriber for Invoice Messages
Subscribes to Amazon MQ and updates accounts with invoice data

LOGGING LEVELS:
- INFO: Connection status, message received, processing steps
- DEBUG: Detailed message content, query results
- WARNING: Unmatched invoices, connection issues
- ERROR: Failures and exceptions
"""
import stomp
import ssl
import json
import logging
import asyncio
import threading
import time
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

# Setup detailed logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('activemq_subscriber')
logger.setLevel(logging.INFO)

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ActiveMQ Configuration
_activemq_host_raw = os.environ.get('ACTIVEMQ_HOST', '')
# Strip protocol prefix if present (stomp://, stomp+ssl://, ssl://)
ACTIVEMQ_HOST = _activemq_host_raw.replace('stomp+ssl://', '').replace('stomp://', '').replace('ssl://', '').split(':')[0] if _activemq_host_raw else ''
ACTIVEMQ_PORT = int(os.environ.get('ACTIVEMQ_PORT', '61614') or '61614')
ACTIVEMQ_USER = os.environ.get('ACTIVEMQ_USER', '')
ACTIVEMQ_PASSWORD = os.environ.get('ACTIVEMQ_PASSWORD', '')
ACTIVEMQ_QUEUE = os.environ.get('ACTIVEMQ_QUEUE', '/queue/order-invoice')
# Only enable if explicitly set to 'true' AND credentials are configured
ACTIVEMQ_ENABLED = bool(
    os.environ.get('ACTIVEMQ_ENABLED', 'false').lower() == 'true' and
    ACTIVEMQ_HOST and 
    ACTIVEMQ_USER and 
    ACTIVEMQ_PASSWORD
)

# Log the sanitized host for debugging
if ACTIVEMQ_HOST:
    logger.info(f"ActiveMQ configured - Host: {ACTIVEMQ_HOST}:{ACTIVEMQ_PORT}")

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME')

# Connection status tracking
connection_stats = {
    'connected': False,
    'last_connected_at': None,
    'last_disconnected_at': None,
    'messages_received': 0,
    'messages_processed': 0,
    'messages_failed': 0,
    'last_message_at': None,
    'reconnect_count': 0
}

def get_activemq_status():
    """Get current ActiveMQ connection status - can be called from API"""
    return {
        'enabled': ACTIVEMQ_ENABLED,
        'host': ACTIVEMQ_HOST,
        'port': ACTIVEMQ_PORT,
        'queue': ACTIVEMQ_QUEUE,
        'connected': connection_stats['connected'],
        'last_connected_at': connection_stats['last_connected_at'],
        'last_disconnected_at': connection_stats['last_disconnected_at'],
        'messages_received': connection_stats['messages_received'],
        'messages_processed': connection_stats['messages_processed'],
        'messages_failed': connection_stats['messages_failed'],
        'last_message_at': connection_stats['last_message_at'],
        'reconnect_count': connection_stats['reconnect_count']
    }


class InvoiceListener(stomp.ConnectionListener):
    """Listener for invoice messages from ActiveMQ"""
    
    def __init__(self, db_client):
        self.db = db_client[db_name]
        self.loop = asyncio.new_event_loop()
        self.subscriber = None
    
    def set_subscriber(self, subscriber):
        """Set reference to subscriber for reconnect"""
        self.subscriber = subscriber
        
    def on_connected(self, frame):
        connection_stats['connected'] = True
        connection_stats['last_connected_at'] = datetime.now(timezone.utc).isoformat()
        logger.info("="*60)
        logger.info("✅ ACTIVEMQ CONNECTED")
        logger.info(f"   Host: {ACTIVEMQ_HOST}:{ACTIVEMQ_PORT}")
        logger.info(f"   Queue: {ACTIVEMQ_QUEUE}")
        logger.info(f"   Time: {connection_stats['last_connected_at']}")
        logger.info("="*60)
    
    def on_heartbeat_timeout(self):
        logger.warning("⚠️ ACTIVEMQ HEARTBEAT TIMEOUT - Will attempt to maintain connection")
        # Don't trigger reconnect here - let the library handle it
        # The on_disconnected will be called if connection is truly lost
    
    def on_heartbeat(self):
        """Called when heartbeat is received - connection is healthy"""
        # Just update the connected status silently
        connection_stats['connected'] = True
        
    def on_disconnected(self):
        # Only log and reconnect if we were previously running
        if not self.subscriber or not self.subscriber.running:
            return
            
        connection_stats['connected'] = False
        connection_stats['last_disconnected_at'] = datetime.now(timezone.utc).isoformat()
        connection_stats['reconnect_count'] += 1
        logger.warning("="*60)
        logger.warning("❌ ACTIVEMQ DISCONNECTED")
        logger.warning(f"   Time: {connection_stats['last_disconnected_at']}")
        logger.warning(f"   Total reconnect attempts: {connection_stats['reconnect_count']}")
        logger.warning("="*60)
        
        # Wait a bit before reconnecting to avoid rapid reconnect loops
        time.sleep(5)
        
        # Trigger reconnect in background
        if self.subscriber and self.subscriber.running:
            logger.info("🔄 Scheduling reconnect in 5 seconds...")
            threading.Thread(target=self.subscriber.reconnect, daemon=True).start()
        
    def on_error(self, frame):
        logger.error(f"❌ ACTIVEMQ ERROR: {frame.body}")
        
    def on_message(self, frame):
        """Process incoming invoice message"""
        connection_stats['messages_received'] += 1
        connection_stats['last_message_at'] = datetime.now(timezone.utc).isoformat()
        
        logger.info("="*60)
        logger.info("📨 MESSAGE RECEIVED")
        logger.info(f"   Message #{connection_stats['messages_received']}")
        logger.info(f"   Time: {connection_stats['last_message_at']}")
        logger.info("-"*60)
        
        try:
            # Log raw message
            raw_body = frame.body.decode('utf-8') if isinstance(frame.body, bytes) else frame.body
            logger.info(f"📄 RAW MESSAGE CONTENT:")
            logger.info(f"{raw_body}")
            logger.info("-"*60)
            
            # Parse JSON message
            message_data = json.loads(raw_body)
            
            # Extract invoice data - handle both field naming conventions
            invoice_data = {
                'invoice_no': message_data.get('invoiceNo'),
                'invoice_date': message_data.get('invoiceDate') or message_data.get('invoiceData'),
                'gross_invoice_value': float(message_data.get('grossInvoiceValue', 0) or 0),
                'net_invoice_value': float(message_data.get('netInvoiceValue', 0) or 0),
                'credit_note_value': float(message_data.get('creditNoteValue', 0) or 0),
                'outstanding': float(message_data.get('outstanding', 0) or 0),
                'account_id_from_mq': message_data.get('ACCOUNT_ID'),  # New field
                'c_lead_id': message_data.get('C_LEAD_ID'),  # Legacy field
                'ca_lead_id': message_data.get('CA_LEAD_ID'),  # Legacy field
                'items': message_data.get('items', []),
                'received_at': datetime.now(timezone.utc).isoformat()
            }
            
            logger.info("📋 PARSED INVOICE DATA:")
            logger.info(f"   Invoice No: {invoice_data['invoice_no']}")
            logger.info(f"   Invoice Date: {invoice_data['invoice_date']}")
            logger.info(f"   ACCOUNT_ID: {invoice_data['account_id_from_mq']}")
            logger.info(f"   CA_LEAD_ID (legacy): {invoice_data['ca_lead_id']}")
            logger.info(f"   C_LEAD_ID: {invoice_data['c_lead_id']}")
            logger.info(f"   Gross Value: ₹{invoice_data['gross_invoice_value']:,.2f}")
            logger.info(f"   Net Value: ₹{invoice_data['net_invoice_value']:,.2f}")
            logger.info(f"   Credit Note: ₹{invoice_data['credit_note_value']:,.2f}")
            logger.info(f"   Outstanding: ₹{invoice_data['outstanding']:,.2f}")
            logger.info(f"   Items Count: {len(invoice_data['items'])}")
            logger.info("-"*60)
            
            # Process in async context
            logger.info("🔄 PROCESSING: Sending to async handler...")
            asyncio.run_coroutine_threadsafe(
                self._process_invoice(invoice_data),
                self.loop
            )
            
        except json.JSONDecodeError as e:
            connection_stats['messages_failed'] += 1
            logger.error(f"❌ FAILED TO PARSE JSON: {e}")
            logger.error(f"   Raw content: {frame.body}")
        except Exception as e:
            connection_stats['messages_failed'] += 1
            logger.error(f"❌ ERROR PROCESSING MESSAGE: {e}")
            import traceback
            logger.error(traceback.format_exc())
    
    async def _process_invoice(self, invoice_data):
        """Update account with invoice data"""
        try:
            # Use ACCOUNT_ID as primary, fallback to CA_LEAD_ID for legacy messages
            account_id = invoice_data.get('account_id_from_mq') or invoice_data.get('ca_lead_id')
            
            logger.info(f"🔍 STEP 1: Looking up account with account_id: {account_id}")
            
            if not account_id:
                logger.warning("⚠️ NO ACCOUNT_ID or CA_LEAD_ID in invoice message - cannot match to account")
                connection_stats['messages_failed'] += 1
                return
            
            # Find account by account_id
            account = await self.db.accounts.find_one({'account_id': account_id})
            
            if not account:
                logger.warning(f"⚠️ STEP 2: Account NOT FOUND for account_id: {account_id}")
                logger.info(f"   Storing as UNMATCHED invoice for later reconciliation...")
                # Store as unmatched invoice for later reconciliation
                invoice_data['status'] = 'unmatched'
                invoice_data['tenant_id'] = 'nyla-air-water'  # Add tenant_id for multi-tenant support
                result = await self.db.invoices.insert_one(invoice_data)
                logger.info(f"   Stored unmatched invoice with _id: {result.inserted_id}")
                connection_stats['messages_processed'] += 1
                return
            
            logger.info(f"✅ STEP 2: Account FOUND")
            logger.info(f"   Account ID: {account.get('account_id')}")
            logger.info(f"   Account Name: {account.get('account_name')}")
            logger.info(f"   Account UUID: {account.get('id')}")
            logger.info(f"   Tenant ID: {account.get('tenant_id')}")
            
            # Store invoice in invoices collection - inherit tenant_id from account
            invoice_data['account_uuid'] = account['id']
            invoice_data['account_id'] = account.get('account_id')
            invoice_data['assigned_to'] = account.get('assigned_to')
            invoice_data['tenant_id'] = account.get('tenant_id', 'nyla-air-water')  # Inherit tenant from account
            invoice_data['status'] = 'matched'
            
            logger.info(f"💾 STEP 3: Storing invoice in database...")
            result = await self.db.invoices.insert_one(invoice_data)
            logger.info(f"   Invoice stored with _id: {result.inserted_id}")
            
            # Calculate totals for the account - filter by tenant_id too
            logger.info(f"📊 STEP 4: Calculating account invoice totals...")
            all_invoices = await self.db.invoices.find({
                'account_uuid': account['id'],
                'status': 'matched',
                'tenant_id': account.get('tenant_id', 'nyla-air-water')
            }).to_list(1000)
            
            total_gross = sum(inv.get('gross_invoice_value', 0) for inv in all_invoices)
            total_net = sum(inv.get('net_invoice_value', 0) for inv in all_invoices)
            total_credit = sum(inv.get('credit_note_value', 0) for inv in all_invoices)
            total_outstanding = sum(inv.get('outstanding', 0) for inv in all_invoices)
            invoice_count = len(all_invoices)
            
            logger.info(f"   Total Invoices: {invoice_count}")
            logger.info(f"   Total Gross: ₹{total_gross:,.2f}")
            logger.info(f"   Total Net: ₹{total_net:,.2f}")
            logger.info(f"   Total Credit Notes: ₹{total_credit:,.2f}")
            logger.info(f"   Total Outstanding: ₹{total_outstanding:,.2f}")
            
            # Update account with invoice summary
            logger.info(f"📝 STEP 5: Updating account with invoice summary...")
            await self.db.accounts.update_one(
                {'id': account['id']},
                {
                    '$set': {
                        'total_gross_invoice_value': total_gross,
                        'total_net_invoice_value': total_net,
                        'total_credit_note_value': total_credit,
                        'total_outstanding': total_outstanding,
                        'invoice_count': invoice_count,
                        'last_invoice_date': invoice_data.get('invoice_date'),
                        'last_invoice_no': invoice_data.get('invoice_no'),
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    }
                }
            )
            
            logger.info(f"✅ STEP 6: Account updated successfully!")
            logger.info(f"   Account: {account.get('account_id')} - {account.get('account_name')}")
            logger.info(f"   Invoice: {invoice_data.get('invoice_no')}")
            
            # Update resource (assigned_to) invoice totals for reporting
            assigned_to = account.get('assigned_to')
            if assigned_to:
                logger.info(f"📊 STEP 7: Updating resource invoice totals for: {assigned_to}")
                await self._update_resource_invoice_totals(assigned_to, invoice_data.get('gross_invoice_value', 0))
            
            connection_stats['messages_processed'] += 1
            logger.info("="*60)
            logger.info(f"✅ MESSAGE PROCESSING COMPLETE")
            logger.info(f"   Total Received: {connection_stats['messages_received']}")
            logger.info(f"   Total Processed: {connection_stats['messages_processed']}")
            logger.info(f"   Total Failed: {connection_stats['messages_failed']}")
            logger.info("="*60)
            
        except Exception as e:
            connection_stats['messages_failed'] += 1
            logger.error(f"❌ ERROR UPDATING ACCOUNT: {e}")
            import traceback
            logger.error(traceback.format_exc())
    
    async def _update_resource_invoice_totals(self, resource_id: str, gross_value: float):
        """Update resource invoice totals for allocation reporting"""
        try:
            # Get or create resource invoice summary
            resource_summary = await self.db.resource_invoice_summary.find_one({'resource_id': resource_id})
            
            if resource_summary:
                new_total = resource_summary.get('total_gross_invoice_value', 0) + gross_value
                new_count = resource_summary.get('invoice_count', 0) + 1
                
                await self.db.resource_invoice_summary.update_one(
                    {'resource_id': resource_id},
                    {
                        '$set': {
                            'total_gross_invoice_value': new_total,
                            'invoice_count': new_count,
                            'updated_at': datetime.now(timezone.utc).isoformat()
                        }
                    }
                )
            else:
                await self.db.resource_invoice_summary.insert_one({
                    'resource_id': resource_id,
                    'total_gross_invoice_value': gross_value,
                    'invoice_count': 1,
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'updated_at': datetime.now(timezone.utc).isoformat()
                })
            
            logger.info(f"Updated resource {resource_id} invoice totals")
            
        except Exception as e:
            logger.error(f"Error updating resource invoice totals: {e}")


class ActiveMQSubscriber:
    """ActiveMQ Subscriber service with auto-reconnect and status logging"""
    
    def __init__(self):
        self.connection = None
        self.listener = None
        self.running = False
        self.db_client = None
        self.reconnect_attempts = 0
        self.max_reconnect_attempts = -1  # Infinite reconnect attempts
        self.reconnect_delay = 10  # 10 seconds between reconnect attempts
        self.status_thread = None
        self._reconnecting = False  # Flag to prevent multiple simultaneous reconnects
        
    def connect(self):
        """Establish connection to ActiveMQ"""
        try:
            # Create MongoDB client
            self.db_client = AsyncIOMotorClient(mongo_url)
            
            # Create listener with reconnect callback
            self.listener = InvoiceListener(self.db_client)
            self.listener.set_subscriber(self)
            
            # Start event loop in background thread
            loop_thread = threading.Thread(target=self._run_event_loop, daemon=True)
            loop_thread.start()
            
            self._establish_connection()
            
            # Start status logging thread (every 30 seconds)
            self.status_thread = threading.Thread(target=self._log_status_periodically, daemon=True)
            self.status_thread.start()
            
        except Exception as e:
            logger.error(f"❌ Failed to connect to ActiveMQ: {e}")
            raise
    
    def _log_status_periodically(self):
        """Log connection status every 30 seconds"""
        while self.running:
            try:
                is_connected = self.connection and self.connection.is_connected() if self.connection else False
                connection_stats['connected'] = is_connected
                
                logger.info("-"*60)
                logger.info("📊 ACTIVEMQ STATUS CHECK (every 30 seconds)")
                logger.info(f"   Connected: {'✅ YES' if is_connected else '❌ NO'}")
                logger.info(f"   Host: {ACTIVEMQ_HOST}:{ACTIVEMQ_PORT}")
                logger.info(f"   Queue: {ACTIVEMQ_QUEUE}")
                logger.info(f"   Last Connected: {connection_stats['last_connected_at'] or 'Never'}")
                logger.info(f"   Last Disconnected: {connection_stats['last_disconnected_at'] or 'Never'}")
                logger.info(f"   Messages Received: {connection_stats['messages_received']}")
                logger.info(f"   Messages Processed: {connection_stats['messages_processed']}")
                logger.info(f"   Messages Failed: {connection_stats['messages_failed']}")
                logger.info(f"   Last Message At: {connection_stats['last_message_at'] or 'Never'}")
                logger.info(f"   Reconnect Count: {connection_stats['reconnect_count']}")
                logger.info("-"*60)
                
            except Exception as e:
                logger.error(f"Error in status logging: {e}")
            
            # Sleep for 30 seconds
            time.sleep(30)
    
    def _establish_connection(self):
        """Create and establish STOMP connection"""
        try:
            # Create STOMP connection with SSL
            # Heartbeats: (send, receive) in milliseconds
            # 0,0 = disable heartbeats (let the broker handle keepalive)
            # Using longer heartbeats to be more lenient with network latency
            self.connection = stomp.Connection(
                [(ACTIVEMQ_HOST, ACTIVEMQ_PORT)],
                heartbeats=(60000, 60000),  # 60 second heartbeats (more lenient)
                reconnect_sleep_initial=2,
                reconnect_sleep_increase=1.5,
                reconnect_sleep_max=30,
                reconnect_attempts_max=-1,  # Infinite reconnect attempts
                timeout=30,  # 30 second connection timeout
                keepalive=True  # Enable TCP keepalive
            )
            
            # Configure SSL
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            
            self.connection.set_ssl(
                for_hosts=[(ACTIVEMQ_HOST, ACTIVEMQ_PORT)],
                ssl_version=ssl.PROTOCOL_TLS
            )
            
            # Set listener
            self.connection.set_listener('invoice_listener', self.listener)
            
            # Connect with credentials - use unique client-id for this instance
            import uuid
            client_id = f"nyla-crm-{uuid.uuid4().hex[:8]}"
            logger.info(f"🔌 Connecting to ActiveMQ at {ACTIVEMQ_HOST}:{ACTIVEMQ_PORT}")
            logger.info(f"   Client ID: {client_id}")
            logger.info(f"   Heartbeat: 60 seconds")
            
            # Connect with wait=True to ensure connection is established
            self.connection.connect(
                ACTIVEMQ_USER,
                ACTIVEMQ_PASSWORD,
                wait=True,  # Wait for connection to be established
                headers={
                    'client-id': client_id,
                    'heart-beat': '60000,60000'  # Explicitly set heartbeat in headers
                }
            )
            
            # Subscribe to queue with durable subscription
            self.connection.subscribe(
                destination=ACTIVEMQ_QUEUE,
                id='invoice-sub-1',
                ack='auto',
                headers={
                    'activemq.prefetchSize': '1'  # Process one message at a time
                }
            )
        
            self.running = True
            self.reconnect_attempts = 0
            logger.info(f"✅ Subscribed to queue: {ACTIVEMQ_QUEUE}")
            logger.info(f"✅ Connection established - listening for messages...")
        except Exception as e:
            logger.error(f"❌ Failed to establish connection: {e}")
            import traceback
            logger.error(traceback.format_exc())
            raise
    
    def reconnect(self):
        """Attempt to reconnect to ActiveMQ"""
        # Prevent multiple simultaneous reconnect attempts
        if self._reconnecting:
            logger.info("🔄 Reconnect already in progress, skipping...")
            return
            
        # Check max attempts only if not set to infinite (-1)
        if self.max_reconnect_attempts != -1 and self.reconnect_attempts >= self.max_reconnect_attempts:
            logger.error(f"Max reconnect attempts ({self.max_reconnect_attempts}) reached")
            return
        
        self._reconnecting = True
        self.reconnect_attempts += 1
        logger.info(f"🔄 Attempting reconnect (attempt #{self.reconnect_attempts}, max: {'unlimited' if self.max_reconnect_attempts == -1 else self.max_reconnect_attempts})...")
        
        try:
            logger.info(f"⏳ Waiting {self.reconnect_delay} seconds before reconnecting...")
            time.sleep(self.reconnect_delay)
            self._establish_connection()
            self._reconnecting = False
            logger.info("✅ Reconnected successfully!")
        except Exception as e:
            self._reconnecting = False
            logger.error(f"❌ Reconnect attempt #{self.reconnect_attempts} failed: {e}")
            # Schedule another reconnect attempt after a delay
            logger.info(f"🔄 Scheduling next reconnect attempt...")
            threading.Thread(target=self.reconnect, daemon=True).start()
    
    def _run_event_loop(self):
        """Run asyncio event loop in background thread"""
        asyncio.set_event_loop(self.listener.loop)
        self.listener.loop.run_forever()
    
    def disconnect(self):
        """Disconnect from ActiveMQ"""
        if self.connection and self.connection.is_connected():
            self.connection.disconnect()
            self.running = False
            logger.info("Disconnected from ActiveMQ")
        
        if self.listener and self.listener.loop:
            self.listener.loop.call_soon_threadsafe(self.listener.loop.stop)
            
        if self.db_client:
            self.db_client.close()
    
    def is_connected(self):
        """Check if connected to ActiveMQ"""
        return self.connection and self.connection.is_connected()


# Global subscriber instance
mq_subscriber = ActiveMQSubscriber()


def start_mq_subscriber():
    """Start the ActiveMQ subscriber in a background thread - NON-BLOCKING"""
    if not ACTIVEMQ_ENABLED:
        logger.info("ℹ️ ActiveMQ subscriber is disabled (ACTIVEMQ_ENABLED=false or missing credentials)")
        return None
    
    if not ACTIVEMQ_HOST or not ACTIVEMQ_USER or not ACTIVEMQ_PASSWORD:
        logger.info("ℹ️ ActiveMQ subscriber skipped - missing required configuration")
        return None
    
    logger.info("="*60)
    logger.info("🚀 STARTING ACTIVEMQ SUBSCRIBER (background thread)")
    logger.info(f"   Host: {ACTIVEMQ_HOST}:{ACTIVEMQ_PORT}")
    logger.info(f"   Queue: {ACTIVEMQ_QUEUE}")
    logger.info("="*60)
        
    def run():
        try:
            mq_subscriber.connect()
            logger.info("✅ ActiveMQ subscriber started successfully")
        except Exception as e:
            logger.error(f"❌ Failed to start ActiveMQ subscriber: {e}")
            import traceback
            logger.error(traceback.format_exc())
    
    thread = threading.Thread(target=run, daemon=True, name="activemq-subscriber")
    thread.start()
    
    # Don't wait for the thread - return immediately so server can start
    logger.info("🔄 ActiveMQ connection running in background - server startup continues...")
    return thread


def stop_mq_subscriber():
    """Stop the ActiveMQ subscriber"""
    if mq_subscriber.running:
        mq_subscriber.disconnect()


async def process_invoice_manually(invoice_data: dict, db) -> dict:
    """
    Process an invoice message manually (for testing or webhook fallback)
    Returns result of the processing
    """
    try:
        # Extract fields from invoice data - handle both field naming conventions
        processed = {
            'id': str(__import__('uuid').uuid4()),
            'invoice_no': invoice_data.get('invoiceNo'),
            'invoice_date': invoice_data.get('invoiceDate') or invoice_data.get('invoiceData'),  # Support both field names
            'gross_invoice_value': float(invoice_data.get('grossInvoiceValue', 0) or 0),
            'net_invoice_value': float(invoice_data.get('netInvoiceValue', 0) or 0),
            'credit_note_value': float(invoice_data.get('creditNoteValue', 0) or 0),
            'outstanding': float(invoice_data.get('outstanding', 0) or 0),
            'account_id_from_mq': invoice_data.get('ACCOUNT_ID'),  # New field
            'c_lead_id': invoice_data.get('C_LEAD_ID'),  # Legacy field
            'ca_lead_id': invoice_data.get('CA_LEAD_ID'),  # Legacy field
            'items': invoice_data.get('items', []),
            'received_at': datetime.now(timezone.utc).isoformat()
        }
        
        # Use ACCOUNT_ID as primary, fallback to CA_LEAD_ID for legacy messages
        account_id = processed.get('account_id_from_mq') or processed.get('ca_lead_id')
        
        if not account_id:
            return {'success': False, 'error': 'No ACCOUNT_ID or CA_LEAD_ID in invoice message'}
        
        # Find account by account_id
        account = await db.accounts.find_one({'account_id': account_id})
        
        if not account:
            # Store as unmatched invoice
            processed['status'] = 'unmatched'
            await db.invoices.insert_one(processed)
            return {
                'success': False, 
                'error': f'Account not found for account_id: {account_id}',
                'invoice_stored': True,
                'status': 'unmatched'
            }
        
        # Store invoice linked to account
        processed['account_uuid'] = account['id']
        processed['account_id'] = account.get('account_id')
        processed['assigned_to'] = account.get('assigned_to')
        processed['status'] = 'matched'
        await db.invoices.insert_one(processed)
        
        # Calculate totals for the account
        all_invoices = await db.invoices.find({
            'account_uuid': account['id'],
            'status': 'matched'
        }).to_list(1000)
        
        total_gross = sum(inv.get('gross_invoice_value', 0) for inv in all_invoices)
        total_net = sum(inv.get('net_invoice_value', 0) for inv in all_invoices)
        total_credit = sum(inv.get('credit_note_value', 0) for inv in all_invoices)
        total_outstanding = sum(inv.get('outstanding', 0) for inv in all_invoices)
        invoice_count = len(all_invoices)
        
        # Update account with invoice summary
        await db.accounts.update_one(
            {'id': account['id']},
            {
                '$set': {
                    'total_gross_invoice_value': total_gross,
                    'total_net_invoice_value': total_net,
                    'total_credit_note_value': total_credit,
                    'total_outstanding': total_outstanding,
                    'invoice_count': invoice_count,
                    'last_invoice_date': processed.get('invoice_date'),
                    'last_invoice_no': processed.get('invoice_no'),
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        # Update resource (assigned_to) invoice totals for reporting
        assigned_to = account.get('assigned_to')
        if assigned_to:
            resource_summary = await db.resource_invoice_summary.find_one({'resource_id': assigned_to})
            gross_value = processed.get('gross_invoice_value', 0)
            
            if resource_summary:
                new_total = resource_summary.get('total_gross_invoice_value', 0) + gross_value
                new_count = resource_summary.get('invoice_count', 0) + 1
                
                await db.resource_invoice_summary.update_one(
                    {'resource_id': assigned_to},
                    {
                        '$set': {
                            'total_gross_invoice_value': new_total,
                            'invoice_count': new_count,
                            'updated_at': datetime.now(timezone.utc).isoformat()
                        }
                    }
                )
            else:
                await db.resource_invoice_summary.insert_one({
                    'resource_id': assigned_to,
                    'total_gross_invoice_value': gross_value,
                    'invoice_count': 1,
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'updated_at': datetime.now(timezone.utc).isoformat()
                })
        
        return {
            'success': True,
            'account_id': account.get('account_id'),
            'account_name': account.get('account_name'),
            'assigned_to': assigned_to,
            'invoice_no': processed.get('invoice_no'),
            'totals': {
                'gross': total_gross,
                'net': total_net,
                'credit': total_credit,
                'outstanding': total_outstanding,
                'count': invoice_count
            }
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


if __name__ == "__main__":
    # Test the subscriber standalone
    import time
    
    print("Starting ActiveMQ subscriber...")
    start_mq_subscriber()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping subscriber...")
        stop_mq_subscriber()
