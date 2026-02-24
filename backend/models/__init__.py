"""
Pydantic models for the Sales CRM application
"""
from .user import User, UserCreate, UserLogin, UserRole
from .lead import Lead, LeadCreate, LeadUpdate, LeadStatus, PaginatedLeadsResponse
from .account import Account, AccountCreate, AccountUpdate, AccountSKUPricing, DeliveryAddress, PaginatedAccountsResponse
from .activity import Activity, ActivityCreate, FollowUp, FollowUpCreate, Comment, CommentCreate
from .daily_status import DailyStatus, DailyStatusCreate, DailyStatusUpdate
from .leave import LeaveRequest, LeaveRequestCreate, LeaveApproval
from .target import TargetPlan, TargetPlanCreate, TerritoryTarget, TerritoryTargetCreate, CityTarget, CityTargetCreate, ResourceTarget, ResourceTargetCreate, SKUTarget, SKUTargetCreate
from .cogs import COGSData, COGSDataUpdate
from .invoice import Invoice
from .user_activity import UserActivity, UserActivityEvent, ActivityHeartbeat
