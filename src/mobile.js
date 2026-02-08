// Mobile Menu Logic
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

// Mobile Back Button Confirmation
// This ensures that when the user presses the back button on mobile,
// they are prompted before leaving the application.
document.addEventListener('DOMContentLoaded', () => {
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
});
