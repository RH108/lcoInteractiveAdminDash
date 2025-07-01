require('dotenv').config(); // Load environment variables
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const mongoose = require('mongoose'); // Import Mongoose

const app = express();
const port = process.env.PORT || 3000; // Use port 3000 by default or an environment variable

// Roblox OAuth Configuration
const robloxConfig = {
    clientId: process.env.ROBLOX_CLIENT_ID,
    clientSecret: process.env.ROBLOX_CLIENT_SECRET,
    // Use an environment variable for the deployed URL, fallback to localhost for local dev
    redirectUri: process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/callback` : `http://localhost:${port}/callback`,
    authorizationUrl: 'https://apis.roblox.com/oauth/v1/authorize',
    tokenUrl: 'https://apis.roblox.com/oauth/v1/token',
    userInfoUrl: 'https://apis.roblox.com/oauth/v1/userinfo',
    scopes: 'openid profile'
};

// Roblox Group Check Configuration
const robloxGroupConfig = {
    groupId: process.env.ROBLOX_GROUP_ID, // The specific Roblox Group ID to check against
    openCloudApiKey: process.env.ROBLOX_OPENCLOUD_API_KEY // API Key for Roblox Open Cloud (Group API)
};

// Roblox Game HTTP Integration Configuration
const robloxGameConfig = {
    secretKey: process.env.ROBLOX_GAME_SECRET_KEY // Secret key for authenticating requests from Roblox games
};

// Express Session Middleware
app.set('trust proxy', 1); // Trust first proxy (Render's proxy)
app.use(session({
    secret: process.env.SESSION_SECRET, // Use a strong, random string for your session secret
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (HTTPS)
        httpOnly: true,
        sameSite: 'lax' // Or 'none' if you're dealing with cross-site iframes, but 'lax' is usually safer default
    }
}));

// Serve static files from the current directory (assuming index.html is here)
app.use(express.static(path.join(__dirname)));
app.use(express.json()); // Middleware to parse JSON request bodies (important for API routes)

// --- MongoDB Connection ---
const mongoUri = process.env.MONGO_URI;

mongoose.connect(mongoUri)
    .then(() => console.log('Connected to MongoDB Atlas!'))
    .catch(err => {
        console.error('Error connecting to MongoDB Atlas:', err);
        process.exit(1); // Exit the process if unable to connect to the database
    });

// --- MongoDB Schema and Model for Blacklist Entries ---
const blacklistEntrySchema = new mongoose.Schema({
    username: { type: String, required: true },
    reason: { type: String, default: 'Not Applicable' },
    platform: { type: String, required: true },
    addedBy: {
        userId: { type: String },
        username: { type: String }
    },
    createdAt: { type: Date, default: Date.now }
}, {
    collection: 'blacklisted_users' // Explicitly set the collection name here
});

const BlacklistEntry = mongoose.model('BlacklistEntry', blacklistEntrySchema);


// --- MongoDB Schema and Model for Event/Insert Requests ---
const eventRequestSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    date: { type: Date }, // Store as Date object
    type: { type: String, required: true, enum: ['Event', 'Insert', 'Other'] }, // Enforce specific types
    status: { type: String, default: 'Pending', enum: ['Pending', 'Approved', 'Denied'] }, // Status of the request
    submittedBy: {
        userId: { type: String },
        username: { type: String }
    },
    createdAt: { type: Date, default: Date.now }
}, {
    collection: 'admin_requests' // Collection name as requested
});

const EventRequest = mongoose.model('EventRequest', eventRequestSchema);

// --- NEW: MongoDB Schema and Model for Ban Requests ---
const banRequestSchema = new mongoose.Schema({
    robloxUserId: { type: String, required: true },
    robloxUsername: { type: String, required: true },
    reason: { type: String, required: true },
    moderatorUserId: { type: String, required: true },
    moderatorUsername: { type: String, required: true },
    status: { type: String, default: 'Pending', enum: ['Pending', 'Approved', 'Denied'] },
    createdAt: { type: Date, default: Date.now },
    processedAt: { type: Date },
    processedBy: {
        userId: { type: String },
        username: { type: String }
    }
}, {
    collection: 'ban_requests' // New collection for ban requests
});

const BanRequest = mongoose.model('BanRequest', banRequestSchema);


// --- Middleware for authenticating Roblox game requests ---
function authenticateGameRequest(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        console.warn('Authentication failed: Authorization header missing.');
        return res.status(401).json({ message: 'Authorization header missing.' });
    }

    const token = authHeader.split(' ')[1]; // Expects "Bearer YOUR_SECRET_KEY"

    if (!token || token !== robloxGameConfig.secretKey) {
        console.warn('Authentication failed: Invalid or missing secret key.');
        return res.status(403).json({ message: 'Invalid or missing secret key.' });
    }

    next(); // If key is valid, proceed to the next middleware/route handler
}


// --- Roblox OAuth Routes ---

app.get('/login', (req, res) => {
    const authUrl = new URL(robloxConfig.authorizationUrl);
    authUrl.searchParams.set('client_id', robloxConfig.clientId);
    authUrl.searchParams.set('redirect_uri', robloxConfig.redirectUri);
    authUrl.searchParams.set('scope', robloxConfig.scopes);
    authUrl.searchParams.set('response_type', 'code');
    res.redirect(authUrl.toString());
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Error: Authorization code not found.');
    }

    const tokenPayload = new URLSearchParams({
        client_id: robloxConfig.clientId,
        client_secret: robloxConfig.clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: robloxConfig.redirectUri
    });

    console.log("Sending token exchange request to Roblox with:", tokenPayload.toString());

    try {
        const tokenResponse = await axios.post(
            robloxConfig.tokenUrl,
            tokenPayload,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const accessToken = tokenResponse.data.access_token;
        console.log("Access token received:", accessToken);

        const userResponse = await axios.get(robloxConfig.userInfoUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        // Store user info in session
        req.session.user = userResponse.data;
        res.redirect('/'); // Redirect to your homepage after successful login
    } catch (error) {
        console.error("OAuth Token Exchange Error", {
            status: error.response?.status,
            data: error.response?.data,
            headers: error.response?.headers,
            message: error.message,
        });
        res.status(500).send(`OAuth Failed: ${JSON.stringify(error.response?.data || error.message)}`);
    }
});

// API endpoint for the front-end to get the current user's data
app.get('/api/me', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Could not log out.');
        }
        res.redirect('/');
    });
});

// --- API Endpoint: Check Group Membership ---
app.get('/api/check-group-membership', async (req, res) => {
    // Ensure user is logged in and group config is set
    if (!req.session.user || !req.session.user.sub) {
        return res.status(401).json({ isMember: false, message: 'User not logged in.' });
    }
    if (!robloxGroupConfig.groupId || !robloxGroupConfig.openCloudApiKey) {
        console.error('Roblox Group ID or Open Cloud API Key is not configured.');
        return res.status(500).json({ isMember: false, message: 'Server-side group check not configured.' });
    }

    const userId = req.session.user.sub; // Roblox user ID (sub claim from userinfo)
    const groupId = robloxGroupConfig.groupId;

    try {
        // Roblox Group Roles API endpoint
        // This endpoint requires an API Key with Group Read permissions for the specific group.
        const groupApiUrl = `https://groups.roblox.com/v1/users/${userId}/groups/roles`;

        const groupResponse = await axios.get(groupApiUrl, {
            headers: {
                'x-api-key': robloxGroupConfig.openCloudApiKey // Use the Open Cloud API Key here
            }
        });

        const userGroups = groupResponse.data.data; // Array of groups the user is in

        // Check if the user's groups contain the target groupId
        const isMember = userGroups.some(group => group.group.id.toString() === groupId.toString());

        res.json({ isMember: isMember });

    } catch (error) {
        console.error("Error checking Roblox group membership:", {
            status: error.response?.status,
            data: error.response?.data,
            headers: error.response?.headers,
            message: error.message,
            userId: userId,
            groupId: groupId
        });
        // Return false for membership in case of any API error
        res.status(500).json({ isMember: false, message: 'Failed to verify group membership due to an API error.' });
    }
});


// --- Blacklist API Endpoints (using Mongoose) ---

// GET all blacklist entries
app.get('/api/blacklist', async (req, res) => {
    try {
        const entries = await BlacklistEntry.find({});
        res.json(entries);
    } catch (error) {
        console.error('Error fetching blacklist entries:', error);
        res.status(500).json({ message: 'Error fetching blacklist entries' });
    }
});

// POST a new blacklist entry
app.post('/api/blacklist', async (req, res) => {
    const { username, reason, platform } = req.body;

    if (!username || !platform) {
        return res.status(400).json({ message: 'Username and platform are required.' });
    }

    try {
        const newEntry = new BlacklistEntry({
            username,
            reason: reason || 'Not Applicable',
            platform,
            // If logged in, associate the entry with the user who added it
            addedBy: req.session.user ? { userId: req.session.user.sub, username: req.session.user.name } : undefined
        });

        const savedEntry = await newEntry.save();
        res.status(201).json({ message: 'Entry added successfully!', entry: savedEntry });
    } catch (error) {
        console.error('Error adding blacklist entry:', error);
        res.status(500).json({ message: 'Error adding blacklist entry' });
    }
});

// DELETE a blacklist entry by ID
app.delete('/api/blacklist/:id', async (req, res) => {
    const { id } = req.params; // Get the ID from the URL parameter

    try {
        const deletedEntry = await BlacklistEntry.findByIdAndDelete(id);

        if (!deletedEntry) {
            return res.status(404).json({ message: 'Blacklist entry not found.' });
        }

        res.json({ message: 'Entry deleted successfully!', deletedEntryId: id });
    } catch (error) {
        console.error('Error deleting blacklist entry:', error);
        // Check if the error is a CastError (invalid MongoDB ID format)
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Invalid entry ID format.' });
        }
        res.status(500).json({ message: 'Error deleting blacklist entry' });
    }
});


// --- Event Request API Endpoints (using Mongoose) ---

// GET all event requests
app.get('/api/event-requests', async (req, res) => {
    try {
        const requests = await EventRequest.find({});
        res.json(requests);
    } catch (error) {
        console.error('Error fetching event requests:', error);
        res.status(500).json({ message: 'Error fetching event requests' });
    }
});

// POST a new event request
app.post('/api/event-requests', async (req, res) => {
    const { name, description, date, type } = req.body;

    if (!name || !type) {
        return res.status(400).json({ message: 'Event Name and Type are required.' });
    }

    try {
        const newRequest = new EventRequest({
            name,
            description: description || '', // Ensure description is stored even if empty
            date: date ? new Date(date) : undefined, // Convert date string to Date object, handle optional
            type,
            status: 'Pending', // Default status
            submittedBy: req.session.user ? { userId: req.session.user.sub, username: req.session.user.name } : undefined
        });

        const savedRequest = await newRequest.save();
        res.status(201).json({ message: 'Event request submitted successfully!', request: savedRequest });
    } catch (error) {
        console.error('Error submitting event request:', error);
        res.status(500).json({ message: 'Error submitting event request' });
    }
});

// --- NEW: In-Game Ban Request Endpoints ---

// POST endpoint for Roblox game to send ban requests
app.post('/api/roblox/ban-request', authenticateGameRequest, async (req, res) => {
    const { robloxUserId, robloxUsername, reason, moderatorUserId, moderatorUsername } = req.body;

    // Basic validation
    if (!robloxUserId || !robloxUsername || !reason || !moderatorUserId || !moderatorUsername) {
        return res.status(400).json({ message: 'Missing required ban request data.' });
    }

    try {
        const newBanRequest = new BanRequest({
            robloxUserId,
            robloxUsername,
            reason,
            moderatorUserId,
            moderatorUsername,
            status: 'Pending' // Default status for new requests
        });

        const savedBanRequest = await newBanRequest.save();
        console.log('Received and saved ban request from game:', savedBanRequest);
        res.status(201).json({ message: 'Ban request received and saved successfully!', request: savedBanRequest });
    } catch (error) {
        console.error('Error saving ban request from game:', error);
        res.status(500).json({ message: 'Failed to save ban request.' });
    }
});

// GET endpoint for admin panel to fetch all ban requests
app.get('/api/ban-requests', async (req, res) => {
    try {
        const banRequests = await BanRequest.find({});
        res.json(banRequests);
    } catch (error) {
        console.error('Error fetching ban requests:', error);
        res.status(500).json({ message: 'Error fetching ban requests' });
    }
});

// PATCH endpoint to approve a ban request
app.patch('/api/ban-requests/:id/approve', async (req, res) => {
    const { id } = req.params;
    const processedBy = req.session.user ? { userId: req.session.user.sub, username: req.session.user.name } : null;

    try {
        const updatedRequest = await BanRequest.findByIdAndUpdate(
            id,
            { status: 'Approved', processedAt: new Date(), processedBy: processedBy },
            { new: true } // Return the updated document
        );

        if (!updatedRequest) {
            return res.status(404).json({ message: 'Ban request not found.' });
        }
        res.json({ message: 'Ban request approved successfully!', request: updatedRequest });
    } catch (error) {
        console.error('Error approving ban request:', error);
        res.status(500).json({ message: 'Failed to approve ban request.' });
    }
});

// PATCH endpoint to deny a ban request
app.patch('/api/ban-requests/:id/deny', async (req, res) => {
    const { id } = req.params;
    const processedBy = req.session.user ? { userId: req.session.user.sub, username: req.session.user.name } : null;

    try {
        const updatedRequest = await BanRequest.findByIdAndUpdate(
            id,
            { status: 'Denied', processedAt: new Date(), processedBy: processedBy },
            { new: true } // Return the updated document
        );

        if (!updatedRequest) {
            return res.status(404).json({ message: 'Ban request not found.' });
        }
        res.json({ message: 'Ban request denied successfully!', request: updatedRequest });
    } catch (error) {
        console.error('Error denying ban request:', error);
        res.status(500).json({ message: 'Failed to deny ban request.' });
    }
});


// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Open your browser to http://localhost:${port}`);
});
