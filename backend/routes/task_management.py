"""
Task Management Module - GitHub-style Issue Tracker
Multi-tenant aware with department-based visibility
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid

from database import get_tenant_db
from deps import get_current_user

router = APIRouter()

def get_tdb():
    """Get tenant-aware database wrapper"""
    return get_tenant_db()

# Role constants for permission checks
ADMIN_ROLES = ['CEO', 'Director', 'System Admin', 'ceo', 'director', 'system admin']
ELEVATED_ROLES = ['CEO', 'Director', 'System Admin', 'Vice President', 'ceo', 'director', 'system admin', 'vp']

def can_manage_settings(user: dict) -> bool:
    """Check if user can manage milestones/labels"""
    role = user.get('role', '')
    return role in ADMIN_ROLES or role.lower() in [r.lower() for r in ADMIN_ROLES]

def can_view_all_tasks(user: dict) -> bool:
    """Check if user can view tasks from all departments"""
    role = user.get('role', '')
    return role in ELEVATED_ROLES or role.lower() in [r.lower() for r in ELEVATED_ROLES]


# ============= MODELS =============

class LabelCreate(BaseModel):
    name: str
    color: str = '#6366f1'  # Default indigo
    description: Optional[str] = None


class LabelUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None


class MilestoneCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[str] = None
    department_id: Optional[str] = None  # None = org-wide


class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None  # 'open', 'closed'
    department_id: Optional[str] = None


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    severity: str = 'medium'  # 'high', 'medium', 'low'
    status: str = 'open'  # 'open', 'in_progress', 'review', 'closed'
    department_id: str
    assignees: List[str] = []  # List of user IDs
    milestone_id: Optional[str] = None
    labels: List[str] = []  # List of label IDs
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    reminder_date: Optional[str] = None
    linked_entity_type: Optional[str] = None  # 'lead', 'account', 'distributor', 'task'
    linked_entity_id: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    department_id: Optional[str] = None
    assignees: Optional[List[str]] = None
    milestone_id: Optional[str] = None
    labels: Optional[List[str]] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    reminder_date: Optional[str] = None
    linked_entity_type: Optional[str] = None
    linked_entity_id: Optional[str] = None


class CommentCreate(BaseModel):
    content: str
    mentions: List[str] = []  # User IDs mentioned


# ============= LABEL ROUTES =============

@router.get("/labels")
async def get_labels(current_user: dict = Depends(get_current_user)):
    """Get all labels"""
    tdb = get_tdb()
    labels = await tdb.task_labels.find({}, {'_id': 0}).sort('name', 1).to_list(100)
    return labels


@router.post("/labels")
async def create_label(label: LabelCreate, current_user: dict = Depends(get_current_user)):
    """Create a new label (admin only)"""
    if not can_manage_settings(current_user):
        raise HTTPException(status_code=403, detail="Only Admin, CEO, or Director can manage labels")
    
    tdb = get_tdb()
    
    # Check for duplicate name
    existing = await tdb.task_labels.find_one({'name': label.name})
    if existing:
        raise HTTPException(status_code=400, detail="Label with this name already exists")
    
    label_data = {
        'id': str(uuid.uuid4()),
        'name': label.name,
        'color': label.color,
        'description': label.description,
        'created_by': current_user['id'],
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await tdb.task_labels.insert_one(label_data)
    return label_data


@router.put("/labels/{label_id}")
async def update_label(label_id: str, update: LabelUpdate, current_user: dict = Depends(get_current_user)):
    """Update a label (admin only)"""
    if not can_manage_settings(current_user):
        raise HTTPException(status_code=403, detail="Only Admin, CEO, or Director can manage labels")
    
    tdb = get_tdb()
    existing = await tdb.task_labels.find_one({'id': label_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Label not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await tdb.task_labels.update_one({'id': label_id}, {'$set': update_data})
    return await tdb.task_labels.find_one({'id': label_id}, {'_id': 0})


@router.delete("/labels/{label_id}")
async def delete_label(label_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a label (admin only)"""
    if not can_manage_settings(current_user):
        raise HTTPException(status_code=403, detail="Only Admin, CEO, or Director can manage labels")
    
    tdb = get_tdb()
    result = await tdb.task_labels.delete_one({'id': label_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Label not found")
    
    # Remove label from all tasks
    await tdb.tasks_v2.update_many(
        {'labels': label_id},
        {'$pull': {'labels': label_id}}
    )
    
    return {'message': 'Label deleted successfully'}


# ============= MILESTONE ROUTES =============

@router.get("/milestones")
async def get_milestones(
    department_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get milestones"""
    tdb = get_tdb()
    query = {}
    
    if department_id:
        # Include org-wide milestones (department_id is null) + department-specific
        query['$or'] = [
            {'department_id': department_id},
            {'department_id': None},
            {'department_id': {'$exists': False}}
        ]
    
    if status:
        query['status'] = status
    
    milestones = await tdb.task_milestones.find(query, {'_id': 0}).sort('due_date', 1).to_list(100)
    
    # Get task counts for each milestone
    for milestone in milestones:
        task_counts = await tdb.tasks_v2.aggregate([
            {'$match': {'milestone_id': milestone['id']}},
            {'$group': {
                '_id': '$status',
                'count': {'$sum': 1}
            }}
        ]).to_list(10)
        
        milestone['task_counts'] = {item['_id']: item['count'] for item in task_counts}
        milestone['total_tasks'] = sum(item['count'] for item in task_counts)
        milestone['closed_tasks'] = milestone['task_counts'].get('closed', 0)
    
    return milestones


@router.post("/milestones")
async def create_milestone(milestone: MilestoneCreate, current_user: dict = Depends(get_current_user)):
    """Create a new milestone (admin only)"""
    if not can_manage_settings(current_user):
        raise HTTPException(status_code=403, detail="Only Admin, CEO, or Director can manage milestones")
    
    tdb = get_tdb()
    
    milestone_data = {
        'id': str(uuid.uuid4()),
        'title': milestone.title,
        'description': milestone.description,
        'due_date': milestone.due_date,
        'department_id': milestone.department_id,
        'status': 'open',
        'created_by': current_user['id'],
        'created_by_name': current_user.get('name'),
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await tdb.task_milestones.insert_one(milestone_data)
    return milestone_data


@router.put("/milestones/{milestone_id}")
async def update_milestone(milestone_id: str, update: MilestoneUpdate, current_user: dict = Depends(get_current_user)):
    """Update a milestone (admin only)"""
    if not can_manage_settings(current_user):
        raise HTTPException(status_code=403, detail="Only Admin, CEO, or Director can manage milestones")
    
    tdb = get_tdb()
    existing = await tdb.task_milestones.find_one({'id': milestone_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Milestone not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await tdb.task_milestones.update_one({'id': milestone_id}, {'$set': update_data})
    return await tdb.task_milestones.find_one({'id': milestone_id}, {'_id': 0})


@router.delete("/milestones/{milestone_id}")
async def delete_milestone(milestone_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a milestone (admin only)"""
    if not can_manage_settings(current_user):
        raise HTTPException(status_code=403, detail="Only Admin, CEO, or Director can manage milestones")
    
    tdb = get_tdb()
    result = await tdb.task_milestones.delete_one({'id': milestone_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Milestone not found")
    
    # Remove milestone from all tasks
    await tdb.tasks_v2.update_many(
        {'milestone_id': milestone_id},
        {'$set': {'milestone_id': None}}
    )
    
    return {'message': 'Milestone deleted successfully'}


# ============= TASK ROUTES =============

@router.get("/tasks")
async def get_tasks(
    department_id: Optional[str] = None,
    status: Optional[str] = None,
    severity: Optional[str] = None,
    milestone_id: Optional[str] = None,
    label_id: Optional[str] = None,
    assignee_id: Optional[str] = None,
    created_by: Optional[str] = None,
    search: Optional[str] = None,
    linked_entity_type: Optional[str] = None,
    linked_entity_id: Optional[str] = None,
    overdue: Optional[str] = None,
    view: str = 'all',  # 'all', 'my_tasks', 'assigned_by_me', 'watching'
    current_user: dict = Depends(get_current_user)
):
    """Get tasks with filters and department-based visibility"""
    tdb = get_tdb()
    query = {}
    
    user_department = current_user.get('department', 'Sales')
    user_id = current_user['id']
    
    # Department-based visibility
    if can_view_all_tasks(current_user):
        # Admin/CEO/Director can see all tasks
        if department_id:
            query['department_id'] = department_id
    else:
        # Regular users can only see their department's tasks OR tasks assigned to them
        if department_id:
            query['department_id'] = department_id
        else:
            query['$or'] = [
                {'department_id': user_department},
                {'assignees': user_id},
                {'created_by': user_id}
            ]
    
    # View filters
    if view == 'my_tasks':
        query['assignees'] = user_id
    elif view == 'assigned_by_me':
        query['created_by'] = user_id
    elif view == 'watching':
        query['watchers'] = user_id
    
    # Other filters
    if status:
        if status == 'active':
            query['status'] = {'$nin': ['closed']}
        else:
            statuses = status.split(',')
            query['status'] = {'$in': statuses}
    
    if severity:
        severities = severity.split(',')
        query['severity'] = {'$in': severities}
    
    if milestone_id:
        query['milestone_id'] = milestone_id
    
    if label_id:
        query['labels'] = label_id
    
    if assignee_id:
        query['assignees'] = assignee_id
    
    if created_by:
        query['created_by'] = created_by
    
    if linked_entity_type and linked_entity_id:
        query['linked_entity_type'] = linked_entity_type
        query['linked_entity_id'] = linked_entity_id
    
    # Overdue filter
    if overdue and overdue.lower() == 'true':
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        query['due_date'] = {'$lt': today, '$ne': None}
        if 'status' not in query:
            query['status'] = {'$nin': ['closed', 'resolved']}
    
    if search:
        query['$or'] = [
            {'title': {'$regex': search, '$options': 'i'}},
            {'description': {'$regex': search, '$options': 'i'}},
            {'task_number': {'$regex': search, '$options': 'i'}}
        ]
    
    tasks = await tdb.tasks_v2.find(query, {'_id': 0}).sort('created_at', -1).to_list(500)
    
    # Enrich with label and milestone data
    label_ids = set()
    milestone_ids = set()
    for task in tasks:
        label_ids.update(task.get('labels', []))
        if task.get('milestone_id'):
            milestone_ids.add(task['milestone_id'])
    
    labels_map = {}
    if label_ids:
        labels = await tdb.task_labels.find({'id': {'$in': list(label_ids)}}, {'_id': 0}).to_list(100)
        labels_map = {label['id']: label for label in labels}
    
    milestones_map = {}
    if milestone_ids:
        milestones = await tdb.task_milestones.find({'id': {'$in': list(milestone_ids)}}, {'_id': 0}).to_list(100)
        milestones_map = {ms['id']: ms for ms in milestones}
    
    for task in tasks:
        task['labels_data'] = [labels_map.get(lid) for lid in task.get('labels', []) if labels_map.get(lid)]
        task['milestone_data'] = milestones_map.get(task.get('milestone_id'))
    
    return tasks


@router.get("/tasks/stats")
async def get_task_stats(
    department_id: Optional[str] = None,
    view: Optional[str] = None,
    status: Optional[str] = None,
    severity: Optional[str] = None,
    assignee_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get task statistics for the tasks page"""
    tdb = get_tdb()
    
    user_department = current_user.get('department', 'Sales')
    user_id = current_user['id']
    
    # Build base query based on visibility
    if can_view_all_tasks(current_user):
        base_query = {'department_id': department_id} if department_id else {}
    else:
        base_query = {'$or': [
            {'department_id': user_department},
            {'assignees': user_id},
            {'created_by': user_id}
        ]}
    
    # Get counts by status
    status_counts = await tdb.tasks_v2.aggregate([
        {'$match': base_query},
        {'$group': {'_id': '$status', 'count': {'$sum': 1}}}
    ]).to_list(10)
    
    # Get counts by severity
    severity_counts = await tdb.tasks_v2.aggregate([
        {'$match': base_query},
        {'$group': {'_id': '$severity', 'count': {'$sum': 1}}}
    ]).to_list(10)
    
    # Get my tasks count (assigned to me, not closed)
    my_tasks_count = await tdb.tasks_v2.count_documents(
        {'assignees': user_id, 'status': {'$ne': 'closed'}}
    )
    
    # Get created by me count (not closed)
    created_by_me_count = await tdb.tasks_v2.count_documents(
        {'created_by': user_id, 'status': {'$ne': 'closed'}}
    )
    
    # Get overdue count
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    overdue_query = {
        **base_query,
        'due_date': {'$lt': today},
        'status': {'$nin': ['closed', 'resolved']}
    }
    overdue_count = await tdb.tasks_v2.count_documents(overdue_query)
    
    return {
        'by_status': {item['_id']: item['count'] for item in status_counts},
        'by_severity': {item['_id']: item['count'] for item in severity_counts},
        'my_tasks': my_tasks_count,
        'created_by_me': created_by_me_count,
        'overdue': overdue_count,
        'total': sum(item['count'] for item in status_counts)
    }


@router.get("/tasks/my-dashboard-stats")
async def get_my_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """Get personal task metrics for the home dashboard"""
    tdb = get_tdb()
    user_id = current_user['id']
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    # Assigned to me (not closed)
    assigned_to_me = await tdb.tasks_v2.count_documents(
        {'assignees': user_id, 'status': {'$ne': 'closed'}}
    )
    
    # Created by me (not closed)
    created_by_me = await tdb.tasks_v2.count_documents(
        {'created_by': user_id, 'status': {'$ne': 'closed'}}
    )
    
    # Overdue (assigned to me, past due, not closed)
    overdue = await tdb.tasks_v2.count_documents({
        'assignees': user_id,
        'due_date': {'$lt': today, '$ne': None},
        'status': {'$nin': ['closed', 'resolved']}
    })
    
    # High severity (assigned to me, not closed)
    high_severity = await tdb.tasks_v2.count_documents({
        'assignees': user_id,
        'severity': 'high',
        'status': {'$ne': 'closed'}
    })
    
    # In progress (assigned to me)
    in_progress = await tdb.tasks_v2.count_documents({
        'assignees': user_id,
        'status': 'in_progress'
    })
    
    # Completed by me (closed tasks where I'm assignee)
    completed = await tdb.tasks_v2.count_documents({
        'assignees': user_id,
        'status': 'closed'
    })
    
    return {
        'assigned_to_me': assigned_to_me,
        'created_by_me': created_by_me,
        'overdue': overdue,
        'high_severity': high_severity,
        'in_progress': in_progress,
        'completed': completed
    }


@router.get("/tasks/{task_id}")
async def get_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single task with full details"""
    tdb = get_tdb()
    task = await tdb.tasks_v2.find_one({'id': task_id}, {'_id': 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Get comments
    comments = await tdb.task_comments_v2.find(
        {'task_id': task_id}, {'_id': 0}
    ).sort('created_at', 1).to_list(100)
    task['comments'] = comments
    
    # Get activity log
    activities = await tdb.task_activities.find(
        {'task_id': task_id}, {'_id': 0}
    ).sort('created_at', -1).to_list(50)
    task['activities'] = activities
    
    # Get labels data
    if task.get('labels'):
        labels = await tdb.task_labels.find(
            {'id': {'$in': task['labels']}}, {'_id': 0}
        ).to_list(20)
        task['labels_data'] = labels
    
    # Get milestone data
    if task.get('milestone_id'):
        milestone = await tdb.task_milestones.find_one(
            {'id': task['milestone_id']}, {'_id': 0}
        )
        task['milestone_data'] = milestone
    
    # Get assignees data
    if task.get('assignees'):
        assignees = await tdb.users.find(
            {'id': {'$in': task['assignees']}},
            {'_id': 0, 'id': 1, 'name': 1, 'email': 1, 'role': 1, 'department': 1}
        ).to_list(20)
        task['assignees_data'] = assignees
    
    # Get linked entity data
    if task.get('linked_entity_type') and task.get('linked_entity_id'):
        collection_map = {
            'lead': 'leads',
            'account': 'accounts',
            'distributor': 'distributors',
            'task': 'tasks_v2'
        }
        collection = collection_map.get(task['linked_entity_type'])
        if collection:
            linked = await tdb.db[collection].find_one(
                {'id': task['linked_entity_id']},
                {'_id': 0, 'id': 1, 'company': 1, 'name': 1, 'title': 1}
            )
            task['linked_entity_data'] = linked
    
    return task


@router.post("/tasks")
async def create_task(task: TaskCreate, current_user: dict = Depends(get_current_user)):
    """Create a new task"""
    tdb = get_tdb()
    
    # Generate task number
    count = await tdb.tasks_v2.count_documents({})
    task_number = f"TASK-{count + 1:05d}"
    
    # Get assignees names
    assignees_data = []
    if task.assignees:
        assignees = await tdb.users.find(
            {'id': {'$in': task.assignees}},
            {'_id': 0, 'id': 1, 'name': 1}
        ).to_list(20)
        assignees_data = assignees
    
    task_data = {
        'id': str(uuid.uuid4()),
        'task_number': task_number,
        'title': task.title,
        'description': task.description,
        'severity': task.severity,
        'status': task.status,
        'department_id': task.department_id,
        'assignees': task.assignees,
        'assignees_data': assignees_data,
        'milestone_id': task.milestone_id,
        'labels': task.labels,
        'due_date': task.due_date,
        'due_time': task.due_time,
        'reminder_date': task.reminder_date,
        'linked_entity_type': task.linked_entity_type,
        'linked_entity_id': task.linked_entity_id,
        'watchers': [current_user['id']],  # Creator is auto-watching
        'created_by': current_user['id'],
        'created_by_name': current_user.get('name'),
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat()
    }
    
    await tdb.tasks_v2.insert_one(task_data)
    
    # Log activity
    await log_activity(tdb, task_data['id'], 'created', None, None, current_user)
    
    return task_data


@router.put("/tasks/{task_id}")
async def update_task(task_id: str, update: TaskUpdate, current_user: dict = Depends(get_current_user)):
    """Update a task"""
    tdb = get_tdb()
    existing = await tdb.tasks_v2.find_one({'id': task_id}, {'_id': 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    
    update_data = {}
    changes = []
    
    for field, value in update.model_dump().items():
        if value is not None and existing.get(field) != value:
            old_value = existing.get(field)
            update_data[field] = value
            changes.append((field, old_value, value))
    
    if not update_data:
        return existing
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Update assignees data if assignees changed
    if 'assignees' in update_data:
        assignees = await tdb.users.find(
            {'id': {'$in': update_data['assignees']}},
            {'_id': 0, 'id': 1, 'name': 1}
        ).to_list(20)
        update_data['assignees_data'] = assignees
    
    await tdb.tasks_v2.update_one({'id': task_id}, {'$set': update_data})
    
    # Log activities for each change
    for field, old_val, new_val in changes:
        await log_activity(tdb, task_id, f'updated_{field}', old_val, new_val, current_user)
    
    return await tdb.tasks_v2.find_one({'id': task_id}, {'_id': 0})


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a task"""
    tdb = get_tdb()
    
    task = await tdb.tasks_v2.find_one({'id': task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Only creator or admin can delete
    if task['created_by'] != current_user['id'] and not can_manage_settings(current_user):
        raise HTTPException(status_code=403, detail="Only task creator or admin can delete")
    
    await tdb.tasks_v2.delete_one({'id': task_id})
    await tdb.task_comments_v2.delete_many({'task_id': task_id})
    await tdb.task_activities.delete_many({'task_id': task_id})
    
    return {'message': 'Task deleted successfully'}


# ============= COMMENT ROUTES =============

@router.post("/tasks/{task_id}/comments")
async def add_comment(task_id: str, comment: CommentCreate, current_user: dict = Depends(get_current_user)):
    """Add a comment to a task"""
    tdb = get_tdb()
    
    task = await tdb.tasks_v2.find_one({'id': task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    comment_data = {
        'id': str(uuid.uuid4()),
        'task_id': task_id,
        'content': comment.content,
        'mentions': comment.mentions,
        'created_by': current_user['id'],
        'created_by_name': current_user.get('name'),
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    
    await tdb.task_comments_v2.insert_one(comment_data)
    
    # Log activity
    await log_activity(tdb, task_id, 'commented', None, comment.content[:100], current_user)
    
    # Add mentioned users to watchers
    if comment.mentions:
        await tdb.tasks_v2.update_one(
            {'id': task_id},
            {'$addToSet': {'watchers': {'$each': comment.mentions}}}
        )
    
    return comment_data


@router.delete("/tasks/{task_id}/comments/{comment_id}")
async def delete_comment(task_id: str, comment_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a comment"""
    tdb = get_tdb()
    
    comment = await tdb.task_comments_v2.find_one({'id': comment_id, 'task_id': task_id})
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    if comment['created_by'] != current_user['id'] and not can_manage_settings(current_user):
        raise HTTPException(status_code=403, detail="Only comment author or admin can delete")
    
    await tdb.task_comments_v2.delete_one({'id': comment_id})
    
    return {'message': 'Comment deleted successfully'}


# ============= WATCH ROUTES =============

@router.post("/tasks/{task_id}/watch")
async def watch_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Start watching a task"""
    tdb = get_tdb()
    
    result = await tdb.tasks_v2.update_one(
        {'id': task_id},
        {'$addToSet': {'watchers': current_user['id']}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {'message': 'Now watching this task'}


@router.delete("/tasks/{task_id}/watch")
async def unwatch_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Stop watching a task"""
    tdb = get_tdb()
    
    result = await tdb.tasks_v2.update_one(
        {'id': task_id},
        {'$pull': {'watchers': current_user['id']}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {'message': 'Stopped watching this task'}


# ============= DEPARTMENTS =============

@router.get("/departments")
async def get_departments(current_user: dict = Depends(get_current_user)):
    """Get list of departments"""
    # Return standard departments
    return [
        {'id': 'Admin', 'name': 'Admin'},
        {'id': 'Sales', 'name': 'Sales'},
        {'id': 'Production', 'name': 'Production'},
        {'id': 'Marketing', 'name': 'Marketing'},
        {'id': 'Finance', 'name': 'Finance'},
        {'id': 'Distribution', 'name': 'Distribution'},
        {'id': 'HR', 'name': 'Human Resources'},
        {'id': 'IT', 'name': 'Information Technology'},
        {'id': 'Operations', 'name': 'Operations'}
    ]


# ============= HELPER FUNCTIONS =============

async def log_activity(tdb, task_id: str, action: str, old_value, new_value, user: dict):
    """Log task activity"""
    activity = {
        'id': str(uuid.uuid4()),
        'task_id': task_id,
        'action': action,
        'old_value': str(old_value) if old_value else None,
        'new_value': str(new_value) if new_value else None,
        'created_by': user['id'],
        'created_by_name': user.get('name'),
        'created_at': datetime.now(timezone.utc).isoformat()
    }
    await tdb.task_activities.insert_one(activity)


# ============= DASHBOARD WIDGET INTEGRATION =============

@router.get("/widget/action-items")
async def get_action_items_for_widget(current_user: dict = Depends(get_current_user)):
    """Get action items for dashboard widget - integrates with existing widget"""
    tdb = get_tdb()
    user_id = current_user['id']
    
    # Get tasks assigned to user
    assigned_tasks = await tdb.tasks_v2.find(
        {'assignees': user_id, 'status': {'$nin': ['closed', 'resolved']}},
        {'_id': 0}
    ).sort('due_date', 1).to_list(20)
    
    # Get tasks created by user
    created_tasks = await tdb.tasks_v2.find(
        {'created_by': user_id, 'status': {'$nin': ['closed', 'resolved']}},
        {'_id': 0}
    ).sort('due_date', 1).to_list(20)
    
    # Merge and dedupe
    task_ids = set()
    all_tasks = []
    for task in assigned_tasks + created_tasks:
        if task['id'] not in task_ids:
            task_ids.add(task['id'])
            # Convert to widget format
            all_tasks.append({
                'id': task['id'],
                'title': task['title'],
                'description': task.get('description'),
                'status': task['status'],
                'priority': task['severity'],  # Map severity to priority for widget
                'due_date': task.get('due_date'),
                'due_time': task.get('due_time'),
                'assigned_to': task['assignees'][0] if task.get('assignees') else None,
                'assigned_to_name': task['assignees_data'][0]['name'] if task.get('assignees_data') else None,
                'assigned_by': task['created_by'],
                'assigned_by_name': task.get('created_by_name'),
                'created_by': task['created_by'],
                'created_by_name': task.get('created_by_name'),
                'task_type': 'general',
                'is_from_task_module': True
            })
    
    return {'tasks': all_tasks[:20]}
