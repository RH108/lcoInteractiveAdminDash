require('dotenv').config(); // Load environment variables
const express = require('express');

app.set('trust proxy', 1); // Trust first proxy (Render's proxy)

// Then your session middleware
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: true,
        httpOnly: true,
        sameSite: 'lax'
    }
}));

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
    redirectUri: `https://lcointeractiveadmindash.onrender.com/callback`, // Ensure this matches your Roblox app settings
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

// Express Session Middleware
app.use(session({
    secret: process.env.SESSION_SECRET, // Use a strong, random string for your session secret
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' } // Use secure cookies in production (HTTPS)
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

// --- NEW API Endpoint: Check Group Membership ---
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


// Start the server
app.listen(port, () => {
    console.log(`Server running at https://lcointeractiveadmindash.onrender.com`);
    console.log(`Open your browser to https://lcointeractiveadmindash.onrender.com`);
});
