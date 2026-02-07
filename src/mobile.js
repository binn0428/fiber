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
