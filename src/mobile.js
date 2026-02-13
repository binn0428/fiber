// Helper to run code when DOM is ready
function onReady(fn) {
    if (document.readyState !== 'loading') {
        fn();
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
}

// Mobile Menu Logic
onReady(() => {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.querySelector('.sidebar');
    const navBtns = document.querySelectorAll('.nav-btn');

    if (mobileMenuBtn && sidebar) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });

        // Close sidebar when clicking outside
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                sidebar.classList.contains('active') && 
                !sidebar.contains(e.target) && 
                !mobileMenuBtn.contains(e.target)) {
                sidebar.classList.remove('active');
            }
        });

        // Close on nav click
        if (navBtns) {
            navBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                        if (window.innerWidth <= 768) {
                        sidebar.classList.remove('active');
                    }
                });
            });
        }
    }
});

// Mobile Back Button Confirmation
// This ensures that when the user presses the back button on mobile,
// they are prompted before leaving the application.
onReady(() => {
    // Check if we are already in a state (to avoid duplicate pushes on reload if browser restores state)
    // But usually simple pushState is fine.
    
    // Initial push to create a history entry
    if (window.history && window.history.pushState) {
        window.history.pushState({ app: true }, document.title);
        
        window.addEventListener('popstate', (event) => {
            // Check if this popstate is triggered by our back action
            // If the user presses back, we fall back to the previous state (which might be null or external)
            
            const leave = confirm("確定要離開系統嗎？");
            if (leave) {
                // User confirmed to leave.
                // We are already at the previous state (outside app or previous page).
                // If we want to ensure exit, we can try history.back() again if there is more history,
                // but usually just letting it happen is enough if we were at the entry point.
                // However, if we pushed state on entry, we are now at the state BEFORE entry.
            } else {
                // User wants to stay.
                // We need to restore the "in-app" state.
                window.history.pushState({ app: true }, document.title);
            }
        });
    }

    // Map Controls Toggle Logic
    const mapControlsToggle = document.getElementById('map-controls-toggle');
    const mapControlsMenu = document.getElementById('map-controls-menu');

    if (mapControlsToggle && mapControlsMenu) {
        // Remove existing listeners if any (though we can't easily, we just rely on main.js removing its block)
        // Or better, let's just keep it here and remove from main.js
        
        mapControlsToggle.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent document click from closing immediately
            mapControlsMenu.classList.toggle('active');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                mapControlsMenu.classList.contains('active') && 
                !mapControlsMenu.contains(e.target) && 
                !mapControlsToggle.contains(e.target)) {
                mapControlsMenu.classList.remove('active');
            }
        });
        
        // Close menu when clicking a button inside it
        const actionBtns = mapControlsMenu.querySelectorAll('.action-btn');
        actionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                        mapControlsMenu.classList.remove('active');
                }
            });
        });
    }
});
