# BuChat Admin Dashboard - Industry Standard

Complete admin control panel with comprehensive management capabilities.

## Features

### Core Management
- **Dashboard**: Real-time statistics (users, posts, communities, comments, reports)
- **Users Management**: View, search, ban/unban, suspend, delete users with reasons
- **Posts Management**: View, search, delete posts with audit trail
- **Communities Management**: View, search, delete communities and all content
- **Comments Management**: View, search, delete individual comments
- **Reports Management**: Review and resolve user reports with admin notes
- **Activity Logs**: Complete audit trail of all admin actions

### Industry-Standard Features
✅ **Comprehensive Deletion**: Removes all associated data (posts, comments, media)
✅ **Audit Logging**: Every admin action is logged with timestamp and reason
✅ **Ban Management**: Permanent or temporary bans with reasons and expiry
✅ **Suspend Users**: Temporary suspensions with duration
✅ **S3 Cleanup**: Automatically deletes user media from S3
✅ **Cascading Deletes**: Deleting users/communities removes all related content
✅ **Confirmation Prompts**: Type "DELETE" for destructive actions
✅ **Admin Notes**: Add notes when resolving reports
✅ **Secure Authentication**: JWT with 24-hour expiry, bcrypt password hashing
✅ **Role-Based Access**: Super admin role with full control

## Setup

```bash
cd frontend/admin
npm install
npm start
```

## Default Admin Credentials

Email: `admin@buchat.com`
Password: `admin123`

## Environment Variables

Create `.env` file:
```
REACT_APP_API_URL=your-api-gateway-url
```

## Backend Deployment

```bash
cd backend
sam build
sam deploy
```

## Admin Capabilities

### User Management
- Ban users (permanent or temporary with expiry)
- Suspend users (hours-based)
- Delete users and ALL their data:
  - User profile
  - All posts
  - All comments
  - All media files from S3
  - All relationships

### Content Management
- Delete posts with reason logging
- Delete comments individually
- Delete communities with all content:
  - Community profile
  - All posts in community
  - All memberships
  - All related data

### Report Management
- View all reports
- Resolve with actions:
  - Delete reported content
  - Ban reported users
  - Dismiss with notes
- Add admin notes for audit

### Audit & Compliance
- Complete activity log
- Track all deletions
- Record admin actions
- Timestamp all operations
- Store reasons for actions

## Security

- Bcrypt password hashing
- JWT authentication (24h expiry)
- Admin role verification
- Secure token storage
- CORS protection
- Input validation

## API Endpoints

- `POST /admin/login` - Admin authentication
- `GET /admin/stats` - Dashboard statistics
- `GET /admin/users` - List all users
- `POST /admin/users/{userId}/ban` - Ban/unban user
- `POST /admin/users/{userId}/suspend` - Suspend user
- `DELETE /admin/users/{userId}` - Delete user
- `GET /admin/posts` - List all posts
- `DELETE /admin/posts/{postId}` - Delete post
- `GET /admin/communities` - List all communities
- `DELETE /admin/communities/{communityId}` - Delete community
- `GET /admin/comments` - List all comments
- `DELETE /admin/comments/{commentId}` - Delete comment
- `GET /admin/reports` - List all reports
- `POST /admin/reports/{reportId}/resolve` - Resolve report
- `GET /admin/logs` - View admin activity logs
