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
    let lastBackPressTime = 0;
    const TOAST_DURATION = 2000;

    // Toast Helper
    function showToast(message) {
        let toast = document.getElementById('exit-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'exit-toast';
            toast.className = 'toast-notification';
            toast.innerHTML = `<span class="toast-icon">👋</span> <span id="toast-msg"></span>`;
            document.body.appendChild(toast);
        }
        
        const msgSpan = toast.querySelector('#toast-msg');
        if (msgSpan) msgSpan.textContent = message;
        
        // Reset animation
        toast.classList.remove('show');
        void toast.offsetWidth; // Trigger reflow
        
        // Show
        toast.classList.add('show');
        
        // Hide after duration
        if (toast.timeoutId) clearTimeout(toast.timeoutId);
        toast.timeoutId = setTimeout(() => {
            toast.classList.remove('show');
        }, TOAST_DURATION);
    }

    // Initial push to create a history entry
    if (window.history && window.history.pushState) {
        window.history.pushState({ app: true }, document.title);
        
        window.addEventListener('popstate', (event) => {
            const now = Date.now();
            
            if (now - lastBackPressTime < TOAST_DURATION) {
                // User pressed back twice within duration -> Allow exit
                // We are already at the previous state (popstate happened), so we just let it be.
            } else {
                // First press -> Prevent exit and show toast
                lastBackPressTime = now;
                
                // Restore state to "in app"
                window.history.pushState({ app: true }, document.title);
                
                showToast("再按一次離開系統");
            }
        });
    }
});
