# সেটআপ গাইড (ডোমেইন ছাড়া ফ্রি ডিপ্লয় + টেলিগ্রাম বট)

## ১. টেলিগ্রাম বট বানান
1. টেলিগ্রামে **@BotFather** খুলে `/newbot` পাঠান, নাম দিন → **Bot Token** পাবেন (`TELEGRAM_BOT_TOKEN`)।
2. আপনার বটে গিয়ে একবার `/start` লিখুন।
3. **@userinfobot**-কে মেসেজ দিন → আপনার **Id** পাবেন (`TELEGRAM_CHAT_ID`)। শুধু এই আইডি বট চালাতে পারবে।

## ২. কোড GitHub-এ তুলুন
GitHub-এ নতুন (Private) রিপো বানিয়ে এই ফোল্ডারের **ভেতরের সব ফাইল** আপলোড করুন
(`public/`, `lib/`, `api/`, `netlify/`, `netlify.toml`, `vercel.json`, `package.json`, rules ফাইল)।
`.env.example`-তে কোনো গোপন মান লিখবেন না।

## ৩. ডিপ্লয় (যেকোনো একটি)
**Netlify:** Add new site → Import from GitHub → রিপো বাছুন → Deploy (বাকি সব `netlify.toml` থেকে আসবে)।
**Vercel:** Add New → Project → রিপো Import → Framework: **Other** → Deploy।

## ৪. Environment Variables বসান (ডিপ্লয়ের পর, তারপর আবার Redeploy)
| নাম | কী বসাবেন |
|---|---|
| TELEGRAM_BOT_TOKEN | BotFather-এর টোকেন |
| TELEGRAM_CHAT_ID | আপনার টেলিগ্রাম Id |
| TELEGRAM_WEBHOOK_SECRET | নিজে বানানো যেকোনো লম্বা র‍্যান্ডম লেখা (শুধু A-Z a-z 0-9 _ -) |
| SETUP_KEY | নিজে বানানো আরেকটি গোপন লেখা |
| FIREBASE_PROJECT_ID | `morer-dokan` (আপনার প্রজেক্ট আইডি) |
| FIREBASE_API_KEY | `index.html`-এর Firebase config-এর `apiKey` |
| ADMIN_EMAIL / ADMIN_PASSWORD | Firebase Authentication-এ বানানো অ্যাডমিন ইমেইল/পাসওয়ার্ড |

## ৫. বট চালু করুন (একবারই)
ব্রাউজারে খুলুন: `https://আপনার-সাইট/api/telegram?setup=আপনার_SETUP_KEY`
`"ok":true` দেখালে হয়ে গেছে।

## ৬. Firebase-এ
- Firestore → Rules-এ `firestore.rules`, Storage → Rules-এ `storage.rules` পেস্ট করে Publish।
- Authentication → Settings → Authorized domains-এ আপনার `xxx.netlify.app` / `xxx.vercel.app` যোগ করুন।

## ৭. টেস্ট
- সাইটে একটা অর্ডার দিন → টেলিগ্রামে মেসেজ আসবে।
- বটে `/menu` লিখুন → 🟢 চালু / 🔴 বন্ধ বাটন আসবে। বন্ধ করলে সাইটে লাল ব্যানার দেখাবে ও নতুন অর্ডার নেওয়া যাবে না (Firebase রুলও আটকাবে)। চালু করলে আবার অর্ডার নেবে। `/on`, `/off`, `/status`-ও কাজ করে।
- অ্যাডমিন → সেটিংসেও "অর্ডার নেওয়া" চালু/বন্ধ করা যায়।

## পরে ডোমেইন কিনলে
Netlify/Vercel-এর Domain settings-এ যোগ করুন, আর Firebase Authorized domains-এ নতুন ডোমেইন দিন। কোডে কিছু বদলাতে হবে না।
