# Outreach Admin Panel

A complete web-based administration interface for the Outreach Automation System.

## Features

### Dashboard
- Real-time statistics overview
- Today's progress tracking
- Campaign performance charts
- Lead status visualization
- Source breakdown analytics
- Recent activity feed

### Campaign Management
- Create, edit, and delete campaigns
- Associate campaigns with brands
- Manage campaign keywords
- Add campaign assets (blogs/pages)
- View campaign performance metrics

### Prospect Management
- View all company prospects
- View blog prospects
- Filter by campaign, source, status
- Search functionality
- Detailed prospect information
- Email extraction status tracking
- Add domains to exclusion list

### Email Management
- View all extracted emails
- Filter by campaign, domain match, generic type
- Email verification status
- Confidence scores
- Source page tracking

### Leads & Outreach
- Lead pipeline management
- Status updates (NEW, READY, OUTREACH_SENT, REPLIED, REJECTED)
- Bulk status updates
- Outreach logs tracking
- Campaign association

### Settings
- **Brands**: Manage your brands and websites
- **Daily Limits**: View and update daily operation limits
- **Keywords**: Manage search keywords for prospect discovery
- **Search Modifiers**: Configure search modifiers for blog discovery
- **Exclusions**: Manage excluded domains and emails
- **Geographic**: Manage countries and cities for targeting

## Quick Start

### 1. Start the Admin Panel

**Windows:**
```bash
# Double-click the batch file
admin.bat

# Or run manually
node src/api/server.js
```

**Mac/Linux:**
```bash
node src/api/server.js
```

### 2. Access the Panel

Open your browser and navigate to:
```
http://localhost:3000
```

### 3. Login

Default password: `admin123`

**To change the password**, set an environment variable:
```bash
# Windows
set ADMIN_PASSWORD=your_secure_password

# Mac/Linux
export ADMIN_PASSWORD=your_secure_password
```

Then start the server.

### 4. Stop the Panel

Press `Ctrl+C` in the terminal where the server is running.

## Configuration

### Change Port

By default, the admin panel runs on port 3000. To change it:

```bash
# Windows
set ADMIN_PORT=8080

# Mac/Linux
export ADMIN_PORT=8080
```

### Change Session Secret

For production use, set a custom session secret:

```bash
# Windows
set SESSION_SECRET=your_random_secret_key

# Mac/Linux
export SESSION_SECRET=your_random_secret_key
```

## Navigation

Use the navigation bar at the top to access different sections:

- **Dashboard**: Overview with charts and statistics
- **Campaigns**: Manage outreach campaigns
- **Prospects**: View discovered companies and blogs
- **Emails**: Manage extracted emails
- **Leads & Outreach**: Track lead pipeline and outreach
- **Settings**: Configure system settings

## Common Tasks

### Create a New Campaign

1. Go to **Campaigns** → **New Campaign**
2. Select a brand
3. Enter campaign name and optional target URL
4. Select keywords (hold Ctrl/Cmd for multiple)
5. Click **Create Campaign**

### Add a Brand

1. Go to **Settings** → **Brands**
2. Enter brand name and website
3. Click **Add Brand**

### Exclude a Domain

1. Go to **Prospects**
2. Find the prospect you want to exclude
3. Click the **Exclude** button
4. Enter a reason (optional)

### Bulk Update Lead Status

1. Go to **Leads**
2. Select leads using checkboxes
3. Click the desired status button (Ready, Sent, Rejected)

### View Daily Progress

1. Go to **Dashboard**
2. Check the **Today's Progress** card
3. For detailed history, go to **Settings** → **Daily Limits**

## Database

The admin panel uses your existing SQLite database (`outreach_system.db`). No migration needed!

All operations go through the existing database, so:
- Your CLI scripts still work
- Data is synchronized
- No duplicate entries

## Security Notes

For production/internal use:

1. **Change the default password** via `ADMIN_PASSWORD` environment variable
2. **Use HTTPS** if exposing to network (use a reverse proxy like nginx)
3. **Set a custom session secret** via `SESSION_SECRET` environment variable
4. **Keep the server updated** with latest security patches

## Team Access

To allow your sales/marketing team to access the admin panel:

1. Run the server on a machine accessible to your team
2. Share the URL (e.g., `http://your-server-ip:3000`)
3. Share the password with your team
4. For better security, set up a reverse proxy with HTTPS

## Troubleshooting

### Port Already in Use

If you get an error about port 3000 being in use:

```bash
# Use a different port
set ADMIN_PORT=3001
node src/api/server.js
```

### Can't Access from Other Computers

1. Make sure your firewall allows connections on the port
2. Use the machine's IP address instead of `localhost`
3. Check if the server is bound to `0.0.0.0` (all interfaces)

### Database Errors

- Ensure `outreach_system.db` is in the project root
- Check file permissions
- Verify the database is not corrupted

## Architecture

```
src/api/
├── server.js           # Main Express server
├── routes/            # API routes
│   ├── api.js         # Dashboard API endpoints
│   ├── campaigns.js   # Campaign routes
│   ├── prospects.js   # Prospect routes
│   ├── emails.js      # Email routes
│   ├── leads.js       # Lead routes
│   └── settings.js    # Settings routes
├── views/             # EJS templates
│   ├── layout.ejs     # Base layout
│   ├── login.ejs      # Login page
│   ├── dashboard.ejs  # Dashboard
│   ├── campaigns/     # Campaign pages
│   ├── prospects/     # Prospect pages
│   ├── emails/        # Email pages
│   ├── leads/         # Lead pages
│   └── settings/      # Settings pages
└── public/            # Static assets
    ├── css/
    │   └── style.css  # Custom styles
    └── js/
        └── main.js    # Client-side JavaScript
```

## Support

For issues or questions:
1. Check the console output for error messages
2. Verify all dependencies are installed (`npm install`)
3. Ensure the database exists and is accessible
4. Check that no firewall is blocking the port

---

**Enjoy using your Outreach Admin Panel! 🚀**
