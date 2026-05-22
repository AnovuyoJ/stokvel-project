# Stokvel App

A full-stack web application for managing stokvel (group savings) operations. Members can join groups, make monthly contributions via PayFast, track payout schedules, and manage group meetings — all from a single platform.
Stokvels are a cornerstone of South African financial culture, with millions of people participating in these rotating savings and credit associations. Managing contributions, tracking payouts, 
scheduling meetings and maintaining transparency can be challenging when done manually via spreadsheets or messaging apps. This project aims to deliver a web-based stokvel management platform that enables members to track contributions, monitor payout schedules, communicate, and gain financial insights into their savings group.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6 |
| Backend | Node.js v22, Express.js |
| Database | MongoDB (Mongoose) |
| Authentication | JSON Web Tokens (JWT) |
| Payments | PayFast (sandbox + production) |
| Email | Nodemailer (Gmail SMTP) |
| Scheduling | node-cron |
| Deployment | Azure App Service (backend), GitHub Actions (CI/CD) |

---

## Project Structure

```
stokvel-project/
├── client/                   # React frontend
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── App.jsx
│   │   ├── components/       # Auth, group, member, payment, meeting UI
│   │   ├── pages/            # Home,  Group, Profile
│   │   ├── sections/         # Dashboard,
│   │   ├── utils/
|   |   ├── firebase.js
|   |   ├──main.jsx 
|   |   └──index.css
│   ├── index.html
|   ├── tests/                # vite unit tests
|   ├── vite.config.js
│   └── vitest.config.js
│
└── server/                   # Express backend
    ├── index.js              # Entry point
    ├── app.js                # Express config 
    ├── cinfig/
    ├── controllers/
    ├── middleware/            
    ├── models/               # Mongoose schemas (User, Member, Group, Rate)
    ├── routes/               # groupRoutes, payfastRoutes, rateRoutes
    ├── services/             # emailService, rateService
    └── tests/                # Jest test suites
```

---

## Prerequisites

Ensure the following are installed before setting up either part of the project:

- [Node.js v22+](https://nodejs.org/)
- [npm v10+](https://www.npmjs.com/)
- [MongoDB](https://www.mongodb.com/) (local instance or Atlas cluster)
- A Gmail account with a configured [App Password](https://myaccount.google.com/apppasswords)
- A [PayFast](https://www.payfast.co.za/) merchant account (sandbox for development)

---

## Download

You can download the latest release as a ZIP without cloning the repository:

1. Go to the [Releases](https://github.com/AnovuyoJ/stokvel-project.git) page
2. Under **Assets**, click **Source code (zip)** to download
3. Extract the ZIP and follow the [Installation & Setup](#installation--setup) instructions below

---

## Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-org/stokvel-project.git
cd stokvel-project
```

---
### 2. Backend Setup

```bash
cd server
npm install
```

Create a `.env` file inside `server/`:

```env
MONGODB_URI=mongodb://teamUser:designdivas@ac-blh60jo-shard-00-00.f2j65bx.mongodb.net:27017,ac-blh60jo-shard-00-01.f2j65bx.mongodb.net:27017,ac-blh60jo-shard-00-02.f2j65bx.mongodb.net:27017/stokvelDB?ssl=true&replicaSet=atlas-12aark-shard-0&authSource=admin&appName=stokvel-cluster
CLIENT_URL=http://localhost:5173
JWT_SECRET=your_secret_here
PORT=3001
SERVER_URL=http://localhost:3001

PAYFAST_MERCHANT_ID=10047967
PAYFAST_MERCHANT_KEY=w6gf72gax8w2q
PAYFAST_PASSPHRASE=
PAYFAST_SANDBOX=true

AZURE_URL= https://stokvel-backed-ada7ceh9agd3dneh.brazilsouth-01.azurewebsites.net

EMAIL_USER=anovuyojafta@gmail.com
EMAIL_PASS=fzlckntgzlnimehr
EMAIL_FROM=anovuyojafta@gmail.com

FIREBASE_PROJECT_ID="stokvel-platform-c1176"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-fbsvc@stokvel-platform-c1176.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQC+NLz3Ylp0EywX\nM5d4S7EhupMqidBQ5Vocizr4fl5JZqfdnkWUrinn/7H50Pan9CDmBYyubvP/21gA\nJ2E2d9Xt4W2QGVkj6YZRKmcU26Gaq+CuDDupcq/LyRNbpivO9zpgMe3Ourb3Gkld\nvGzpSJ2Hf7LAD3Npoo12sY1cmWCC09g+zbohpNyRouorRZv8UzcpA/Nw4FMcPY+p\nDUIqKWrghzw9ha78Pz4MGT9cuhf6nabeLAAC+FKeEjQpJ1UsjYn5PT23pibFQkB+\nnSZn0u6Dgk15aeGsmu9VXrZCuVLMb8ajXXWeod1K0q+Oo+S1uEgxbUeUQ+YdyrVd\n2gRXxr8JAgMBAAECggEAF4qwftACEQ7UbLS6gS2hKWMN1vyCt5iDjDfhXyNI6T3W\n9hOiWhIqZqgbr6dg+A27yqySKn7aHWdZH3/ARP0VEeHObUDt6wd60+3zHz5F5L50\nSyaBdeoXfxoOls/c6TtpUsGrROSQQ8pRnVP2iPMvaDdyeNoQt1jiuHemXvku3FJE\nTa2Djyr9xVoFRy52cpKHq754cl0TkW524um6k0U/1WQG4S5wuCND1Xvnn7o3LwdC\nW8r3xFfAIN7AaQMnYmUsJLdo1Q7YEx3HdVNNnV+NI+kEO2IMb/zTs8L2n3Dx6yIS\nr3nXkmCQZYKNf1+WqO/4q0Z+zM79f+9zcMi1bVcqtwKBgQDulrmJnxs18CrXJkf/\nd6QXTZh8TXpiDjfD/roOTwGsWDVRqzqUq/54S4P7L+9E4o5zHgsNSZ2Ihu3C95/6\n2Jay14fFdSmb7q8RFh9IKMQfrW+6wx2u00yLdRHAt0TMZ7kLAvOKGggxIbPfRlct\n6QfzAYNu09jESMvqEzC6kXNU9wKBgQDMFiKCo7ClNypSYsefrFcQYk2mnCWDhmxr\nSNkQsrdrIWQaKFX+ga060RTcSmaXqJc+47voEAy9+7hrNFnw6mTPd1Blm9PhfN6w\nwQqIliiXl2erpdSHPU/aCNWaNnYrp9Ohxv7BjUZoglerP7p2nwht9D5s6rc2wjv+\nPPGV9ZWL/wKBgQCx2MCtCWDrL/9/KRX6JGC4ziqgXdCgTyDahIKEL/h7U7VLD2w3\nbo3ddc0H7I9atdahkP+EBB/dqVaKQrOJ9PFAltCqK8+8YIs3HVpsG5c2Vb43ZUI3\nE2K3gaieEv7Br3+L6cNIamc42HqQMIrDujUmuzYR4vBuQCVgcrWcHNfvuQKBgQCh\nlr0IVvbcOYuG47NPF7Nvw4Xb7zI8q0hYwbssX3SenDeYBmvgMWipczZjHX2RgukN\n4F69ZUfRfOcN6stz1wKuybecW/8tQCNKK+5dKxdEv5pT698UnVUGO4x0p7503lLQ\nerDnKyaeROWJL9JBbbXM6WAr+MPL1YqOyE43/9TCnQKBgQCNIZQ8E9QyIFSJZFR6\nXCZ/MqXf9uisIFbi836lFZ5yza6a4G+SkZppocIz5nCNeDGbf471jZyikEDL2PBa\nXeImKa938e+1iPKQlKNao/WEft17bfH2B4gT+uDashEcQyl6RVw1+e6JzI2gNk26\nyH63G/26PLt6tgMXC7CzXRGLdA==\n-----END PRIVATE KEY-----\n"

> **Never commit `.env` to version control.** It is included in `.gitignore`.

Start the backend:

```bash
npm start
```

Expected output:
```
Database connected successfully
Server running on port 3001
```

Run backend tests:

```bash
npm test
```
Test coverage:
```bash
npm test -- --coverage

---

### 3. Frontend Setup

Open a new terminal:

```bash
cd client
npm install
```

Create a `.env` file inside `client/`:

```env
VITE_API_URL=http://localhost:3001
VITE_CLIENT_URL=http://localhost:5173

VITE_FIREBASE_API_KEY= "AIzaSyAdp132_5WkzUFRzqKM9as_CECOXEg1iRc"
VITE_FIREBASE_AUTH_DOMAIN="stokvel-platform-c1176.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="stokvel-platform-c1176"
```

Start the frontend:

```bash
npm run dev
```

Run backend tests:

```bash
npm test
```

Test coverage:
```bash
npm test -- --coverage

The app will be available at `http://localhost:5173`.

---

## Key Features

- **Authentication** — Register, login, and JWT-based session management
- **Group Management** — Create stokvel groups with configurable monthly contribution amounts
- **Member Management** — Invite members by email; assign roles (Admin, Treasurer, Member)
- **Payments** — Contribute via PayFast redirect; treasurer can manually confirm offline payments
- **FIFO Payouts** — Automated round-robin disbursement scheduling based on join date
- **Meetings** — Schedule meetings, set agendas, record and email minutes to all members
- **Rate Display** — Live South African repo and prime interest rates fetched from the SARB API

---

## API Overview

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login and receive JWT |

### Groups & Members
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/groups` | Create a new group |
| GET | `/api/groups` | Get all groups for logged-in user |
| GET | `/api/members?groupId=` | List members in a group |
| POST | `/api/members` | Invite a member |
| PATCH | `/api/members/:id/role` | Update a member's role |

### Payments
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/payfast/contribute` | Start a PayFast payment |
| POST | `/api/payfast/itn` | PayFast ITN webhook |
| POST | `/api/payfast/confirm` | Manually confirm a payment |
| GET | `/api/payfast/contributions` | Get group contributions |
| POST | `/api/payfast/disburse` | Record a manual payout |
| POST | `/api/payfast/disburse-next` | FIFO auto-disbursement |
| PATCH | `/api/payfast/disburse/:id` | Mark disbursement as paid |
| GET | `/api/payfast/disbursements` | Get group disbursements |

### Health
| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Azure health check probe |

---

## Deployment

### Backend — Azure App Service

The backend is deployed to **Azure App Service (Linux)** automatically on every push to the `testing` branch via GitHub Actions.

#### Required GitHub Secrets

| Secret | Description |
|---|---|
| `AZUREAPPSERVICE_CLIENTID_...` | Azure service principal client ID |
| `AZUREAPPSERVICE_TENANTID_...` | Azure tenant ID |
| `AZUREAPPSERVICE_SUBSCRIPTIONID_...` | Azure subscription ID |
| `AZUREAPPSERVICE_PUBLISHPROFILE_...` | Azure publish profile XML |

#### Required Azure App Settings

Set these under **Azure Portal → App Service → Configuration → Application Settings**:

```
MONGODB_URI
JWT_SECRET
PAYFAST_MERCHANT_ID
PAYFAST_MERCHANT_KEY
PAYFAST_PASSPHRASE
PAYFAST_SANDBOX
AZURE_URL
CLIENT_URL
EMAIL_USER
EMAIL_PASS
EMAIL_FROM
```

#### CI/CD Pipeline

On push to `testing`, the workflow:

1. Checks out the code
2. Sets up Node.js v22
3. Installs dependencies and builds inside `server/`
4. Uploads the artifact
5. Authenticates with Azure via OIDC
6. Deploys to the `stokvel-backed` App Service

#### Health Check

Azure probes `GET /health` to monitor instance health. Configure this under **Azure Portal → App Service → Health check → Path: `/health`**.

---

For production, update the frontend `.env`:

```env
VITE_API_URL=https://stokvel-frontend-agdyfaameebwe4f7.brazilsouth-01.azurewebsites.net
```

---

## Environment Variable Reference

| Variable | Location | Description |
|---|---|---|
| `PORT` | server | Port the Express server listens on |
| `MONGODB_URI` | server | MongoDB connection string |
| `JWT_SECRET` | server | Secret key for signing JWTs |
| `PAYFAST_MERCHANT_ID` | server | PayFast merchant ID |
| `PAYFAST_MERCHANT_KEY` | server | PayFast merchant key |
| `PAYFAST_PASSPHRASE` | server | PayFast signature passphrase |
| `PAYFAST_SANDBOX` | server | `true` for sandbox, `false` for live |
| `AZURE_URL` | server | Public URL of the backend |
| `CLIENT_URL` | server | Public URL of the frontend |
| `EMAIL_USER` | server | Gmail address for sending emails |
| `EMAIL_PASS` | server | Gmail App Password (16 characters) |
| `EMAIL_FROM` | server | From address shown in emails |
| `VITE_API_URL` | client | Base URL of the backend API |
