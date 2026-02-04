# Nyla Sales CRM

A modern, full-stack sales CRM application built for Nyla Air Water to manage leads, track follow-ups, and analyze sales performance.

## 🌟 Features

### Core Functionality
- **Lead Management**: Create, view, edit, and delete leads with comprehensive information
- **Activity Timeline**: Track all interactions and status changes for each lead
- **Follow-up Reminders**: Schedule and manage follow-ups with calendar integration
- **Comments**: Add notes and comments to leads for team collaboration
- **Dashboard Analytics**: Real-time metrics and visualizations of sales pipeline
- **Reports**: Detailed analytics on lead sources, conversion rates, and team performance
- **Team Management**: Manage team members with role-based access control

### User Roles & Permissions
- **Admin**: Full access to all features, can manage team members and delete leads
- **Sales Manager**: View all leads, create/edit leads, access reports and analytics
- **Sales Rep**: View and manage assigned leads only, schedule follow-ups

### Lead Workflow
Standard lead statuses: `New → Contacted → Qualified → Proposal → Closed Won/Lost`

## 🎨 Design

Modern minimal design using Nyla Air Water brand identity:
- **Primary Color**: Ocean Teal (#0891B2)
- **Secondary**: Sage Green (#10B981)
- **Accent**: Warm Sand (#F59E0B)
- **Typography**: Outfit (headings), Work Sans (subheadings), Inter (body)
- **UI Framework**: React with Shadcn/UI components
- **Charts**: Recharts for data visualization

## 🏗️ Tech Stack

### Frontend
- **React 19** with React Router for navigation
- **Tailwind CSS** for styling
- **Shadcn/UI** for component library
- **Framer Motion** for animations
- **Recharts** for charts and graphs
- **date-fns** for date formatting
- **React Hook Form + Zod** for form validation

### Backend
- **FastAPI** (Python) for REST API
- **MongoDB** for database
- **JWT** for authentication
- **bcrypt** for password hashing
- **Motor** for async MongoDB operations

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- MongoDB running on localhost:27017

### Installation

1. **Backend Setup**
```bash
cd /app/backend
pip install -r requirements.txt
```

2. **Frontend Setup**
```bash
cd /app/frontend
yarn install
```

3. **Seed Demo Data**
```bash
python /app/scripts/seed_demo_data.py
```

### Running the Application

The application is already running via supervisor:
- Backend: http://localhost:8001
- Frontend: http://localhost:3000
- MongoDB: mongodb://localhost:27017

Check status:
```bash
sudo supervisorctl status
```

## 👤 Demo Accounts

Use these credentials to login:

| Email | Password | Role |
|-------|----------|------|
| admin@nyla.com | admin123 | Admin |
| manager@nyla.com | manager123 | Sales Manager |
| sales@nyla.com | sales123 | Sales Rep |

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Leads
- `GET /api/leads` - Get all leads (filtered by role)
- `GET /api/leads/{id}` - Get lead by ID
- `POST /api/leads` - Create new lead
- `PUT /api/leads/{id}` - Update lead
- `DELETE /api/leads/{id}` - Delete lead (admin/manager only)

### Activities
- `POST /api/activities` - Create activity
- `GET /api/activities/{lead_id}` - Get activities for a lead

### Follow-ups
- `GET /api/follow-ups` - Get all follow-ups
- `POST /api/follow-ups` - Create follow-up
- `PUT /api/follow-ups/{id}/complete` - Mark as completed

### Comments
- `POST /api/comments` - Add comment to lead
- `GET /api/comments/{lead_id}` - Get comments for a lead

### Analytics
- `GET /api/analytics/dashboard` - Get dashboard metrics
- `GET /api/analytics/reports` - Get detailed reports

### Team
- `GET /api/users` - Get all team members
- `PUT /api/users/{id}` - Update user (admin only)

## 📁 Project Structure

```
/app/
├── backend/
│   ├── server.py              # FastAPI application
│   ├── requirements.txt       # Python dependencies
│   └── .env                   # Environment variables
├── frontend/
│   ├── src/
│   │   ├── pages/            # Page components
│   │   │   ├── SplashScreen.js
│   │   │   ├── Login.js
│   │   │   ├── Dashboard.js
│   │   │   ├── LeadsList.js
│   │   │   ├── LeadDetail.js
│   │   │   ├── AddEditLead.js
│   │   │   ├── FollowUps.js
│   │   │   ├── Reports.js
│   │   │   └── TeamManagement.js
│   │   ├── layouts/          # Layout components
│   │   │   └── DashboardLayout.js
│   │   ├── context/          # React context
│   │   │   └── AuthContext.js
│   │   ├── utils/            # Utility functions
│   │   │   └── api.js
│   │   ├── components/ui/    # Shadcn UI components
│   │   ├── App.js           # Main app component
│   │   └── index.css        # Global styles
│   ├── package.json          # Node dependencies
│   └── .env                  # Environment variables
├── scripts/
│   └── seed_demo_data.py    # Database seeding script
├── design_guidelines.json   # Design system documentation
└── README.md               # This file
```

## 🧪 Testing

The application has been comprehensively tested:
- **Backend**: 21/21 tests passed (100%)
- **Frontend**: 9/9 tests passed (100%)
- **Overall**: 100% success rate

Test results available at: `/app/test_reports/iteration_1.json`

## 🔒 Security

- JWT-based authentication with 24-hour token expiration
- Password hashing using bcrypt
- Role-based access control (RBAC)
- CORS configuration
- Protected API endpoints

## 🎯 Key Features Demonstrated

1. **Dashboard Analytics**
   - Total leads count
   - Conversion rate percentage
   - Pipeline value in USD
   - Today's follow-ups count
   - Status distribution (pie & bar charts)

2. **Lead Management**
   - Full CRUD operations
   - Search and filter by status
   - Bulk operations support
   - Activity tracking
   - Comment threads

3. **Follow-up System**
   - Calendar view
   - Scheduled reminders
   - Overdue notifications
   - Completion tracking

4. **Reporting**
   - Lead source analysis
   - Team performance metrics
   - Conversion funnel
   - Monthly trends

## 📱 Responsive Design

The application is fully responsive and works on:
- Desktop (1920x1080+)
- Laptop (1024x768+)
- Tablet (iPad: 768x1024)
- Mobile devices

## 🌐 Environment Variables

### Backend (.env)
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=test_database
JWT_SECRET=nyla-sales-crm-secret-key-2025
CORS_ORIGINS=*
```

### Frontend (.env)
```
REACT_APP_BACKEND_URL=<your-backend-url>
```

## 🐛 Known Issues

None! All tests passed with 100% success rate.

## 🚀 Future Enhancements

Potential improvements for the next phase:
- **Email Integration**: Send follow-up reminders via email
- **Calendar Sync**: Integrate with Google Calendar/Outlook
- **Advanced Reporting**: Customizable reports and exports
- **Mobile App**: Native iOS/Android applications
- **Real-time Notifications**: WebSocket-based live updates
- **Document Attachments**: Upload contracts and proposals
- **Pipeline Automation**: Automated status updates based on activities
- **AI Insights**: Predictive analytics for lead scoring

## 📄 License

Built for Nyla Air Water - 2025

## 🙏 Credits

- Design inspired by Nyla Air Water brand (nylaairwater.earth)
- UI Components: Shadcn/UI
- Icons: Lucide React
- Charts: Recharts
