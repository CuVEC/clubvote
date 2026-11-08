import { useCallback, useEffect, useState } from 'react'
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { Buffer } from 'buffer'

const PROGRAM_ID = new PublicKey('CKhrEj7ZyX49ZuaWGLubLyaSBwtQje3wLDaWA9UeYdEP')
// 今晚先用本地链；明早部署上 DevNet 后，把这一行换成 'https://api.devnet.solana.com'
const RPC_URL = 'http://127.0.0.1:8899'

const DISC_CREATE = new Uint8Array([182, 171, 112, 238, 6, 219, 14, 110])
const DISC_VOTE = new Uint8Array([227, 110, 155, 23, 136, 126, 172, 25])

const connection = new Connection(RPC_URL, 'confirmed')

function getProvider(): any {
  const w = window as any
  return w.phantom?.solana ?? w.solana
}

function pollPda(authority: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('poll'), authority.toBuffer()],
    PROGRAM_ID,
  )[0]
}

function voterRecordPda(poll: PublicKey, voter: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vote'), poll.toBuffer(), voter.toBuffer()],
    PROGRAM_ID,
  )[0]
}

interface PollData {
  question: string
  votesA: number
  votesB: number
}

function parsePoll(data: Buffer): PollData {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const len = view.getUint32(8, true)
  const question = new TextDecoder().decode(data.subarray(12, 12 + len))
  const votesA = Number(view.getBigUint64(12 + len, true))
  const votesB = Number(view.getBigUint64(20 + len, true))
  return { question, votesA, votesB }
}

export default function App() {
  const [wallet, setWallet] = useState<PublicKey | null>(null)
  const [question, setQuestion] = useState('Should the club meet on Friday nights?')
  const [pollAddr, setPollAddr] = useState('')
  const [poll, setPoll] = useState<PollData | null>(null)
  const [status, setStatus] = useState('Connect your Phantom wallet to start.')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!pollAddr) return
    try {
      const info = await connection.getAccountInfo(new PublicKey(pollAddr))
      setPoll(info ? parsePoll(info.data as Buffer) : null)
    } catch {
      setPoll(null)
    }
  }, [pollAddr])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 4000)
    return () => clearInterval(id)
  }, [refresh])

  async function sendTx(ix: TransactionInstruction): Promise<string> {
    const provider = getProvider()
    const tx = new Transaction().add(ix)
    tx.feePayer = wallet!
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
    const res: any = await provider.signAndSendTransaction(tx)
    const sig: string = typeof res === 'string' ? res : res.signature
    await connection.confirmTransaction(sig, 'confirmed')
    return sig
  }

  async function connect() {
    const provider = getProvider()
    if (!provider) {
      setStatus('Phantom not found. Install Phantom and reload this page.')
      return
    }
    const res = await provider.connect()
    const pk: PublicKey = res.publicKey
    setWallet(pk)
    setPollAddr(pollPda(pk).toBase58())
    setStatus('Wallet connected: ' + pk.toBase58())
  }

  async function createPoll() {
    if (!wallet) return
    setBusy(true)
    try {
      const pda = pollPda(wallet)
      const q = Buffer.from(question, 'utf8')
      const lenBuf = Buffer.alloc(4)
      lenBuf.writeUInt32LE(q.length, 0)
      const data = Buffer.concat([Buffer.from(DISC_CREATE), lenBuf, q])
      const ix = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: pda, isSigner: false, isWritable: true },
          { pubkey: wallet, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      })
      const sig = await sendTx(ix)
      setPollAddr(pda.toBase58())
      setStatus('Poll created on-chain. Tx: ' + sig)
      await refresh()
    } catch (e: any) {
      setStatus('Create failed: ' + (e?.message ?? String(e)))
    } finally {
      setBusy(false)
    }
  }

  async function vote(choice: 0 | 1) {
    if (!wallet || !pollAddr) return
    setBusy(true)
    try {
      const pollKey = new PublicKey(pollAddr)
      const record = voterRecordPda(pollKey, wallet)
      const data = Buffer.concat([Buffer.from(DISC_VOTE), Buffer.from([choice])])
      const ix = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: pollKey, isSigner: false, isWritable: true },
          { pubkey: record, isSigner: false, isWritable: true },
          { pubkey: wallet, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      })
      const sig = await sendTx(ix)
      setStatus('Vote recorded on-chain. Tx: ' + sig)
      await refresh()
    } catch {
      setStatus(
        'REJECTED BY THE CHAIN: this wallet has already voted. One wallet = one vote.',
      )
    } finally {
      setBusy(false)
    }
  }

  const total = poll ? poll.votesA + poll.votesB : 0
  const pctA = total ? Math.round((poll!.votesA / total) * 100) : 0
  const pctB = total ? 100 - pctA : 0

  const bar = (pct: number, color: string) => (
    <div style={{ background: '#ddd', borderRadius: 6, height: 18, width: '100%' }}>
      <div
        style={{
          background: color,
          height: '100%',
          width: pct + '%',
          borderRadius: 6,
          transition: 'width 0.5s',
        }}
      />
    </div>
  )

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 640,
        margin: '0 auto',
        padding: 24,
        color: '#1a1a1a',
      }}
    >
      <h1>🗳️ ClubVote</h1>
      <p>On-chain club voting. One wallet, one vote — enforced by the program, not by trust.</p>

      {!wallet ? (
        <button onClick={connect} style={{ padding: '10px 20px', fontSize: 16 }}>
          Connect Phantom
        </button>
      ) : (
        <p style={{ wordBreak: 'break-all' }}>Connected: {wallet.toBase58()}</p>
      )}

      <hr style={{ margin: '20px 0', opacity: 0.3 }} />

      <h3>Create a poll (with your wallet)</h3>
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 8 }}
      />
      <button onClick={createPoll} disabled={!wallet || busy} style={{ padding: '8px 16px' }}>
        Create poll on-chain
      </button>

      <h3 style={{ marginTop: 28 }}>Poll</h3>
      <input
        value={pollAddr}
        onChange={(e) => setPollAddr(e.target.value.trim())}
        placeholder="Poll address (auto-filled with your own poll)"
        style={{ width: '100%', padding: 8, marginBottom: 8 }}
      />
      {poll ? (
        <div>
          <p style={{ fontSize: 20 }}>
            <b>{poll.question}</b>
          </p>
          <p>Option A — {poll.votesA} votes ({pctA}%)</p>
          {bar(pctA, '#7c5cff')}
          <p>Option B — {poll.votesB} votes ({pctB}%)</p>
          {bar(pctB, '#2ec4b6')}
          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <button onClick={() => vote(0)} disabled={!wallet || busy} style={{ padding: '10px 20px' }}>
              Vote A
            </button>
            <button onClick={() => vote(1)} disabled={!wallet || busy} style={{ padding: '10px 20px' }}>
              Vote B
            </button>
          </div>
          <p style={{ opacity: 0.7, marginTop: 12 }}>
            Share this poll address so other wallets can paste it above and vote: {pollAddr}
          </p>
        </div>
      ) : (
        <p style={{ opacity: 0.7 }}>No poll found at this address yet. Create one above.</p>
      )}

      <p style={{ marginTop: 24, wordBreak: 'break-all' }}>{status}</p>
    </div>
  )
}
