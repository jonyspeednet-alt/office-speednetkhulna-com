const express = require('express');
const router = express.Router();

const db = require('../utilities/db'); 

router.post('/login_action', async (req, res) => {
    // ১. ইনপুট ডাটা সংগ্রহ
    const identifier = req.body.identifier ? req.body.identifier.trim() : '';
    const password = req.body.password;

    try {
        // ২. ডাটাবেস থেকে ইউজার খোঁজা (ইমেইল অথবা এমপ্লয়ী আইডি দিয়ে)
        const sql = "SELECT * FROM users WHERE (email = ? OR employee_id = ?) LIMIT 1";
        
        // ডাটাবেস থেকে ইউজার খোঁজা
        const [rows] = await db.execute(sql, [identifier, identifier]);
        const user = rows.length > 0 ? rows[0] : null;

        if (user) {
            // ৩. পাসওয়ার্ড যাচাই (hashed এবং plain text উভয়ই সাপোর্ট করে)
            let isMatch = false;
            const bcrypt = require('bcrypt');
            const dbPassword = user.password ? user.password.trim() : '';

            // First try bcrypt if it looks like a hash
            if (dbPassword.startsWith('$2')) {
                try {
                    isMatch = await bcrypt.compare(password, dbPassword);
                } catch (err) {
                    console.error('Bcrypt Error:', err);
                    isMatch = false;
                }
            }

            // If still not matched, try plain text fallback
            if (!isMatch) {
                isMatch = (password === dbPassword);
            }

            if (isMatch) {
                
                // ৪. সেশন ভেরিয়েবল সেট করা
                // (Node.js এ express-session মিডলওয়্যার ব্যবহার করা হচ্ছে বলে ধরে নেওয়া হলো)
                req.session.user_id = user.id;
                req.session.full_name = user.full_name;
                req.session.role = user.role;
                req.session.can_action = user.can_take_action;
                req.session.emp_id = user.employee_id;

                // ৫. রিডাইরেক্ট লজিক
                const redirectUrl = req.session.redirect_url || '/dashboard';
                
                // রিডাইরেক্ট URL সেশন থেকে মুছে ফেলা (যদি থাকে)
                if (req.session.redirect_url) {
                    delete req.session.redirect_url;
                }

                // সফল লগইন শেষে ড্যাশবোর্ডে পাঠানো
                return res.redirect(redirectUrl);
            } else {
                // ভুল পাসওয়ার্ড এলার্ট এবং রিডাইরেক্ট
                return res.send("<script>alert('ভুল পাসওয়ার্ড!'); window.location.href='/';</script>");
            }
        } else {
            // ইউজার পাওয়া না গেলে এলার্ট এবং রিডাইরেক্ট
            return res.send("<script>alert('ইউজার পাওয়া যায়নি!'); window.location.href='/';</script>");
        }

    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).send("Error: " + error.message);
    }
});

module.exports = router;