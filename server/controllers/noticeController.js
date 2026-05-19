const pool = require('../utilities/db');

/**
 * Get Active Notice
 * Replaces static content in notice_ticker.php
 */
const getActiveNotice = async (req, res) => {
  try {
    // For migration parity, using the static text from the PHP file.
    // In the future, you can replace this with a DB query: SELECT content FROM notices WHERE active = true
    const notice = "নতুন আপডেট: এখন থেকে স্টাফরা নিজেরাই প্রোফাইল থেকে পাসওয়ার্ড পরিবর্তন করতে পারবেন। | অফিস টাইম: সকাল ০৯:৩০ হতে সন্ধ্যা ০৭:৩০ পর্যন্ত। | জরুরি প্রয়োজনে অ্যাডমিনের সাথে যোগাযোগ করুন।";
    
    res.json({ notice });
  } catch (error) {
    console.error('Notice Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = { getActiveNotice };