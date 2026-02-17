"""
ActiveMQ Subscriber for Invoice Messages
Subscribes to Amazon MQ and updates leads with invoice data
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

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ActiveMQ Configuration
ACTIVEMQ_HOST = os.environ.get('ACTIVEMQ_HOST', 'b-98672ff4-9e09-4640-a671-2985257fb660-1.mq.us-west-2.amazonaws.com')
ACTIVEMQ_PORT = int(os.environ.get('ACTIVEMQ_PORT', 61614))
ACTIVEMQ_USER = os.environ.get('ACTIVEMQ_USER', 'nyla-mq')
ACTIVEMQ_PASSWORD = os.environ.get('ACTIVEMQ_PASSWORD', 'nylaXX0109##')
ACTIVEMQ_QUEUE = os.environ.get('ACTIVEMQ_QUEUE', '/queue/invoices')
ACTIVEMQ_ENABLED = os.environ.get('ACTIVEMQ_ENABLED', 'false').lower() == 'true'

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME')


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
        logger.info("Connected to ActiveMQ broker")
    
    def on_heartbeat_timeout(self):
        logger.warning("Heartbeat timeout detected")
        
    def on_disconnected(self):
        logger.warning("Disconnected from ActiveMQ broker")
        # Trigger reconnect
        if self.subscriber and self.subscriber.running:
            logger.info("Scheduling reconnect...")
            threading.Thread(target=self.subscriber.reconnect, daemon=True).start()
        
    def on_error(self, frame):
        logger.error(f"ActiveMQ Error: {frame.body}")
        
    def on_message(self, frame):
        """Process incoming invoice message"""
        try:
            logger.info(f"Received message: {frame.body}")
            
            # Parse JSON message
            if isinstance(frame.body, bytes):
                message_data = json.loads(frame.body.decode('utf-8'))
            else:
                message_data = json.loads(frame.body)
            
            # Extract invoice data
            invoice_data = {
                'invoice_no': message_data.get('invoiceNo'),
                'invoice_date': message_data.get('invoiceData'),  # Note: typo in source as 'invoiceData'
                'gross_invoice_value': float(message_data.get('grossInvoiceValue', 0)),
                'net_invoice_value': float(message_data.get('netInvoiceValue', 0)),
                'credit_note_value': float(message_data.get('creditNoteValue', 0)),
                'c_lead_id': message_data.get('C_LEAD_ID'),
                'ca_lead_id': message_data.get('CA_LEAD_ID'),  # This is our lead_id to match
                'received_at': datetime.now(timezone.utc).isoformat()
            }
            
            # Process in async context
            asyncio.run_coroutine_threadsafe(
                self._process_invoice(invoice_data),
                self.loop
            )
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse message JSON: {e}")
        except Exception as e:
            logger.error(f"Error processing message: {e}")
    
    async def _process_invoice(self, invoice_data):
        """Update lead with invoice data"""
        try:
            lead_id = invoice_data.get('ca_lead_id')
            
            if not lead_id:
                logger.warning("No CA_LEAD_ID in invoice message")
                return
            
            # Find lead by lead_id (our unique formatted ID)
            lead = await self.db.leads.find_one({'lead_id': lead_id})
            
            if not lead:
                logger.warning(f"Lead not found for lead_id: {lead_id}")
                # Store as unmatched invoice for later reconciliation
                invoice_data['status'] = 'unmatched'
                await self.db.invoices.insert_one(invoice_data)
                return
            
            # Store invoice in invoices collection
            invoice_data['lead_uuid'] = lead['id']
            invoice_data['status'] = 'matched'
            await self.db.invoices.insert_one(invoice_data)
            
            # Calculate totals for the lead
            all_invoices = await self.db.invoices.find({
                'lead_uuid': lead['id'],
                'status': 'matched'
            }).to_list(1000)
            
            total_gross = sum(inv.get('gross_invoice_value', 0) for inv in all_invoices)
            total_net = sum(inv.get('net_invoice_value', 0) for inv in all_invoices)
            total_credit = sum(inv.get('credit_note_value', 0) for inv in all_invoices)
            invoice_count = len(all_invoices)
            
            # Update lead with invoice summary
            await self.db.leads.update_one(
                {'id': lead['id']},
                {
                    '$set': {
                        'total_gross_invoice_value': total_gross,
                        'total_net_invoice_value': total_net,
                        'total_credit_note_value': total_credit,
                        'invoice_count': invoice_count,
                        'last_invoice_date': invoice_data.get('invoice_date'),
                        'last_invoice_no': invoice_data.get('invoice_no'),
                        'updated_at': datetime.now(timezone.utc).isoformat()
                    }
                }
            )
            
            logger.info(f"Updated lead {lead_id} with invoice {invoice_data.get('invoice_no')}")
            
            # Update resource (assigned_to) invoice totals for reporting
            assigned_to = lead.get('assigned_to')
            if assigned_to:
                await self._update_resource_invoice_totals(assigned_to, invoice_data.get('gross_invoice_value', 0))
            
        except Exception as e:
            logger.error(f"Error updating lead with invoice: {e}")
    
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
    """ActiveMQ Subscriber service with auto-reconnect"""
    
    def __init__(self):
        self.connection = None
        self.listener = None
        self.running = False
        self.db_client = None
        self.reconnect_attempts = 0
        self.max_reconnect_attempts = 10
        self.reconnect_delay = 5  # seconds
        
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
            
        except Exception as e:
            logger.error(f"Failed to connect to ActiveMQ: {e}")
            raise
    
    def _establish_connection(self):
        """Create and establish STOMP connection"""
        # Create STOMP connection with SSL and longer heartbeats
        self.connection = stomp.Connection(
            [(ACTIVEMQ_HOST, ACTIVEMQ_PORT)],
            heartbeats=(30000, 30000),  # 30 second heartbeats
            reconnect_sleep_initial=5,
            reconnect_sleep_increase=2,
            reconnect_sleep_max=60,
            reconnect_attempts_max=-1  # Infinite reconnect attempts
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
        
        # Connect with credentials
        logger.info(f"Connecting to ActiveMQ at {ACTIVEMQ_HOST}:{ACTIVEMQ_PORT}")
        self.connection.connect(
            ACTIVEMQ_USER,
            ACTIVEMQ_PASSWORD,
            wait=True,
            headers={'client-id': 'nyla-crm-subscriber'}
        )
        
        # Subscribe to queue
        self.connection.subscribe(
            destination=ACTIVEMQ_QUEUE,
            id='invoice-sub-1',
            ack='auto'
        )
        
        self.running = True
        self.reconnect_attempts = 0
        logger.info(f"Subscribed to queue: {ACTIVEMQ_QUEUE}")
    
    def reconnect(self):
        """Attempt to reconnect to ActiveMQ"""
        if self.reconnect_attempts >= self.max_reconnect_attempts:
            logger.error(f"Max reconnect attempts ({self.max_reconnect_attempts}) reached")
            return
        
        self.reconnect_attempts += 1
        logger.info(f"Attempting reconnect ({self.reconnect_attempts}/{self.max_reconnect_attempts})...")
        
        try:
            time.sleep(self.reconnect_delay)
            self._establish_connection()
            logger.info("Reconnected successfully!")
        except Exception as e:
            logger.error(f"Reconnect failed: {e}")
            # Schedule another reconnect attempt
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
    """Start the ActiveMQ subscriber in a background thread"""
    if not ACTIVEMQ_ENABLED:
        logger.info("ActiveMQ subscriber is disabled (ACTIVEMQ_ENABLED=false)")
        return None
        
    def run():
        try:
            mq_subscriber.connect()
            logger.info("ActiveMQ subscriber started successfully")
        except Exception as e:
            logger.error(f"Failed to start ActiveMQ subscriber: {e}")
    
    thread = threading.Thread(target=run, daemon=True)
    thread.start()
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
        # Extract fields from invoice data
        processed = {
            'id': str(__import__('uuid').uuid4()),
            'invoice_no': invoice_data.get('invoiceNo'),
            'invoice_date': invoice_data.get('invoiceData'),  # Note: typo in source
            'gross_invoice_value': float(invoice_data.get('grossInvoiceValue', 0)),
            'net_invoice_value': float(invoice_data.get('netInvoiceValue', 0)),
            'credit_note_value': float(invoice_data.get('creditNoteValue', 0)),
            'c_lead_id': invoice_data.get('C_LEAD_ID'),
            'ca_lead_id': invoice_data.get('CA_LEAD_ID'),
            'received_at': datetime.now(timezone.utc).isoformat()
        }
        
        lead_id = processed.get('ca_lead_id')
        
        if not lead_id:
            return {'success': False, 'error': 'No CA_LEAD_ID in invoice message'}
        
        # Find lead by lead_id (our unique formatted ID)
        lead = await db.leads.find_one({'lead_id': lead_id})
        
        if not lead:
            # Store as unmatched invoice
            processed['status'] = 'unmatched'
            await db.invoices.insert_one(processed)
            return {
                'success': False, 
                'error': f'Lead not found for lead_id: {lead_id}',
                'invoice_stored': True,
                'status': 'unmatched'
            }
        
        # Store invoice linked to lead
        processed['lead_uuid'] = lead['id']
        processed['assigned_to'] = lead.get('assigned_to')
        processed['status'] = 'matched'
        await db.invoices.insert_one(processed)
        
        # Calculate totals for the lead
        all_invoices = await db.invoices.find({
            'lead_uuid': lead['id'],
            'status': 'matched'
        }).to_list(1000)
        
        total_gross = sum(inv.get('gross_invoice_value', 0) for inv in all_invoices)
        total_net = sum(inv.get('net_invoice_value', 0) for inv in all_invoices)
        total_credit = sum(inv.get('credit_note_value', 0) for inv in all_invoices)
        invoice_count = len(all_invoices)
        
        # Update lead with invoice summary
        await db.leads.update_one(
            {'id': lead['id']},
            {
                '$set': {
                    'total_gross_invoice_value': total_gross,
                    'total_net_invoice_value': total_net,
                    'total_credit_note_value': total_credit,
                    'invoice_count': invoice_count,
                    'last_invoice_date': processed.get('invoice_date'),
                    'last_invoice_no': processed.get('invoice_no'),
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        # Update resource (assigned_to) invoice totals for reporting
        assigned_to = lead.get('assigned_to')
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
            'lead_id': lead_id,
            'lead_company': lead.get('company'),
            'assigned_to': assigned_to,
            'invoice_no': processed.get('invoice_no'),
            'totals': {
                'gross': total_gross,
                'net': total_net,
                'credit': total_credit,
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
