// This script runs immediately to set dark mode before DOM is fully loaded
(function() {
    // Load saved dark mode status or use system preference
    const savedDarkMode = localStorage.getItem('darkmode');
    const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = savedDarkMode !== null ? savedDarkMode === 'true' : systemPrefersDark;
    
    // Apply dark mode class immediately
    if (isDark) {
        document.documentElement.classList.add('darkmode');
    }
})();
