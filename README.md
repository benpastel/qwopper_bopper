# qwopper_bopper
A 2-player fighting game with unnecessarily difficult controls, under construction.

<img width="1137" alt="Screenshot 2025-04-23 at 3 33 04 PM" src="https://github.com/user-attachments/assets/4952f8bb-7e01-417c-aee5-36ce8d988483" />

I wouldn't call it _fun_ yet, but it is funny for a few minutes :)


## Controls
- Q: open thighs
- W: close thighs
- O: open calves
- P: close calves
- E: open arms
- R: close arms

## Implementation

TypeScript throughout. The game is a deterministic [Rapier](https://rapier.rs) simulation (`src/sim`) that both players run in their browsers, connected peer to peer with rollback netcode (`src/net`); a small Node server (`src/server`) hosts the lobby and introduces the peers.

```
npm install
npm run dev     # server on :8080, client on :5173
npm test
```

`?fakenet=latency,jitter,loss` plays the bot over a simulated network, e.g. `?fakenet=90,30,0.1`.
