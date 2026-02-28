"""
Zoom API Integration Service
Server-to-Server OAuth for creating Zoom meetings automatically
"""
import os
import httpx
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

class ZoomAPIClient:
    def __init__(self):
        self.account_id = os.environ.get('ZOOM_ACCOUNT_ID')
        self.client_id = os.environ.get('ZOOM_CLIENT_ID')
        self.client_secret = os.environ.get('ZOOM_CLIENT_SECRET')
        self.base_url = "https://api.zoom.us/v2"
        self.token_url = "https://zoom.us/oauth/token"
        self.access_token: Optional[str] = None
        self.token_expiry: Optional[datetime] = None
    
    def is_configured(self) -> bool:
        """Check if Zoom credentials are configured."""
        return all([self.account_id, self.client_id, self.client_secret])
    
    def get_access_token(self) -> str:
        """Generate a new Zoom API access token using Server-to-Server OAuth."""
        if not self.is_configured():
            raise Exception("Zoom API credentials not configured")
        
        # Check if we have a valid cached token
        if self.access_token and self.token_expiry and datetime.utcnow() < self.token_expiry:
            return self.access_token
        
        payload = {
            "grant_type": "account_credentials",
            "account_id": self.account_id
        }
        
        auth = (self.client_id, self.client_secret)
        
        try:
            response = httpx.post(
                self.token_url,
                data=payload,
                auth=auth,
                timeout=10.0
            )
            response.raise_for_status()
            
            token_data = response.json()
            self.access_token = token_data.get("access_token")
            expires_in = token_data.get("expires_in", 3600)
            # Set expiry 60 seconds before actual expiry to be safe
            self.token_expiry = datetime.utcnow() + timedelta(seconds=expires_in - 60)
            
            return self.access_token
        except httpx.HTTPError as e:
            raise Exception(f"Failed to obtain Zoom access token: {str(e)}")
    
    def _get_headers(self) -> Dict[str, str]:
        """Prepare authorization headers for API requests."""
        token = self.get_access_token()
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    
    def create_meeting(
        self,
        topic: str,
        start_time: str,
        duration: int,
        timezone: str = "Asia/Kolkata",
        agenda: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a Zoom meeting and return meeting details including join URL.
        
        Args:
            topic: Meeting title
            start_time: Start time in ISO 8601 format (YYYY-MM-DDTHH:MM:SS)
            duration: Duration in minutes
            timezone: IANA timezone identifier (default: Asia/Kolkata)
            agenda: Meeting description/agenda
        
        Returns:
            Dict with meeting_id, join_url, start_url, password, etc.
        """
        # Use 'me' as user_id to create meeting for the authenticated account
        url = f"{self.base_url}/users/me/meetings"
        
        meeting_data = {
            "topic": topic,
            "type": 2,  # Scheduled meeting
            "start_time": start_time,
            "duration": duration,
            "timezone": timezone,
            "agenda": agenda or "",
            "settings": {
                "host_video": True,
                "participant_video": True,
                "join_before_host": True,
                "mute_upon_entry": False,
                "watermark": False,
                "audio": "both",
                "auto_recording": "none",
                "waiting_room": False,
                "meeting_authentication": False
            }
        }
        
        headers = self._get_headers()
        
        try:
            response = httpx.post(
                url,
                json=meeting_data,
                headers=headers,
                timeout=15.0
            )
            response.raise_for_status()
            
            meeting_response = response.json()
            return {
                "meeting_id": str(meeting_response.get("id")),
                "join_url": meeting_response.get("join_url"),
                "start_url": meeting_response.get("start_url"),
                "password": meeting_response.get("password"),
                "host_id": meeting_response.get("host_id"),
                "host_email": meeting_response.get("host_email")
            }
        except httpx.HTTPStatusError as e:
            error_detail = ""
            try:
                error_detail = e.response.json()
            except:
                error_detail = e.response.text
            raise Exception(f"Failed to create Zoom meeting: {error_detail}")
        except httpx.HTTPError as e:
            raise Exception(f"Failed to create Zoom meeting: {str(e)}")
    
    def delete_meeting(self, meeting_id: str) -> bool:
        """Delete a Zoom meeting."""
        url = f"{self.base_url}/meetings/{meeting_id}"
        headers = self._get_headers()
        
        try:
            response = httpx.delete(url, headers=headers, timeout=10.0)
            response.raise_for_status()
            return True
        except httpx.HTTPError as e:
            raise Exception(f"Failed to delete Zoom meeting: {str(e)}")


# Singleton instance
_zoom_client: Optional[ZoomAPIClient] = None

def get_zoom_client() -> ZoomAPIClient:
    """Get or create Zoom API client singleton."""
    global _zoom_client
    if _zoom_client is None:
        _zoom_client = ZoomAPIClient()
    return _zoom_client
