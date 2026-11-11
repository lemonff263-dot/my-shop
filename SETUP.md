# সেটআপ গাইড (সব তথ্য আগে থেকেই বসানো আছে)

## ১. ডিপ্লয়
Netlify → Add new site → Import from GitHub → `my-shop` → Deploy। (Vercel-এও চলবে: Framework "Other")

## ২. Firebase Console (একবারই)
0. **Authentication → Sign-in method:** Email/Password চালু আছে কিনা দেখুন। **Authentication → Users → Add user:** ইমেইল `lemonff264@gmail.com`, পাসওয়ার্ড `Lemon444` (এই ইউজার না থাকলে বট থেকে অর্ডার অন/অফ কাজ করবে না আর অ্যাডমিন লগইনও হবে না)।
1. **Firestore → Rules:** `firestore.rules` ফাইলের লেখা পেস্ট করে **Publish**।
2. **Authentication → Settings → Authorized domains:** আপনার `xxx.netlify.app` যোগ করুন।
3. (পরে টাকা দিলে) Storage → Rules-এ `storage.rules`।

## ৩. টেলিগ্রাম বট
সাইট ডিপ্লয় হয়ে একবার খুললেই বট নিজে চালু হয়। না হলে একবার খুলুন:
`https://আপনার-সাইট.netlify.app/api/telegram?setup=878777`
এরপর বটে `/menu` লিখুন → 🟢 চালু / 🔴 বন্ধ।

## ৪. সাইট চালু হওয়ার পর অ্যাডমিন → সেটিংসে
- ফোন, WhatsApp, ঠিকানা, ফেসবুক লিংক, রিটার্ন পলিসি, Pixel ID বসান।
- পুরনো প্রোডাক্ট/ব্যানার থাকলে **"পুরনো ছবি দ্রুত করুন"** বাটনে একবার চাপুন (সাইট অনেক দ্রুত হবে)।
- **ছবি সংরক্ষণ:** এখন "ফ্রি (Firestore)"। পরে Blaze প্ল্যান নিলে "Firebase Storage" বেছে নিন, সাইট নিজেই বদলে যাবে।

## ৫. নিরাপত্তা (জরুরি)
- `lib/config.js`-এ গোপন তথ্য আছে, তাই রিপো সবসময় **Private** রাখবেন।
- পরে Netlify → Environment variables-এ একই নামে মান দিলে সেগুলো এখানের মানকে ছাপিয়ে যাবে, তখন `config.js`-এর মান মুছে ফেলতে পারবেন।
- ওয়েবসাইট দেখার সংখ্যা: অ্যাডমিন → **ট্রাফিক** ট্যাব।
