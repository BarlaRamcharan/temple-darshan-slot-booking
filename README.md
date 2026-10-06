# Temple Darshan Slot Booking System

Temple Darshan is a full-stack temple booking platform built with HTML, CSS, JavaScript, Node.js, Express.js, and MongoDB. Devotees sign in with a one-time verification code delivered to their email using Gmail SMTP, browse five temples, select a date and darshan slot, confirm a booking, and view a QR-coded digital pass.

## Features

- Email OTP authentication with Gmail SMTP, hashed OTP storage, expiry, resend cooldown, attempt limits, and rate limiting
- JWT-based authentication
- Temple selection, per-devotee details, server-priced INR 100-per-devotee summary, and reserved slot capacity
- Razorpay Test Mode order creation and server-side signature/payment verification
- Paid-only booking confirmation, My Bookings dashboard, public QR verification, and downloadable PDF darshan pass
- Admin dashboard for temples, slots, bookings, and statistics
- MongoDB storage and sample temple/slot data

## Tech stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js and Express.js
- Database: MongoDB
- Authentication: JWT
- Email delivery: Nodemailer with Gmail SMTP
- QR generation: `qrcode`

## Project structure

```text
Temple-Darshan/
├── client/
│   ├── css/
│   ├── js/
│   └── index.html
├── server/
│   ├── config/
│   ├── controllers/
│   ├── data/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   └── server.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Temple image assets

Temple cards use the project-root image files served by the backend at `/assets`. Keep these files in place; the application does not download or copy them.

| Temple | Local asset |
| --- | --- |
| Tirumala Venkateswara Temple, Tirupati | `assets/temples/tirumala.jpg` |
| Sri Lakshmi Narasimha Swamy Temple, Yadadri | `assets/temples/yadadri.jpg` |
| Mallikarjuna Swamy Temple, Srisailam | `assets/temples/srisailam.jpg` |
| Sri Sita Ramachandra Swamy Temple, Bhadrachalam | `assets/temples/bhadrachalam.jpg` |
| Sri Durga Malleswara Swamy Varla Devasthanam, Vijayawada | `assets/temples/kanaka-durga.jpg` |

Previously sourced images remain in `client/assets/` but are no longer used by the temple cards. Their attribution details are retained here:

| Temple | Retained asset | Wikimedia Commons source and license |
| --- | --- | --- |
| Tirumala Venkateswara Temple, Tirupati | `client/assets/tirumala-venkateswara-temple.jpg` | [File page](https://commons.wikimedia.org/wiki/File:Tirumala_Venkateswara_Temple,_Tirupati_(24338261275).jpg) — Dinesh Kumar (DK), CC BY-SA 2.0 |
| Sri Lakshmi Narasimha Swamy Temple, Yadadri | `client/assets/yadadri-lakshmi-narasimha-temple.jpg` | [File page](https://commons.wikimedia.org/wiki/File:Sri_Lakshminarasimha_Swamy_Temple_Yadagirigutta_Yadadri_Telangana_10.jpg) — Ravindraoudeptling, CC BY 4.0 |
| Mallikarjuna Swamy Temple, Srisailam | `client/assets/srisailam-mallikarjuna-temple.jpg` | [File page](https://commons.wikimedia.org/wiki/File:Mallikarjuna_Temple_-_Srisailam.jpg) — B.K.Viswanadh, CC BY 2.5 |
| Sri Sita Ramachandra Swamy Temple, Bhadrachalam | `client/assets/bhadrachalam-sita-ramachandra-temple.jpg` | [File page](https://commons.wikimedia.org/wiki/File:Bhadrachalam_temple_gopuram.jpg) — Srinivas, CC BY-SA 4.0 |
| Sri Durga Malleswara Swamy Varla Devasthanam, Vijayawada | `client/assets/vijayawada-kanaka-durga-temple.jpg` | [File page](https://commons.wikimedia.org/wiki/File:Vijayawada_Kanaka_Durga_Temple_-_Gali_Gopuram.jpg) — NAGASREENIVASARAO PUPPALA, CC BY-SA 4.0 |

## Installation

From the project directory, install dependencies:

```bash
npm install
```

Create a local environment file from the template:

```powershell
Copy-Item .env.example .env
```

Set up the Gmail credentials and JWT secret in `.env` before starting the backend. `.env` is excluded by `.gitignore`; never commit it.

## Gmail SMTP setup

1. Create or use a Gmail account dedicated to sending application email.
2. Enable 2-Step Verification on that Google account.
3. Create a Google App Password for the application.
4. Put the Gmail address in `EMAIL_USER`.
5. Put the generated App Password in `EMAIL_APP_PASSWORD`.
6. Never use the normal Gmail account password in the project.
7. Never commit `.env` or share its contents. It contains SMTP credentials and the JWT signing secret.
8. Restart the backend after adding or changing environment variables.

Gmail App Passwords are generated in Google Account security settings after 2-Step Verification is enabled. Use the generated app-specific password, not the password used to sign into Gmail.

## Environment variables

`.env.example` contains:

```env
PORT=3000
MONGODB_URI=
JWT_SECRET=replace-with-a-long-random-secret
EMAIL_USER=your-gmail-address@gmail.com
EMAIL_APP_PASSWORD=your-gmail-app-password
ADMIN_EMAIL=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
APP_BASE_URL=http://localhost:3000
```

- `MONGODB_URI`: optional MongoDB connection URI; the app defaults to a local MongoDB database.
- `JWT_SECRET`: required, long random signing secret. Replace the example value.
- `EMAIL_USER` and `EMAIL_APP_PASSWORD`: required Gmail SMTP credentials.
- `ADMIN_EMAIL`: optional email address for the administrator account. That address receives the admin role after verifying its email.
- `RAZORPAY_KEY_ID`: Razorpay **Test Mode** public key ID. The backend accepts only key IDs beginning with `rzp_test_`.
- `RAZORPAY_KEY_SECRET`: Razorpay Test Mode secret. Used only by the backend; never place it in frontend code or share it.
- `APP_BASE_URL`: optional public origin used in QR verification links. Use the externally accessible HTTPS origin outside localhost.

The email OTP endpoint never returns or logs the generated code. It stores only an HMAC hash and the expiry/attempt/cooldown metadata.

## MongoDB

The app connects to `mongodb://127.0.0.1:27017/temple-darshan` by default. Set `MONGODB_URI` to use another MongoDB deployment. Initial startup seeds the five temples and sample slots.

## Start the application

```bash
npm start
```

The Express server serves both the frontend and API at `http://localhost:3000`. Open that URL in a browser. `npm run dev` starts the backend with Nodemon.

## Email OTP sign-in

1. Enter a valid email address and select **Send OTP**.
2. Check that email inbox for the verification code.
3. Enter the six-digit code and select **Verify & Continue**.
4. Codes expire after five minutes. A resend cooldown and verification attempt limits apply.

The email sender must be configured before requesting a code. If Gmail rejects the credentials or delivery fails, the app displays a generic send failure and does not expose SMTP details.

## Razorpay Test Mode

1. Sign in to the Razorpay Dashboard and switch to **Test Mode**.
2. Find the Test Mode Key ID and Key Secret under API Keys.
3. Add them to the local `.env` as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. Use only Test Mode credentials; the backend refuses live key IDs.
4. Restart the backend with `npm start`. The public Key ID is returned to the signed-in frontend only when the server has Test Mode credentials; the secret remains backend-only.
5. Select a temple, date, slot, and devotees. Each devotee is charged ₹100; the backend calculates the total and creates the Razorpay order in INR. The browser-provided amount is never trusted.
6. Use Razorpay's official Test Mode payment details to complete a successful or failed test checkout. Only a captured payment with a valid backend-verified Razorpay signature creates a confirmed booking.
7. Cancelling checkout closes the pending reservation without creating a confirmed booking. Pending slot reservations expire after 15 minutes.
8. Checkout requests Razorpay's official UPI payment instrument and retains the default enabled methods. UPI apps and desktop QR availability depend on Razorpay account settings and the device/browser; the app does not create UPI payment controls itself.

Do not commit `.env`. No payment can be completed until your own Test Mode keys are configured.

## Admin dashboard

Set `ADMIN_EMAIL` in `.env`, restart the backend, and sign in using that address's email OTP. The admin dashboard then allows administrators to create temples and darshan slots and review/search bookings.

## API overview

### Authentication

- `POST /api/auth/send-email-otp` — request an email verification code
- `POST /api/auth/verify-email-otp` — verify the code and create a JWT session

### Temples

- `GET /api/temples`
- `GET /api/temples/:id`

### Slots

- `GET /api/slots`
- `GET /api/slots/:id`

### Bookings

- `GET /api/bookings/payment/config` — authenticated Test Mode availability and public key ID
- `POST /api/bookings/payment/order` — create a server-priced INR order and temporarily reserve capacity
- `POST /api/bookings/payment/verify` — verify checkout signature and captured payment before booking confirmation
- `POST /api/bookings/payment/cancel` — close a cancelled checkout and release its capacity reservation
- `GET /api/bookings/my`
- `GET /api/bookings/:id`
- `GET /api/bookings/:id/pass.pdf` — download an authenticated PDF pass
- `PATCH /api/bookings/:id/cancel`
- `GET /api/bookings/verify/:token` — public read-only verification data for the opaque QR token
- `GET /verify-booking/:token` — public QR verification page

### Admin

- `POST /api/admin/temples`
- `PUT /api/admin/temples/:id`
- `DELETE /api/admin/temples/:id`
- `POST /api/admin/slots`
- `PUT /api/admin/slots/:id`
- `DELETE /api/admin/slots/:id`
- `GET /api/admin/bookings`
- `GET /api/admin/stats`

Protected endpoints require `Authorization: Bearer <JWT>`. Admin endpoints also require the configured administrator role.

## Test coverage and manual payment testing

Run focused booking validation, pricing, and Razorpay-signature tests:

```bash
npm test
```

After adding Razorpay Test Mode keys, complete a successful test checkout and verify that the booking appears in **My Bookings** and the Admin Dashboard with `paid` / `confirmed` status. For a failed or cancelled checkout, verify that no confirmed booking appears and that the payment can be retried. Open the pass, download its PDF, and scan the QR code with a device that can reach `APP_BASE_URL`; the verification page displays the paid booking details, all devotee names, and the persistent entry gate assigned by the backend from the selected temple and time slot.
