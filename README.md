# GatePass - Blockchain-Based Hostel Outpass Verification System

**Student:** Anika Sharma (23100BTCSAII14269) - Group 20
**Dept:** AI & DS, 4th Year, 7th Semester, SVVV Indore

## What it does
In most hostels, outpasses are given on paper or in a register. Passes can be faked, signatures can be copied,
the same pass can be used again, entries in the register can be changed later, and parents do not know
when their child has left or returned.

GatePass solves this using a blockchain smart contract:

1. **Student** requests an outpass (reason, destination, leaving time, return time).
2. **Warden** approves or rejects it. The decision is saved on the blockchain.
3. Student gets a **QR code**. Its secret code is linked to the student's wallet, and only its hash is stored on the blockchain.
4. **Gate security** scans the QR. The system shows **Valid / Not Approved / Expired / Already Used / Fake**.
   The guard marks **exit**, and later **entry** with the same QR. Late return is detected automatically.
5. **Parents** can check live status and history with only the enrollment number (no login).
6. Every action is a blockchain transaction, so nobody can change the records later.

## Tech stack
Solidity 0.8.24, Hardhat (local Ethereum blockchain), ethers.js v6, Node.js, HTML/CSS/JavaScript,
qrcode.js (QR generation), html5-qrcode (QR scanning by camera or image).

## How to run
Requirement: Node.js 18 or later (https://nodejs.org)

**Easy way (Windows):** double-click `SETUP - Double Click Me.bat` once. It installs the project in
`Documents\Projects\GatePass`, creates a **GatePass** icon on the Desktop and starts the project automatically in
the background when Windows starts. After that, just double-click the **GatePass** desktop icon.

**Manual way:**
```
cd GatePass          (the folder that contains package.json)
npm install          (only the first time)
npm start
```
Then open **http://localhost:3000**.

## Demo users (ready-made, no MetaMask needed)
| Name | Role |
|---|---|
| Hostel Admin Office | Admin |
| Dr. Sunita Rao (Chief Warden) | Warden |
| Ramesh Kumar (Main Gate Security) | Gate Security |
| Rahul Verma - 23100BTCSAII10101, Room B-204 | Student |
| Priya Singh - 23100BTCSAII10102, Room G-112 | Student |
| Aman Joshi - 23100BTCSAII10103, Room B-118 | Student |

## Demo flow
1. **Student** tab (Rahul): request a pass, e.g. Home visit to Ujjain.
2. **Warden** tab: approve with a note.
3. **Student** tab: the QR code appears. Click Download QR.
4. **Gate Security** tab: Upload QR Image. The result is **VALID - ALLOW EXIT**. Click Mark Exit.
5. **Dashboard / Parent View** (enrollment 23100BTCSAII10101): the student is shown as outside the hostel.
6. **Dashboard**, Demo Clock: +8 hours.
7. **Gate Security**: scan again. The result is **STUDENT RETURNING (LATE)**. Click Mark Entry.
8. Scan again. The result is **PASS ALREADY USED**.
9. Paste a fake QR text such as `GATEPASS|1|abc123`. The result is **FAKE PASS**.

## Project structure
```
contracts/GatePass.sol     Smart contract
scripts/compile.js         Compiles the contract
start.js                   Starts blockchain, deploys contract, registers demo users, runs the website
frontend/                  Website (index.html, style.css, app.js)
```
Note: data resets every time the project restarts (local test blockchain).
