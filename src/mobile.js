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
    // Toast Helper
    const showToast = (msg) => {
        let toast = document.getElementById('app-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'app-toast';
            toast.className = 'toast-message';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('show');
        
        if (window.toastTimeout) clearTimeout(window.toastTimeout);
        window.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 2000);
    };

    let lastBackTime = 0;
    
    // Initial push to create a history entry
    if (window.history && window.history.pushState) {
        window.history.pushState({ app: true }, document.title);
        
        window.addEventListener('popstate', (event) => {
            const now = Date.now();
            if (now - lastBackTime < 2000) {
                // User pressed back twice within 2 seconds. Allow exit.
                // Go back one more time to actually leave the page
                window.history.back();
            } else {
                // First press: Cancel leave and show toast
                window.history.pushState({ app: true }, document.title);
                lastBackTime = now;
                showToast("👋 再按一次離開系統");
            }
        });
    }
});
