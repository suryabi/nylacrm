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
        
    def on_connected(self, frame):
        logger.info("Connected to ActiveMQ broker")
        
    def on_disconnected(self):
        logger.warning("Disconnected from ActiveMQ broker")
        
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
            
        except Exception as e:
            logger.error(f"Error updating lead with invoice: {e}")


class ActiveMQSubscriber:
    """ActiveMQ Subscriber service"""
    
    def __init__(self):
        self.connection = None
        self.listener = None
        self.running = False
        self.db_client = None
        
    def connect(self):
        """Establish connection to ActiveMQ"""
        try:
            # Create MongoDB client
            self.db_client = AsyncIOMotorClient(mongo_url)
            
            # Create listener
            self.listener = InvoiceListener(self.db_client)
            
            # Start event loop in background thread
            loop_thread = threading.Thread(target=self._run_event_loop, daemon=True)
            loop_thread.start()
            
            # Create STOMP connection with SSL
            self.connection = stomp.Connection(
                [(ACTIVEMQ_HOST, ACTIVEMQ_PORT)],
                heartbeats=(10000, 10000)  # 10 second heartbeats
            )
            
            # Configure SSL
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE  # Amazon MQ may require this
            
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
            logger.info(f"Subscribed to queue: {ACTIVEMQ_QUEUE}")
            
        except Exception as e:
            logger.error(f"Failed to connect to ActiveMQ: {e}")
            raise
    
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
        
        return {
            'success': True,
            'lead_id': lead_id,
            'lead_company': lead.get('company'),
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
