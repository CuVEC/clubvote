# ClubVote — On-chain club voting on Solana

Fair club decisions on Solana: create a poll, every wallet votes once, results are public and instant.

Club votes usually run on forms and group chats: anyone can vote twice, and whoever runs the poll can quietly edit the results. ClubVote moves the ballot box into a Solana program. Create a poll, share its address, and every wallet gets exactly one vote — enforced by the program itself, not by trust. When a wallet votes, the program creates a voter-record account for it; a second vote from the same wallet fails on-chain, exactly as the demo shows.

## Demo
- Video: https://youtu.be/foJzYn18Fa8
- Program ID: CKhrEj7ZyX49ZuaWGLubLyaSBwtQje3wLDaWA9UeYdEP

## How it works
- Anchor program (Rust, programs/test-deploy/src/lib.rs): create_poll creates a Poll PDA (question, two tallies, authority). vote(choice) increments a tally and initializes a VoterRecord PDA — one-wallet-one-vote falls out of account ownership.
- LiteSVM integration test (programs/test-deploy/tests/test_voting.rs) passes the full flow: 0:0, two wallets vote to 1:1, the same wallet's second vote is rejected and the tally does not move.
- Frontend (app/): React + Vite + TypeScript + @solana/web3.js, talking to Phantom directly. Results are read from the on-chain account and refresh live.

## Run it locally
Prereqs: Solana CLI + Anchor installed; Phantom in Testnet Mode with Localnet selected.

    solana-test-validator
    anchor deploy --provider.cluster localnet
    solana transfer YOUR_PHANTOM_ADDRESS 1 --allow-unfunded-recipient
    cd app && yarn && yarn dev

Then open http://localhost:5173. The app talks to the local validator by default (RPC_URL in app/src/App.tsx); point that one line at https://api.devnet.solana.com and the same program runs on DevNet unchanged.

## Honest notes
The demo was recorded against a local Solana validator running the exact submitted program. DevNet deployment was attempted throughout the event, but the public DevNet faucet stayed rate-limited all weekend — so no DevNet Explorer link is included, rather than a fake one. Built solo by a first-time hacker for the MLH Solana Hackathon (Nov 6-8, 2026), with AI assistance (Claude) for planning, code drafting and review; the on-chain logic was fully tested before submission.
