# Decentralized Voting System

A full-stack blockchain-based voting platform built on Ethereum (Sepolia) that ensures secure, transparent, and tamper-proof elections.

---

## Overview

This project implements a decentralized election system where:

- Admins can create and manage elections
- Voters can securely cast votes using MetaMask
- Results are transparently stored and retrieved from the blockchain
- All operations are trustless and verifiable

---

## Tech Stack

### Blockchain
- Solidity (Smart Contracts)
- Ethereum Sepolia Testnet
- Hardhat

### Frontend
- React (Vite)
- Ethers.js
- MetaMask

### UI Features
- Election dashboard (dynamic loading)
- Candidate management
- Real-time vote casting
- Result visualization (Chart.js)

---

## Features

### Admin Panel
- Create elections
- Add candidates
- Authorize voters
- Start elections
- Manage election lifecycle

### Voter Panel
- View available elections
- View candidates
- Cast vote securely (1 wallet = 1 vote)
- See real-time results

### Dashboard
- Dynamic election discovery (no manual IDs)
- Event-based data fetching
- Status indicators (Active / Ended)

---

## Security Features

- One vote per wallet enforcement
- Role-based access control (Admin vs Voter)
- Blockchain immutability ensures no tampering
- Designed for future **commit-reveal voting** (privacy enhancement)

---

## Gas Optimization

- Uses event-based indexing instead of heavy storage reads
- Separates read (provider) and write (signer) operations
- Minimal on-chain data storage for efficiency

---

##
