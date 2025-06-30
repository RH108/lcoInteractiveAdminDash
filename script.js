// --- Global Blacklist Management Functions ---
// These functions are defined globally so they can be called from different parts
// of the script (e.g., initial load, after adding an entry, after deleting)

/**
 * Fetches blacklist entries from the backend API and populates the blacklist table.
 */
async function fetchBlacklistEntries() {
    const tableBody = document.querySelector('#blacklist-table tbody');
    const blacklistedUsersCountElement = document.getElementById('blacklisted-users-count'); // Get the new count element

    // Log an error and return if the table body is not found
    if (!tableBody) {
        console.error("Table body with ID 'blacklist-table' not found. Cannot fetch entries.");
        return;
    }
    tableBody.innerHTML = ''; // Clear existing rows to prevent duplicates when refreshing

    try {
        // Send a GET request to the backend API to retrieve blacklist data
        const response = await fetch('/api/blacklist');

        // Check if the HTTP response was successful
        if (!response.ok) {
            const errorText = await response.text(); // Get raw text to help debug if JSON parsing fails
            throw new Error(`HTTP error! Status: ${response.status}. Response: ${errorText}`);
        }

        const entries = await response.json(); // Parse the JSON response
        console.log("Fetched blacklist entries:", entries); // Debug log: show fetched data

        // Update the blacklisted users count
        if (blacklistedUsersCountElement) {
            blacklistedUsersCountElement.textContent = entries.length;
        }

        // Iterate over each entry and append it as a new row to the table
        entries.forEach((entry, index) => {
            const newRow = document.createElement('tr');
            // Populate the row with entry data. index + 1 for display ID, entry._id for data-id attribute for deletion
            newRow.innerHTML = `
                <td class="text-left py-3 px-4">${index + 1}</td> <!-- Sequential display ID -->
                <td class="text-left py-3 px-4">${entry.username}</td>
                <td class="text-left py-3 px-4">${entry.platform}</td>
                <td class="text-left py-3 px-4">${entry.reason || 'Not Applicable'}</td>
                <td class="text-left py-3 px-4">
                    <button class="text-sm bg-red-500 hover:bg-red-700 text-white py-1 px-2 rounded-lg delete-btn" data-id="${entry._id}">Delete</button>
                </td>
            `;
            tableBody.appendChild(newRow);
        });

        // Attach click listeners to all newly created delete buttons
        document.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', async function() {
                const entryId = this.dataset.id; // Get the MongoDB _id from the data-id attribute
                await deleteBlacklistEntry(entryId); // Call delete function with the entry ID
            });
        });

    } catch (error) {
        console.error('Error fetching blacklist entries:', error);
        // Implement user-facing feedback (e.g., a message modal) for fetch errors
        // showMessageModal('Error loading blacklist. Please try again later.');
    }
}

/**
 * Handles adding a new blacklist entry by sending data to the backend.
 * @returns {boolean} True if the entry was added successfully, false otherwise.
 */
async function addBlacklistEntry() {
    // Retrieve input elements directly when this function is called
    const usernameInput = document.getElementById('username-input');
    const reasonInput = document.getElementById('reason-input');
    const platformInput = document.getElementById('platform-select');

    // Basic check for input elements presence
    if (!usernameInput || !reasonInput || !platformInput) {
        console.error("One or more input elements for blacklist entry not found. Cannot add entry.");
        return false;
    }

    // Get and trim input values
    const username = usernameInput.value.trim();
    const reason = reasonInput.value.trim();
    const platform = platformInput.value;

    // Client-side validation: ensure required fields are not empty
    if (!username || !platform) {
        console.warn('Username and platform are required for adding an entry.');
        // Implement user-facing feedback for validation errors
        // showMessageModal('Username and platform are required to add an entry.');
        return false;
    }

    try {
        // Send a POST request to the backend API with the new entry data
        const response = await fetch('/api/blacklist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json', // Specify content type as JSON
            },
            body: JSON.stringify({ username, reason, platform }), // Convert JavaScript object to JSON string
        });

        // Check if the HTTP response was successful
        if (!response.ok) {
            // Attempt to read server-side error message if available
            const errorData = await response.json();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorData.message || 'Unknown error during add'}`);
        }

        const result = await response.json(); // Parse the JSON response
        console.log('Entry added successfully:', result); // Debug log: show success result

        // Clear input fields after successful addition
        usernameInput.value = '';
        reasonInput.value = '';
        platformInput.value = '';

        await fetchBlacklistEntries(); // Refresh the table to show the newly added entry and update count
        return true; // Indicate successful addition
    } catch (error) {
        console.error('Error adding blacklist entry:', error);
        // Implement user-facing feedback for API errors during add operation
        // showMessageModal(`Failed to add entry: ${error.message}`);
        return false; // Indicate failure
    }
}

/**
 * Handles deleting a blacklist entry by its ID via the backend API.
 * @param {string} id The MongoDB _id of the entry to delete.
 */
async function deleteBlacklistEntry(id) {
    // Optional: Add a confirmation step using a custom modal
    // if (!await showConfirmationModal('Are you sure you want to delete this entry?')) {
    //     return;
    // }

    try {
        // Send a DELETE request to the backend API with the entry's ID
        const response = await fetch(`/api/blacklist/${id}`, {
            method: 'DELETE',
        });

        // Check if the HTTP response was successful
        if (!response.ok) {
            // Attempt to read server-side error message if available
            const errorData = await response.json();
            throw new Error(`HTTP error! Status: ${response.status}, Message: ${errorData.message || 'Unknown error during delete'}`);
        }

        const result = await response.json(); // Parse the JSON response
        console.log('Entry deleted successfully:', result); // Debug log: show deletion result

        await fetchBlacklistEntries(); // Refresh the table to reflect the deletion and update count
    } catch (error) {
        console.error('Error deleting blacklist entry:', error);
        // Implement user-facing feedback for API errors during delete operation
        // showMessageModal(`Failed to delete entry: ${error.message}`);
    }
}

/**
 * Displays a message to the user and attempts to close the window.
 * @param {string} message The message to display.
 */
function showAccessDeniedMessageAndClose(message) {
    // Hide the entire app container and show a simple message
    const appContainer = document.getElementById('app-container');
    const loginContainer = document.getElementById('login-container'); // Hide login too
    const body = document.body;

    if (appContainer) appContainer.classList.add('hidden');
    if (loginContainer) loginContainer.classList.add('hidden'); // Hide login too, just in case

    // Create a simple overlay message
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-50 text-white text-center p-4';
    overlay.innerHTML = `
        <div class="bg-red-700 p-8 rounded-lg shadow-xl max-w-md">
            <p class="text-2xl font-bold mb-4">Access Denied</p>
            <p class="text-lg mb-6">${message}</p>
            <p class="text-sm">This window will attempt to close in 5 seconds.</p>
            <p class="text-xs mt-2">If it doesn't close automatically, please close it manually.</p>
        </div>
    `;
    body.appendChild(overlay);

    // Attempt to close the window after a delay
    setTimeout(() => {
        if (window.opener) { // Check if the window was opened by another window/script
            window.close();
            console.log("Window attempted to close.");
        } else {
            console.warn("Window cannot be closed automatically. User needs to close manually.");
            // Optionally, replace the message with one that just asks them to close.
            overlay.querySelector('p:last-child').textContent = "Please close this window/tab manually.";
        }
    }, 5000); // 5 seconds delay
}


// --- Main Dashboard Initialization and Event Listeners ---
document.addEventListener('DOMContentLoaded', async function () {
    // --- Get main container elements ---
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const userWelcome = document.getElementById('user-welcome');
    const userAvatar = document.getElementById('user-avatar');
    const sidebar = document.getElementById('sidebar');
    const openSidebarBtn = document.getElementById('open-sidebar-btn'); // Button to open sidebar on mobile
    const closeSidebarBtn = document.getElementById('close-sidebar-btn'); // Button to close sidebar on mobile
    const contentSections = document.querySelectorAll('.content-section'); // All main content display sections
    const sidebarLinks = document.querySelectorAll('.sidebar-link'); // Navigation links in the sidebar
    const contentTitle = document.getElementById('content-title'); // Title in the header

    // --- Modal Elements ---
    const blacklistModal = document.getElementById('blacklist-modal');
    const modalOpenBtn = document.getElementById('open-modal-btn'); // Button to open the blacklist add modal
    const modalCloseBtnCancel = document.getElementById('close-modal-btn-cancel'); // Cancel button in modal
    const modalSaveBtn = document.getElementById('save-blacklist-btn'); // Save button in modal


    /**
     * Toggles the visibility of the login/app containers based on login status.
     * Also updates user specific UI elements.
     */
    async function checkLoginStatus() {
        try {
            const response = await fetch('/api/me'); // Call backend to check session status
            const data = await response.json(); // Parse response

            if (data.loggedIn && data.user) {
                // User is logged in, now check group membership
                const groupCheckResponse = await fetch('/api/check-group-membership');
                const groupData = await groupCheckResponse.json();

                if (groupData.isMember) {
                    // User is logged in AND is a group member: show the app container
                    if (loginContainer) loginContainer.classList.add('hidden');
                    if (appContainer) appContainer.classList.remove('hidden');

                    // Update UI with user data from Roblox (if available)
                    if (userWelcome && data.user.preferred_username) {
                        userWelcome.textContent = `Welcome, ${data.user.preferred_username}`;
                    }
                    if (userAvatar && data.user.picture) {
                        userAvatar.src = data.user.picture;
                        userAvatar.alt = `${data.user.name}'s Avatar`;
                    } else if (userAvatar) {
                        userAvatar.src = 'https://placehold.co/40x40/cccccc/333333?text=AV';
                    }

                    // Initialize dashboard features (sidebar, content switching, blacklist data load)
                    initializeDashboardFeatures();
                } else {
                    // User is logged in but NOT a group member
                    showAccessDeniedMessageAndClose('You do not have permission to access this admin panel. Group membership required.');
                }
            } else {
                // User is not logged in: show the login container and hide the app container
                if (loginContainer) loginContainer.classList.remove('hidden');
                if (appContainer) appContainer.classList.add('hidden');
            }
        } catch (error) {
            console.error("Could not fetch login status or group membership:", error);
            // Ensure login screen is visible in case of an API error, unless it's a specific access denied message
            if (error.message.includes('Access Denied') || error.message.includes('permission')) {
                 showAccessDeniedMessageAndClose('An error occurred during permission verification. Please try again or contact support.');
            } else {
                if (loginContainer) loginContainer.classList.remove('hidden');
                if (appContainer) appContainer.classList.add('hidden');
            }
        }
    }


    /**
     * Initializes all interactive features of the dashboard after successful login.
     * This function encapsulates all event listeners and initial data fetches
     * that depend on the #app-container being visible.
     */
    function initializeDashboardFeatures() {

        // --- Sidebar Toggling Logic ---
        // Ensure elements are available before attaching listeners
        if (openSidebarBtn && sidebar && closeSidebarBtn) {
            console.log("Sidebar toggle buttons found. Attaching listeners.");
            openSidebarBtn.addEventListener('click', () => {
                sidebar.classList.remove('-translate-x-full');
            });

            closeSidebarBtn.addEventListener('click', () => {
                sidebar.classList.add('-translate-x-full');
            });

            // Close sidebar when clicking outside on mobile (if sidebar is open)
            appContainer.addEventListener('click', (event) => {
                // Only act if screen is small AND click is outside sidebar AND click is not on openSidebarBtn AND sidebar is currently open
                if (window.innerWidth < 768 && !sidebar.contains(event.target) && !openSidebarBtn.contains(event.target) && !sidebar.classList.contains('-translate-x-full')) {
                    sidebar.classList.add('-translate-x-full');
                }
            });
        } else {
            console.error("Sidebar elements (open/close buttons or sidebar itself) not found after login.");
        }

        // --- Content Section Switching Logic ---
        sidebarLinks.forEach(link => {
            link.addEventListener('click', function (event) {
                event.preventDefault(); // Prevent default link behavior
                const targetId = this.dataset.target; // Get the target section's ID from data-target attribute

                // Deactivate all sidebar links and hide all content sections
                sidebarLinks.forEach(l => l.classList.remove('active'));
                contentSections.forEach(section => {
                    section.classList.add('hidden'); // Hide all sections
                    section.classList.remove('active'); // Remove active class for consistency
                });

                // Activate the clicked link and show its corresponding content section
                this.classList.add('active');
                const targetSection = document.getElementById(targetId);
                if (targetSection) {
                    targetSection.classList.remove('hidden'); // Show the target section
                    targetSection.classList.add('active'); // Add active class for consistency

                    // Update header title based on the selected sidebar link
                    if (contentTitle) {
                        contentTitle.textContent = this.textContent.trim();
                    }

                    // If the "Blacklists" section is activated, re-fetch entries to ensure fresh data
                    if (targetId === 'blacklists') {
                        fetchBlacklistEntries(); // This will refresh the table and update the count
                    }
                } else {
                    console.error(`Content section with ID '${targetId}' not found.`);
                }

                // Close sidebar on mobile after clicking a link
                if (window.innerWidth < 768) {
                    // Directly manipulate sidebar class as `closeSidebar` might not be in this scope anymore
                    sidebar.classList.add('-translate-x-full');
                }
            });
        });

        // Ensure the initially active content section is displayed on load
        const initialActiveLink = document.querySelector('.sidebar-link.active');
        if (initialActiveLink) {
            const initialTargetId = initialActiveLink.dataset.target;
            const initialTargetSection = document.getElementById(initialTargetId);
            if (initialTargetSection) {
                initialTargetSection.classList.remove('hidden');
                initialTargetSection.classList.add('active');
                if (contentTitle) {
                    contentTitle.textContent = initialActiveLink.textContent.trim();
                }
                // If the initial section is 'blacklists', fetch data immediately
                if (initialTargetId === 'blacklists') {
                    fetchBlacklistEntries(); // This will refresh the table and update the count
                }
            }
        } else {
             // Default to showing the 'home' section if no active link is set
            const defaultHomeSection = document.getElementById('home');
            if (defaultHomeSection) {
                defaultHomeSection.classList.remove('hidden');
                defaultHomeSection.classList.add('active');
                if (contentTitle) {
                    contentTitle.textContent = "Home"; // Set default title
                }
            }
        }


        // --- Modal & Blacklist Buttons Logic ---

        // Function to open the blacklist modal
        const openModal = () => {
            if (blacklistModal) {
                blacklistModal.classList.remove('hidden');
                console.log("Modal opened. hidden class removed."); // Debug log
            } else {
                console.error("Blacklist modal element not found during open attempt in initializeDashboardFeatures!");
            }
        };

        // Function to close the blacklist modal
        const closeModal = () => {
            if (blacklistModal) {
                blacklistModal.classList.add('hidden');
                console.log("Modal closed. hidden class added."); // Debug log
            } else {
                console.error("Blacklist modal element not found during close attempt in initializeDashboardFeatures!");
            }
        };


        // Attach event listeners for the modal and blacklist operations
        if (modalOpenBtn) {
            console.log("Modal Open button found. Attaching click listener."); // Debug log
            modalOpenBtn.addEventListener('click', openModal);
        } else {
            console.error("Open Modal button with ID 'open-modal-btn' not found in initializeDashboardFeatures.");
        }

        if (modalCloseBtnCancel) {
            console.log("Modal Cancel button found. Attaching click listener."); // Debug log
            modalCloseBtnCancel.addEventListener('click', closeModal);
        } else {
            console.error("Close Modal (cancel) button with ID 'close-modal-btn-cancel' not found in initializeDashboardFeatures.");
        }

        // Close modal if the user clicks on the background overlay
        if (blacklistModal) {
            console.log("Blacklist modal found. Attaching overlay click listener."); // Debug log
            blacklistModal.addEventListener('click', function (event) {
                if (event.target === blacklistModal) { // Only close if click is directly on the overlay
                    closeModal();
                }
            });
        }

        // Event listener for the save blacklist button inside the modal
        if (modalSaveBtn) {
            console.log("Modal Save button found. Attaching click listener."); // Debug log
            modalSaveBtn.addEventListener('click', async () => {
                const success = await addBlacklistEntry();
                if (success) {
                    closeModal(); // Close modal only if entry was added successfully
                }
            });
        } else {
            console.error("Save Blacklist button with ID 'save-blacklist-btn' not found in initializeDashboardFeatures.");
        }
    } // End of initializeDashboardFeatures function

    // --- Main Entry Point: DOMContentLoaded ---
    // This runs once the HTML is fully loaded.
    await checkLoginStatus(); // Perform initial login check and then initialize dashboard
});
