const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    `https://${process.env.SUPABASE_USER_ID}.supabase.co`,
    process.env.SUPABASE_API_KEY
);

// Middleware für die Session-Verwaltung
const authMiddleware = async (req, res, next) => {
    const token = req.cookies.session;
    
    if (!token) {
        req.user = null;
        return next();
    }

    try {
        // Session mit Supabase validieren
        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error) throw error;
        
        // Benutzerdaten dem Request hinzufügen
        req.user = user;
    } catch (error) {
        console.error('Auth Middleware Fehler:', error);
        req.user = null;
        // Cookie löschen, wenn die Session ungültig ist
        res.clearCookie('session');
    }
    
    next();
};

// Middleware für geschützte Routen
const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.redirect('/login?error=unauthorized');
    }
    next();
};

module.exports = {
    authMiddleware,
    requireAuth
}; 