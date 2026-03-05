"""
Tasks routes - Task/Action items CRUD
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid

from database import db
from deps import get_current_user

router = APIRouter()

# ============= MODELS =============

class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = None
    task_type: str = 'general'
    priority: str = 'medium'
    status: str = 'pending'
    due_date: str
    due_time: Optional[str] = None
    assigned_to: str
    assigned_to_name: Optional[str] = None
    assigned_by: str
    assigned_by_name: Optional[str] = None
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    lead_id: Optional[str] = None
    account_id: Optional[str] = None
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        extra = "ignore"


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    task_type: str = 'general'
    priority: str = 'medium'
    due_date: str
    due_time: Optional[str] = None
    assigned_to: str
    lead_id: Optional[str] = None
    account_id: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    task_type: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    assigned_to: Optional[str] = None
    lead_id: Optional[str] = None
    account_id: Optional[str] = None
    comment: Optional[str] = None


# ============= TASK ROUTES =============

@router.post("")
async def create_task(task: TaskCreate, current_user: dict = Depends(get_current_user)):
    """Create a new task"""
    # Get assignee name
    assignee = await db.users.find_one({'id': task.assigned_to}, {'_id': 0, 'name': 1})
    assignee_name = assignee.get('name') if assignee else None
    
    task_data = {
        'id': str(uuid.uuid4()),
        'title': task.title,
        'description': task.description,
        'task_type': task.task_type,
        'priority': task.priority,
        'status': 'pending',
        'due_date': task.due_date,
        'due_time': task.due_time,
        'assigned_to': task.assigned_to,
        'assigned_to_name': assignee_name,
        'assigned_by': current_user['id'],
        'assigned_by_name': current_user.get('name'),
        'created_by': current_user['id'],
        'created_by_name': current_user.get('name'),
        'lead_id': task.lead_id,
        'account_id': task.account_id,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await db.tasks.insert_one(task_data)
    
    return task_data


@router.get("")
async def get_tasks(
    assigned_to: Optional[str] = None,
    status: Optional[str] = None,
    lead_id: Optional[str] = None,
    account_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get tasks with optional filters"""
    query = {}
    
    if assigned_to:
        query['assigned_to'] = assigned_to
    
    if status:
        statuses = status.split(',')
        query['status'] = {'$in': statuses}
    
    if lead_id:
        query['lead_id'] = lead_id
    
    if account_id:
        query['account_id'] = account_id
    
    tasks = await db.tasks.find(query, {'_id': 0}).sort('due_date', 1).to_list(1000)
    
    return tasks


@router.get("/{task_id}")
async def get_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single task"""
    task = await db.tasks.find_one({'id': task_id}, {'_id': 0})
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    return task


@router.put("/{task_id}")
async def update_task(task_id: str, update: TaskUpdate, current_user: dict = Depends(get_current_user)):
    """Update a task"""
    existing = await db.tasks.find_one({'id': task_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail='Task not found')
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None and k != 'comment'}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Handle status changes
    if update.status == 'completed' and existing.get('status') != 'completed':
        update_data['completed_at'] = datetime.now(timezone.utc).isoformat()
    
    # Update assignee name if changing assigned_to
    if update.assigned_to and update.assigned_to != existing.get('assigned_to'):
        assignee = await db.users.find_one({'id': update.assigned_to}, {'_id': 0, 'name': 1})
        update_data['assigned_to_name'] = assignee.get('name') if assignee else None
    
    await db.tasks.update_one({'id': task_id}, {'$set': update_data})
    
    # Add comment if provided
    if update.comment:
        comment_data = {
            'id': str(uuid.uuid4()),
            'task_id': task_id,
            'comment': update.comment,
            'created_by': current_user['id'],
            'created_by_name': current_user.get('name'),
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        await db.task_comments.insert_one(comment_data)
    
    return await db.tasks.find_one({'id': task_id}, {'_id': 0})


@router.delete("/{task_id}")
async def delete_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a task"""
    result = await db.tasks.delete_one({'id': task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Task not found')
    
    # Delete associated comments
    await db.task_comments.delete_many({'task_id': task_id})
    
    return {'message': 'Task deleted successfully'}
